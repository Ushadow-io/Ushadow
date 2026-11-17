"""Helpers for the staged engine tests: episodes, scripted answers, a rule-based fake model."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from memory_service.engine.fake import _PATTERN, SINGLE_VALUED
from memory_service.engine.staged import FakeLLM, MemoryGraphStore, StagedEngine, StagedSettings
from memory_service.engine.staged.llm import LLMRequest
from memory_service.models import EpisodeInput, EpisodeLine
from memory_service.textutil import norm

T0 = datetime(2024, 1, 10, 9, 0, tzinfo=UTC)
G = "u_test_group"


def episode(name: str, lines: list[tuple[str, str]], start: datetime = T0) -> EpisodeInput:
    """lines: (speaker, text); 10 s per line, recording `rec-<name>`."""
    out = [EpisodeLine(recording_id=f"rec-{name}", transcript_revision="final-1",
                       start=start + timedelta(seconds=10 * i),
                       end=start + timedelta(seconds=10 * i + 9), speaker=s,
                       role="owner" if s == "Owner" else "participant", text=t)
           for i, (s, t) in enumerate(lines)]
    return EpisodeInput(name=name, reference_time=start, lines=out)


def facts(*items: tuple[str, str, str, list[str]] | tuple[str, str, str, list[str], dict[str, Any]]
          ) -> dict[str, Any]:
    """An extract answer: (subject, relation, object, line refs[, extra fields])."""
    names = sorted({n for it in items for n in (it[0], it[2])})
    out = []
    for it in items:
        s, r, o, refs = it[:4]
        extra = it[4] if len(it) > 4 else {}
        out.append({"subject": s, "relation": r, "object": o, "fact": f"{s} {r} {o}", "lines": refs,
                    "valid_from": None, "valid_until": None, "quote": None, **extra})
    return {"entities": [{"name": n, "type": "Entity", "aliases": []} for n in names], "facts": out}


# ---- a rule-based fake model: the fake engine's regexes, answered per stage ----------------------


def rule_extract(req: LLMRequest) -> dict[str, Any]:
    items = []
    for line in req.payload:
        for m in _PATTERN.finditer(line["text"]):
            s, rel, o = m.group("s"), m.group("rel"), m.group("o").strip()
            items.append((s, rel, o, [line["ref"]], {"quote": m.group(0)}))
    return facts(*items)


_KNOWN = re.compile(r"^(?P<s>\S+) (?P<rel>works at|lives in|likes|prefers|is married to) (?P<o>.+)$")


def _judge(item: dict[str, Any]) -> dict[str, Any]:
    rel, obj = norm(item["relation"]), norm(item["object"])
    for k in item["known"]:
        m = _KNOWN.match(k["fact"])
        if m and norm(m.group("rel")) == rel and norm(m.group("o")) == obj:
            return {"id": item["id"], "answer": "duplicate", "known_ids": [k["id"]], "certainty": "high"}
    ends = [k["id"] for k in item["known"] if (m := _KNOWN.match(k["fact"])) and norm(m.group("rel")) == rel
            and rel in SINGLE_VALUED]
    if ends:
        return {"id": item["id"], "answer": "contradicts", "known_ids": ends, "certainty": "high"}
    return {"id": item["id"], "answer": "new", "known_ids": [], "certainty": "high"}


def rule_reconcile(req: LLMRequest) -> dict[str, Any]:
    return {"decisions": [_judge(it) for it in req.payload]}


def rule_match(req: LLMRequest) -> dict[str, Any]:
    return {"decisions": [{"id": it["id"], "answer": "new", "candidate": None, "certainty": "high"}
                          for it in req.payload]}


def rule_llm() -> FakeLLM:
    return FakeLLM({"extract": rule_extract, "match": rule_match, "reconcile": rule_reconcile,
                    "review": lambda r: {"answer": "inconclusive", "candidate": None, "certainty": "low"},
                    "dup_facts": lambda r: {"decisions": [{"id": p["id"], "same": False}
                                                          for p in r.payload]}})


def staged(llm: FakeLLM | None = None, **settings: Any) -> StagedEngine:
    base = {"store": "memory", "same_above": 0.95, "new_below": 0.5}
    return StagedEngine(MemoryGraphStore(), llm or rule_llm(), StagedSettings(**{**base, **settings}))
