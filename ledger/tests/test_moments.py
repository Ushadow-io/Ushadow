from __future__ import annotations

import json
from datetime import timedelta

from ledger.models import IngestRequest, MomentStatus
from ledger.replay import load_request, replay_into
from ledger.schema import CaptureBundle, TimeRange
from ledger.schema.life_datatypes import RecordingOrigin
from ledger.services import build_services
from ledger.services.moment_cutter import CutInput, cut
from ledger.stores import build_stores
from ledger.timeutil import duration
from tests.conftest import fixed_clock, make_services, new_db
from tests.fixtures.bundle import USER, at, golden_day, long_segments


def _shape(moments) -> list[tuple]:
    return [(m.key, m.recordingId, m.range.start, m.range.end, m.segmentCount) for m in moments]


def test_cutter_cuts_about_three_minutes_on_pauses():
    segs = long_segments()
    spans = cut(CutInput(segments=segs, barriers=[], horizon=segs[-1].end, closed=True))
    lengths = [(s.end - s.start).total_seconds() for s in spans]
    assert all(length <= 180 for length in lengths)
    assert max(lengths) >= 150  # close to 3 minutes, not tiny pieces
    # the 60 s pause after 13:05 is always a boundary
    assert any(s.start == segs[50].start for s in spans)
    # every cut is on a 3 s pause (after every 10th line) or the 60 s pause
    starts = {s.start for s in spans}
    assert starts <= {segs[i].start for i in range(0, 110, 10)}
    assert sum(s.segment_count for s in spans) == len(segs)


def test_cutter_holds_back_the_open_end_of_a_live_recording():
    segs = long_segments()[:40]
    held = cut(CutInput(segments=segs, barriers=[], horizon=segs[-1].end, closed=False))
    done = cut(CutInput(segments=segs, barriers=[], horizon=segs[-1].end, closed=True))
    assert len(held) == len(done) - 1
    assert held == done[: len(held)]


async def test_replay_of_same_bundle_twice_gives_identical_moments(tmp_path):
    path = tmp_path / "golden_day.json"
    path.write_text(golden_day().model_dump_json())

    runs = []
    for _ in range(2):  # two fresh ledgers
        db = new_db()
        await replay_into(db, load_request(path, USER))
        runs.append(_shape(await make_services(db).query.moments(USER, None)))
    assert runs[0] == runs[1]
    assert len(runs[0]) >= 8

    db = new_db()  # the same ledger twice
    first = await replay_into(db, load_request(path, USER))
    second = await replay_into(db, load_request(path, USER))
    assert second.moments.created == 0
    assert second.moments.present == first.moments.created
    assert _shape(await make_services(db).query.moments(USER, None)) == runs[0]


async def test_streamed_live_recording_gives_the_same_moments_as_one_batch():
    bundle = golden_day()
    rec, transcript = bundle.recordings[4], bundle.transcripts[4]
    batch = make_services()
    await batch.ingest.ingest(IngestRequest(userId=USER, bundle=bundle))
    expected = _shape(await batch.query.moments(USER, None))
    expected = [m for m in expected if m[1] == "rec-long"]

    now = {"t": rec.range.start}
    live = build_services(build_stores(new_db()), clock=lambda: now["t"])
    for i in range(7, len(transcript.segments) + 7, 7):
        segs = transcript.segments[:i]
        now["t"] = segs[-1].end + timedelta(seconds=2)
        live_rec = rec.model_copy(
            update={
                "origin": RecordingOrigin.live,
                "range": TimeRange(start=rec.range.start, end=now["t"]),
            }
        )
        chunk = CaptureBundle(
            schemaVersion="2.0.0",
            range=bundle.range,
            recordings=[live_rec],
            transcripts=[transcript.model_copy(update={"segments": segs})],
        )
        await live.ingest.ingest(IngestRequest(userId=USER, bundle=chunk))
    now["t"] += timedelta(minutes=5)  # the recording goes quiet; the sweep closes it
    await live.moments.sweep()
    assert _shape(await live.query.moments(USER, None)) == expected


async def test_late_evidence_adds_moments_and_never_rewrites_old_ones(services, request_day):
    await services.ingest.ingest(request_day)
    before = _shape(await services.query.moments(USER, None))

    bundle = golden_day()
    transcript = bundle.transcripts[3]  # rec-b
    late = transcript.segments[0].model_copy(
        update={
            "id": "b-late",
            "text": "Late line from a second upload.",
            "start": at("11:15:00"),
            "end": at("11:15:04"),
        }
    )
    chunk = CaptureBundle(
        schemaVersion="2.0.0",
        range=bundle.range,
        transcripts=[transcript.model_copy(update={"segments": [late]})],
    )
    result = await services.ingest.ingest(IngestRequest(userId=USER, bundle=chunk))

    after = _shape(await services.query.moments(USER, None))
    assert result.moments.created == 1
    assert set(before) <= set(after) and len(after) == len(before) + 1


async def test_moment_state_is_saved(services, request_day):
    await services.ingest.ingest(request_day)
    moment = (await services.query.moments(USER, None))[0]
    assert moment.status == MomentStatus.ready and moment.attempts == 0
    await services.stores.moments.set_status(
        moment.key, MomentStatus.processing, count_attempt=True
    )
    again = (await services.query.moments(USER, None))[0]
    assert again.status == MomentStatus.processing and again.attempts == 1
    assert duration(again.range) == duration(moment.range)


def test_fixture_file_is_valid_json_bundle(tmp_path):
    path = tmp_path / "b.json"
    path.write_text(
        json.dumps({"userId": USER, "bundle": json.loads(golden_day().model_dump_json())})
    )
    assert load_request(path, None).userId == USER
    assert fixed_clock() > at("23:00:00")
