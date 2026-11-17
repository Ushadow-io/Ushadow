"""In-process fake of the memory service, shaped like its real routes (see clients/memory.py).

Tests only. Facts are what memory would show; `correct` / `forget` keep a suppress list (human
wins), so a forgotten fact stays gone, as in memory. `down = True` makes every call fail like
an outage.
"""

from __future__ import annotations

import itertools
import re
from datetime import UTC, datetime
from typing import Any

from ledger.clients.memory import (
    ACTION_PREFIX,
    KNOWLEDGE_PREFIX,
    FactQuery,
    MemoryDecision,
    MemoryEntity,
    MemoryFact,
    MemoryFactDecision,
    MemoryKnownEntity,
    MemoryUnavailable,
)

_WORD = re.compile(r"[a-z0-9]+")


def words(text: str | None) -> set[str]:
    return set(_WORD.findall((text or "").lower()))


class FakeMemoryClient:
    def __init__(self, facts: list[MemoryFact] | None = None,
                 entities: list[MemoryEntity] | None = None) -> None:
        self.facts: dict[str, MemoryFact] = {f.id: f for f in facts or []}
        self.entities: dict[str, MemoryEntity] = {e.id: e for e in entities or []}
        self.suppressed: set[str] = set()
        self.decisions: list[MemoryDecision] = []
        self.fact_decisions_of: dict[str, list[MemoryFactDecision]] = {}
        self.known: dict[tuple[str, str], MemoryKnownEntity] = {}  # (user, lower name) -> entry
        self.calls: list[str] = []
        self.down = False
        self._ids = itertools.count(1)

    def _check(self, route: str) -> None:
        self.calls.append(route)
        if self.down:
            raise MemoryUnavailable("memory_unreachable")

    def _live(self, user_id: str) -> list[MemoryFact]:
        return [f for f in self.facts.values() if f.id not in self.suppressed]

    async def search(self, user_id: str, query: FactQuery) -> list[MemoryFact]:
        self._check("search")
        q = words(query.q)
        out = [f for f in self._live(user_id) if f.kind in query.kinds and q & words(f.text)
               and (query.includeClosed or f.invalidAt is None)]
        return out[: query.limit]

    async def entity(self, user_id: str, entity_id: str) -> MemoryEntity | None:
        self._check("entities")
        e = self.entities.get(entity_id)
        if e is None or entity_id in self.suppressed:
            return None
        facts = [f for f in self._live(user_id) if f.kind == "knowledge" and entity_id in f.about]
        return e.model_copy(update={"facts": facts})

    async def action_facts(self, user_id: str) -> list[MemoryFact]:
        self._check("action-facts")
        return [f for f in self._live(user_id) if f.kind == "action"]

    async def fact(self, user_id: str, fact_id: str) -> MemoryFact | None:
        self._check("facts")
        return None if fact_id in self.suppressed else self.facts.get(fact_id)

    async def fact_decisions(
        self, user_id: str, fact_id: str
    ) -> list[MemoryFactDecision] | None:
        self._check("facts")
        if fact_id in self.suppressed or fact_id not in self.facts:
            return None
        return list(self.fact_decisions_of.get(fact_id, []))

    def _decide(self, kind: str, op: str) -> MemoryDecision:
        d = MemoryDecision(id=f"d{next(self._ids)}", kind=kind, op=op, createdAt=datetime.now(UTC))
        self.decisions.append(d)
        return d

    async def correct(self, body: dict[str, Any]) -> list[MemoryDecision] | None:
        self._check("correct")
        old = self.facts.get(body["factId"])
        if old is None or old.id in self.suppressed:
            return None
        self.suppressed.add(old.id)
        decs = [self._decide(old.kind, "suppress")]
        new_text = _statement_text(body)
        if new_text and not body.get("retract"):
            prefix = KNOWLEDGE_PREFIX if old.kind == "knowledge" else ACTION_PREFIX
            fid = f"{prefix}human{next(self._ids)}"
            update = {"id": fid, "text": new_text, "source": "person", "evidence": [],
                      "invalidAt": None}
            self.facts[fid] = old.model_copy(update=update)
            st = body.get("statement")
            self.fact_decisions_of[fid] = [MemoryFactDecision(
                id=f"fd{next(self._ids)}", kind="correct", at=datetime.now(UTC), statement=st,
                text=None if st else new_text, due=body.get("due"),
                direction=body.get("direction"))]
            decs.append(self._decide(old.kind, "assert"))
        return decs

    async def forget(
        self, user_id: str, fact_ids: list[str], entity_id: str | None
    ) -> list[MemoryDecision]:
        self._check("forget")
        decs = []
        for fid in fact_ids:
            if fid in self.facts:
                self.suppressed.add(fid)
                decs.append(self._decide(self.facts[fid].kind, "suppress"))
        if entity_id and entity_id in self.entities:
            self.suppressed.add(entity_id)
            decs.append(self._decide("knowledge", "suppress_entity"))
        return decs

    async def known_entities(self, user_id: str) -> list[MemoryKnownEntity]:
        self._check("known-entities")
        return sorted((e for (u, _), e in self.known.items() if u == user_id),
                      key=lambda e: e.name.lower())

    async def name_entity(self, body: dict[str, Any]) -> MemoryKnownEntity:
        self._check("known-entities")
        entry = MemoryKnownEntity(id=f"dec_known{next(self._ids)}", name=body["name"].strip(),
                                  aliases=sorted({a.strip() for a in body.get("aliases") or []
                                                  if a.strip()}), type=body.get("type"))
        self.known[(body["userId"], entry.name.lower())] = entry
        return entry

    async def unname_entity(self, user_id: str, name: str) -> bool:
        self._check("known-entities")
        return self.known.pop((user_id, name.strip().lower()), None) is not None


def _statement_text(body: dict[str, Any]) -> str | None:
    st = body.get("statement")
    if st:
        return st.get("text") or f"{st['subject']} {st['relation']} {st['object']}"
    return body.get("text")
