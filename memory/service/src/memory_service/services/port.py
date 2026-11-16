"""The memory port: one interface, the engine behind it. Every call takes the user first;
there is no code path without one."""

from __future__ import annotations

from datetime import datetime

from memory_service.actions import ActionFact, ActionFactDraft
from memory_service.engine import EngineFact, entity_key, knowledge_key, statement_signature
from memory_service.models import (
    CorrectRequest,
    Decision,
    EraseReport,
    FactKind,
    MemoryEntity,
    MemoryFact,
    RebuildReport,
    SearchFilters,
    WorkUnit,
)
from memory_service.schema import Conversation, EvidenceRef, TimeRange
from memory_service.services import erase as erase_svc
from memory_service.services import human_wins
from memory_service.services import ingest as ingest_svc
from memory_service.services.deps import (
    ACTION_PREFIX,
    ENTITY_PREFIX,
    KNOWLEDGE_PREFIX,
    Deps,
    action_key,
    action_scope,
    knowledge_fact_id,
)
from memory_service.services.human_wins import Ask, Effective
from memory_service.textutil import group_id, words


def _need(user_id: str) -> str:
    if not user_id or not user_id.strip():
        raise ValueError("a user is required")
    return user_id


class MemoryPort:
    def __init__(self, deps: Deps) -> None:
        self.d = deps

    # ---- writes in ------------------------------------------------------------------------------

    async def ingest(self, user_id: str, conversation: Conversation,
                     reference_time: datetime | None = None) -> WorkUnit:
        return await ingest_svc.ingest(self.d, _need(user_id), conversation, reference_time)

    async def sync(self, user_id: str, start: datetime, end: datetime) -> list[WorkUnit]:
        return await ingest_svc.sync(self.d, _need(user_id), start, end)

    async def run_pending(self, user_id: str) -> list[WorkUnit]:
        return await ingest_svc.run_pending(self.d, _need(user_id))

    async def queue(self, user_id: str) -> list[WorkUnit]:
        return await self.d.tables.queue.for_user(_need(user_id))

    async def rejections(self, user_id: str) -> dict[str, int]:
        return await self.d.tables.rejections.counts(_need(user_id))

    # ---- reads ----------------------------------------------------------------------------------

    async def _knowledge(self, user_id: str, f: EngineFact, eff: Effective) -> MemoryFact | None:
        if eff.hides(user_id, f):
            return None
        fid = knowledge_fact_id(user_id, f.signature())
        proofs = [p.evidence for p in await self.d.tables.proofs.for_fact(user_id, fid)]
        if not f.human and not proofs:
            return None  # a machine fact without valid proof is never shown
        return MemoryFact(id=fid, user_id=user_id, kind=FactKind.knowledge, key=f.relation,
                          text=f.text, subject={"kind": "entity", "id": ENTITY_PREFIX + (
                              f.source_entity_id or "")},
                          about=[ENTITY_PREFIX + e for e in (f.source_entity_id, f.target_entity_id)
                                 if e],
                          valid_at=f.valid_at, invalid_at=f.invalid_at,
                          source="person" if f.human else "agent", evidence=proofs)

    @staticmethod
    def _action(user_id: str, a: ActionFact) -> MemoryFact:
        v = a.value
        return MemoryFact(id=ACTION_PREFIX + a.id, user_id=user_id, kind=FactKind.action, key=a.key,
                          text=v.get("text"), subject=a.subject.model_dump(),
                          about=list(v.get("about") or []), valid_at=a.occurred_at,
                          source=a.source,
                          evidence=[EvidenceRef.model_validate(e) for e in v.get("evidence") or []],
                          direction=v.get("direction"), due=v.get("due"),
                          sensitivity=v.get("sensitivity"))

    async def _keep(self, user_id: str, f: EngineFact, eff: Effective,
                    filters: SearchFilters) -> MemoryFact | None:
        if f.closed and not filters.include_closed:
            return None
        return await self._knowledge(user_id, f, eff)

    async def search(self, user_id: str, query: str, filters: SearchFilters) -> list[MemoryFact]:
        user_id = _need(user_id)
        eff = await human_wins.effective(self.d, user_id)
        out: dict[str, MemoryFact] = {}
        if FactKind.knowledge in filters.kinds:
            for f in await self.d.engine.search(group_id(user_id), query, filters.limit * 3):
                m = await self._keep(user_id, f, eff, filters)
                if m is not None:
                    out.setdefault(m.id, m)
        if FactKind.action in filters.kinds:
            q = words(query)
            for a in await self.d.actions.standing(action_scope(user_id)):
                if a.value.get("key_hash") not in eff.suppressed and q & words(a.value.get("text")):
                    out.setdefault(ACTION_PREFIX + a.id, self._action(user_id, a))
        return list(out.values())[: filters.limit]

    async def entity(self, user_id: str, entity_id: str) -> MemoryEntity | None:
        user_id, group = _need(user_id), group_id(user_id)
        if not entity_id.startswith(ENTITY_PREFIX):
            return None
        e = await self.d.engine.entity(group, entity_id.removeprefix(ENTITY_PREFIX))
        eff = await human_wins.effective(self.d, user_id)
        if e is None or entity_key(user_id, e.name) in eff.blocked_entities:
            return None
        facts = [m for f in await self.d.engine.entity_facts(group, e.engine_id)
                 if (m := await self._knowledge(user_id, f, eff)) is not None]
        return MemoryEntity(id=entity_id, user_id=user_id, name=e.name, summary=e.summary,
                            facts=facts)

    async def _action_fact(self, user_id: str, fact_id: str) -> ActionFact | None:
        sid = fact_id.removeprefix(ACTION_PREFIX)
        return next((a for a in await self.d.actions.standing(action_scope(user_id))
                     if a.id == sid), None)

    async def _knowledge_exists(self, user_id: str, fact_id: str) -> bool:
        if await self.d.tables.registry.get(user_id, fact_id):
            return True
        return any(knowledge_fact_id(user_id, f.signature()) == fact_id
                   for f in await self.d.engine.facts(group_id(user_id)))

    # ---- human decisions ------------------------------------------------------------------------

    async def _rec(self, user_id: str, ask: Ask) -> Decision:
        return await human_wins.record(self.d, user_id, ask)

    async def correct(self, req: CorrectRequest) -> list[Decision] | None:
        """None: no such fact for this user."""
        user_id = _need(req.user_id)
        if req.fact_id.startswith(ACTION_PREFIX):
            return await self._correct_action(req)
        if not req.fact_id.startswith(KNOWLEDGE_PREFIX) or not await self._knowledge_exists(
                user_id, req.fact_id):
            return None
        old = req.fact_id.removeprefix(KNOWLEDGE_PREFIX)
        decs = [await self._rec(user_id, Ask(FactKind.knowledge, "suppress", old))]
        if req.statement is not None and not req.retract:
            h = knowledge_key(user_id, statement_signature(req.statement))
            decs.append(await self._rec(user_id, Ask(FactKind.knowledge, "assert", h,
                                                     req.statement.model_dump())))
        await human_wins.reapply(self.d, user_id)
        return decs

    async def _correct_action(self, req: CorrectRequest) -> list[Decision] | None:
        user_id = req.user_id
        a = await self._action_fact(user_id, req.fact_id)
        if a is None:
            return None
        decs = [await self._rec(user_id, Ask(FactKind.action, "suppress", a.value["key_hash"]))]
        if req.text is not None and not req.retract:
            kh = action_key(user_id, a.key, req.text)
            value = {"text": req.text, "due": req.due, "direction": req.direction,
                     "correction_of": a.id, "key_hash": kh, "memory_key": f"corr_{a.id}_{kh[:16]}"}
            draft = ActionFactDraft(subject=a.subject, key=a.key, occurred_at=a.occurred_at,
                                    source="person", scope=action_scope(user_id),
                                    value={k: v for k, v in value.items() if v is not None})
            decs.append(await self._rec(user_id, Ask(FactKind.action, "assert", kh,
                                                     draft.model_dump(mode="json"))))
        await human_wins.reapply(self.d, user_id)
        return decs

    async def _forget_one(self, user_id: str, fact_id: str) -> Decision | None:
        if fact_id.startswith(KNOWLEDGE_PREFIX):
            h = fact_id.removeprefix(KNOWLEDGE_PREFIX)
            return await self._rec(user_id, Ask(FactKind.knowledge, "suppress", h))
        a = await self._action_fact(user_id, fact_id)
        if a is None:
            return None
        return await self._rec(user_id, Ask(FactKind.action, "suppress", a.value["key_hash"]))

    async def forget(self, user_id: str, fact_ids: list[str],
                     entity_id: str | None = None) -> list[Decision]:
        """Remove and block, so a later ingest or rebuild cannot make it again. The recording
        stays (that is `erase`)."""
        user_id = _need(user_id)
        decs = [dec for fid in fact_ids if (dec := await self._forget_one(user_id, fid))]
        if entity_id and entity_id.startswith(ENTITY_PREFIX):
            e = await self.d.engine.entity(group_id(user_id), entity_id.removeprefix(ENTITY_PREFIX))
            if e is not None:
                decs.append(await self._rec(user_id, Ask(FactKind.knowledge, "suppress_entity",
                                                         entity_key(user_id, e.name))))
        await human_wins.reapply(self.d, user_id)
        return decs

    async def erase(self, user_id: str, recording_id: str, rng: TimeRange) -> EraseReport:
        return await erase_svc.erase(self.d, _need(user_id), recording_id, rng)

    async def rebuild(self, user_id: str, start: datetime | None = None,
                      end: datetime | None = None) -> RebuildReport:
        return await erase_svc.rebuild(self.d, _need(user_id), start, end)

    async def action_facts(self, user_id: str) -> list[ActionFact]:
        """Standing action facts in the raw taskfacts shape."""
        return await self.d.actions.standing(action_scope(_need(user_id)))
