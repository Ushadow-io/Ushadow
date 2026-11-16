"""Erase of evidence (privacy). A real delete, not a hidden flag.

For a recording or a time range of it:
- delete every segment in range, in every transcript revision;
- delete every correction in range;
- remove the audio pointer of the recording;
- delete the moments that overlap the range, then cut the words that remain again;
- leave a CaptureGap(cause=excluded) and an Erasure record. Neither holds erased content.

The Erasure record is written first, so an ingest that runs at the same time already
excludes the range.
"""

from __future__ import annotations

from ledger.models import EraseRequest, Erasure
from ledger.schema import CaptureGap, GapCause, Recording, TimeRange
from ledger.services.moment_service import Clock, MomentService
from ledger.services.redaction import strip_audio_pointer
from ledger.stores import Stores
from ledger.stores.evidence import range_query
from ledger.timeutil import now_utc, stable_hash


class EraseService:
    def __init__(self, stores: Stores, moments: MomentService, clock: Clock = now_utc) -> None:
        self._s = stores
        self._moments = moments
        self._clock = clock

    async def erase(self, req: EraseRequest) -> Erasure | None:
        """None when the recording is not known for this owner."""
        user_id = req.userId
        rec = await self._s.recordings.load(user_id, req.recordingId)
        if rec is None:
            return None
        rng = req.range or rec.range
        erasure_id = "erase-" + stable_hash(user_id, rec.id, rng.start, rng.end)
        existing = await self._s.erasures.get(erasure_id)
        erasure = await self._record(user_id, rec, rng, erasure_id) if existing is None else None
        await self._delete_content(user_id, rec, rng, erasure_id)
        await self._moments.cut_recording(user_id, rec.id)
        return erasure or Erasure.model_validate(existing["body"])

    async def _record(
        self, user_id: str, rec: Recording, rng: TimeRange, erasure_id: str
    ) -> Erasure:
        query = range_query(user_id, rng, recordingId=rec.id)
        gap = CaptureGap(
            id="gap-excluded-" + erasure_id.removeprefix("erase-"),
            sourceId=rec.sourceId,
            range=rng,
            cause=GapCause.excluded,
        )
        erasure = Erasure(
            id=erasure_id,
            userId=user_id,
            recordingId=rec.id,
            range=rng,
            gapId=gap.id,
            erasedAt=self._clock(),
            segmentsRemoved=len(await self._s.segments.find(query)),
            correctionsRemoved=len(await self._s.corrections.find(query)),
            momentsRemoved=len(await self._s.moments.find(query)),
            audioPointerRemoved=strip_audio_pointer(rec)[1],
        )
        await self._s.erasures.add(erasure)
        await self._s.gaps.save(user_id, gap)
        return erasure

    async def _delete_content(
        self, user_id: str, rec: Recording, rng: TimeRange, erasure_id: str
    ) -> None:
        query = range_query(user_id, rng, recordingId=rec.id)
        await self._s.segments.delete_many(query)
        await self._s.corrections.delete_many(query)
        await self._s.moments.delete_many(query)
        stripped, removed = strip_audio_pointer(rec)
        if removed:
            key = self._s.recordings.key(user_id, rec.id)
            await self._s.recordings.redact(key, stripped.model_dump(mode="json"), erasure_id)
