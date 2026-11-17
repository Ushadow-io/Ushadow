"""Several final segments at one instant are all evidence (invented text).

Real transcripts have two or three zero-length segments (start == end) at the same instant with
different words. The segment key was recording + revision + start + end, so the second one was
refused as "differs from stored evidence" and its words were lost on every ingest.
"""

from __future__ import annotations

from datetime import timedelta
from itertools import permutations

import pytest

from ledger.models import EraseRequest, IngestRequest
from ledger.schema import CaptureBundle, Recording, Segment, TimeRange, Transcript
from ledger.schema.life_datatypes import RecordingOrigin, TranscriptStatus
from ledger.services import Services
from ledger.services.l2.lines import assign
from ledger.services.moment_service import content_hash
from ledger.timeutil import fingerprint, holds, ts
from tests.conftest import make_services
from tests.fixtures.bundle import USER, at

REC = "rec-many"
T0 = at("09:00:00")  # three zero-length segments open the recording
TMID = at("09:00:29") + timedelta(milliseconds=500)  # two more, in a pause mid-talk
OPENING = [("Speaker 0", "well"), ("Speaker 1", "right then"), ("Speaker 0", "okay")]
MIDDLE = [("Speaker 0", "hmm"), ("Speaker 0", "yes")]


def _zero(prefix: str, when, group: list[tuple[str, str]]) -> list[Segment]:
    return [
        Segment(id=f"{prefix}-{i}", text=text, speakerLabel=label, start=when, end=when)
        for i, (label, text) in enumerate(group)
    ]


def _talk() -> list[Segment]:
    out, t = [], T0
    for i in range(12):
        out.append(
            Segment(
                id=f"talk-{i}",
                text=f"we paint the shelf part {i}",
                speakerLabel=f"Speaker {i % 2}",
                start=t,
                end=t + timedelta(seconds=4),
            )
        )
        t += timedelta(seconds=5)
    return out


def segments(order: tuple[int, ...] = (0, 1, 2), id_prefix: str = "") -> list[Segment]:
    """The recording's final segments; `order` permutes the opening group."""
    opening = _zero(f"{id_prefix}open", T0, OPENING)
    middle = _zero(f"{id_prefix}mid", TMID, MIDDLE)
    return [*(opening[i] for i in order), *_talk()[:6], *middle, *_talk()[6:]]


def _recording(live: bool = False) -> Recording:
    return Recording(
        id=REC,
        sourceId="phone",
        modality="audio_input",
        range=TimeRange(start=T0 - timedelta(seconds=1), end=T0 + timedelta(minutes=2)),
        origin=RecordingOrigin.live if live else RecordingOrigin.recovered,
    )


def request(
    segs: list[Segment], revision: str = "rev-1", status=TranscriptStatus.final, live=False
) -> IngestRequest:
    tr = Transcript(
        recordingId=REC,
        revision=revision,
        status=status,
        createdAt=T0 + timedelta(minutes=3),
        segments=segs,
    )
    day = TimeRange(start=at("00:00:00"), end=at("23:59:59"))
    bundle = CaptureBundle(
        schemaVersion="2.0.0", range=day, recordings=[_recording(live)], transcripts=[tr]
    )
    return IngestRequest(userId=USER, bundle=bundle)


def _words(segs) -> set[tuple[str, str, str]]:
    return {(ts(s.start), s.speakerLabel, s.text) for s in segs}


async def _stored(services: Services, revision: str = "rev-1") -> list[Segment]:
    return await services.stores.segments.segments(USER, REC, revision)


@pytest.mark.parametrize("order", list(permutations(range(3))))
@pytest.mark.parametrize("times", [1, 2, 3])
async def test_every_segment_at_one_instant_is_stored_in_any_order(order, times):
    services = make_services()
    sent = segments(order)
    results = [await services.ingest.ingest(request(sent)) for _ in range(times)]
    assert all(r.refusals == [] for r in results)
    assert results[0].segments.created == len(sent)
    assert all(r.segments.present == len(sent) for r in results[1:])
    stored = await _stored(services)
    assert len(stored) == len(sent) and _words(stored) == _words(sent)
    assert len(await services.stores.segments.find({})) == len(sent)


async def test_arrival_order_does_not_change_what_is_stored():
    shapes = []
    for order in permutations(range(3)):
        services = make_services()
        await services.ingest.ingest(request(segments(order)))
        docs = await services.stores.segments.find({})
        stored = await _stored(services)
        moments = await services.query.moments(USER, None)
        shapes.append(
            (
                sorted(d["_id"] for d in docs),
                [(s.id, s.text) for s in stored],  # listing order is the same too
                sorted((m.key, m.contentHash) for m in moments),
            )
        )
    assert all(shape == shapes[0] for shape in shapes)


async def test_same_segment_with_a_new_sender_id_is_present():
    services = make_services()
    await services.ingest.ingest(request(segments()))
    again = await services.ingest.ingest(request(segments((2, 0, 1), id_prefix="renamed-")))
    assert again.refusals == [] and again.segments.created == 0
    assert again.segments.present == len(segments())
    assert len(await services.stores.segments.find({})) == len(segments())


