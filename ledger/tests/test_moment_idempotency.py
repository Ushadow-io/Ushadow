"""M1: the same evidence twice gives the same moments and zero new records.

Real days have zero-length segments (start == end) at the very start of a recording. The
cutter used to treat them as free on a re-run (a zero-length range "overlaps" nothing), so
each re-ingest cut a one-segment moment on the edge of an existing one.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from ledger.models import IngestRequest
from ledger.schema import CaptureBundle, Recording, Segment, TimeRange, Transcript
from ledger.services import Services, build_services
from ledger.services.moment_cutter import CutInput, cut
from ledger.stores import build_stores
from ledger.timeutil import holds, overlaps
from tests.conftest import fake_models, make_services, new_db
from tests.fixtures.bundle import USER, at
from tests.fixtures.random_day import USER as RUSER
from tests.fixtures.random_day import RandomDay


def _seg(
    seg_id: str, start: datetime, end: datetime, text: str = "we talk about the plan"
) -> Segment:
    return Segment(id=seg_id, text=text, speakerLabel="Speaker 0", start=start, end=end)


def edge_request() -> IngestRequest:
    """A recording that opens with two zero-length segments at the same instant as the first
    real one, and one with a zero-length segment at the end of a moment before a hard pause."""
    t0 = at("10:00:00")
    segs = [_seg("z-0", t0, t0, "uh"), _seg("z-1", t0, t0, "so")]
    t = t0
    for i in range(30):
        segs.append(_seg(f"a-{i}", t, t + timedelta(seconds=3)))
        t += timedelta(seconds=4)
    segs.append(_seg("z-end", segs[-1].end, segs[-1].end, "ok"))
    t += timedelta(seconds=90)  # hard pause
    for i in range(10):
        segs.append(_seg(f"b-{i}", t, t + timedelta(seconds=3)))
        t += timedelta(seconds=4)
    rec = Recording(
        id="rec-edge",
        sourceId="phone",
        modality="audio_input",
        range=TimeRange(start=t0, end=t + timedelta(seconds=5)),
        origin="recovered",
    )
    tr = Transcript(recordingId="rec-edge", revision="rev-1", createdAt=t, segments=segs)
    day = TimeRange(start=at("00:00:00"), end=at("23:59:59"))
    bundle = CaptureBundle(schemaVersion="2.0.0", range=day, recordings=[rec], transcripts=[tr])
    return IngestRequest(userId=USER, bundle=bundle)


def _shape(moments) -> list[tuple]:
    return sorted((m.key, m.recordingId, m.range.start, m.range.end) for m in moments)


async def _segments(services: Services, user: str, rec_id: str) -> list[Segment]:
    out: list[Segment] = []
    for header in await services.stores.transcripts.revisions(user, rec_id):
        out.extend(await services.stores.segments.segments(user, rec_id, header.revision))
    return out


async def _assert_covered(services: Services, user: str) -> None:
    """Every stored segment belongs to a moment; moments of a recording never share time."""
    moments = await services.query.moments(user, None)
    for rec_id in {m.recordingId for m in moments}:
        ranges = sorted(
            (m.range for m in moments if m.recordingId == rec_id), key=lambda r: r.start
        )
        assert all(not overlaps(a, b) for a, b in zip(ranges, ranges[1:], strict=False))
        for seg in await _segments(services, user, rec_id):
            span = TimeRange(start=seg.start, end=seg.end)
            assert any(holds(r, span) for r in ranges), seg.id


def test_cutter_gives_edge_zero_length_segments_to_the_existing_moment():
    segs = edge_request().bundle.transcripts[0].segments
    first = cut(CutInput(segments=segs, barriers=[], horizon=segs[-1].end, closed=True))
    barriers = [TimeRange(start=s.start, end=s.end) for s in first]
    again = cut(CutInput(segments=segs, barriers=barriers, horizon=segs[-1].end, closed=True))
    assert again == []
    assert sum(s.segment_count for s in first) == len(segs)


async def test_reingest_of_zero_length_edge_segments_cuts_no_new_moment():
    services = make_services()
    first = await services.ingest.ingest(edge_request())
    expected = _shape(await services.query.moments(USER, None))
    for _ in range(2):
        again = await services.ingest.ingest(edge_request())
        assert again.moments.created == 0 and again.moments.rerun == 0
        assert again.moments.present == first.moments.created
    assert _shape(await services.query.moments(USER, None)) == expected
    await _assert_covered(services, USER)


async def test_pipeline_after_reingest_makes_no_new_links_or_conversation_changes():
    services = make_services(models=fake_models())
    day = edge_request().bundle.range
    await services.ingest.ingest(edge_request())
    await services.conversations.run(USER, day)
    links = len(await services.stores.links.find({}))
    await services.ingest.ingest(edge_request())
    again = await services.conversations.run(USER, day)
    assert again.linksCreated == 0 and again.model.calls == 0
    assert again.conversations.created == again.conversations.changed == 0
    assert len(await services.stores.links.find({})) == links


def _clocked() -> tuple[Services, dict]:
    clock = {"t": datetime.min}
    return build_services(build_stores(new_db()), clock=lambda: clock["t"]), clock


async def _ingest_live(services: Services, clock: dict, day: RandomDay) -> None:
    for when, post in day.live_posts():
        clock["t"] = when
        await services.ingest.ingest(post)


@pytest.mark.parametrize("seed", range(25))
async def test_random_days_give_the_same_moments_on_every_ingest(seed):
    """Property (seeded): batch or live posts then final, ingested 1, 2, 3 times, give the
    same moment keys and ranges and full coverage, and passes 2 and 3 create nothing."""
    day = RandomDay(seed)
    batch = make_services()
    shapes = []
    for _ in range(3):
        result = await batch.ingest.ingest(day.batch())
        shapes.append(_shape(await batch.query.moments(RUSER, None)))
        if len(shapes) > 1:
            assert result.moments.created == 0 and result.moments.rerun == 0
    assert shapes[0] == shapes[1] == shapes[2]
    await _assert_covered(batch, RUSER)

    live, clock = _clocked()
    live_shapes = []
    for _ in range(3):
        await _ingest_live(live, clock, RandomDay(seed))
        live_shapes.append(_shape(await live.query.moments(RUSER, None)))
    assert live_shapes[0] == live_shapes[1] == live_shapes[2]
    await _assert_covered(live, RUSER)
