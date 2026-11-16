"""Stores: persistence only. Services hold the rules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ledger.stores.base import EvidenceImmutableError, Outcome
from ledger.stores.evidence import (
    CorrectionStore,
    GapStore,
    RecordingStore,
    SegmentStore,
    TranscriptStore,
)
from ledger.stores.work import ErasureStore, LinkStore, MomentStore

__all__ = ["EvidenceImmutableError", "Outcome", "Stores", "build_stores", "ensure_indexes"]


@dataclass(frozen=True)
class Stores:
    recordings: RecordingStore
    transcripts: TranscriptStore
    segments: SegmentStore
    corrections: CorrectionStore
    gaps: GapStore
    links: LinkStore
    moments: MomentStore
    erasures: ErasureStore


def build_stores(db: Any) -> Stores:
    """db is a Motor database (or a mongomock-motor one in tests)."""
    return Stores(
        recordings=RecordingStore(db["recordings"]),
        transcripts=TranscriptStore(db["transcripts"]),
        segments=SegmentStore(db["segments"]),
        corrections=CorrectionStore(db["corrections"]),
        gaps=GapStore(db["gaps"]),
        links=LinkStore(db["links"]),
        moments=MomentStore(db["moments"]),
        erasures=ErasureStore(db["erasures"]),
    )


_INDEXES: dict[str, list[list[tuple[str, int]]]] = {
    "recordings": [[("userId", 1), ("start", 1), ("end", 1)]],
    "transcripts": [[("userId", 1), ("recordingId", 1), ("createdAt", 1)]],
    "segments": [[("userId", 1), ("recordingId", 1), ("revision", 1), ("start", 1)]],
    "corrections": [[("userId", 1), ("recordingId", 1), ("start", 1)]],
    "gaps": [[("userId", 1), ("start", 1), ("end", 1)]],
    "links": [
        [("userId", 1), ("key", 1)],
        [("userId", 1), ("fromId", 1)],
        [("userId", 1), ("toId", 1)],
    ],
    "moments": [[("userId", 1), ("recordingId", 1), ("start", 1)], [("userId", 1), ("start", 1)]],
    "erasures": [[("userId", 1), ("recordingId", 1)]],
}


async def ensure_indexes(db: Any) -> None:
    for name, indexes in _INDEXES.items():
        for keys in indexes:
            await db[name].create_index(keys)
