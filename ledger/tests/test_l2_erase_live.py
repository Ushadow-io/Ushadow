"""Erase and late evidence at L2: only the affected conversations are rebuilt, and erased words
never stay in a state, title, summary or fragment."""

from __future__ import annotations

from datetime import timedelta

from ledger.models import EraseRequest
from ledger.schema import TimeRange
from ledger.services import build_services
from ledger.stores import build_stores
from tests.conftest import fake_models, new_db
from tests.fixtures.l2_day import SECRET, USER, span_of
from tests.l2_helpers import all_l2_text, ingest_and_run, l2_services, shape
from tests.test_live import REC, T0, final_post, live_post
from tests.test_live import USER as LIVE_USER


async def test_erase_inside_a_conversation_removes_the_words_everywhere():
    services = l2_services()
    await ingest_and_run(services)
    before = await shape(services)
    assert SECRET in before[1][8]  # summary of the rec-m + rec-n conversation
    assert SECRET in await all_l2_text(services)

    erased = await services.conversations.erase(
        EraseRequest(userId=USER, recordingId="rec-m", range=span_of("09:07:16", "09:07:23"))
    )
    assert erased.segmentsRemoved == 1

    after = await shape(services)
    assert SECRET not in await all_l2_text(services)  # conversations (also retired), states, links
    assert SECRET not in str(after)
    assert [r[0] for r in after] == [r[0] for r in before]  # same conversations
    assert after[0] == before[0] and after[2:] == before[2:]  # untouched
    assert after[1][1] == 2 and after[1][7]  # rebuilt: next revision, composed again

    again = await ingest_and_run(services)  # a replay does not bring the words back
    assert again.model.calls == 0 and SECRET not in await all_l2_text(services)


def _live_services(clock: dict):
    return build_services(build_stores(new_db()), clock=lambda: clock["t"], models=fake_models())


DAY = TimeRange(start=T0 - timedelta(hours=1), end=T0 + timedelta(hours=2))


async def _live_shape(services) -> list[tuple]:
    return [row[:1] + row[2:] for row in await shape_of(services)]  # all but the revision


async def shape_of(services) -> list[tuple]:
    out = []
    for view in await services.conversations.list(LIVE_USER, None):
        conv = view.conversation
        out.append(
            (
                conv.id,
                conv.revision,
                tuple((p.recordingId, p.range.start, p.range.end) for p in conv.parts),
                tuple((f.id, f.range.start, f.range.end, f.topic) for f in view.fragments),
                conv.closedAt,
                conv.title,
                conv.summary,
            )
        )
    return out


async def test_live_then_final_settles_to_the_final_only_result():
    clock = {"t": T0}
    live = _live_services(clock)
    for first in range(0, 60, 10):
        clock["t"] = T0 + timedelta(seconds=first * 6 + 70)
        await live.ingest.ingest(live_post(first, first + 10))
        await live.conversations.run(LIVE_USER, DAY)
    assert await live.conversations.list(LIVE_USER, None), "conversations start while live"
    clock["t"] = T0 + timedelta(seconds=430)
    await live.ingest.ingest(final_post())
    await live.conversations.run(LIVE_USER, DAY)

    clock_f = {"t": T0 + timedelta(seconds=430)}
    final = _live_services(clock_f)
    await final.ingest.ingest(final_post())
    await final.conversations.run(LIVE_USER, DAY)
    assert await _live_shape(live) == await _live_shape(final)

    clock["t"] = clock_f["t"] = T0 + timedelta(hours=3)  # quiet: they close and are composed
    await live.conversations.run(LIVE_USER, DAY)
    await final.conversations.run(LIVE_USER, DAY)
    settled = await _live_shape(final)
    assert await _live_shape(live) == settled
    assert all(row[3] is not None and row[4] for row in settled)
    live_rows = await shape_of(live)
    assert any(row[1] > 1 for row in live_rows)  # live builds were revised by the final
    assert {p[0] for row in live_rows for p in row[2]} == {REC}
