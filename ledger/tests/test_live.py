"""Live (provisional) then final transcripts, as the Chronicle adapter sends them.

Bundles come from the adapter's own pure mapping (adapters/chronicle/mapping.py, loaded
read-only from its file), so these tests check the real contract.
"""

from __future__ import annotations

import importlib.util
from datetime import UTC, datetime, timedelta
from pathlib import Path

from ledger.models import EraseRequest, IngestRequest, MomentStatus
from ledger.schema import CaptureBundle, TimeRange
from ledger.services import Services, build_services
from ledger.stores import build_stores
from tests.conftest import new_db

_MAPPING = Path(__file__).resolve().parents[1] / "adapters" / "chronicle" / "mapping.py"
_spec = importlib.util.spec_from_file_location("chronicle_mapping", _MAPPING)
mapping = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mapping)

USER = "user-live"
CID = "conv-live-1"
T0 = datetime(2026, 11, 14, 9, 0, 0, tzinfo=UTC)
REC = f"chronicle:{CID}"


def raw_segments(final: bool = False) -> list[dict]:
    """~6 min of talk on the conversation clock: 5 s lines every 6 s, a 50 s pause after 30.
    The final reading hears line 3 differently."""
    out = []
    for i in range(60):
        start = i * 6 + (50 if i >= 30 else 0)
        text = f"line {i} about the venue booking"
        if final and i == 3:
            text = "line three, heard better by the final model"
        out.append(
            {
                "start": float(start),
                "end": float(start + 5),
                "text": text,
                "speaker": f"Speaker {i % 2}",
                "words": [],
            }
        )
    return out


def _facts(seconds: float, final: bool) -> dict:
    end = T0 + timedelta(seconds=seconds)
    return {
        "conversation_id": CID,
        "client_id": "omi-1",
        "started_at": T0,
        "ended_at": end if final else None,
        "end_reason": "inactivity_timeout" if final else None,
        "capture_origin": "streaming",
        "audio_ranges": [
            {
                "started_at": T0,
                "ended_at": end,
                "time_basis": "captured",
                "capture_session_ids": ["s1"],
            }
        ],
        "version_id": "ver-1" if final else None,
        "version_created_at": end if final else None,
        "model": "nova-3",
        "segments": raw_segments(final),
    }


def live_post(first: int, last: int, refine: dict | None = None) -> IngestRequest:
    """Segments [first, last) only: Chronicle sends new or changed live segments."""
    segs = raw_segments()[first:last]
    if refine:
        segs = [refine]
    seconds = max(s["end"] for s in raw_segments()[:last]) + 1
    payload = {"conversation_id": CID, "segments": segs, "timestamp_clock": "conversation"}
    bundle, why = mapping.build_bundle(mapping.EVENT_STREAMING, payload, _facts(seconds, False))
    assert bundle, why
    return IngestRequest(userId=USER, bundle=CaptureBundle.model_validate(bundle))


def final_post() -> IngestRequest:
    payload = {"conversation_id": CID}
    bundle, why = mapping.build_bundle(mapping.EVENT_COMPLETE, payload, _facts(420, True))
    assert bundle, why
    return IngestRequest(userId=USER, bundle=CaptureBundle.model_validate(bundle))


def live_services(clock: dict) -> Services:
    return build_services(build_stores(new_db()), clock=lambda: clock["t"])


async def _live_then_final(services: Services, clock: dict) -> None:
    for first in range(0, 60, 10):
        clock["t"] = T0 + timedelta(seconds=first * 6 + 70)
        await services.ingest.ingest(live_post(first, first + 10))
    clock["t"] = T0 + timedelta(seconds=430)
    await services.ingest.ingest(final_post())


def _moments_shape(moments) -> list[tuple]:
    return [
        (m.key, m.range.start, m.range.end, m.contentRevision, m.contentHash, m.status, m.reruns)
        for m in moments
    ]


