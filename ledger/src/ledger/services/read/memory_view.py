"""Memory as one read-API answer sees it: every call that fails is recorded (a fixed reason)
and answers an empty result, so the ledger parts of the answer are still returned."""

from __future__ import annotations

from collections.abc import Awaitable

from ledger.clients.memory import (
    FactQuery,
    MemoryClient,
    MemoryEntity,
    MemoryFact,
    MemoryFactDecision,
    MemoryRejected,
    MemoryUnavailable,
)
from ledger.read_models import Answer
from ledger.services.read.views import name_match

MAX_ENTITIES = 10


class MemoryView:
    def __init__(self, client: MemoryClient, user_id: str) -> None:
        self._c = client
        self._user = user_id
        self.reasons: list[str] = []

    async def _safe[T](self, call: Awaitable[T], default: T) -> T:
        try:
            return await call
        except MemoryUnavailable as exc:
            if exc.reason not in self.reasons:
                self.reasons.append(exc.reason)
        except MemoryRejected as exc:
            reason = f"memory_rejected_{exc.status}"
            if reason not in self.reasons:
                self.reasons.append(reason)
        return default

    async def search(self, query: FactQuery) -> list[MemoryFact]:
        return await self._safe(self._c.search(self._user, query), [])

    async def entity(self, entity_id: str) -> MemoryEntity | None:
        return await self._safe(self._c.entity(self._user, entity_id), None)

    async def fact(self, fact_id: str) -> MemoryFact | None:
        return await self._safe(self._c.fact(self._user, fact_id), None)

    async def fact_decisions(self, fact_id: str) -> list[MemoryFactDecision] | None:
        return await self._safe(self._c.fact_decisions(self._user, fact_id), None)

    async def action_facts(self) -> list[MemoryFact]:
        return await self._safe(self._c.action_facts(self._user), [])

    async def entities_named(self, text: str) -> list[tuple[MemoryEntity, str]]:
        """Entities whose name matches `text` (exact first). Memory has no name lookup, so:
        search knowledge facts with the words, collect the entities they are about, read them."""
        facts = await self.search(FactQuery(q=text, kinds=["knowledge"], includeClosed=True,
                                            limit=50))
        ids: list[str] = []
        for f in facts:
            subject = (f.subject or {}).get("id")
            for eid in ([subject] if subject else []) + f.about:
                if eid not in ids:
                    ids.append(eid)
        found = []
        for eid in ids[:MAX_ENTITIES]:
            e = await self.entity(eid)
            match = name_match(e.name, text) if e else None
            if e and match:
                found.append((e, match))
        return sorted(found, key=lambda pair: pair[1] != "exact")

    def mark(self, answer: Answer) -> Answer:
        if self.reasons:
            answer.partial = True
            answer.partialReasons = [*answer.partialReasons, *self.reasons]
        return answer