async def test_a_changed_segment_at_a_shared_instant_is_refused():
    services = make_services()
    await services.ingest.ingest(request(segments()))
    changed = segments()
    changed[1] = changed[1].model_copy(update={"text": "something else"})  # the post drops one
    result = await services.ingest.ingest(request(changed))
    assert result.segments.refused == 1 and result.refusals[0].type == "segment"
    assert result.segments.present == len(changed) - 1
    assert "something else" not in {s.text for s in await _stored(services)}

    confidence = segments()  # same words, other body: still a different segment
    confidence[0] = confidence[0].model_copy(update={"confidence": 0.5})
    result = await services.ingest.ingest(request(confidence))
    assert result.segments.refused == 1


async def test_the_moment_covers_every_segment_at_the_instant():
    services = make_services()
    sent = segments()
    await services.ingest.ingest(request(sent))
    moments = await services.query.moments(USER, None)
    stored = await _stored(services)
    for when in (T0, TMID):
        span = TimeRange(start=when, end=when)
        home = [m for m in moments if holds(m.range, span)]
        assert len(home) >= 1
        moment = home[0]
        assert moment.contentHash == content_hash(stored, moment.range)
        group = [s for s in stored if s.start == when and s.end == when]
        assert len(group) >= 2
        without_one = [s for s in stored if s is not group[-1]]
        assert content_hash(without_one, moment.range) != moment.contentHash
    lines = assign(stored, [m.range for m in moments])
    assert sum(len(x) for x in lines) == len(stored)  # every one gets a line, once
    for when in (T0, TMID):
        homes = {i for i, x in enumerate(lines) for s in x if s.start == when}
        assert len(homes) == 1  # all segments of one instant land in the same moment


async def test_live_then_final_keeps_every_segment_of_the_final():
    services = make_services()
    sent = segments()
    for part in (sent[:5], sent[5:]):  # live deltas
        live = request(part, revision="live", status=TranscriptStatus.provisional, live=True)
        assert (await services.ingest.ingest(live)).refusals == []
    final = await services.ingest.ingest(request(sent, revision="rev-final", live=True))
    assert final.refusals == [] and final.segments.created == len(sent)
    stored = await _stored(services, "rev-final")
    assert _words(stored) == _words(sent)
    late = await services.ingest.ingest(
        request(sent, revision="live", status=TranscriptStatus.provisional, live=True)
    )
    assert late.transcripts.frozen == 1 and late.refusals == []
    again = await services.ingest.ingest(
        request(segments((1, 2, 0)), revision="rev-final", live=True)
    )
    assert again.refusals == [] and again.segments.present == len(sent)


async def test_erase_over_the_instant_removes_every_segment_there():
    services = make_services()
    await services.ingest.ingest(request(segments()))
    rng = TimeRange(start=TMID - timedelta(seconds=0.2), end=TMID + timedelta(seconds=0.2))
    erasure = await services.erase.erase(EraseRequest(userId=USER, recordingId=REC, range=rng))
    assert erasure is not None and erasure.segmentsRemoved == len(MIDDLE)
    assert not [s for s in await _stored(services) if s.start == TMID]
    again = await services.ingest.ingest(request(segments()))
    assert again.refusals == [] and again.segments.excluded == len(MIDDLE)
    assert not [s for s in await _stored(services) if s.start == TMID]


def _old_key(seg: Segment) -> str:
    """The key the ledger used before the segment identity was part of it."""
    return f"{USER}|{REC}|rev-1|{ts(seg.start)}|{ts(seg.end)}"


async def test_segments_stored_under_the_old_key_stay_present_and_lost_ones_come_back():
    """A deployed ledger holds the first segment of each instant under the old key and lost
    the others. The next ingest finds the stored ones and adds the lost ones, no duplicates."""
    services = make_services()
    sent = segments()
    collection = services.stores.segments._c
    await services.ingest.ingest(request(sent[:0]))  # recording + transcript header only
    seen: set[str] = set()
    for seg in sent:  # what the old code kept: one segment per (start, end)
        key = _old_key(seg)
        if key in seen:
            continue
        seen.add(key)
        body = seg.model_dump(mode="json")
        await collection.insert_one(
            {
                "_id": key,
                "userId": USER,
                "recordingId": REC,
                "revision": "rev-1",
                "start": ts(seg.start),
                "end": ts(seg.end),
                "body": body,
                "fp": fingerprint(body),
            }
        )
    lost = len(sent) - len(seen)
    assert lost == len(OPENING) - 1 + len(MIDDLE) - 1

    first = await services.ingest.ingest(request(segments((2, 1, 0))))
    assert first.refusals == []
    assert first.segments.present == len(seen) and first.segments.created == lost
    assert _words(await _stored(services)) == _words(sent)
    for _ in range(2):
        again = await services.ingest.ingest(request(sent))
        assert again.refusals == [] and again.segments.created == 0
        assert again.segments.present == len(sent)
    assert len(await services.stores.segments.find({})) == len(sent)
