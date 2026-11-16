"""Sync by changes with a saved cursor, retired conversations, ledger erasures."""

from __future__ import annotations

from datetime import timedelta

from memory_service.ledger_client import LedgerErasure
from memory_service.models import UnitStatus
from memory_service.schema import TimeRange
from memory_service.services.port import MemoryPort
from memory_service.textutil import group_id
from tests.helpers import T0, USER_A, Clock, clocked_deps, conversation, everything, seed, seg_range, texts

DAY = timedelta(days=1)


def setup():
    clock = Clock()
    deps = clocked_deps(clock)
    return clock, deps, MemoryPort(deps)


async def test_sync_by_changes_is_cheap_and_repeatable():
    clock, deps, port = setup()
    seed(deps, USER_A, "c1", T0, [("S0", "Alice works at Acme."), ("S0", "I will call Bob.")])
    clock.advance()
    rep = await port.sync(USER_A)
    assert [u.status for u in rep.units] == [UnitStatus.done] and rep.cursor == clock.t
    assert await deps.tables.cursors.get(USER_A) == clock.t
    facts_before = len(await deps.engine.facts(group_id(USER_A)))

    clock.advance()
    again = await port.sync(USER_A)
    assert again.units == [] and again.retired == 0  # nothing changed: nothing to do
    assert deps.ledger.calls == ["changes", "changes"]

    # a new revision after the cursor comes through and supersedes the old one
    clock.advance()
    rec = "rec-c1"
    deps.ledger.add_conversation(USER_A, conversation("c1", rec, T0, 2, revision=2))
    clock.advance()
    rep = await port.sync(USER_A)
    assert [(u.revision, u.status) for u in rep.units] == [(2, UnitStatus.done)]
    states = {u.revision: u.status for u in await port.queue(USER_A)}
    assert states == {1: UnitStatus.superseded, 2: UnitStatus.done}
    assert len(await deps.engine.facts(group_id(USER_A))) == facts_before


async def test_cursor_is_per_user_and_range_form_keeps_it():
    clock, deps, port = setup()
    seed(deps, USER_A, "c1", T0, [("S0", "Alice works at Acme.")])
    clock.advance()
    rep = await port.sync(USER_A, T0 - timedelta(hours=1), T0 + timedelta(hours=1))
    assert [u.status for u in rep.units] == [UnitStatus.done] and rep.cursor is None
    assert await deps.tables.cursors.get(USER_A) is None
    assert await deps.tables.cursors.get("someone-else") is None
    assert deps.ledger.calls == ["conversations"]


async def test_retired_conversation_is_undone_like_a_superseded_revision():
    clock, deps, port = setup()
    await port.ingest(USER_A, seed(deps, USER_A, "c0", T0, [("S1", "Erin works at Initech.")]))
    c1 = seed(deps, USER_A, "c1", T0 + DAY,
              [("S1", "Erin works at Globex."), ("S0", "I will send the deck.")])
    await port.ingest(USER_A, c1)
    assert await texts(port, USER_A, "Erin") == ["Erin works at Globex"]
    assert [a.value["text"] for a in await deps.actions.standing(f"user:{USER_A}")] == [
        "I will send the deck"]

    clock.advance()
    deps.ledger.retire(USER_A, "c1", replaced_by=["c2"])
    seed(deps, USER_A, "c2", T0 + 2 * DAY, [("S1", "Dana likes Jazz.")])
    clock.advance()
    rep = await port.sync(USER_A)

    assert rep.retired == 1
    assert await texts(port, USER_A, "Erin") == ["Erin works at Initech"]  # closure reopened
    assert await deps.actions.standing(f"user:{USER_A}") == []  # action facts retracted
    assert "globex" not in await everything(deps)
    assert deps.tables.collections["proofs"].docs and all(
        d["conversation_id"] != "c1" for d in deps.tables.collections["proofs"].docs.values())
    assert await texts(port, USER_A, "Dana Jazz") == ["Dana likes Jazz"]  # replacement ingested
    assert {u.conversation_id: u.status for u in await port.queue(USER_A)}["c1"] == UnitStatus.superseded

    clock.advance()
    assert (await port.sync(USER_A)).retired == 0  # repeat: nothing more to undo


async def test_range_sync_also_sees_retired():
    clock, deps, port = setup()
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, [("S1", "Erin works at Initech.")]))
    deps.ledger.retire(USER_A, "c1")
    rep = await port.sync(USER_A, T0 - DAY, T0 + DAY)
    assert rep.retired == 1 and await texts(port, USER_A, "Erin") == []


async def test_full_rebuild_retracts_action_facts_of_conversations_gone_from_the_ledger():
    clock, deps, port = setup()
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, [("S0", "I will send the deck.")]))
    await port.ingest(USER_A, seed(deps, USER_A, "c2", T0 + DAY, [("S0", "I will book the venue.")]))
    del deps.ledger.convs[USER_A]["c2"]  # c2 no longer exists in the ledger
    await port.rebuild(USER_A)
    assert [a.value["text"] for a in await deps.actions.standing(f"user:{USER_A}")] == [
        "I will send the deck"]

    # a ranged rebuild only retracts what the ledger says is retired
    deps.ledger.retire(USER_A, "c1")
    await port.rebuild(USER_A, T0 - DAY, T0 + 3 * DAY)
    assert await deps.actions.standing(f"user:{USER_A}") == []


async def test_ledger_erasure_reaches_memory_without_calling_erase():
    clock, deps, port = setup()
    c1 = [("S0", "Dana likes Jazz."), ("S1", "Zorblax works at Quuxcorp.")]
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, c1))
    assert "zorblax" in await everything(deps)

    deps.ledger.add_erasure(USER_A, LedgerErasure(
        id="er1", recordingId="rec-c1", range=TimeRange(**seg_range(T0, 1).model_dump())))
    clock.advance()
    rep = await port.sync(USER_A)
    assert rep.erasures_applied == 1
    assert "zorblax" not in await everything(deps) and "quuxcorp" not in await everything(deps)
    assert await texts(port, USER_A, "Dana Jazz") == ["Dana likes Jazz"]

    clock.advance()
    assert (await port.sync(USER_A)).erasures_applied == 0  # applied once, by erasure id
    assert await deps.tables.applied.has(USER_A, "er1")
