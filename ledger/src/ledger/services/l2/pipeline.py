"""L2 pipeline: moments + effective Links -> conversations. A rebuildable view.

run(user, range):
1. widen the start back to a conversation border (a stored conversation, or a 30 min pause);
2. load the moments up to range.end + 4 h (a conversation may run past the end);
3. walk them (joins, state updates, splits); day pass; walk again if the day pass joined;
4. keep the conversations that start before range.end; build, save (revision on change),
   retire the ones no longer made; compose the closed ones; mark the moments done.
A re-run with the same inputs finds every Decision and state record and asks no model.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Callable
from datetime import datetime, timedelta

from ledger.l2_models import ConversationCounts, RunResult
from ledger.models import Moment, MomentStatus
from ledger.schema import Decider, LinkKind, TimeRange
from ledger.services.l2 import daypass
from ledger.services.l2.build import build, closed_at
from ledger.services.l2.composer import Composer
from ledger.services.l2.context import RunCtx
from ledger.services.l2.persist import Persister
from ledger.services.l2.rules import LONG_GAP_SECONDS, MAX_CONVERSATION_SECONDS
from ledger.services.l2.views import MomentView, MomentViews
from ledger.services.l2.walker import Group, Walker
from ledger.stores import Stores
from ledger.timeutil import utc

LOOKAHEAD = timedelta(seconds=MAX_CONVERSATION_SECONDS)
LOOKBACK_LIMIT = timedelta(days=1)
PAUSE = timedelta(seconds=LONG_GAP_SECONDS)


def _t(value: str) -> datetime:
    return datetime.fromisoformat(value)


class Pipeline:
    def __init__(
        self, stores: Stores, parts: tuple[Walker, Composer], clock: Callable[[], datetime]
    ) -> None:
        self._s = stores
        self._walker, self._composer = parts
        self._clock = clock
        self._views = MomentViews(stores)
        self._persist = Persister(stores)
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def run(self, user_id: str, rng: TimeRange) -> RunResult:
        async with self._locks[user_id]:
            return await self._run(user_id, rng)

    async def _run(self, user_id: str, rng: TimeRange) -> RunResult:
        ctx = RunCtx(user_id=user_id, stores=self._s, clock=self._clock)
        start = await self._widen(user_id, utc(rng.start))
        end = utc(rng.end)
        views, moments = await self._views.load(
            user_id, TimeRange(start=start, end=end + LOOKAHEAD)
        )
        ctx.human_splits = await self._human_splits(user_id, views)
        groups = await self._walker.walk(ctx, views)
        if await daypass.apply(ctx, groups):
            groups = await self._walker.walk(ctx, views)
        counts = await self._save(ctx, groups, TimeRange(start=start, end=end))
        await self._mark_done(moments, end)
        return RunResult(
            userId=user_id,
            range=TimeRange(start=start, end=end),
            moments=sum(1 for m in moments if utc(m.range.start) < end),
            conversations=counts,
            linksCreated=ctx.links_created,
            model=ctx.stats.finish(),
        )

    async def _save(self, ctx: RunCtx, groups: list[Group], scope: TimeRange) -> ConversationCounts:
        now = self._clock()
        built = []
        for i, group in enumerate(groups):
            if group.start >= utc(scope.end):
                break
            nxt = groups[i + 1].start if i + 1 < len(groups) else None
            built.append((build(ctx.user_id, group), closed_at(group.end, nxt, now)))
        counts, docs = await self._persist.save(ctx.user_id, built, scope)
        for item, _ in built:
            if await self._composer.compose(ctx, item, docs[item.conversation.id]):
                counts.composed += 1
        return counts

    async def _widen(self, user_id: str, start: datetime) -> datetime:
        """Move the start back to a border, so the walk never starts inside a conversation
        or a moment: a stored conversation's start that no moment straddles, or a 30 min
        pause before the first moment."""
        floor = start - LOOKBACK_LIMIT
        for _ in range(500):
            earlier = await self._earlier_start(user_id, start)
            if earlier is None or earlier < floor:
                return start
            start = earlier
        return start

    async def _earlier_start(self, user_id: str, t: datetime) -> datetime | None:
        probe = TimeRange(start=t - timedelta(milliseconds=1), end=t + timedelta(milliseconds=1))
        convs = await self._s.conversations.active(user_id, probe)
        conv_starts = [_t(c["body"]["range"]["start"]) for c in convs]
        starts = conv_starts + [
            utc(m.range.start) for m in await self._s.moments.list(user_id, probe)
        ]
        inside = [s for s in starts if s < t]
        if inside:
            return min(inside)
        if conv_starts:  # t is the start of a stored conversation: a decided border
            return None
        near = await self._s.moments.list(user_id, TimeRange(start=t - PAUSE, end=t))
        before = [utc(m.range.start) for m in near if utc(m.range.start) < t]
        return min(before) if before else None

    async def _human_splits(self, user_id: str, views: list[MomentView]) -> list:
        rec_ids = sorted({v.recording_id for v in views})
        links = await self._s.links.touching(user_id, rec_ids) if rec_ids else []
        return [
            link
            for link in links
            if link.kind == LinkKind.split_at and link.decidedBy == Decider.human and link.at
        ]

    async def _mark_done(self, moments: list[Moment], end: datetime) -> None:
        for moment in moments:
            if moment.status == MomentStatus.ready and utc(moment.range.start) < end:
                await self._s.moments.set_status(moment.key, MomentStatus.done)

    async def sweep(self) -> int:
        """Run every owner that has moments marked ready (new, or changed by late evidence)."""
        docs = await self._s.moments.find({"body.status": MomentStatus.ready.value})
        windows: dict[str, list[str]] = {}
        for doc in docs:
            window = windows.setdefault(doc["userId"], [doc["start"], doc["end"]])
            window[0], window[1] = min(window[0], doc["start"]), max(window[1], doc["end"])
        for user_id, (lo, hi) in sorted(windows.items()):
            rng = TimeRange(start=datetime.fromisoformat(lo), end=datetime.fromisoformat(hi))
            await self.run(user_id, rng)
        return len(windows)
