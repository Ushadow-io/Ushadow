"""POST /ingest: store a (partial) CaptureBundle. Safe to repeat.

Keys: recording = owner + id; transcript = owner + recording + revision; segment = owner +
recording + revision + time range; correction, gap, link = owner + id. The same item sent twice
is one record. A different body under a stored key is refused, never written.

Live transcripts: revision `live` is provisional. While the recording has no final revision,
live segments may be appended and a live segment with the same start may be replaced (the one
overwrite path, SegmentStore -> EvidenceStore.put_provisional). Once a final revision exists,
live posts are no-ops (counted as `frozen`) and the final is the current revision.

Erased ranges are applied to incoming evidence before it is compared and stored, so a
re-ingest or a replay does not bring erased words back.
"""

from __future__ import annotations

from collections.abc import Awaitable

from ledger.models import IngestRequest, IngestResult, Refusal, TypeCounts
from ledger.revisions import finals, is_live, pick_current
from ledger.schema import CaptureBundle, Recording, TimeRange, Transcript
from ledger.services.duplicate_service import DuplicateService
from ledger.services.moment_service import MomentService
from ledger.services.redaction import is_erased, strip_audio_pointer
from ledger.stores import EvidenceImmutableError, Outcome, Stores

IGNORED_IN_M1 = (
    "sources",
    "fragments",
    "screenObservations",
    "meetings",
    "conversations",
    "entities",
    "facts",
)


def _add(counts: TypeCounts, outcome: Outcome) -> None:
    setattr(counts, outcome.value, getattr(counts, outcome.value) + 1)


class _Run:
    """State of one ingest call."""

    def __init__(self, user_id: str) -> None:
        self.user_id = user_id
        self.result = IngestResult()
        self.touched: set[str] = set()
        self.erased: dict[str, list[TimeRange]] = {}
        self.pointers: dict[str, str | None] = {}

    async def save(
        self, counts: TypeCounts, ref: tuple[str, str], write: Awaitable[Outcome]
    ) -> bool:
        try:
            _add(counts, await write)
            return True
        except EvidenceImmutableError:
            counts.refused += 1
            self.result.refusals.append(
                Refusal(type=ref[0], id=ref[1], reason="differs from stored evidence")
            )
            return False

    def refuse(self, counts: TypeCounts, ref: tuple[str, str], reason: str) -> None:
        counts.refused += 1
        self.result.refusals.append(Refusal(type=ref[0], id=ref[1], reason=reason))


class IngestService:
    def __init__(
        self, stores: Stores, moments: MomentService, duplicates: DuplicateService
    ) -> None:
        self._s = stores
        self._moments = moments
        self._duplicates = duplicates

    async def ingest(self, req: IngestRequest) -> IngestResult:
        run = _Run(req.userId)
        bundle = req.bundle
        for rec in bundle.recordings or []:
            await self._recording(run, rec)
        for transcript in bundle.transcripts or []:
            await self._transcript(run, transcript)
        await self._corrections(run, bundle)
        await self._gaps_and_links(run, bundle)
        run.result.ignored = {
            name: len(getattr(bundle, name)) for name in IGNORED_IN_M1 if getattr(bundle, name)
        }
        await self._derive(run)
        return run.result

    async def _erased(self, run: _Run, recording_id: str) -> list[TimeRange]:
        if recording_id not in run.erased:
            erasures = await self._s.erasures.for_recording(run.user_id, recording_id)
            run.erased[recording_id] = [e.range for e in erasures]
        return run.erased[recording_id]

    async def _recording(self, run: _Run, rec: Recording) -> None:
        if await self._erased(run, rec.id):
            rec, _ = strip_audio_pointer(rec)
        write = self._s.recordings.save(run.user_id, rec)
        if await run.save(run.result.recordings, ("recording", rec.id), write):
            run.touched.add(rec.id)
            run.pointers[rec.id] = rec.currentTranscriptRevision

    async def _transcript(self, run: _Run, transcript: Transcript) -> None:
        counts = run.result.transcripts
        ref = ("transcript", f"{transcript.recordingId}/{transcript.revision}")
        if await self._s.recordings.load(run.user_id, transcript.recordingId) is None:
            run.refuse(counts, ref, "unknown recording; send the Recording first")
            return
        if is_live(transcript.revision) and await self._has_final(run, transcript.recordingId):
            counts.frozen += 1  # live is frozen once a final revision exists
            run.result.segments.frozen += len(transcript.segments)
            return
        if not await run.save(counts, ref, self._s.transcripts.save(run.user_id, transcript)):
            return
        erased = await self._erased(run, transcript.recordingId)
        seg_counts = run.result.segments
        for seg in transcript.segments:
            if is_erased(TimeRange(start=seg.start, end=seg.end), erased):
                seg_counts.excluded += 1
                continue
            write = self._s.segments.save(run.user_id, transcript, seg)
            await run.save(seg_counts, ("segment", seg.id), write)
        run.touched.add(transcript.recordingId)

    async def _has_final(self, run: _Run, recording_id: str) -> bool:
        return bool(finals(await self._s.transcripts.revisions(run.user_id, recording_id)))

    async def _set_pointer(self, run: _Run, recording_id: str) -> None:
        """currentTranscriptRevision: the named final, else the newest final, else live."""
        headers = await self._s.transcripts.revisions(run.user_id, recording_id)
        stored = await self._s.recordings.load(run.user_id, recording_id)
        incoming = run.pointers.get(recording_id) or (stored and stored.currentTranscriptRevision)
        current = pick_current(incoming, headers)
        if current:
            await self._s.recordings.set_current_revision(run.user_id, recording_id, current)

    async def _corrections(self, run: _Run, bundle: CaptureBundle) -> None:
        counts = run.result.corrections
        for fix in bundle.corrections or []:
            if is_erased(fix.range, await self._erased(run, fix.recordingId)):
                counts.excluded += 1
                continue
            await run.save(
                counts, ("correction", fix.id), self._s.corrections.save(run.user_id, fix)
            )

    async def _gaps_and_links(self, run: _Run, bundle: CaptureBundle) -> None:
        for gap in bundle.gaps or []:
            await run.save(run.result.gaps, ("gap", gap.id), self._s.gaps.save(run.user_id, gap))
        for link in bundle.links or []:
            await run.save(
                run.result.links, ("link", link.id), self._s.links.save(run.user_id, link)
            )

    async def _derive(self, run: _Run) -> None:
        for recording_id in sorted(run.touched):
            await self._set_pointer(run, recording_id)
            rec = await self._s.recordings.load(run.user_id, recording_id)
            if rec is None:
                continue
            dup = await self._duplicates.check(run.user_id, rec)
            run.result.duplicateLinks.created += dup.created
            run.result.duplicateLinks.present += dup.present
            cut = await self._moments.cut_recording(run.user_id, recording_id)
            run.result.moments.created += cut.created
            run.result.moments.present += cut.present
            run.result.moments.rerun += cut.rerun
