"""Read handlers: brief (a person/topic entity, or one conversation) and why (a fact or a
conversation). UNSCOPED answers; the gateway runs the scope gate on them."""

from __future__ import annotations

from datetime import timedelta

from ledger.clients.memory import ACTION_PREFIX, MemoryFact
from ledger.l2_models import ConversationView
from ledger.read_models import (
    BriefAnswer,
    BriefRequest,
    Item,
    ItemKind,
    Refusal,
    RefusalCode,
    WhyAnswer,
    WhyRequest,
    WhyStep,
)
from ledger.schema import TimeRange
from ledger.services.read.answers import ReadDeps, people_of
from ledger.services.read.memory_view import MemoryView
from ledger.services.read.views import (
    candidate,
    conversation_item,
    fact_item,
    norm,
    people,
    words,
)

RECENT = 5
NOT_FOUND = Refusal(code=RefusalCode.not_found, detail="not found for this user")


def _sort_actions(answer: BriefAnswer, facts: list[MemoryFact]) -> None:
    for item in (fact_item(f) for f in facts):
        if item.subKind == "task":
            answer.openTasks.append(item)
        elif item.subKind == "commitment":
            {"owed_by_me": answer.commitmentsByMe, "owed_to_me": answer.commitmentsToMe}.get(
                item.direction or "", answer.commitmentsOther).append(item)
        elif item.subKind == "decision":
            answer.decisions.append(item)
        else:
            answer.facts.append(item)


def _mentions(view: ConversationView, name: str) -> bool:
    if norm(name) in {norm(p) for p in people(view)}:
        return True
    c = view.conversation
    return words(name) <= words(f"{c.title} {c.summary}") and bool(words(name))


def _about(fact: MemoryFact, entity_id: str, name: str) -> bool:
    return entity_id in fact.about or (bool(words(name)) and words(name) <= words(fact.text))


class BriefHandlers:
    def __init__(self, deps: ReadDeps) -> None:
        self.d = deps

    async def brief(self, req: BriefRequest) -> BriefAnswer | Refusal:
        mem = MemoryView(self.d.memory, req.userId)
        if req.conversationId:
            answer = await self._brief_conversation(req, mem)
        else:
            answer = await self._brief_entity(req, mem)
        return mem.mark(answer) if isinstance(answer, BriefAnswer) else answer

    async def _brief_entity(self, req: BriefRequest, mem: MemoryView) -> BriefAnswer | Refusal:
        entity_id = req.entityId or ""
        entity = await mem.entity(entity_id)
        if entity is None:
            return NOT_FOUND if not mem.reasons else BriefAnswer(
                userId=req.userId, subject={"kind": "entity", "id": entity_id})
        now = self.d.clock()
        rng = TimeRange(start=now - timedelta(days=req.days), end=now)
        views = [v for v in await self.d.conversations.list(req.userId, rng)
                 if _mentions(v, entity.name)]
        views.sort(key=lambda v: v.conversation.range.end, reverse=True)
        items = [conversation_item(v) for v in views[:RECENT]]
        answer = BriefAnswer(userId=req.userId, range=rng,
                             subject={"kind": "entity", "id": entity_id},
                             entity=candidate(entity, "exact"),
                             lastTalk=items[0] if items else None, conversations=items,
                             gaps=await self.d.query.gaps(req.userId, rng))
        actions = [f for f in await mem.action_facts() if _about(f, entity_id, entity.name)]
        _sort_actions(answer, actions)
        return answer

    async def _brief_conversation(self, req: BriefRequest, mem: MemoryView) -> BriefAnswer | (
        Refusal
    ):
        conv_id = req.conversationId or ""
        view = await self.d.conversations.get(req.userId, conv_id)
        if view is None:
            return NOT_FOUND
        rng = view.conversation.range
        answer = BriefAnswer(userId=req.userId, range=rng,
                             subject={"kind": "conversation", "id": conv_id},
                             conversation=conversation_item(view),
                             people=await people_of(mem, [view]),
                             gaps=await self.d.query.gaps(req.userId, rng))
        _sort_actions(answer, [f for f in await mem.action_facts() if f.conversationId == conv_id])
        return answer

    async def why(self, req: WhyRequest) -> WhyAnswer | Refusal:
        if req.conversationId:
            return await self._why_conversation(req.userId, req.conversationId)
        return await self._why_fact(req.userId, req.factId or "")

    async def _why_conversation(self, user_id: str, conv_id: str) -> WhyAnswer | Refusal:
        view = await self.d.conversations.get(user_id, conv_id)
        why = await self.d.conversations.why(user_id, conv_id)
        if view is None or why is None:
            return NOT_FOUND
        steps = [WhyStep(kind=ItemKind.conversation, role=row.role, source=row.source,
                         decidedBy=row.link.decidedBy.value if row.link else "rule", link=row.link)
                 for row in why.decisions]
        rng = view.conversation.range
        return WhyAnswer(userId=user_id, range=rng, target={"kind": "conversation", "id": conv_id},
                         item=conversation_item(view), steps=steps,
                         gaps=await self.d.query.gaps(user_id, rng))

    async def _why_fact(self, user_id: str, fact_id: str) -> WhyAnswer | Refusal:
        """Action facts are found through /action-facts. Memory has no lookup of ONE knowledge
        fact by id yet: such an answer is partial (`memory_fact_lookup_unsupported`)."""
        mem = MemoryView(self.d.memory, user_id)
        target = {"kind": "fact", "id": fact_id}
        if not fact_id.startswith(ACTION_PREFIX):
            return WhyAnswer(userId=user_id, target=target, partial=True,
                             partialReasons=["memory_fact_lookup_unsupported"])
        fact = next((f for f in await mem.action_facts() if f.id == fact_id), None)
        if fact is None:
            return mem.mark(WhyAnswer(userId=user_id, target=target)) if mem.reasons else NOT_FOUND
        item = fact_item(fact)
        return WhyAnswer(userId=user_id, target=target, item=item, steps=[_asserted(item)])


def _asserted(item: Item) -> WhyStep:
    """Who made the fact: a person (a human decision) or the extractor model."""
    return WhyStep(kind=item.kind, subKind=item.subKind, sensitivity=item.sensitivity,
                   role="asserted", source=item.source,
                   decidedBy="human" if item.source == "person" else "model")
