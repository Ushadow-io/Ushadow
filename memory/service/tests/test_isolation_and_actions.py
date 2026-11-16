"""Two users never see each other's facts; action facts come out in the taskfacts shape."""

from __future__ import annotations

from memory_service.actions import ActionFact
from memory_service.models import SearchFilters
from memory_service.textutil import group_id
from tests.helpers import T0, USER_A, USER_B, seed, texts


async def test_two_users_never_see_each_other(deps, port):
    # Same conversation id and recording id for both users, on purpose.
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, [("S0", "Alice works at Acme."),
                                                            ("S0", "I will call the bank.")]))
    await port.ingest(USER_B, seed(deps, USER_B, "c1", T0, [("S0", "Bruno works at Beta."),
                                                            ("S0", "I will water the plants.")]))

    a = await port.search(USER_A, "works Alice Bruno Acme Beta call water I will", SearchFilters())
    b = await port.search(USER_B, "works Alice Bruno Acme Beta call water I will", SearchFilters())
    assert sorted(f.text for f in a) == ["Alice works at Acme", "I will call the bank"]
    assert sorted(f.text for f in b) == ["Bruno works at Beta", "I will water the plants"]
    assert {f.user_id for f in a} == {USER_A} and {f.user_id for f in b} == {USER_B}
    assert await texts(port, USER_A, "Bruno Beta plants") == []

    # Entities and fact ids of one user are not reachable by the other.
    entity_a = a[0].subject["id"] if a[0].kind == "knowledge" else a[1].subject["id"]
    assert await port.entity(USER_A, entity_a) is not None
    assert await port.entity(USER_B, entity_a) is None
    assert await port.forget(USER_B, [f.id for f in a if f.kind == "action"]) == []
    assert await texts(port, USER_A, "call bank") == ["I will call the bank"]

    # Engine groups differ, and erase by B does not touch A.
    assert group_id(USER_A) != group_id(USER_B)
    await port.erase(USER_B, "rec-c1", a[0].evidence[0].range)
    assert len(await port.search(USER_A, "Alice call", SearchFilters())) == 2


async def test_user_is_required(port):
    for call in (port.search("", "x", SearchFilters()), port.queue(" "), port.rebuild("")):
        try:
            await call
        except ValueError:
            continue
        raise AssertionError("a call ran without a user")


TASKFACTS_FIELDS = {"id", "subject", "key", "occurred_at", "recorded_at", "value", "source", "scope",
                    "seq", "retracts"}


async def test_action_facts_have_taskfacts_shape_and_no_status(deps, port):
    lines = [("S0", "I will send the deck."), ("S1", "Can you book the venue?"),
             ("S1", "We decided to launch in March."), ("S0", "The limit is 2000.")]
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, lines))
    facts = await port.action_facts(USER_A)

    got = {(f.key, f.subject.kind, f.value.get("direction")) for f in facts}
    assert got == {("promise_made", "commitment", "owed_by_me"),
                   ("task_requested", "task", "owed_by_me"),
                   ("decision_made", "decision", None), ("constraint_added", "constraint", None)}
    for f in facts:
        row = f.model_dump(mode="json")
        assert set(row) == TASKFACTS_FIELDS
        assert "status" not in row and "status" not in row["value"]
        assert set(row["subject"]) == {"kind", "id"}
        assert f.source == "agent" and f.scope == f"user:{USER_A}" and f.retracts is None
        assert f.seq is not None
        [ev] = f.value["evidence"]
        assert ev["recordingId"] == "rec-c1" and ev["quote"] and ev["range"]["start"]
        assert f.occurred_at.isoformat() == ev["range"]["start"].replace("Z", "+00:00")

    # "Standing" is worked out from retractions; the retracted row stays in the log.
    deck = next(f for f in facts if f.key == "promise_made")
    await deps.actions.retract(deck, source="person")
    assert deck.id not in {f.id for f in await port.action_facts(USER_A)}
    assert any(f.id == deck.id for f in deps.actions.log)
    try:
        ActionFact.model_validate({**deck.model_dump(), "status": "done"})
    except ValueError:
        pass
    else:
        raise AssertionError("a status field was accepted")
