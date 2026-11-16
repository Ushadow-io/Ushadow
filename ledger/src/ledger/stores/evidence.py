"""L0 evidence stores. Every record is scoped by userId and never overwritten."""

from __future__ import annotations

from typing import Any

from ledger.revisions import provisional
from ledger.schema import (
    CaptureGap,
    Recording,
    Segment,
    TimeRange,
    Transcript,
    TranscriptCorrection,
)
from ledger.stores.base import Doc, EvidenceStore, Outcome
from ledger.stores.growth import grow_recording, grow_transcript_header
from ledger.timeutil import ts


def range_query(user_id: str, rng: TimeRange | None, **extra: Any) -> Doc:
    """Records of the user that overlap rng (all of them when rng is None)."""
    query: Doc = {"userId": user_id, **extra}
    if rng is not None:
        query["start"] = {"$lt": ts(rng.end)}
        query["end"] = {"$gt": ts(rng.start)}
    return query


def _span(rng: TimeRange) -> Doc:
    return {"start": ts(rng.start), "end": ts(rng.end)}


class RecordingStore(EvidenceStore):
    def __init__(self, collection: Any) -> None:
        super().__init__(collection, grow=grow_recording)

    @staticmethod
    def key(user_id: str, recording_id: str) -> str:
        return f"{user_id}|{recording_id}"

    async def save(self, user_id: str, rec: Recording) -> Outcome:
        doc = {
            "_id": self.key(user_id, rec.id),
            "userId": user_id,
            "recordingId": rec.id,
            "sourceId": rec.sourceId,
            **_span(rec.range),
            "body": rec.model_dump(mode="json"),
        }
        return await self.put(doc)

    async def load(self, user_id: str, recording_id: str) -> Recording | None:
        doc = await self.get(self.key(user_id, recording_id))
        return Recording.model_validate(doc["body"]) if doc else None

    async def list(self, user_id: str, rng: TimeRange | None = None) -> list[Recording]:
        docs = await self.find(range_query(user_id, rng), sort=[("start", 1), ("_id", 1)])
        return [Recording.model_validate(d["body"]) for d in docs]

    async def set_current_revision(self, user_id: str, recording_id: str, revision: str) -> bool:
        """Move the pointer to the revision to read by default. A pointer, not evidence."""
        doc = await self.get(self.key(user_id, recording_id))
        if doc is None or doc["body"].get("currentTranscriptRevision") == revision:
            return False
        await self._replace_body(doc, {**doc["body"], "currentTranscriptRevision": revision})
        return True


class TranscriptStore(EvidenceStore):
    """Transcript headers (a Transcript with no segments). Segments live in SegmentStore."""

    def __init__(self, collection: Any) -> None:
        super().__init__(collection, grow=grow_transcript_header)

    @staticmethod
    def key(user_id: str, recording_id: str, revision: str) -> str:
        return f"{user_id}|{recording_id}|{revision}"

    async def save(self, user_id: str, header: Transcript) -> Outcome:
        speakers = sorted(header.speakers or [], key=lambda s: s.label) or None
        body = header.model_copy(update={"segments": [], "speakers": speakers})
        doc = {
            "_id": self.key(user_id, header.recordingId, header.revision),
            "userId": user_id,
            "recordingId": header.recordingId,
            "revision": header.revision,
            "createdAt": ts(header.createdAt),
            "body": body.model_dump(mode="json"),
        }
        return await self.put(doc)

    async def revisions(self, user_id: str, recording_id: str) -> list[Transcript]:
        """All headers of a recording, first revision first."""
        docs = await self.find(
            {"userId": user_id, "recordingId": recording_id},
            sort=[("createdAt", 1), ("revision", 1)],
        )
        return [Transcript.model_validate(d["body"]) for d in docs]


class SegmentStore(EvidenceStore):
    """One document per segment. Key = recording + revision + time range.

    Provisional segments are keyed on their start only (Chronicle refines a live segment's end
    and text under the same start), so a refined provisional segment replaces the old one.
    """

    @staticmethod
    def key(user_id: str, transcript: Transcript, seg: Segment) -> str:
        base = f"{user_id}|{transcript.recordingId}|{transcript.revision}|{ts(seg.start)}"
        return base if provisional(transcript) else f"{base}|{ts(seg.end)}"

    async def save(self, user_id: str, transcript: Transcript, seg: Segment) -> Outcome:
        """Final revisions: insert once. Provisional: the overwrite path (see ingest)."""
        doc = {
            "_id": self.key(user_id, transcript, seg),
            "userId": user_id,
            "recordingId": transcript.recordingId,
            "revision": transcript.revision,
            "start": ts(seg.start),
            "end": ts(seg.end),
            "body": seg.model_dump(mode="json"),
        }
        if provisional(transcript):
            return await self.put_provisional(doc)
        return await self.put(doc)

    async def list(
        self,
        user_id: str,
        recording_id: str,
        revision: str | None = None,
        rng: TimeRange | None = None,
    ) -> list[Doc]:
        extra: Doc = {"recordingId": recording_id}
        if revision is not None:
            extra["revision"] = revision
        return await self.find(range_query(user_id, rng, **extra), sort=[("start", 1), ("end", 1)])

    async def segments(self, user_id: str, recording_id: str, revision: str) -> list[Segment]:
        docs = await self.list(user_id, recording_id, revision)
        return [Segment.model_validate(d["body"]) for d in docs]


class CorrectionStore(EvidenceStore):
    @staticmethod
    def key(user_id: str, correction_id: str) -> str:
        return f"{user_id}|{correction_id}"

    async def save(self, user_id: str, fix: TranscriptCorrection) -> Outcome:
        doc = {
            "_id": self.key(user_id, fix.id),
            "userId": user_id,
            "recordingId": fix.recordingId,
            **_span(fix.range),
            "body": fix.model_dump(mode="json"),
        }
        return await self.put(doc)

    async def list(
        self, user_id: str, recording_id: str, rng: TimeRange | None = None
    ) -> list[TranscriptCorrection]:
        docs = await self.find(
            range_query(user_id, rng, recordingId=recording_id), sort=[("start", 1), ("_id", 1)]
        )
        return [TranscriptCorrection.model_validate(d["body"]) for d in docs]


class GapStore(EvidenceStore):
    @staticmethod
    def key(user_id: str, gap_id: str) -> str:
        return f"{user_id}|{gap_id}"

    async def save(self, user_id: str, gap: CaptureGap) -> Outcome:
        doc = {
            "_id": self.key(user_id, gap.id),
            "userId": user_id,
            "sourceId": gap.sourceId,
            "cause": gap.cause.value,
            **_span(gap.range),
            "body": gap.model_dump(mode="json"),
        }
        return await self.put(doc)

    async def list(self, user_id: str, rng: TimeRange | None = None) -> list[CaptureGap]:
        docs = await self.find(range_query(user_id, rng), sort=[("start", 1), ("_id", 1)])
        return [CaptureGap.model_validate(d["body"]) for d in docs]
