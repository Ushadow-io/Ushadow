"""Ingest queue: exactly once per (conversation, revision); a new revision supersedes."""

from __future__ import annotations

from datetime import timedelta

from memory_service.models import UnitStatus
from memory_service.textutil import group_id
from tests.helpers import T0, USER_A, conversation, seed, texts

LINES = [
    ("S0", "Morning. Alice works at Acme."),
    ("S1", "Right, and Dana likes Jazz."),
    ("S0", "I will send the budget tomorrow."),
    ("S1", "Bob lives in Paris."),
]


async def _counts(deps, user):
    facts = await deps.engine.facts(group_id(user))
    proofs = deps.tables.collections["proofs"].docs
    return len(facts), len(proofs), len(await deps.actions.standing(f"user:{user}")), len(
        deps.actions.log)


async def test_ingest_twice_gives_one_set_of_facts(deps, port):
    conv = seed(deps, USER_A, "c1", T0, LINES)
    first = await port.ingest(USER_A, conv)
    assert first.status == UnitStatus.done
    assert (first.facts_written, first.actions_written) == (3, 1)
    before = await _counts(deps, USER_A)

    again = await port.ingest(USER_A, conv)
    assert again.status == UnitStatus.done and again.attempts == 1  # not run a second time
    assert await _counts(deps, USER_A) == before
    assert await texts(port, USER_A, "Alice Acme") == ["Alice works at Acme"]

    # A retry run of the queue also does nothing for a done unit.
    assert await port.run_pending(USER_A) == []
    assert await _counts(deps, USER_A) == before


async def test_new_revision_supersedes_old_facts(deps, port):
    conv1 = seed(deps, USER_A, "c1", T0, LINES)
    await port.ingest(USER_A, conv1)
    assert "Bob lives in Paris" in await texts(port, USER_A, "Bob Paris")

    # Revision 2: the conversation now ends after line 3 (Bob's line went to another talk).
    conv2 = conversation("c1", "rec-c1", T0, 3, revision=2)
    unit2 = await port.ingest(USER_A, conv2)
    assert unit2.status == UnitStatus.done

    assert await texts(port, USER_A, "Bob Paris") == []
    assert await texts(port, USER_A, "Alice Acme") == ["Alice works at Acme"]  # once, not twice
    engine_facts = await deps.engine.facts(group_id(USER_A))
    assert sorted(f.text for f in engine_facts) == ["Alice works at Acme", "Dana likes Jazz"]
    assert {d["revision"] for d in deps.tables.collections["proofs"].docs.values()} == {2}
    standing = await deps.actions.standing(f"user:{USER_A}")
    assert [(a.key, a.value["conversation"]["revision"]) for a in standing] == [("promise_made", 2)]
    units = {u.revision: u.status for u in await port.queue(USER_A)}
    assert units == {1: UnitStatus.superseded, 2: UnitStatus.done}

    # A late copy of revision 1 changes nothing.
    late = await port.ingest(USER_A, conv1)
    assert late.status == UnitStatus.superseded
    assert await texts(port, USER_A, "Bob Paris") == []


async def test_older_revision_arriving_after_newer_is_skipped(deps, port):
    seed(deps, USER_A, "c1", T0, LINES)
    await port.ingest(USER_A, conversation("c1", "rec-c1", T0, 4, revision=3))
    old = await port.ingest(USER_A, conversation("c1", "rec-c1", T0, 2, revision=2))
    assert old.status == UnitStatus.superseded
    assert len(await deps.engine.facts(group_id(USER_A))) == 3


async def test_open_conversation_is_refused(deps, port):
    conv = seed(deps, USER_A, "c1", T0, LINES).model_copy(update={"closedAt": None})
    try:
        await port.ingest(USER_A, conv)
    except ValueError as exc:
        assert "not closed" in str(exc)
    else:
        raise AssertionError("an open conversation was ingested")


async def test_media_speakers_make_no_facts(deps, port):
    conv = seed(deps, USER_A, "c1", T0, [("TV", "Gina works at Netflix."),
                                         ("S0", "Hank lives in Rome.")])
    await port.ingest(USER_A, conv)
    assert await texts(port, USER_A, "Gina Hank works lives") == ["Hank lives in Rome"]


async def test_failed_unit_is_retried_without_duplicates(deps, port):
    conv = seed(deps, USER_A, "c1", T0, LINES)

    class Boom(type(deps.extractor)):
        calls = 0

        async def extract(self, episode):
            Boom.calls += 1
            if Boom.calls == 1:
                raise RuntimeError("model down, with private words in the message")
            return await super().extract(episode)

    deps.extractor = Boom()
    unit = await port.ingest(USER_A, conv)
    assert unit.status == UnitStatus.failed and unit.last_error == "RuntimeError"
    [retried] = await port.run_pending(USER_A)
    assert retried.status == UnitStatus.done and retried.attempts == 2
    assert len(await deps.engine.facts(group_id(USER_A))) == 3
    assert len(deps.engine.groups[group_id(USER_A)].episodes) == 1  # half-written episode removed


async def test_sync_pulls_closed_conversations_from_ledger(deps, port):
    seed(deps, USER_A, "c1", T0, LINES)
    units = await port.sync(USER_A, T0 - timedelta(hours=1), T0 + timedelta(hours=1))
    assert [u.status for u in units] == [UnitStatus.done]
    again = await port.sync(USER_A, T0 - timedelta(hours=1), T0 + timedelta(hours=1))
    assert [(u.status, u.attempts) for u in again] == [(UnitStatus.done, 1)]
    assert len(await deps.engine.facts(group_id(USER_A))) == 3
