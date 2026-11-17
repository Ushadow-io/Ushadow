"""L1 moment cutter. Pure code, no model.

A moment is a time range of one recording, about 3 minutes, cut on natural pauses. The cut
depends only on the segments and the barriers (existing moments, erased ranges), so a re-run
gives the same ranges. Existing moments are barriers: late evidence fills the space around
them and never moves them. A segment belongs to a moment by `timeutil.holds` (the same rule
L2 uses to give lines to moments), so a re-run never finds a leftover segment on an edge.

Rules (Omi values, design L1):
- a pause of >= hard_pause seconds always ends a moment;
- a moment longer than max_seconds or max_words is split at its largest pause after
  min_seconds (a pause > 0, so the next moment starts after this one ends);
- the last group of a recording is held back until the recording is closed or has been quiet
  for hard_pause seconds, so a live recording does not get a half moment.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from ledger.models import MOMENT_POLICY
from ledger.schema import Segment, TimeRange
from ledger.timeutil import holds, overlaps, utc


@dataclass(frozen=True)
class CutPolicy:
    version: str = MOMENT_POLICY
    hard_pause: float = 45.0
    max_seconds: float = 180.0
    max_words: int = 600
    min_seconds: float = 60.0


@dataclass(frozen=True)
class Span:
    start: datetime
    end: datetime
    segment_count: int
    word_count: int


@dataclass(frozen=True)
class CutInput:
    segments: Sequence[Segment]
    barriers: Sequence[TimeRange]
    horizon: datetime  # latest known end of the recording
    closed: bool
    erased: Sequence[TimeRange] = ()  # erased ranges: barriers, by the erase rule (overlaps)


def _words(segs: Sequence[Segment]) -> int:
    return sum(len(s.text.split()) for s in segs)


def _end(segs: Sequence[Segment]) -> datetime:
    return max(utc(s.end) for s in segs)


def _seconds(a: datetime, b: datetime) -> float:
    return (utc(b) - utc(a)).total_seconds()


def _too_big(group: list[Segment], policy: CutPolicy) -> bool:
    long = _seconds(group[0].start, _end(group)) > policy.max_seconds
    return long or _words(group) > policy.max_words


def _split_index(group: list[Segment], policy: CutPolicy) -> int | None:
    """Index of the best boundary: the largest real pause, preferring one after min_seconds.
    Equal pauses: the latest one, so the moment is as close to max_seconds as it can be."""
    best: tuple[bool, float, int] | None = None
    for i in range(1, len(group)):
        head_end = _end(group[:i])
        pause = _seconds(head_end, group[i].start)
        if pause <= 0:
            continue
        long_enough = _seconds(group[0].start, head_end) >= policy.min_seconds
        candidate = (long_enough, pause, i)
        if best is None or candidate > best:
            best = candidate
    return None if best is None else best[2]


def _cut_run(run: list[Segment], policy: CutPolicy) -> list[list[Segment]]:
    groups: list[list[Segment]] = []
    current: list[Segment] = []
    for seg in run:
        if current and _seconds(_end(current), seg.start) >= policy.hard_pause:
            groups.append(current)
            current = []
        current.append(seg)
        while len(current) > 1 and _too_big(current, policy):
            index = _split_index(current, policy)
            if index is None:
                break
            groups.append(current[:index])
            current = current[index:]
    if current:
        groups.append(current)
    return groups


def _runs(segs: list[Segment], barriers: list[TimeRange]) -> list[tuple[list[Segment], bool]]:
    """Split segments by barriers. Each run is (segments, bounded on the right by a barrier)."""
    runs: dict[int, list[Segment]] = {}
    for seg in segs:
        slot = sum(1 for b in barriers if utc(b.start) < utc(seg.start))
        runs.setdefault(slot, []).append(seg)
    return [(runs[slot], slot < len(barriers)) for slot in sorted(runs)]


def _taken(seg: Segment, moments: Sequence[TimeRange], erased: Sequence[TimeRange]) -> bool:
    """A segment an existing moment already holds (the L2 membership rule, so a zero-length
    segment on a moment's edge is that moment's), or one in an erased range."""
    span = TimeRange(start=seg.start, end=seg.end)
    return any(holds(m, span) for m in moments) or any(overlaps(span, e) for e in erased)


def cut(data: CutInput, policy: CutPolicy | None = None) -> list[Span]:
    policy = policy or CutPolicy()
    barriers = sorted([*data.barriers, *data.erased], key=lambda b: (utc(b.start), utc(b.end)))
    free = [
        s
        for s in sorted(data.segments, key=lambda s: (utc(s.start), utc(s.end), s.id))
        if not _taken(s, data.barriers, data.erased)
    ]
    spans: list[Span] = []
    for run, bounded in _runs(free, barriers):
        groups = _cut_run(run, policy)
        last = groups[-1]
        quiet = _seconds(_end(last), data.horizon) >= policy.hard_pause
        if not (bounded or data.closed or quiet):
            groups = groups[:-1]
        spans.extend(
            Span(start=utc(g[0].start), end=_end(g), segment_count=len(g), word_count=_words(g))
            for g in groups
        )
    return spans
