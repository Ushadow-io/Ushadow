"""Opt-in tests on a REAL MongoDB. Set MEMORY_TEST_MONGO_URI to run them; otherwise skipped.

Safety: every test uses its own database named `memory_test_<random>` and drops it at the end,
also on failure. Nothing else on the server is read or written."""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import timedelta

import pytest

from memory_service.ledger_client import LedgerErasure
from memory_service.models import CorrectRequest, SearchFilters
from memory_service.schema import TimeRange
from memory_service.services.port import MemoryPort
from memory_service.stores import ensure_indexes, mongo_tables
from memory_service.stores.collection import MongoCollection
from tests.helpers import T0, USER_A, Clock, clocked_deps, seed, seg_range, texts

URI = os.environ.get("MEMORY_TEST_MONGO_URI")
pytestmark = [pytest.mark.mongo, pytest.mark.skipif(not URI, reason="MEMORY_TEST_MONGO_URI not set")]


@pytest.fixture
async def db():
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(URI, serverSelectionTimeoutMS=5000)
    name = f"memory_test_{uuid.uuid4().hex[:12]}"
    assert name.startswith("memory_test_")
    try:
        yield client[name]
    finally:
        await client.drop_database(name)  # only ever our own random name
        client.close()


async def test_put_if_absent_and_replace_if(db):
    c = MongoCollection(db["x"])
    assert await c.put_if_absent({"_id": "a", "v": 1}) is True
    assert await c.put_if_absent({"_id": "a", "v": 2}) is False  # duplicate-key path
    assert (await c.get("a"))["v"] == 1
    assert await c.replace_if({"_id": "a", "v": 3}, v=1) is True
    assert await c.replace_if({"_id": "a", "v": 4}, v=1) is False  # no longer matches
    assert await c.replace_if({"_id": "missing", "v": 4}, v=1) is False
    assert (await c.get("a"))["v"] == 3


async def test_lease_table_with_racing_takeovers(db):
    clock = Clock()
    leases = mongo_tables(db).leases
    ttl = timedelta(seconds=10)
    assert await leases.acquire(USER_A, "c1", "w0", clock(), ttl)
    assert not await leases.acquire(USER_A, "c1", "w1", clock(), ttl)  # live
    clock.advance(11)
    won = await asyncio.gather(*(leases.acquire(USER_A, "c1", f"w{i}", clock(), ttl)
                                 for i in range(5)))
    assert sum(won) == 1
    owner = (await db["leases"].find_one({"_id": f"{USER_A}|c1"}))["owner"]
    await leases.release(USER_A, "c1", "someone-else")  # not the owner: no effect
    assert await db["leases"].count_documents({}) == 1
    await leases.release(USER_A, "c1", owner)
    assert await db["leases"].count_documents({}) == 0


async def test_cursor_and_applied_erasures(db):
    t = mongo_tables(db)
    clock = Clock()
    assert await t.cursors.get(USER_A) is None
    await t.cursors.set(USER_A, clock())
    assert await t.cursors.get(USER_A) == clock()
    assert await t.cursors.get("other") is None
    assert not await t.applied.has(USER_A, "er1")
    await t.applied.add(USER_A, "er1")
    await t.applied.add(USER_A, "er1")  # idempotent
    assert await t.applied.has(USER_A, "er1") and not await t.applied.has("other", "er1")
    assert await db["applied_erasures"].count_documents({}) == 1


async def test_indexes_are_created_and_ids_are_unique(db):
    await ensure_indexes(db)
    await ensure_indexes(db)  # repeatable
    keys = lambda info: [tuple(v["key"]) for v in info.values()]  # noqa: E731
    assert (("user_id", 1), ("conversation_id", 1)) in keys(await db["work_units"].index_information())
    assert (("user_id", 1), ("fact_id", 1)) in keys(await db["proofs"].index_information())
    assert (("user_id", 1),) in keys(await db["applied_erasures"].index_information())
    # atomic leasing rests on the always-unique `_id` index, which Mongo makes with the collection
    await mongo_tables(db).leases.acquire(USER_A, "c1", "w", Clock()(), timedelta(seconds=5))
    assert (("_id", 1),) in keys(await db["leases"].index_information())


async def test_full_cycle_on_real_mongo(db):
    await ensure_indexes(db)
    clock = Clock()
    deps = clocked_deps(clock, tables=mongo_tables(db), min_owner_words=0)
    port = MemoryPort(deps)
    lines = [("S1", "Zorblax works at Quuxcorp."), ("S0", "Dana likes Jazz."),
             ("S0", "I will send the deck.")]
    c1 = seed(deps, USER_A, "c1", T0, lines)
    clock.advance()
    rep = await port.sync(USER_A)
    assert [u.status for u in rep.units] == ["done"] and await db["leases"].count_documents({}) == 0
    clock.advance()
    assert (await port.sync(USER_A)).units == []  # cursor saved in Mongo

    [dana] = await port.search(USER_A, "Dana Jazz", SearchFilters(kinds=["knowledge"]))
    await port.correct(CorrectRequest(user_id=USER_A, fact_id=dana.id, statement={
        "subject": "Dana", "relation": "likes", "object": "Opera"}))
    assert "Dana likes Opera" in await texts(port, USER_A, "Dana")

    deps.ledger.add_erasure(USER_A, LedgerErasure(
        id="er1", recordingId=c1.parts[0].recordingId,
        range=TimeRange(**seg_range(T0, 0).model_dump())))
    clock.advance()
    assert (await port.sync(USER_A)).erasures_applied == 1
    assert (await port.sync(USER_A)).erasures_applied == 0
    assert await texts(port, USER_A, "Zorblax Quuxcorp") == []
    for name in await db.list_collection_names():
        async for doc in db[name].find({}):
            assert "zorblax" not in str(doc).lower(), name

    rb = await port.rebuild(USER_A)
    assert rb.units_failed == 0
    assert "Dana likes Opera" in await texts(port, USER_A, "Dana")  # human wins survives rebuild
    assert await texts(port, USER_A, "Zorblax") == []
    assert "zorblax" not in (await everything_engine(deps))


async def everything_engine(deps) -> str:
    return deps.engine.dump().lower()
