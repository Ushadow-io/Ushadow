from __future__ import annotations

import pytest

from ledger.models import IngestRequest
from ledger.schema import CaptureBundle
from ledger.schema.life_datatypes import CutReason, RecordingOrigin
from ledger.services import Services
from ledger.stores import EvidenceImmutableError
from tests.fixtures.bundle import USER, at, golden_day


async def _count(services: Services, store: str) -> int:
    return len(await getattr(services.stores, store).find({}))


async def _snapshot(services: Services) -> dict[str, int]:
    names = ("recordings", "transcripts", "segments", "corrections", "gaps", "links", "moments")
    return {name: await _count(services, name) for name in names}


async def test_ingest_twice_gives_one_set_of_records(services: Services, request_day):
    first = await services.ingest.ingest(request_day)
    after_first = await _snapshot(services)
    second = await services.ingest.ingest(request_day)

    assert first.recordings.created == 5
    assert first.transcripts.created == 5
    assert first.segments.created == 1 + 4 + 4 + 4 + 110
    assert first.corrections.created == 1
    assert first.moments.created > 0
    assert first.refusals == []

    assert await _snapshot(services) == after_first
    assert second.recordings.created == second.transcripts.created == 0
    assert second.segments.created == second.moments.created == 0
    assert second.recordings.present == 5
    assert second.segments.present == first.segments.created
    assert second.links.present == 3
    assert second.refusals == []
    assert set(second.ignored) == set()


async def test_changed_evidence_under_same_key_is_refused(services: Services, request_day):
    await services.ingest.ingest(request_day)
    bundle = golden_day()
    tv = bundle.transcripts[0]
    tv.segments[0] = tv.segments[0].model_copy(update={"text": "Something else entirely."})
    result = await services.ingest.ingest(IngestRequest(userId=USER, bundle=bundle))

    assert result.segments.refused == 1
    assert result.refusals[0].type == "segment"
    stored = await services.query.transcripts(USER, "rec-tv")
    assert stored[0].segments[0].text == "Detective Carter from NYPD homicide."


async def test_store_refuses_update_of_evidence(services: Services, request_day):
    await services.ingest.ingest(request_day)
    with pytest.raises(EvidenceImmutableError):
        await services.stores.segments.update({"_id": "x"}, {"$set": {"body.text": "new"}})
    rec = await services.stores.recordings.load(USER, "rec-a")
    with pytest.raises(EvidenceImmutableError):
        await services.stores.recordings.save(USER, rec.model_copy(update={"sourceId": "other"}))


async def test_new_transcript_is_a_new_revision(services: Services, request_day):
    await services.ingest.ingest(request_day)
    bundle = golden_day()
    rev2 = bundle.transcripts[3].model_copy(
        update={
            "revision": "rev-2",
            "createdAt": at("20:00:00"),
            "model": "whisper-large",
        }
    )
    partial = CaptureBundle(schemaVersion="2.0.0", range=bundle.range, transcripts=[rev2])
    result = await services.ingest.ingest(IngestRequest(userId=USER, bundle=partial))

    assert result.transcripts.created == 1
    revisions = await services.query.transcripts(USER, "rec-b")
    assert [t.revision for t in revisions] == ["rev-1", "rev-2"]
    assert all(len(t.segments) == 4 for t in revisions)


async def test_partial_bundles_and_live_growth(services: Services):
    rng = golden_day().range
    rec = (
        golden_day()
        .recordings[4]
        .model_copy(
            update={
                "id": "rec-live",
                "origin": RecordingOrigin.live,
                "range": golden_day()
                .recordings[4]
                .range.model_copy(update={"end": at("13:01:00")}),
            }
        )
    )
    first = CaptureBundle(schemaVersion="2.0.0", range=rng, recordings=[rec])
    result = await services.ingest.ingest(IngestRequest(userId=USER, bundle=first))
    assert result.recordings.created == 1

    grown = rec.model_copy(
        update={
            "range": rec.range.model_copy(update={"end": at("13:30:00")}),
            "endReason": CutReason.silence,
        }
    )
    again = CaptureBundle(schemaVersion="2.0.0", range=rng, recordings=[grown])
    result = await services.ingest.ingest(IngestRequest(userId=USER, bundle=again))
    assert result.recordings.extended == 1
    stored = await services.stores.recordings.load(USER, "rec-live")
    assert stored.range.end == at("13:30:00")


async def test_transcript_for_unknown_recording_is_refused(services: Services):
    bundle = golden_day()
    partial = CaptureBundle(
        schemaVersion="2.0.0", range=bundle.range, transcripts=[bundle.transcripts[0]]
    )
    result = await services.ingest.ingest(IngestRequest(userId=USER, bundle=partial))
    assert result.transcripts.refused == 1
    assert await _count(services, "segments") == 0


async def test_records_are_scoped_by_owner(services: Services, request_day):
    await services.ingest.ingest(request_day)
    other = await services.ingest.ingest(IngestRequest(userId="user-other", bundle=golden_day()))
    assert other.recordings.created == 5
    assert len(await services.query.recordings(USER, None)) == 5
    assert len(await services.query.recordings("user-nobody", None)) == 0


async def test_streamed_segments_append_to_one_revision(services: Services):
    bundle = golden_day()
    rec_b, transcript = bundle.recordings[3], bundle.transcripts[3]
    for i in range(1, 5):
        part = transcript.model_copy(update={"segments": transcript.segments[:i]})
        chunk = CaptureBundle(
            schemaVersion="2.0.0", range=bundle.range, recordings=[rec_b], transcripts=[part]
        )
        result = await services.ingest.ingest(IngestRequest(userId=USER, bundle=chunk))
        assert result.refusals == []
    stored = await services.query.transcripts(USER, "rec-b")
    assert len(stored) == 1 and len(stored[0].segments) == 4
