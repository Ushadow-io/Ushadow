"""Small day pass: fix edges across the day, as rule Links. No model, no transcript text.

Input per conversation: start, end, known people, state topic, and how it was opened. Two
neighbour conversations are joined (a `continues` Link on the daypass key) when:
- the border between them was decided by the gap model or its fallback (not by a hard rule,
  not by a human, not by a topic split);
- both are short (<= 10 min) and the pause is < 30 min;
- they have the same known people, or the same topic.
Decided once per key. A human Link on the join key of the same border still wins.
"""

from __future__ import annotations

from dataclasses import dataclass

from ledger.l2_models import DAYPASS_POLICY
from ledger.schema import Decider, LinkKind
from ledger.services.l2.context import LinkSpec, RunCtx, daypass_key
from ledger.services.l2.lines import people, seconds
from ledger.services.l2.rules import LONG_GAP_SECONDS
from ledger.services.l2.walker import Group

SHORT_SECONDS = 600
SOFT_SOURCES = frozenset({"model", "fallback"})


@dataclass(frozen=True)
class Merge:
    prev_key: str
    next_key: str
    reason: str
    gap_seconds: float


def _reason(a: Group, b: Group) -> str | None:
    who_a, who_b = people(a.lines), people(b.lines)
    if who_a and who_a == who_b:
        return "same_people"
    topic_a, topic_b = a.state.topic.strip().lower(), b.state.topic.strip().lower()
    if topic_a and topic_a == topic_b:
        return "same_topic"
    return None


def candidates(groups: list[Group]) -> list[Merge]:
    out: list[Merge] = []
    for a, b in zip(groups, groups[1:], strict=False):
        if b.opened[0] not in SOFT_SOURCES:
            continue
        gap = seconds(a.end, b.start)
        short = (
            seconds(a.start, a.end) <= SHORT_SECONDS and seconds(b.start, b.end) <= SHORT_SECONDS
        )
        if not short or gap >= LONG_GAP_SECONDS:
            continue
        reason = _reason(a, b)
        if reason:
            out.append(Merge(a.slices[-1].view.key, b.slices[0].view.key, reason, gap))
    return out


async def apply(ctx: RunCtx, groups: list[Group]) -> int:
    """Write the new day-pass Links. Returns how many were written."""
    written = 0
    for merge in candidates(groups):
        key = daypass_key(merge.prev_key, merge.next_key)
        if await ctx.links(key):
            continue  # decided once
        await ctx.write(
            LinkSpec(
                key=key,
                digest="daypass",
                kind=LinkKind.continues,
                from_id=merge.prev_key,
                to_id=merge.next_key,
                decided_by=Decider.rule,
                policy=DAYPASS_POLICY,
                gap_seconds=merge.gap_seconds,
                reason=merge.reason,
            )
        )
        written += 1
    return written
