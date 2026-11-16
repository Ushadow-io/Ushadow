"""Pure rules for Decisions (Link): which Link answers a key, and when two recordings are one."""

from __future__ import annotations

from collections.abc import Sequence

from ledger.models import DUPLICATE_POLICY
from ledger.schema import Decider, Link, Recording
from ledger.timeutil import duration, overlap_seconds, ts, utc

_PRIORITY = {Decider.human: 3, Decider.model: 2, Decider.rule: 1}

DUPLICATE_MIN_OVERLAP = 0.9


def effective(links: Sequence[Link]) -> Link | None:
    """The Link that answers the key: not retracted; human over model over rule; newest wins."""
    retracted = {link.retracts for link in links if link.retracts}
    active = [link for link in links if link.id not in retracted]
    if not active:
        return None
    return max(active, key=lambda link: (_PRIORITY[link.decidedBy], ts(link.recordedAt), link.id))


def duplicate_pair(a: Recording, b: Recording) -> tuple[Recording, Recording]:
    """Stable order, so both directions give the same key."""
    first, second = sorted((a, b), key=lambda r: (ts(r.range.start), r.id))
    return first, second


def duplicate_key(a: Recording, b: Recording) -> str:
    first, second = duplicate_pair(a, b)
    return f"duplicate_of:{first.id}:{second.id}:{DUPLICATE_POLICY}"


def judge_duplicate(a: Recording, b: Recording) -> tuple[float, str] | None:
    """(confidence, reason) when a and b capture the same time, else None."""
    if a.id == b.id:
        return None
    if a.contentHash and a.contentHash == b.contentHash:
        return 1.0, "same contentHash"
    if a.modality and b.modality and a.modality != b.modality:
        return None
    shorter = min(duration(a.range), duration(b.range))
    if shorter <= 0:
        return None
    share = overlap_seconds(a.range, b.range) / shorter
    if share < DUPLICATE_MIN_OVERLAP:
        return None
    return round(share, 3), f"same time range ({share:.0%} of the shorter recording)"


def gap_seconds(a: Recording, b: Recording) -> float:
    first, second = duplicate_pair(a, b)
    return (utc(second.range.start) - utc(first.range.end)).total_seconds()
