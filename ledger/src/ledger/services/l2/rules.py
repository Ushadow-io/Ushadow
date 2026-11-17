"""Pure L2 rules: when two moments are one conversation, and when a topic split is valid.

Join rules (design L2, step 1), checked in order:
1. gap >= 30 min                      -> new conversation   (long_gap)
2. the conversation would pass 4 h    -> new conversation   (max_length)
3. gap < 120 s, same recording/device -> continues          (same_recording / same_device)
4. same known people on both sides    -> continues          (same_people)
Anything else is unclear: the gap model decides. When the model gives no valid answer, the
fallback rule decides (gap <= 5 min continues) and is recorded as a rule.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from ledger.services.l2.lines import Line, seconds
from ledger.timeutil import stable_hash, ts

LONG_GAP_SECONDS = 30 * 60
SHORT_GAP_SECONDS = 120
MAX_CONVERSATION_SECONDS = 4 * 3600
FALLBACK_GAP_SECONDS = 300

MIN_SIDE_LINES = 2
MIN_SIDE_SECONDS = 5.0
MAX_SPLITS_PER_MOMENT = 3  # topic splits inside one moment (human splits are not counted)


@dataclass(frozen=True)
class JoinFacts:
    gap_seconds: float
    same_recording: bool
    same_source: bool
    people_before: frozenset[str]
    people_after: frozenset[str]
    conversation_seconds: float  # length of the conversation if the next moment joins

    def digest(self) -> str:
        return stable_hash(
            round(self.gap_seconds, 3),
            self.same_recording,
            self.same_source,
            sorted(self.people_before),
            sorted(self.people_after),
            self.conversation_seconds > MAX_CONVERSATION_SECONDS,
        )


def judge_join(f: JoinFacts) -> tuple[bool, str] | None:
    """(continues, reason), or None when the rules cannot decide."""
    if f.gap_seconds >= LONG_GAP_SECONDS:
        return False, "long_gap"
    if f.conversation_seconds > MAX_CONVERSATION_SECONDS:
        return False, "max_length"
    if f.gap_seconds < SHORT_GAP_SECONDS and f.same_recording:
        return True, "same_recording_short_gap"
    if f.gap_seconds < SHORT_GAP_SECONDS and f.same_source:
        return True, "same_device_short_gap"
    if f.people_before and f.people_before == f.people_after:
        return True, "same_people"
    return None


def fallback_join(f: JoinFacts) -> tuple[bool, str]:
    return f.gap_seconds <= FALLBACK_GAP_SECONDS, "fallback_gap"


# ---- Topic split ----


@dataclass(frozen=True)
class Side:
    """What the open conversation already holds before this moment."""

    count: int
    start: datetime
    end: datetime


def split_index(lines: Sequence[Line], seg_id: str | None) -> int | None:
    """Index of the cited segment in this moment, or None when it is not a real segment here."""
    for i, line in enumerate(lines):
        if line.seg_id == seg_id:
            return i
    return None


def human_index(lines: Sequence[Line], at: datetime) -> int | None:
    """A human split at a time: the first line that starts at or after it."""
    for i, line in enumerate(lines):
        if ts(line.start) >= ts(at):
            return i
    return None


def check_split(prior: Side | None, lines: Sequence[Line], index: int) -> str | None:
    """None when the split is valid; else the reason it is rejected (min_size)."""
    before = lines[:index]
    after = lines[index:]
    count = len(before) + (prior.count if prior else 0)
    first = prior.start if prior else (before[0].start if before else None)
    last = before[-1].end if before else (prior.end if prior else None)
    if count < MIN_SIDE_LINES or first is None or last is None:
        return "min_size"
    if seconds(first, last) < MIN_SIDE_SECONDS:
        return "min_size"
    if len(after) < MIN_SIDE_LINES or seconds(after[0].start, after[-1].end) < MIN_SIDE_SECONDS:
        return "min_size"
    return None
