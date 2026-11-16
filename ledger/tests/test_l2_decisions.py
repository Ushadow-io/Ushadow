"""Human overrides: a human split or join wins, survives re-runs, and changes only the
conversations it touches."""

from __future__ import annotations

from ledger.models import DecisionRequest
from ledger.schema import LinkKind
from tests.fixtures.l2_day import DAY_RANGE, USER, at
from tests.l2_helpers import ingest_and_run, l2_services, recordings, shape


def _by_id(rows):
    return {r[0]: r for r in rows}


async def _why_link(services, conv_id: str, role: str):
    why = await services.conversations.why(USER, conv_id)
    return next(d.link for d in why.decisions if d.role == role)


async def test_human_split_survives_rerun_and_touches_one_conversation():
    services = l2_services()
    await ingest_and_run(services)
    before = await shape(services)
    target = before[1]  # rec-m (after the model split) + rec-n
    # rec-n line 10 starts at 09:13:05
    result = await services.conversations.decide(
        DecisionRequest(
            userId=USER,
            kind=LinkKind.split_at,
            fromId="rec-n",
            at=at("09:13:05"),
            key="split:human:rec-n:1",
            reason="the venue talk ends here",
        )
    )
    assert result.created and result.effective.decidedBy.value == "human"
    after = await shape(services)
    assert [recordings(r) for r in after] == [
        ["rec-m"],
        ["rec-m", "rec-n"],
        ["rec-n"],
        ["rec-p", "rec-p2"],
        ["rec-x"],
    ]
    old, new = _by_id(before), _by_id(after)
    for row in (before[0], before[2], before[3]):  # untouched: same revision, same text
        assert new[row[0]] == old[row[0]]
    changed = new[target[0]]
    assert changed[1] == 2 and changed[3] < target[3]  # same id, next revision, shorter
    assert after[2][2] == at("09:13:05") and after[2][1] == 1

    again = await services.conversations.run(USER, DAY_RANGE)
    assert again.model.calls == 0 and await shape(services) == after


async def test_human_join_merges_two_conversations_and_survives_rerun():
    services = l2_services()
    await ingest_and_run(services)
    before = await shape(services)
    opened = await _why_link(services, before[3][0], "opened_by")  # rec-x: long_gap rule
    assert opened.reason == "long_gap"
    result = await services.conversations.decide(
        DecisionRequest(
            userId=USER,
            kind=LinkKind.continues,
            fromId=opened.fromId,
            toId=opened.toId,
            key=opened.key,
            retracts=opened.id,
        )
    )
    assert result.effective.id == result.link.id
    after = await shape(services)
    assert [recordings(r) for r in after] == [
        ["rec-m"],
        ["rec-m", "rec-n"],
        ["rec-p", "rec-p2", "rec-x"],
    ]
    assert after[0] == before[0] and after[1] == before[1]
    assert after[2][0] == before[2][0] and after[2][1] == 2
    retired = await services.stores.conversations.load(USER, before[3][0])
    assert retired["active"] is False and "title" not in retired["body"]

    for _ in range(2):
        again = await ingest_and_run(services)
        assert await shape(services) == after
    assert again.model.calls == 0


async def test_human_can_cancel_a_model_split():
    services = l2_services()
    await ingest_and_run(services)
    split = await _why_link(services, (await shape(services))[0][0], "closed_by")
    assert split.kind == LinkKind.split_at and split.decidedBy.value == "model"
    await services.conversations.decide(
        DecisionRequest(
            userId=USER,
            kind=LinkKind.continues,
            fromId=split.fromId,
            toId="no-split",
            key=split.key,
            retracts=split.id,
        )
    )
    after = await shape(services)
    assert [recordings(r) for r in after][:1] == [["rec-m", "rec-n"]]
    assert len(after) == 3
