from __future__ import annotations

from ledger.models import DUPLICATE_POLICY, DecisionError, DecisionRequest
from ledger.schema import Decider, LinkKind
from ledger.services import Services
from tests.fixtures.bundle import USER

DUP_KEY = f"duplicate_of:rec-tv:rec-tv-copy:{DUPLICATE_POLICY}"


async def test_duplicate_rule_writes_one_rule_link(services: Services, request_day):
    first = await services.ingest.ingest(request_day)
    second = await services.ingest.ingest(request_day)
    links = await services.stores.links.by_key(USER, DUP_KEY)
    assert len(links) == 1
    rule = links[0]
    assert (rule.decidedBy, rule.kind, rule.policyVersion) == (
        Decider.rule,
        LinkKind.duplicate_of,
        DUPLICATE_POLICY,
    )
    assert (rule.fromId, rule.toId) == ("rec-tv", "rec-tv-copy")
    assert first.duplicateLinks.created == 1 and second.duplicateLinks.created == 0
    # nothing deleted: both recordings and their moments stay
    assert {r.id for r in await services.query.recordings(USER, None)} >= {"rec-tv", "rec-tv-copy"}


async def test_human_link_wins_over_rule_link_for_same_key(services: Services, request_day):
    await services.ingest.ingest(request_day)
    rule = (await services.stores.links.by_key(USER, DUP_KEY))[0]
    assert (await services.decisions.effective(USER, DUP_KEY)).id == rule.id

    # without retracts, priority alone decides: human > model > rule
    human = await services.decisions.decide(
        DecisionRequest(
            userId=USER,
            kind=LinkKind.unrelated,
            fromId="rec-tv",
            toId="rec-tv-copy",
            key=DUP_KEY,
            reason="two different TV channels",
        )
    )
    assert human.created and human.effective.id == human.link.id
    assert human.link.decidedBy == Decider.human

    # a re-run of the rule does not decide again, and the human Link still wins
    await services.ingest.ingest(request_day)
    assert len(await services.stores.links.by_key(USER, DUP_KEY)) == 2
    assert (await services.decisions.effective(USER, DUP_KEY)).id == human.link.id


async def test_retracts_and_idempotent_decisions(services: Services, request_day):
    await services.ingest.ingest(request_day)
    rule = (await services.stores.links.by_key(USER, DUP_KEY))[0]
    req = DecisionRequest(
        userId=USER,
        kind=LinkKind.duplicate_of,
        fromId="rec-tv",
        toId="rec-tv-copy",
        key=DUP_KEY,
        retracts=rule.id,
    )
    first = await services.decisions.decide(req)
    again = await services.decisions.decide(req)
    assert first.created and not again.created and again.link.id == first.link.id
    # a later human Link that retracts the first human Link takes over
    undo = await services.decisions.decide(
        DecisionRequest(
            userId=USER,
            kind=LinkKind.unrelated,
            fromId="rec-tv",
            toId="rec-tv-copy",
            key=DUP_KEY,
            retracts=first.link.id,
        )
    )
    assert undo.effective.id == undo.link.id


async def test_decision_errors(services: Services, request_day):
    await services.ingest.ingest(request_day)
    unknown = await services.decisions.decide(
        DecisionRequest(
            userId=USER, kind=LinkKind.unrelated, fromId="a", toId="b", key=DUP_KEY, retracts="nope"
        )
    )
    assert unknown == DecisionError.unknown_retracts
    mismatch = await services.decisions.decide(
        DecisionRequest(
            userId=USER,
            kind=LinkKind.unrelated,
            fromId="a",
            toId="b",
            key="other",
            retracts="link-split-model",
        )
    )
    assert mismatch == DecisionError.key_mismatch
    missing = await services.decisions.decide(
        DecisionRequest(
            userId=USER, kind=LinkKind.split_at, fromId="rec-b", key="split_at:rec-b:p1"
        )
    )
    assert missing == DecisionError.missing_target


async def test_bundle_links_follow_the_same_rule(services: Services, request_day):
    await services.ingest.ingest(request_day)
    winner = await services.decisions.effective(USER, "split_at:rec-b:p1")
    assert winner.id == "link-split-human"
