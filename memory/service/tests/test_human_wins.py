"""Human wins: corrections and forget decisions survive later episodes and full rebuilds."""

from __future__ import annotations

from datetime import timedelta

from memory_service.models import CorrectRequest, SearchFilters, Statement
from memory_service.textutil import group_id
from tests.helpers import T0, USER_A, conversation, seed, texts

DAY = timedelta(days=1)


async def _fact_id(port, user, q):
    [f] = await port.search(user, q, SearchFilters(kinds=["knowledge"]))
    return f.id


async def test_correction_survives_later_conflicting_ingest_and_rebuild(deps, port):
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, [("S1", "Carol lives in Paris.")]))
    paris = await _fact_id(port, USER_A, "Carol Paris")

    decs = await port.correct(CorrectRequest(user_id=USER_A, fact_id=paris, statement=Statement(
        subject="Carol", relation="lives in", object="Lyon")))
    assert [d.op for d in decs] == ["suppress", "assert"]
    assert await texts(port, USER_A, "Carol") == ["Carol lives in Lyon"]

    # A later conversation says Paris again. In the engine this re-creates Paris and closes the
    # human Lyon fact (the Graphiti behaviour the spike found). Human wins puts it right.
    later = seed(deps, USER_A, "c2", T0 + DAY, [("S1", "Carol lives in Paris.")])
    await port.ingest(USER_A, later)
    assert await texts(port, USER_A, "Carol") == ["Carol lives in Lyon"]
    engine = await deps.engine.facts(group_id(USER_A))
    assert [(f.target, f.closed, f.human) for f in engine] == [("Lyon", False, True)]

    report = await port.rebuild(USER_A)
    assert (report.conversations, report.units_done, report.units_failed) == (2, 2, 0)
    assert await texts(port, USER_A, "Carol") == ["Carol lives in Lyon"]
    engine = await deps.engine.facts(group_id(USER_A))
    assert [(f.target, f.closed, f.human) for f in engine] == [("Lyon", False, True)]


async def test_retract_only_correction_hides_fact_for_good(deps, port):
    conv = seed(deps, USER_A, "c1", T0, [("S1", "Ivan works at Hooli.")])
    await port.ingest(USER_A, conv)
    await port.correct(CorrectRequest(user_id=USER_A, fact_id=await _fact_id(port, USER_A, "Ivan"),
                                      retract=True))
    assert await texts(port, USER_A, "Ivan Hooli") == []
    await port.rebuild(USER_A)
    assert await texts(port, USER_A, "Ivan Hooli") == []


async def test_forgotten_fact_is_not_recreated(deps, port):
    lines = [("S1", "Dana likes Jazz."), ("S0", "Alice works at Acme.")]
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, lines))
    jazz = await _fact_id(port, USER_A, "Dana Jazz")
    await port.forget(USER_A, [jazz])
    assert await texts(port, USER_A, "Dana Jazz") == []

    # Not by a new revision of the same conversation, nor a new conversation, nor a rebuild.
    await port.ingest(USER_A, conversation("c1", "rec-c1", T0, 2, revision=2))
    await port.ingest(USER_A, seed(deps, USER_A, "c2", T0 + DAY, [("S1", "Dana likes Jazz.")]))
    assert await texts(port, USER_A, "Dana Jazz") == []
    await port.rebuild(USER_A)
    assert await texts(port, USER_A, "Dana Jazz") == []
    assert all(f.target != "Jazz" for f in await deps.engine.facts(group_id(USER_A)))
    assert await texts(port, USER_A, "Alice Acme") == ["Alice works at Acme"]


async def test_forget_entity_blocks_all_its_facts(deps, port):
    lines = [("S1", "Mallory works at Evil."), ("S1", "Mallory likes Chess."),
             ("S0", "Alice works at Acme.")]
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, lines))
    [f] = await port.search(USER_A, "Mallory Chess", SearchFilters(kinds=["knowledge"], limit=1))
    await port.forget(USER_A, [], entity_id=f.subject["id"])
    assert await texts(port, USER_A, "Mallory Evil Chess") == []
    await port.rebuild(USER_A)
    assert await texts(port, USER_A, "Mallory Evil Chess") == []
    assert await port.entity(USER_A, f.subject["id"]) is None


async def test_forgotten_and_corrected_action_facts(deps, port):
    lines = [("S0", "I will send the deck."), ("S1", "Can you book the venue?")]
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, lines))
    by_text = {f.text: f for f in await port.search(USER_A, "deck venue", SearchFilters(kinds=["action"]))}
    await port.forget(USER_A, [by_text["I will send the deck"].id])
    await port.correct(CorrectRequest(user_id=USER_A, fact_id=by_text["Can you book the venue"].id,
                                      text="Book the big venue", due="2024-01-20"))

    async def standing():
        return sorted((a.value["text"], a.source) for a in await deps.actions.standing(f"user:{USER_A}"))

    want = [("Book the big venue", "person")]
    assert await standing() == want
    await port.ingest(USER_A, conversation("c1", "rec-c1", T0, 2, revision=2))
    assert await standing() == want
    await port.rebuild(USER_A)
    assert await standing() == want
