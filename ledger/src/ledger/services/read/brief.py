"""Read handlers: brief (a person/topic entity, or one conversation) and why (a fact or a
conversation). UNSCOPED answers; the gateway runs the scope gate on them."""

from __future__ import annotations

from datetime import timedelta

from ledger.clients.memory import MemoryFact
from ledger.l2_models import ConversationView
from ledger.read_models import (
    BriefAnswer,
    BriefRequest,
    Refusal,
    RefusalCode,
    WhyAnswer,
    WhyRequest,
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
from ledger.services.read.why_fact import conversation_steps, why_fact

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
        return await why_fact(self.d, req.userId, req.factId or "")

    async def _why_conversation(self, user_id: str, conv_id: str) -> WhyAnswer | Refusal:
        view = await self.d.conversations.get(user_id, conv_id)
        why = await self.d.conversations.why(user_id, conv_id)
        if view is None or why is None:
            return NOT_FOUND
        steps = conversation_steps(why)
        rng = view.conversation.range
        return WhyAnswer(userId=user_id, range=rng, target={"kind": "conversation", "id": conv_id},
                         item=conversation_item(view), steps=steps,
                         gaps=await self.d.query.gaps(user_id, rng))
