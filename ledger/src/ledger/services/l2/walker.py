"""The walk: moments in time order -> groups of lines (one group per conversation).

For each moment: decide the join with the previous moment (JoinDecider), then add it to the
open conversation with a state update (StateUpdater). A split (human, or a valid model split
not cancelled by a human) closes the conversation at the cited line and opens a new one; the
lines after it are asked again, so a moment splits up to MAX_SPLITS_PER_MOMENT times by model
(each split checked in code: a real line, both sides at least the minimum size).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from ledger.l2_models import EMPTY_STATE_ID, ConvState
from ledger.schema import Decider, LinkKind
from ledger.services.decision_rules import effective
from ledger.services.l2.context import RunCtx, human_link, split_key
from ledger.services.l2.joins import JoinDecider, OpenConversation
from ledger.services.l2.lines import Line
from ledger.services.l2.rules import MAX_SPLITS_PER_MOMENT, Side, human_index
from ledger.services.l2.states import StateInput, StateUpdater
from ledger.services.l2.views import MomentView
from ledger.timeutil import ts


@dataclass
class Slice:
    view: MomentView
    lines: list[Line]
    state_after: ConvState


@dataclass
class Group:
    opened: tuple[str, str | None] = ("start", None)  # (source, link id)
    slices: list[Slice] = field(default_factory=list)
    state: ConvState = field(default_factory=ConvState)
    state_id: str = EMPTY_STATE_ID
    joins: list[tuple[str, str | None]] = field(default_factory=list)
    splits: list[tuple[str, str | None]] = field(default_factory=list)
    closed_by: tuple[str, str | None] | None = None

    @property
    def lines(self) -> list[Line]:
        return [ln for s in self.slices for ln in s.lines]

    @property
    def start(self) -> datetime:
        return self.slices[0].lines[0].start

    @property
    def end(self) -> datetime:
        return max(s.lines[-1].end for s in self.slices)

    def side(self) -> Side | None:
        if not self.slices:
            return None
        return Side(count=len(self.lines), start=self.start, end=self.end)

    def open_view(self) -> OpenConversation:
        return OpenConversation(self.state, self.state_id, self.start)

    def add(self, piece: Slice, state_id: str) -> None:
        self.slices.append(piece)
        self.state = piece.state_after
        self.state_id = state_id


@dataclass(frozen=True)
class _Part:
    """Lines of one moment still to place, and how many splits came before them in it."""

    view: MomentView
    lines: list[Line]
    n: int


class Walker:
    def __init__(self, joins: JoinDecider, states: StateUpdater) -> None:
        self._joins = joins
        self._states = states

    async def walk(self, ctx: RunCtx, views: list[MomentView]) -> list[Group]:
        groups: list[Group] = []
        cur: Group | None = None
        prev: MomentView | None = None
        for view in views:
            if cur is None or prev is None:
                cur = Group()
            else:
                out = await self._joins.decide(ctx, (prev, view), cur.open_view())
                if out.continues:
                    cur.joins.append((out.source, out.link_id))
                else:
                    cur.closed_by = (out.source, out.link_id)
                    groups.append(cur)
                    cur = Group(opened=(out.source, out.link_id))
            cur = await self._absorb(ctx, cur, view, groups)
            prev = view
        if cur is not None and cur.slices:
            groups.append(cur)
        return groups

    async def _human_split(
        self, ctx: RunCtx, cur: Group, view: MomentView, lines: list[Line]
    ) -> tuple | None:
        """(line index, link id) of the earliest effective human split in these lines."""
        lo = cur.end if cur.slices else lines[0].start
        hits = []
        for link in ctx.human_splits:
            if link.fromId != view.recording_id or link.at is None:
                continue
            if not ts(lo) < ts(link.at) <= ts(lines[-1].start):
                continue
            if effective(await ctx.links(link.key)) != link:
                continue
            index = human_index(lines, link.at)
            if index is not None and (index > 0 or cur.slices):
                hits.append((index, link.id))
        return min(hits) if hits else None

    async def _cancelled(self, ctx: RunCtx, view: MomentView, part: int) -> bool:
        """A human 'no split' on the moment (part 0 key) or on this part."""
        for key in dict.fromkeys([split_key(view.key), split_key(view.key, part)]):
            human = human_link(await ctx.links(key))
            if human is not None and human.kind != LinkKind.split_at:
                return True
        return False

    async def _absorb(
        self, ctx: RunCtx, cur: Group, view: MomentView, groups: list[Group]
    ) -> Group:
        return await self._take(ctx, (cur, groups), _Part(view, view.lines, 0))

    async def _take(self, ctx: RunCtx, where: tuple[Group, list[Group]], part: _Part) -> Group:
        """Add part.lines to the open conversation, splitting it where a human or a valid model
        split says. The lines after a split are taken again as the next part."""
        cur = where[0]
        human = await self._human_split(ctx, cur, part.view, part.lines)
        if human is not None:
            return await self._split(ctx, where, part, human[0], (Decider.human.value, human[1]))
        inp = StateInput(
            cur.state_id,
            cur.state,
            part.lines,
            part.view.key,
            cur.side(),
            allow_split=part.n < MAX_SPLITS_PER_MOMENT,
            part=part.n,
        )
        out = await self._states.update(ctx, inp)
        if out.split_index is not None and not await self._cancelled(ctx, part.view, part.n):
            decided = ("model", out.split_link_id)
            return await self._split(ctx, where, part, out.split_index, decided)
        cur.add(Slice(part.view, part.lines, out.state), out.state_id)
        return cur

    async def _split(
        self,
        ctx: RunCtx,
        where: tuple[Group, list[Group]],
        part: _Part,
        index: int,
        decided: tuple[str, str | None],
    ) -> Group:
        cur, groups = where
        before, after = part.lines[:index], part.lines[index:]
        if before:
            cur.add(Slice(part.view, before, cur.state), cur.state_id)
        if cur.slices:
            cur.closed_by = decided
            groups.append(cur)
        new = Group(opened=decided)
        new.splits.append(decided)
        return await self._take(ctx, (new, groups), _Part(part.view, after, part.n + 1))
