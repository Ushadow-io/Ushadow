"""life-datatypes v2 fields: Transcript.status (rule 7), Recording.audio, CaptureGap.recordingId."""

from __future__ import annotations

from datetime import timedelta

from ledger.models import EraseRequest, IngestRequest
from ledger.revisions import is_provisional
from ledger.schema import AudioRef, CaptureBundle, Recording, Segment, Transcript
from ledger.services import Services
from tests.fixtures.bundle import USER, at, golden_day, span

REC = "rec-s"


def _bundle(*transcripts: Transcript, rec: Recording | None = None) -> IngestRequest:
    rec = rec or Recording(
        id=REC, sourceId="omi", modality="audio_input", range=span("09:00:00", "09:10:00")
    )
    return IngestRequest(
        userId=USER,
        bundle=CaptureBundle(
            schemaVersion="2.0.0",
            range=span("09:00:00", "09:10:00"),
            recordings=[rec],
            transcripts=list(transcripts),
        ),
    )


def _t(revision: str, status: str | None, n: int = 3, text: str = "words") -> Transcript:
    segs = [
        Segment(
            id=f"{revision}-{i}",
            text=f"{text} {i}",
            speakerLabel="Speaker 0",
            start=at("09:00:10") + timedelta(seconds=6 * i),
            end=at("09:00:15") + timedelta(seconds=6 * i),
        )
        for i in range(n)
    ]
    return Transcript(
        recordingId=REC, revision=revision, createdAt=at("09:11:00"), status=status, segments=segs
    )


def test_status_decides_and_live_without_status_is_the_one_tolerance():
    assert is_provisional("draft-7", "provisional")
    assert not is_provisional("draft-7", None)  # absent = final
    assert not is_provisional("live", "final")  # status wins over the id
    assert is_provisional("live", None)  # backward tolerance, revisions.is_provisional only


async def test_provisional_revision_with_any_id_grows_then_freezes(services: Services):
    first = await services.ingest.ingest(_bundle(_t("draft-a", "provisional", 2)))
    grown = await services.ingest.ingest(_bundle(_t("draft-a", "provisional", 4)))
    assert first.segments.created == 2 and grown.segments.created == 2
    refined = _t("draft-a", "provisional", 1, text="better")
    assert (await services.ingest.ingest(_bundle(refined))).segments.replaced == 1
    rec = await services.stores.recordings.load(USER, REC)
    assert rec.currentTranscriptRevision == "draft-a"

    await services.ingest.ingest(_bundle(_t("v1", "final")))
    late = await services.ingest.ingest(_bundle(_t("draft-a", "provisional", 6)))
    assert late.transcripts.frozen == 1 and late.refusals == []
    draft = next(t for t in await services.query.transcripts(USER, REC) if t.revision == "draft-a")
    assert len(draft.segments) == 4
    rec = await services.stores.recordings.load(USER, REC)
    assert rec.currentTranscriptRevision == "v1"


async def test_rule7_a_second_provisional_revision_is_refused(services: Services):
    await services.ingest.ingest(_bundle(_t("draft-a", "provisional")))
    second = await services.ingest.ingest(_bundle(_t("draft-b", "provisional")))
    assert second.transcripts.refused == 1
    assert second.refusals[0].reason == "a recording has at most one provisional revision"
    revisions = [t.revision for t in await services.query.transcripts(USER, REC)]
    assert revisions == ["draft-a"]


async def test_a_revision_never_switches_between_draft_and_final(services: Services):
    await services.ingest.ingest(_bundle(_t("draft-a", "provisional")))
    promote = await services.ingest.ingest(_bundle(_t("draft-a", "final")))
    assert promote.transcripts.refused == 1  # a final is a new revision, not a status flip


async def test_legacy_live_without_status_is_still_a_draft(services: Services):
    await services.ingest.ingest(_bundle(_t("live", None, 2)))
    grown = await services.ingest.ingest(_bundle(_t("live", None, 3)))
    assert grown.segments.created == 1 and grown.refusals == []
    other = await services.ingest.ingest(_bundle(_t("draft-b", "provisional")))
    assert other.transcripts.refused == 1  # live (legacy) already is the one draft


async def test_erase_removes_recording_audio_and_writes_gap_with_recording_id(services: Services):
    day = golden_day()
    audio = AudioRef(uri="s3://example-bucket/audio/rec-a.opus", format="opus")
    day.recordings = [
        r.model_copy(update={"audio": audio}) if r.id == "rec-a" else r for r in day.recordings
    ]
    await services.ingest.ingest(IngestRequest(userId=USER, bundle=day))
    assert (await services.stores.recordings.load(USER, "rec-a")).audio == audio

    erasure = await services.erase.erase(
        EraseRequest(userId=USER, recordingId="rec-a", range=span("11:02:00", "11:03:00"))
    )
    assert erasure.audioPointerRemoved is True
    rec = await services.stores.recordings.load(USER, "rec-a")
    assert rec.audio is None and rec.contentHash == "sha256:a913"  # the record stays
    assert "audioPath" not in (rec.metadata or {})  # the old metadata key: fallback
    gap = next(g for g in await services.query.gaps(USER, None) if g.id == erasure.gapId)
    assert gap.recordingId == "rec-a" and gap.range == span("11:02:00", "11:03:00")

    again = await services.ingest.ingest(IngestRequest(userId=USER, bundle=day))
    assert again.refusals == []  # incoming audio is stripped too, not a conflict
    assert (await services.stores.recordings.load(USER, "rec-a")).audio is None
