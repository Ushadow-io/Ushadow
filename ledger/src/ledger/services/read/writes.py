"""correct / forget through the read API: forwarded as HUMAN decisions to the service that
owns the thing. Facts: memory `/correct`, `/forget` (memory writes the suppress decision, so a
re-run cannot make the fact again). Conversation structure: the ledger's own decisions.

`target_items` gives the gateway what each write touches, so the scope gate can check it
before anything is sent."""

from __future__ import annotations

from ledger.clients.memory import (
    ACTION_PREFIX,
    ENTITY_PREFIX,
    KNOWLEDGE_PREFIX,
    MemoryDecision,
    MemoryRejected,
    MemoryUnavailable,
)
from ledger.models import DecisionError, DecisionRequest
from ledger.read_models import (
    CorrectRequest,
    ForgetRequest,
    Item,
    ItemKind,
    Refusal,
    RefusalCode,
    WriteAnswer,
)
from ledger.services.read.answers import ReadDeps
from ledger.services.read.views import fact_item

_DECISION_REFUSAL = {
    DecisionError.unknown_retracts: RefusalCode.not_found,
    DecisionError.key_mismatch: RefusalCode.conflict,
    DecisionError.missing_target: RefusalCode.invalid,
}
NOT_FOUND = Refusal(code=RefusalCode.not_found, detail="not found for this user")
UNAVAILABLE = Refusal(code=RefusalCode.unavailable, detail="memory is unavailable")


def _rows(decisions: list[MemoryDecision]) -> list[dict]:
    return [{"id": d.id, "kind": d.kind, "op": d.op, "decidedBy": "human"} for d in decisions]


class WriteHandlers:
    def __init__(self, deps: ReadDeps) -> None:
        self.d = deps

    async def target_items(self, req: CorrectRequest | ForgetRequest) -> list[Item] | Refusal:
        """What the write touches, as items the gate can judge. A fact id that is not this
        user's (or that memory does not show) is not_found."""
        if isinstance(req, CorrectRequest):
            if req.conversation is not None:
                return [Item(kind=ItemKind.conversation, id=req.conversation.fromId)]
            ids, entity = [req.fact.factId] if req.fact else [], None
        else:
            ids, entity = list(req.factIds), req.entityId
        if entity and not entity.startswith(ENTITY_PREFIX):
            return NOT_FOUND
        if any(not i.startswith((KNOWLEDGE_PREFIX, ACTION_PREFIX)) for i in ids):
            return NOT_FOUND  # an id in no known format
        items = [Item(kind=ItemKind.knowledge, id=i) for i in [*ids, *([entity] if entity else [])]
                 if not i.startswith(ACTION_PREFIX)]
        actions = [i for i in ids if i.startswith(ACTION_PREFIX)]
        found = await self._action_items(req.userId, actions) if actions else []
        return found if isinstance(found, Refusal) else items + found

    async def _action_items(self, user_id: str, ids: list[str]) -> list[Item] | Refusal:
        """Action facts carry their subkind and sensitivity: read them so the gate can judge."""
        try:
            shown = {f.id: f for f in await self.d.memory.action_facts(user_id)}
        except (MemoryUnavailable, MemoryRejected):
            return UNAVAILABLE
        if any(i not in shown for i in ids):
            return NOT_FOUND
        return [fact_item(shown[i]) for i in ids]

    async def correct(self, req: CorrectRequest) -> WriteAnswer | Refusal:
        if req.conversation is not None:
            return await self._decide(req)
        fact = req.fact
        assert fact is not None
        body = {"userId": req.userId, **fact.model_dump(mode="json", exclude_none=True)}
        try:
            decisions = await self.d.memory.correct(body)
        except MemoryUnavailable:
            return UNAVAILABLE
        except MemoryRejected:
            return Refusal(code=RefusalCode.invalid, detail="memory refused the correction")
        if decisions is None:
            return NOT_FOUND
        return WriteAnswer(userId=req.userId, owner="memory", decisions=_rows(decisions))

    async def _decide(self, req: CorrectRequest) -> WriteAnswer | Refusal:
        conv = req.conversation
        assert conv is not None
        decision = DecisionRequest(userId=req.userId, **conv.model_dump())
        result = await self.d.conversations.decide(decision)
        if isinstance(result, DecisionError):
            return Refusal(code=_DECISION_REFUSAL[result], detail=result.value)
        row = {"id": result.link.id, "kind": "conversation", "op": result.link.kind.value,
               "decidedBy": result.link.decidedBy.value, "created": result.created}
        return WriteAnswer(userId=req.userId, owner="ledger", decisions=[row], link=result.link,
                           effective=result.effective)

    async def forget(self, req: ForgetRequest) -> WriteAnswer | Refusal:
        try:
            decisions = await self.d.memory.forget(req.userId, req.factIds, req.entityId)
        except MemoryUnavailable:
            return UNAVAILABLE
        except MemoryRejected:
            return Refusal(code=RefusalCode.invalid, detail="memory refused the request")
        return WriteAnswer(userId=req.userId, owner="memory", decisions=_rows(decisions))
