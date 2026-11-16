"""Deterministic stand-in model for tests and dry runs. The answer depends only on the prompt.

- gap:      continues when the gap is <= 10 min and a non-owner speaker of the next lines is
            already in the state's people; else new.
- state:    topic = first 4 words of the conversation's first line (kept once set); people =
            names heard; threads = lines that end with "?". With `split_marker`, the first line
            that contains it is reported as `topicChangedAt`.
- composer: title = topic; summary = topic + threads; citations = the first two line ids.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from ledger.llm.client import ModelRequest

GAP_MAX_SECONDS = 600


@dataclass(frozen=True)
class FakeBehaviour:
    split_marker: str | None = None
    bogus_split: bool = False  # cite a segment id that does not exist
    cite_bogus: bool = False  # composer adds a citation that does not exist
    broken_answers: int = 0  # the first N answers are not JSON


def _rows(rows: list[str]) -> list[tuple[str, str, str]]:
    """(id, who, text) of 'id|time|role:speaker|text' rows."""
    out = []
    for row in rows:
        seg_id, _time, who, text = (row.split("|", 3) + ["", "", ""])[:4]
        out.append((seg_id, who, text))
    return out


def _words(text: str, n: int) -> str:
    return " ".join(text.split()[:n])


class FakeModel:
    def __init__(self, behaviour: FakeBehaviour | None = None, name: str = "fake-small") -> None:
        self.name = name
        self.behaviour = behaviour or FakeBehaviour()
        self.calls = 0
        self._broken = self.behaviour.broken_answers

    async def complete(self, req: ModelRequest) -> str:
        self.calls += 1
        if self._broken > 0:
            self._broken -= 1
            return "this is not json"
        payload = json.loads(req.user)
        handler = {"gap": self._gap, "state": self._state, "composer": self._compose}[req.layer]
        return json.dumps(handler(payload))

    def _gap(self, payload: dict[str, Any]) -> dict[str, Any]:
        known = set(payload["state"]["people"])
        names = {who.split(":", 1)[1] for _, who, _ in _rows(payload["next"])}
        others = {n for n in names if n in known}
        near = payload["gapSeconds"] <= GAP_MAX_SECONDS
        return {"decision": "continues" if near and others else "new", "confidence": 0.8}

    def _split(self, payload: dict[str, Any], rows: list[tuple[str, str, str]]) -> str | None:
        marker = self.behaviour.split_marker
        if not payload.get("allowSplit") or not marker:
            return None
        hit = next((seg_id for seg_id, _, text in rows if marker in text), None)
        if hit and self.behaviour.bogus_split:
            return "seg-that-does-not-exist"
        return hit

    def _state(self, payload: dict[str, Any]) -> dict[str, Any]:
        state = payload["state"]
        rows = _rows(payload["lines"])
        split = self._split(payload, rows)
        topic = state["topic"] or (_words(rows[0][2], 4) if rows else "")
        hit = next((text for seg_id, _, text in rows if seg_id == split), None)
        if hit:
            topic = _words(hit, 4)
        names = {who.split(":", 1)[1] for _, who, _ in rows}
        threads = state["threads"] + [text for _, _, text in rows if text.endswith("?")]
        new = {"topic": topic, "people": sorted(set(state["people"]) | names), "threads": threads}
        return {"state": new, "topicChangedAt": split}

    def _compose(self, payload: dict[str, Any]) -> dict[str, Any]:
        state = payload["state"]
        rows = _rows(payload["lines"])
        topic = state["topic"] or (_words(rows[0][2], 4) if rows else "talk")
        citations = [seg_id for seg_id, _, _ in rows[:2]]
        if self.behaviour.cite_bogus:
            citations.append("seg-bogus")
        return {
            "title": topic,
            "summary": "; ".join([topic, *state["threads"]]),
            "citations": citations,
        }
