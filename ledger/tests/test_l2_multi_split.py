"""More than one topic split inside one moment (a phone call, and the return from it).

One recording of 30 lines, 6 s apart: one ~3 minute moment. Lines with the marker are where
the FakeModel reports a topic change.
"""

from __future__ import annotations

from ledger.llm import FakeBehaviour
from ledger.models import DecisionRequest, IngestRequest
from ledger.schema import CaptureBundle, LinkKind, Speaker
from ledger.services.l2.context import split_key
from ledger.services.l2.rules import MAX_SPLITS_PER_MOMENT
from tests.fixtures.l2_day import DAY, USER, _lines, _recording, at, span_of
from tests.l2_helpers import l2_services

MARK = "Switching over"
DAY_RANGE = span_of("00:00:00", "23:59:59")
KIM = Speaker(label="Speaker 1", role="participant", personId="person-kim", displayName="Kim")


def _request(marks: set[int]) -> IngestRequest:
    texts = [f"{MARK} now, line {i}" if i in marks else f"line {i} of the talk" for i in range(30)]
    rec, transcript = _recording("rec-c", "phone", _lines("c", at("10:00:05"), texts), KIM)
    bundle = CaptureBundle(
        schemaVersion="2.0.0",
        range=span_of("00:00:00", "23:59:59"),
        recordings=[rec],
        transcripts=[transcript],
    )
    assert DAY.date() == rec.range.start.date()
    return IngestRequest(userId=USER, bundle=bundle)


async def _starts(services) -> list[str]:
    """The first line of each conversation, as a line id (c-N)."""
    out = []
    for view in await services.conversations.list(USER, None):
        start = view.conversation.range.start
        out.append(f"c-{round((start - at('10:00:05')).total_seconds() / 6)}")
    return out


async def _run(services, marks: set[int]):
    await services.ingest.ingest(_request(marks))
    return await services.conversations.run(USER, DAY_RANGE)


async def test_one_moment_splits_twice():
    services = l2_services(FakeBehaviour(split_marker=MARK))
    await _run(services, {8, 20})
    assert len(await services.query.moments(USER, None)) == 1
    assert await _starts(services) == ["c-0", "c-8", "c-20"]
    keys = sorted(
        d["key"] for d in await services.stores.links.find({}) if d["body"]["kind"] == "split_at"
    )
    moment = (await services.query.moments(USER, None))[0].key
    assert keys == sorted([split_key(moment), split_key(moment, 1)])


async def test_two_splits_are_saved_decisions_a_rerun_asks_no_model():
    services = l2_services(FakeBehaviour(split_marker=MARK))
    first = await _run(services, {8, 20})
    expected = await _starts(services)
    again = await _run(services, {8, 20})
    assert first.model.calls > 0
    assert again.model.calls == 0 and again.linksCreated == 0
    assert again.conversations.unchanged == 3
    fresh = l2_services(FakeBehaviour(split_marker=MARK))
    await _run(fresh, {8, 20})
    assert await _starts(fresh) == expected


async def test_splits_inside_one_moment_are_bounded():
    marks = {3, 6, 9, 12, 15, 18, 21, 24}
    services = l2_services(FakeBehaviour(split_marker=MARK))
    await _run(services, marks)
    starts = await _starts(services)
    assert len(starts) == MAX_SPLITS_PER_MOMENT + 1
    assert starts == ["c-0", "c-3", "c-6", "c-9"]


async def test_each_split_keeps_the_minimum_side():
    # line 28: the side after it would hold 2 lines (28, 29) of 11 s: valid; line 29: one line
    services = l2_services(FakeBehaviour(split_marker=MARK))
    await _run(services, {8, 29})
    assert await _starts(services) == ["c-0", "c-8"]
    reasons = [d["body"]["reason"] for d in await services.stores.links.find({})]
    assert "split_rejected:min_size" in reasons


async def test_a_human_no_split_on_the_moment_cancels_every_model_split():
    services = l2_services(FakeBehaviour(split_marker=MARK))
    await _run(services, {8, 20})
    moment = (await services.query.moments(USER, None))[0].key
    await services.decisions.decide(
        DecisionRequest(
            userId=USER,
            kind=LinkKind.continues,
            fromId="rec-c",
            toId=moment,
            key=split_key(moment),
        )
    )
    await services.conversations.run(USER, DAY_RANGE)
    assert await _starts(services) == ["c-0"]
