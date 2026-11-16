"""M2 done-when: replays give the same conversations, and model inputs stay small."""

from __future__ import annotations

from datetime import timedelta

from ledger.l2_models import JOIN_POLICY
from ledger.models import IngestRequest
from ledger.schema import CaptureBundle, Segment, Speaker, TimeRange
from ledger.services.l2.prompts import COMPOSER_INPUT_MAX_CHARS, SMALL_INPUT_MAX_CHARS
from tests.fixtures.l2_day import DAY_RANGE, USER, _recording, at
from tests.l2_helpers import all_l2_text, ingest_and_run, l2_services, recordings, shape


async def test_day_becomes_the_expected_conversations():
    services = l2_services()
    result = await ingest_and_run(services)
    rows = await shape(services)
    assert [recordings(r) for r in rows] == [
        ["rec-m"],  # until the topic split at line 70
        ["rec-m", "rec-n"],  # after the split, joined by the same_people rule
        ["rec-p", "rec-p2"],  # two short plumber calls, joined by the day pass
        ["rec-x"],  # long_gap rule
    ]
    assert result.conversations.created == 4 and result.conversations.composed == 4
    assert all(r[1] == 1 and r[6] is not None and r[7] for r in rows)  # rev 1, closed, titled
    assert "rec-tv" not in str(rows)  # media only, and its duplicate, make no conversation


async def test_three_fresh_replays_give_identical_conversations():
    shapes = []
    for _ in range(3):
        services = l2_services()
        await ingest_and_run(services)
        shapes.append(await shape(services))
    assert shapes[0] == shapes[1] == shapes[2] and len(shapes[0]) == 4


async def test_three_replays_in_one_ledger_ask_no_model_again():
    services = l2_services()
    first = await ingest_and_run(services)
    expected = await shape(services)
    assert first.model.calls > 0
    for _ in range(2):
        again = await ingest_and_run(services)
        assert again.model.calls == 0 and again.linksCreated == 0
        assert again.conversations.unchanged == 4 and again.conversations.composed == 0
        assert await shape(services) == expected
    fresh = l2_services()
    await ingest_and_run(fresh)
    assert await shape(fresh) == expected


async def test_join_and_split_decisions_are_saved_links():
    services = l2_services()
    await ingest_and_run(services)
    convs = await services.conversations.list(USER, None)
    sources = []
    for view in convs:
        why = await services.conversations.why(USER, view.conversation.id)
        sources.append(
            {(d.role, d.source, d.link.reason if d.link else None) for d in why.decisions}
        )
    assert ("closed_by", "model", "topic_changed") in sources[0]
    assert ("joined", "rule", "same_people") in sources[1]
    assert ("joined", "daypass", "same_topic") in sources[2]
    assert ("opened_by", "rule", "long_gap") in sources[3]
    joins = [d for d in await services.stores.links.find({}) if d["key"].startswith("join:")]
    assert joins and all(d["body"]["policyVersion"] == JOIN_POLICY for d in joins)
    assert "pineapple" not in str(joins)  # Link reasons are codes, never words


def _talkative() -> IngestRequest:
    """Long lines: a moment reaches the 600-word limit, so its text must be cut to fit."""
    words = " ".join(f"word{i}" for i in range(40))
    segs = [
        Segment(
            id=f"t-{i}",
            text=f"{words} {i}",
            speakerLabel=f"Speaker {i % 2}",
            start=at("16:00:05") + timedelta(seconds=6 * i),
            end=at("16:00:10") + timedelta(seconds=6 * i),
        )
        for i in range(120)
    ]
    other = Speaker(label="Speaker 1", role="participant", displayName="Lee")
    rec, transcript = _recording("rec-talk", "pendant", segs, other)
    bundle = CaptureBundle(
        schemaVersion="2.0.0", range=DAY_RANGE, recordings=[rec], transcripts=[transcript]
    )
    return IngestRequest(userId=USER, bundle=bundle)


async def test_largest_model_input_stays_under_the_bound():
    services = l2_services()
    await services.ingest.ingest(_talkative())
    result = await ingest_and_run(services)
    layers = result.model.layers
    assert set(layers) == {"gap", "state", "composer"}
    assert max(layers["gap"].maxInputChars, layers["state"].maxInputChars) <= SMALL_INPUT_MAX_CHARS
    assert layers["composer"].maxInputChars <= COMPOSER_INPUT_MAX_CHARS
    assert result.model.maxInputTokensEstimate <= COMPOSER_INPUT_MAX_CHARS // 4
    totals = services.model_stats.finish()
    assert totals.layers["state"].calls == layers["state"].calls


async def test_a_window_inside_the_day_gives_the_same_conversations():
    services = l2_services()
    await ingest_and_run(services)
    expected = await shape(services)
    again = await services.conversations.run(
        USER, TimeRange(start=at("09:08:00"), end=at("09:09:00"))
    )
    assert again.model.calls == 0 and again.conversations.retired == 0
    assert await shape(services) == expected
    assert "pineapple" in await all_l2_text(services)  # the erase test relies on this
