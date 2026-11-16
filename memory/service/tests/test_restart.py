"""State that must survive a restart of the memory service: action facts (MongoActionFactStore)
and, for tests and demos, the fake engine (PersistentFakeEngine). A "restart" here is a new
Deps on the same database: nothing is carried over in process memory."""

from __future__ import annotations

import pytest
from mongomock_motor import AsyncMongoMockClient

from memory_service.actions import ActionFactDraft, ActionSubject, MongoActionFactStore
from memory_service.config import Settings
from memory_service.engine import PersistentFakeEngine
from memory_service.ledger_client import FakeLedger
from memory_service.services.port import MemoryPort
from memory_service.stores import mongo_tables
from memory_service.textutil import group_id
from memory_service.wiring import build_deps
from tests.helpers import T0, USER_A, make_deps, seed, seg_range, texts


def _deps(db, ledger):
    return make_deps(tables=mongo_tables(db), ledger=ledger, actions=MongoActionFactStore(db),
                     engine=PersistentFakeEngine(db["fake_engine"]))


def _draft(mk: str, text: str = "I will call Bob") -> ActionFactDraft:
    return ActionFactDraft(subject=ActionSubject(kind="commitment", id="a1"), key="promise_made",
                           occurred_at=T0, value={"text": text, "memory_key": mk},
                           source="agent", scope="user:u")


async def test_mongo_action_store_is_idempotent_retractable_erasable_and_durable():
    db = AsyncMongoMockClient()["memory_test"]
    store = MongoActionFactStore(db)
    a = await store.record(_draft("k1"))
    assert (await store.record(_draft("k1"))).id == a.id  # same memory_key: the same fact
    b = await store.record(_draft("k2", "I will book the venue"))
    assert [f.id for f in await MongoActionFactStore(db).standing("user:u")] == [a.id, b.id]
    await store.retract(a, source="person")
    await store.erase(b)
    again = MongoActionFactStore(db)  # a restart
    assert await again.standing("user:u") == []
    rows = await again.rows("user:u")
    assert [r.seq for r in rows] == [1, 2, 3, 4]
    assert next(r for r in rows if r.id == b.id).value == {}  # words gone, row kept
    assert await again.standing("user:other") == []
    with pytest.raises(ValueError):
        await store.record(ActionFactDraft(**{**_draft("x").model_dump(), "value": {}}))


async def test_facts_and_action_facts_survive_a_restart_and_are_not_ingested_twice():
    db, ledger = AsyncMongoMockClient()["memory_test"], FakeLedger()
    port = MemoryPort(_deps(db, ledger))
    lines = [("S1", "Zorblax works at Quuxcorp."), ("S0", "I will call Bob."), ("S1", "Dana likes Jazz.")]
    seed(port.d, USER_A, "c1", T0, lines)
    assert [u.status for u in (await port.sync(USER_A)).units] == ["done"]

    restarted = MemoryPort(_deps(db, ledger))
    assert await texts(restarted, USER_A, "Zorblax Dana") == ["Dana likes Jazz", "Zorblax works at Quuxcorp"]
    assert [a.value["text"] for a in await restarted.action_facts(USER_A)] == ["I will call Bob"]
    assert (await restarted.sync(USER_A)).units == []  # cursor and units are durable too

    # new ids after the restart never collide with the old ones
    seed(restarted.d, USER_A, "c2", T0.replace(day=11), [("S1", "Erin likes Tea.")])
    await restarted.sync(USER_A)
    engine_ids = [f.engine_id for f in await restarted.d.engine.facts(group_id(USER_A))]
    assert len(engine_ids) == len(set(engine_ids)) == 3

    await restarted.erase(USER_A, "rec-c1", seg_range(T0, 0))
    after = MemoryPort(_deps(db, ledger))
    assert await texts(after, USER_A, "Zorblax Dana Erin") == ["Dana likes Jazz", "Erin likes Tea"]
    async for doc in db["fake_engine"].find({}):
        assert "zorblax" not in str(doc).lower()


@pytest.mark.parametrize(("field", "value"), [("actions", "postgres"), ("engine", "neo")])
async def test_unknown_backends_are_refused(field, value):
    s = Settings(**{"store": "memory", "actions": "memory", "engine": "fake", field: value})
    with pytest.raises(ValueError):
        await build_deps(s)
