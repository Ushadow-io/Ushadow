"""Cuts stored transcripts into Moments and saves them as work units.

- The cut is made from the cut source revision (live if present, so work starts during the
  conversation; else the first final). The current revision then fills only the time that no
  moment covers yet. Keys are (policy, owner, recording, range), so a re-run finds them.
- Each moment records the revision and a hash of the text it stands for. When the current
  revision changes the text in a moment's range, the moment is marked for a re-run
  (status ready, reruns + 1). It is never re-cut, moved or duplicated.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime, timedelta

from ledger.models import Moment, MomentStatus, TypeCounts
from ledger.revisions import cut_source
from ledger.schema import Recording, Segment, TimeRange, Transcript
from ledger.services.moment_cutter import CutInput, CutPolicy, Span, cut
from ledger.stores import Outcome, Stores
from ledger.timeutil import now_utc, overlaps, stable_hash, ts, utc

Clock = Callable[[], datetime]


def moment_key(policy: str, user_id: str, recording_id: str, rng: TimeRange) -> str:
    return "mom-" + stable_hash(policy, user_id, recording_id, rng.start, rng.end)


def content_hash(segments: Sequence[Segment], rng: TimeRange) -> str:
    """Hash of the words (and who said them) inside rng."""
    inside = [
        (ts(s.start), ts(s.end), s.speakerLabel, s.text)
        for s in segments
        if overlaps(TimeRange(start=s.start, end=s.end), rng)
    ]
    return stable_hash(*sorted(inside), length=32)


class MomentService:
    def __init__(
        self, stores: Stores, policy: CutPolicy | None = None, clock: Clock = now_utc
    ) -> None:
        self._s = stores
        self._policy = policy or CutPolicy()
        self._clock = clock

    def _closed(self, rec: Recording) -> bool:
        """A recording is closed when it says so, when it is not live, or when it is old."""
        if rec.endReason is not None or (rec.origin and rec.origin.value != "live"):
            return True
        quiet = (self._clock() - utc(rec.range.end)).total_seconds()
        return quiet >= self._policy.hard_pause

    @staticmethod
    def _current(rec: Recording, headers: Sequence[Transcript], source: str) -> str:
        known = {h.revision for h in headers}
        current = rec.currentTranscriptRevision
        return current if current in known else source

    async def cut_recording(self, user_id: str, recording_id: str) -> TypeCounts:
        counts = TypeCounts()
        rec = await self._s.recordings.load(user_id, recording_id)
        headers = await self._s.transcripts.revisions(user_id, recording_id)
        source = cut_source(headers)
        if rec is None or source is None:
            return counts
        current = self._current(rec, headers, source)
        current_segs = await self._s.segments.segments(user_id, recording_id, current)
        existing = await self._s.moments.list(user_id, recording_id=recording_id)
        counts.present = len(existing)
        await self._refresh(existing, current, current_segs, counts)
        erased = [e.range for e in await self._s.erasures.for_recording(user_id, recording_id)]
        barriers = [m.range for m in existing] + erased
        for revision in dict.fromkeys([source, current]):  # source first, then current
            segs = await self._s.segments.segments(user_id, recording_id, revision)
            data = CutInput(segs, barriers, horizon=rec.range.end, closed=self._closed(rec))
            for span in cut(data, self._policy):
                moment = self._moment(rec, user_id, span, (revision, current, current_segs))
                if await self._s.moments.add(moment) == Outcome.created:
                    counts.created += 1
                barriers.append(moment.range)
        return counts

    async def _refresh(
        self, moments: list[Moment], current: str, segs: list[Segment], counts: TypeCounts
    ) -> None:
        for moment in moments:
            new_hash = content_hash(segs, moment.range)
            if moment.contentRevision == current and moment.contentHash == new_hash:
                continue
            if await self._s.moments.set_content(moment, current, new_hash):
                counts.rerun += 1

    def _moment(
        self, rec: Recording, user_id: str, span: Span, text: tuple[str, str, list[Segment]]
    ) -> Moment:
        cut_from, current, current_segs = text
        rng = TimeRange(start=span.start, end=span.end)
        return Moment(
            key=moment_key(self._policy.version, user_id, rec.id, rng),
            userId=user_id,
            recordingId=rec.id,
            range=rng,
            policyVersion=self._policy.version,
            transcriptRevision=cut_from,
            contentRevision=current,
            contentHash=content_hash(current_segs, rng),
            segmentCount=span.segment_count,
            wordCount=span.word_count,
            status=MomentStatus.ready,
            createdAt=self._clock(),
        )

    async def sweep(self, window: timedelta = timedelta(hours=2)) -> int:
        """Cut moments for recently active recordings (closes held-back live moments)."""
        since = ts(self._clock() - window)
        docs = await self._s.recordings.find({"end": {"$gte": since}})
        created = 0
        for doc in docs:
            counts = await self.cut_recording(doc["userId"], doc["recordingId"])
            created += counts.created
        return created
