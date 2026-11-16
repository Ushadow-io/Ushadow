"""Test helpers. No network: fake engine, fake ledger, in-memory side tables and action store."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from memory_service.actions import FakeActionExtractor, InMemoryActionFactStore
from memory_service.engine import FakeEngine
from memory_service.ledger_client import FakeLedger
from memory_service.models import SearchFilters
from memory_service.schema import Conversation, TimeRange, Transcript
from memory_service.services.deps import Deps
from memory_service.services.port import MemoryPort
from memory_service.stores import memory_tables

T0 = datetime(2024, 1, 10, 9, 0, tzinfo=UTC)  # in the past whatever the machine clock says
USER_A = "alice@example.test"
USER_B = "bob@example.test"
SEG = timedelta(seconds=10)


def make_deps(**over) -> Deps:
    kw = dict(engine=FakeEngine(), tables=memory_tables(), ledger=FakeLedger(),
              actions=InMemoryActionFactStore(), extractor=FakeActionExtractor())
    kw.update(over)
    return Deps(**kw)


def seg_range(start: datetime, index: int) -> TimeRange:
    return TimeRange(start=start + index * SEG, end=start + (index + 1) * SEG - timedelta(seconds=1))


def add_recording(ledger: FakeLedger, user: str, rec_id: str, start: datetime,
                  lines: list[tuple[str, str]]) -> None:
    """lines: (speaker label, text). S0 = owner, S1 = participant, TV = media. 10 s per line."""
    segments = [{"id": f"{rec_id}-s{i}", "text": text, "speakerLabel": label,
                 "start": (start + i * SEG).isoformat(),
                 "end": (start + (i + 1) * SEG - timedelta(seconds=1)).isoformat()}
                for i, (label, text) in enumerate(lines)]
    ledger.add_transcript(user, Transcript.model_validate({
        "recordingId": rec_id, "revision": "final-1", "createdAt": start.isoformat(),
        "speakers": [{"label": "S0", "role": "owner", "displayName": "Owner"},
                     {"label": "S1", "role": "participant"},
                     {"label": "TV", "role": "media"}],
        "segments": segments}))


def conversation(conv_id: str, rec_id: str, start: datetime, n_lines: int, revision: int = 1,
                 first: int = 0) -> Conversation:
    s, e = start + first * SEG, start + n_lines * SEG
    return Conversation.model_validate({
        "id": conv_id, "revision": revision, "closedAt": e.isoformat(),
        "range": {"start": s.isoformat(), "end": e.isoformat()},
        "parts": [{"recordingId": rec_id, "range": {"start": s.isoformat(), "end": e.isoformat()}}]})


def seed(deps: Deps, user: str, conv_id: str, start: datetime, lines: list[tuple[str, str]],
         revision: int = 1) -> Conversation:
    rec = f"rec-{conv_id}"
    add_recording(deps.ledger, user, rec, start, lines)
    conv = conversation(conv_id, rec, start, len(lines), revision)
    deps.ledger.add_conversation(user, conv)
    return conv


async def texts(port: MemoryPort, user: str, q: str, **f) -> list[str]:
    return sorted(m.text or "" for m in await port.search(user, q, SearchFilters(**f)))


async def everything(deps: Deps) -> str:
    """Every byte the memory service holds, as lower-case text: engine, side tables, actions."""
    parts = [deps.engine.dump()]
    for c in deps.tables.collections.values():
        parts.append(json.dumps(c.docs, default=str))
    parts.append(json.dumps([f.model_dump(mode="json") for f in deps.actions.log]))
    return "\n".join(parts).lower()
