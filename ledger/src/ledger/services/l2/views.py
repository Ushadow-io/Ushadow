"""Load the moments of a window as MomentViews: lines, digest, device and people.

Left out (by rule, no Link needed): moments with no lines, moments where only media or
background voices speak, and moments of a recording that an effective `duplicate_of` Link
marks as the copy (toId). A human `unrelated` Link on the duplicate key brings the copy back.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from ledger.models import Moment
from ledger.schema import Link, LinkKind, Recording, TimeRange
from ledger.services.decision_rules import effective
from ledger.services.l2.lines import (
    Line,
    LineSource,
    assign,
    build_lines,
    is_media_only,
    lines_digest,
    people,
)
from ledger.stores import Stores
from ledger.timeutil import ts


@dataclass(frozen=True)
class MomentView:
    moment: Moment
    lines: list[Line]
    digest: str
    source_id: str
    people: frozenset[str]

    @property
    def key(self) -> str:
        return self.moment.key

    @property
    def recording_id(self) -> str:
        return self.moment.recordingId


def _copies(links: list[Link]) -> set[str]:
    by_key: dict[str, list[Link]] = {}
    for link in links:
        by_key.setdefault(link.key, []).append(link)
    winners = (effective(group) for group in by_key.values())
    return {w.toId for w in winners if w and w.kind == LinkKind.duplicate_of and w.toId}


class MomentViews:
    def __init__(self, stores: Stores) -> None:
        self._s = stores

    async def load(self, user_id: str, rng: TimeRange) -> tuple[list[MomentView], list[Moment]]:
        """(views in time order, every moment in the window)."""
        moments = await self._s.moments.list(user_id, rng)
        rec_ids = sorted({m.recordingId for m in moments})
        links = await self._s.links.touching(user_id, rec_ids) if rec_ids else []
        copies = _copies(links)
        views: list[MomentView] = []
        for rec_id in rec_ids:
            if rec_id in copies:
                continue
            rec = await self._s.recordings.load(user_id, rec_id)
            if rec is not None:
                own = [m for m in moments if m.recordingId == rec_id]
                views.extend(await self._recording_views(user_id, rec, own))
        views.sort(key=lambda v: (ts(v.lines[0].start), v.recording_id, v.key))
        return views, moments

    async def _source(self, user_id: str, rec: Recording, revision: str) -> LineSource:
        headers = await self._s.transcripts.revisions(user_id, rec.id)
        header = next((h for h in headers if h.revision == revision), None)
        return LineSource(
            recording_id=rec.id,
            revision=revision,
            segments=await self._s.segments.segments(user_id, rec.id, revision),
            speakers=(header.speakers if header else None) or [],
            corrections=await self._s.corrections.list(user_id, rec.id),
        )

    async def _recording_views(
        self, user_id: str, rec: Recording, moments: list[Moment]
    ) -> list[MomentView]:
        out: list[MomentView] = []
        for revision in sorted({m.contentRevision for m in moments}):
            own = [m for m in moments if m.contentRevision == revision]
            src = await self._source(user_id, rec, revision)
            for moment, segs in zip(own, assign(src.segments, [m.range for m in own]), strict=True):
                lines = build_lines(replace(src, segments=segs))
                if lines and not is_media_only(lines):
                    out.append(self._view(moment, lines, rec.sourceId))
        return out

    @staticmethod
    def _view(moment: Moment, lines: list[Line], source_id: str) -> MomentView:
        return MomentView(
            moment=moment,
            lines=lines,
            digest=lines_digest(lines),
            source_id=source_id,
            people=people(lines),
        )
