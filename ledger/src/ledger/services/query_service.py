"""Read side: recordings, transcripts, moments, gaps and links for a time range."""

from __future__ import annotations

from ledger.models import Erasure, Moment
from ledger.schema import CaptureGap, Link, Recording, TimeRange, Transcript, TranscriptCorrection
from ledger.services.decision_rules import effective
from ledger.stores import Stores


class QueryService:
    def __init__(self, stores: Stores) -> None:
        self._s = stores

    async def recordings(self, user_id: str, rng: TimeRange | None) -> list[Recording]:
        return await self._s.recordings.list(user_id, rng)

    async def moments(self, user_id: str, rng: TimeRange | None) -> list[Moment]:
        return await self._s.moments.list(user_id, rng)

    async def gaps(self, user_id: str, rng: TimeRange | None) -> list[CaptureGap]:
        return await self._s.gaps.list(user_id, rng)

    async def erasures(self, user_id: str, rng: TimeRange | None) -> list[Erasure]:
        return await self._s.erasures.list(user_id, rng)

    async def links(
        self, user_id: str, rng: TimeRange | None, effective_only: bool = False
    ) -> list[Link]:
        """Links that touch a recording in the range. effective_only: one Link per key."""
        rec_ids = [r.id for r in await self._s.recordings.list(user_id, rng)]
        links = await self._s.links.touching(user_id, rec_ids) if rec_ids else []
        if not effective_only:
            return links
        by_key: dict[str, list[Link]] = {}
        for link in links:
            by_key.setdefault(link.key, []).append(link)
        winners = (effective(group) for group in by_key.values())
        return [w for w in winners if w is not None]

    async def transcripts(self, user_id: str, recording_id: str) -> list[Transcript]:
        """Every revision, with its stored segments (erased ones are gone)."""
        out: list[Transcript] = []
        for header in await self._s.transcripts.revisions(user_id, recording_id):
            segs = await self._s.segments.segments(user_id, recording_id, header.revision)
            out.append(header.model_copy(update={"segments": segs}))
        return out

    async def corrections(self, user_id: str, recording_id: str) -> list[TranscriptCorrection]:
        return await self._s.corrections.list(user_id, recording_id)