async def test_growing_live_posts_make_one_transcript_with_appended_segments():
    clock = {"t": T0 + timedelta(seconds=60)}
    services = live_services(clock)
    first = await services.ingest.ingest(live_post(0, 10))
    second = await services.ingest.ingest(live_post(10, 20))
    again = await services.ingest.ingest(live_post(10, 20))

    assert first.transcripts.created == 1 and second.transcripts.created == 0
    assert second.segments.created == 10 and again.segments.present == 10
    transcripts = await services.query.transcripts(USER, REC)
    assert [t.revision for t in transcripts] == ["live"]
    assert len(transcripts[0].segments) == 20
    rec = await services.stores.recordings.load(USER, REC)
    assert rec.currentTranscriptRevision == "live"

    # a refined live segment (same start, new end and text) replaces the old one
    refined = dict(raw_segments()[5], end=34.5, text="line 5, refined by the live model")
    result = await services.ingest.ingest(live_post(5, 6, refine=refined))
    assert result.segments.replaced == 1
    texts = [s.text for s in (await services.query.transcripts(USER, REC))[0].segments]
    assert len(texts) == 20 and "line 5, refined by the live model" in texts


async def test_final_becomes_current_and_live_is_frozen():
    clock = {"t": T0 + timedelta(seconds=60)}
    services = live_services(clock)
    await services.ingest.ingest(live_post(0, 30))
    final = await services.ingest.ingest(final_post())
    again = await services.ingest.ingest(final_post())

    assert final.transcripts.created == 1 and again.transcripts.present == 1
    assert again.segments.created == 0 and again.refusals == []
    rec = await services.stores.recordings.load(USER, REC)
    assert rec.currentTranscriptRevision == "ver-1"

    late_live = await services.ingest.ingest(live_post(30, 40))
    assert late_live.transcripts.frozen == 1 and late_live.segments.frozen == 10
    assert late_live.refusals == []
    live = [t for t in await services.query.transcripts(USER, REC) if t.revision == "live"][0]
    assert len(live.segments) == 30  # frozen: nothing appended
    rec = await services.stores.recordings.load(USER, REC)
    assert rec.currentTranscriptRevision == "ver-1"  # the live post did not move the pointer


async def test_moments_start_live_and_changed_ones_are_marked_for_rerun():
    clock = {"t": T0}
    services = live_services(clock)
    for first in range(0, 60, 10):
        clock["t"] = T0 + timedelta(seconds=first * 6 + 70)
        await services.ingest.ingest(live_post(first, first + 10))
    before = await services.query.moments(USER, None)
    assert before, "work starts during the conversation"
    assert all(m.contentRevision == "live" for m in before)
    for m in before:
        await services.stores.moments.set_status(m.key, MomentStatus.done, count_attempt=True)

    clock["t"] = T0 + timedelta(seconds=430)
    result = await services.ingest.ingest(final_post())
    after = {m.key: m for m in await services.query.moments(USER, None)}

    assert {m.key for m in before} <= set(after)  # keys kept, nothing duplicated
    assert len(after) == len(set(after))
    assert result.moments.rerun == 1
    changed = [m for m in after.values() if m.reruns == 1]
    assert len(changed) == 1 and changed[0].status == MomentStatus.ready
    assert changed[0].range.start <= T0 + timedelta(seconds=18) < changed[0].range.end
    unchanged = [after[m.key] for m in before if after[m.key].reruns == 0]
    assert all(m.status == MomentStatus.done and m.contentRevision == "ver-1" for m in unchanged)


async def test_replay_of_live_then_final_twice_gives_identical_moments():
    runs = []
    for _ in range(2):
        clock = {"t": T0}
        services = live_services(clock)
        await _live_then_final(services, clock)
        runs.append(_moments_shape(await services.query.moments(USER, None)))
    assert runs[0] == runs[1] and len(runs[0]) >= 2

    clock = {"t": T0}
    services = live_services(clock)
    await _live_then_final(services, clock)
    await _live_then_final(services, clock)  # the same posts again into the same ledger
    assert _moments_shape(await services.query.moments(USER, None)) == runs[0]


async def test_erase_covers_the_live_revision():
    clock = {"t": T0 + timedelta(seconds=200)}
    services = live_services(clock)
    await services.ingest.ingest(live_post(0, 30))
    rng = TimeRange(start=T0 + timedelta(seconds=17), end=T0 + timedelta(seconds=30))
    erasure = await services.erase.erase(EraseRequest(userId=USER, recordingId=REC, range=rng))
    assert erasure.segmentsRemoved == 2  # lines 3 (18-23 s) and 4 (24-29 s)
    again = await services.ingest.ingest(live_post(0, 10))  # the live post comes again
    assert again.segments.excluded == 2 and again.segments.created == 0
    live = (await services.query.transcripts(USER, REC))[0]
    assert not any("line 3 " in s.text or "line 4 " in s.text for s in live.segments)
