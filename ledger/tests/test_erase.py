from __future__ import annotations

from ledger.models import EraseRequest, IngestRequest
from ledger.schema import CaptureBundle, GapCause, TimeRange
from ledger.services import Services
from tests.fixtures.bundle import USER, at, golden_day, span

ERASED_WORDS = ("menu", "venue", "I'll do it today")


async def _all_text(services: Services) -> str:
    """Every word the ledger holds, in every store."""
    parts = []
    for name in (
        "segments",
        "corrections",
        "transcripts",
        "recordings",
        "moments",
        "erasures",
        "gaps",
    ):
        parts.extend(str(doc) for doc in await getattr(services.stores, name).find({}))
    return "\n".join(parts)


async def _erase_venue(services: Services):
    return await services.erase.erase(
        EraseRequest(userId=USER, recordingId="rec-a", range=span("11:02:00", "11:03:00"))
    )


async def test_erase_removes_words_in_all_revisions_and_leaves_excluded_gap(services, request_day):
    await services.ingest.ingest(request_day)
    assert "venue" in await _all_text(services)
    moments_before = await services.query.moments(USER, None)

    erasure = await _erase_venue(services)

    assert erasure.segmentsRemoved == 4  # a-3, a-4 (rev-1) and a2-3, a2-4 (rev-2)
    assert erasure.correctionsRemoved == 1
    assert erasure.momentsRemoved == 1
    assert erasure.audioPointerRemoved is True
    text = await _all_text(services)
    assert not any(word in text for word in ERASED_WORDS)
    assert "audioPath" not in text
    assert "launch budget" in text  # words outside the range stay

    for transcript in await services.query.transcripts(USER, "rec-a"):
        assert [s.text for s in transcript.segments] == [
            "Shall we look at the launch budget?",
            "Yes, marketing is over by about ten percent.",
        ]
    gaps = await services.query.gaps(USER, span("11:00:00", "11:05:00"))
    assert [(g.cause, g.range) for g in gaps] == [(GapCause.excluded, span("11:02:00", "11:03:00"))]
    moments_after = await services.query.moments(USER, None)
    assert len(moments_after) == len(moments_before) - 1
    assert not any(m.range.start == at("11:02:10") for m in moments_after)


async def test_reingest_and_replay_do_not_bring_erased_words_back(services, request_day):
    await services.ingest.ingest(request_day)
    await _erase_venue(services)

    result = await services.ingest.ingest(request_day)

    assert result.segments.excluded == 4
    assert result.corrections.excluded == 1
    assert result.segments.created == 0 and result.moments.created == 0
    assert result.refusals == []  # the stripped audio pointer is not a conflict
    text = await _all_text(services)
    assert not any(word in text for word in ERASED_WORDS)
    assert "audioPath" not in text

    # a new transcript revision with words in the range does not bring them back either
    bundle = golden_day()
    rev3 = bundle.transcripts[2].model_copy(
        update={"revision": "rev-3", "createdAt": at("21:00:00")}
    )
    late = CaptureBundle(schemaVersion="2.0.0", range=bundle.range, transcripts=[rev3])
    result = await services.ingest.ingest(IngestRequest(userId=USER, bundle=late))
    assert result.transcripts.created == 1 and result.segments.excluded == 2
    text = await _all_text(services)
    assert not any(word in text for word in ERASED_WORDS)


async def test_erase_record_holds_no_content_and_is_idempotent(services, request_day):
    await services.ingest.ingest(request_day)
    first = await _erase_venue(services)
    again = await _erase_venue(services)
    assert again.id == first.id
    erasures = await services.query.erasures(USER, None)
    assert len(erasures) == 1
    assert set(erasures[0].model_dump()) == {
        "id",
        "userId",
        "recordingId",
        "range",
        "gapId",
        "erasedAt",
        "segmentsRemoved",
        "correctionsRemoved",
        "momentsRemoved",
        "audioPointerRemoved",
    }


async def test_erase_whole_recording(services, request_day):
    await services.ingest.ingest(request_day)
    erasure = await services.erase.erase(EraseRequest(userId=USER, recordingId="rec-b"))
    assert erasure.range == golden_day().recordings[3].range
    transcripts = await services.query.transcripts(USER, "rec-b")
    assert transcripts and all(t.segments == [] for t in transcripts)
    assert (
        await services.query.moments(USER, TimeRange(start=at("11:05:41"), end=at("11:22:29")))
        == []
    )


async def test_erase_unknown_recording_returns_none(services):
    assert await services.erase.erase(EraseRequest(userId=USER, recordingId="nope")) is None
