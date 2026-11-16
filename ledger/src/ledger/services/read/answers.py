"""Read handlers: context, resolve, search, timeline. They build UNSCOPED answers; only the
gateway calls them, and it runs the scope gate on every answer before it leaves the service."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from ledger.clients.memory import FactQuery, MemoryClient
from ledger.l2_models import ConversationView
from ledger.read_models import (
    ContextAnswer,
    ContextRequest,
    EntityCandidate,
    ItemKind,
    ResolveAnswer,
    ResolveRequest,
    SearchAnswer,
    SearchRequest,
    TimelineAnswer,
    TimelineRequest,
)
from ledger.schema import TimeRange
from ledger.services.conversation_service import ConversationService
from ledger.services.moment_service import Clock
from ledger.services.query_service import QueryService
from ledger.services.read.memory_view import MemoryView
from ledger.services.read.views import (
    candidate,
    conversation_item,
    conversation_words,
    fact_in_range,
    fact_item,
    people,
    words,
)

CONTEXT_CONVERSATIONS = 5
PEOPLE_MAX = 5


@dataclass(frozen=True)
class ReadDeps:
    conversations: ConversationService
    query: QueryService
    memory: MemoryClient
    clock: Clock


def _latest_first(views: list[ConversationView]) -> list[ConversationView]:
    """Open conversations first, then by end, newest first."""
    return sorted(views, key=lambda v: (v.conversation.closedAt is None, v.conversation.range.end),
                  reverse=True)


async def people_of(mem: MemoryView, views: list[ConversationView]) -> list[EntityCandidate]:
    """Standing facts about the people in these conversations. A name with several matching
    entities gives them all (no silent pick). They need the conversation scope too: the names
    come from the conversations."""
    names: list[str] = []
    for v in views:
        names += [n for n in people(v) if n not in names]
    out: list[EntityCandidate] = []
    for name in names[:PEOPLE_MAX]:
        for e, match in await mem.entities_named(name):
            if match == "exact" and all(c.id != e.id for c in out):
                out.append(candidate(e, match, requires=[ItemKind.conversation.value]))
    return out


class ReadHandlers:
    def __init__(self, deps: ReadDeps) -> None:
        self.d = deps

    def memory(self, user_id: str) -> MemoryView:
        return MemoryView(self.d.memory, user_id)

    async def _matching(self, user_id: str, rng: TimeRange | None, q: str) -> list:
        wanted = words(q)
        views = await self.d.conversations.list(user_id, rng)
        scored = [(len(wanted & conversation_words(v)), v) for v in views]
        return [v for n, v in sorted(scored, key=lambda p: -p[0]) if n > 0]

    async def context(self, req: ContextRequest) -> ContextAnswer:
        now = req.now or self.d.clock()
        rng = TimeRange(start=now - timedelta(hours=req.hours), end=now)
        if req.query:
            views = _latest_first(await self._matching(req.userId, rng, req.query))
        else:
            views = _latest_first(await self.d.conversations.list(req.userId, rng))
        views = views[:CONTEXT_CONVERSATIONS]
        mem = self.memory(req.userId)
        answer = ContextAnswer(userId=req.userId, range=rng, now=now,
                               conversations=[conversation_item(v) for v in views],
                               people=await people_of(mem, views),
                               gaps=await self.d.query.gaps(req.userId, rng))
        return mem.mark(answer)

    async def resolve(self, req: ResolveRequest) -> ResolveAnswer:
        mem = self.memory(req.userId)
        found = await mem.entities_named(req.text)
        answer = ResolveAnswer(userId=req.userId, text=req.text,
                               candidates=[candidate(e, match) for e, match in found])
        return mem.mark(answer)

    async def search(self, req: SearchRequest) -> SearchAnswer:
        mem = self.memory(req.userId)
        rng = req.range
        items = []
        fact_kinds = [k.value for k in req.kinds if k != ItemKind.conversation]
        if fact_kinds:
            query = FactQuery(q=req.q, kinds=fact_kinds, includeClosed=req.includeClosed,
                              limit=req.limit)
            facts = await mem.search(query)
            items += [fact_item(f) for f in facts if rng is None or fact_in_range(f, rng)]
        if ItemKind.conversation in req.kinds:
            views = await self._matching(req.userId, rng, req.q)
            items += [conversation_item(v) for v in views[: req.limit]]
        gaps = await self.d.query.gaps(req.userId, rng) if rng else []
        answer = SearchAnswer(userId=req.userId, range=rng, query=req.q, items=items, gaps=gaps)
        return mem.mark(answer)

    async def timeline(self, req: TimelineRequest) -> TimelineAnswer:
        rng = req.range
        views = await self.d.conversations.list(req.userId, rng)
        views.sort(key=lambda v: (v.conversation.range.start, v.conversation.id))
        return TimelineAnswer(userId=req.userId, range=rng,
                              conversations=[conversation_item(v) for v in views],
                              gaps=await self.d.query.gaps(req.userId, rng))
