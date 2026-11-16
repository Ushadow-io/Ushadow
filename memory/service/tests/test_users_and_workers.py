"""Several users and several workers at once, on in-memory tables and (opt-in) real Mongo.
No cross-user data, no double ingest. Real Mongo: MEMORY_TEST_MONGO_URI, databases named
`memory_test_<random>`, dropped at the end."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from dataclasses import replace
from datetime import timedelta

import pytest

from memory_service.engine import FakeEngine
from memory_service.ledger_client import LedgerErasure
from memory_service.models import UnitStatus
from memory_service.schema import TimeRange
from memory_service.services import worker
from memory_service.services.port import MemoryPort
from memory_service.stores import ensure_indexes, memory_tables, mongo_tables
from memory_service.textutil import group_id
from tests.helpers import T0, USER_A, USER_B, Clock, clocked_deps, seed, seg_range, texts

URI = os.environ.get("MEMORY_TEST_MONGO_URI")
DAY = timedelta(days=1)


@pytest.fixture(params=["memory", pytest.param("mongo", marks=[
    pytest.mark.mongo, pytest.mark.skipif(not URI, reason="MEMORY_TEST_MONGO_URI not set")])])
async def tables(request):
    if request.param == "memory":
        yield memory_tables()
        return
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(URI, serverSelectionTimeoutMS=5000)
    name = f"memory_test_{uuid.uuid4().hex[:12]}"
    assert name.startswith("memory_test_")
    try:
        await ensure_indexes(client[name])
        yield mongo_tables(client[name])
    finally:
        await client.drop_database(name)  # only ever our own random name
        client.close()


async def everything(d) -> str:
    """Every byte held, as lower-case text, for memory or Mongo side tables."""
    parts = [d.engine.dump()]
    for c in d.tables.collections.values():
        parts.append(json.dumps(await c.find(), default=str))
    parts.append(json.dumps([f.model_dump(mode="json") for f in d.actions.log]))
    return "\n".join(parts).lower()


class SlowEngine(FakeEngine):
    def __init__(self) -> None:
        super().__init__()
        self.calls = 0

    async def add_episode(self, group, episode):
        self.calls += 1
        await asyncio.sleep(0.03)
        return await super().add_episode(group, episode)


def workers(tables, n=2, **over):
    """n service instances: same tables, ledger and engine, different worker ids."""
    clock = Clock()
    first = clocked_deps(clock, tables=tables, engine=SlowEngine(), min_owner_words=0, **over)
    return clock, [first] + [replace(first, worker_id=f"worker-{i}") for i in range(2, n + 1)]


def seed_user(d, user, secret, other):
    """Same conversation ids, recording ids and times for every user: only the words differ."""
    seed(d, user, "c1", T0, [("S1", f"{secret} works at {secret}corp."), ("S0", "I will send the deck.")])
    seed(d, user, "c2", T0 + DAY, [("S1", f"{other} likes Jazz.")])


async def test_two_users_interleaved_sync_ingest_and_erase_share_nothing(tables):
    clock, [d] = workers(tables, 1)
    port = MemoryPort(d)
    seed_user(d, USER_A, "Zorblax", "Dana")
    seed_user(d, USER_B, "Quibble", "Gus")
    clock.advance()
    await asyncio.gather(port.sync(USER_A), port.sync(USER_B),
                         port.ingest(USER_A, d.ledger.convs[USER_A]["c2"][0].conversation))
    assert await texts(port, USER_A, "Zorblax") == ["Zorblax works at Zorblaxcorp"]
    assert await texts(port, USER_B, "Zorblax") == []
    assert await texts(port, USER_B, "Quibble") == ["Quibble works at Quibblecorp"]
    assert await texts(port, USER_A, "Quibble") == []
    assert {u.user_id for u in await port.queue(USER_A)} == {USER_A}
    assert len(d.engine.groups[group_id(USER_A)].episodes) == 2  # c2 ingested once, not twice
    assert group_id(USER_A) != group_id(USER_B)

    # erase user A's recording range while B syncs and ingests more: same recording id, same times
    clock.advance()
    d.ledger.add_erasure(USER_A, LedgerErasure(
        id="er1", recordingId="rec-c1", range=TimeRange(**seg_range(T0, 0).model_dump())))
    seed(d, USER_B, "c3", T0 + 2 * DAY, [("S1", "Erin works at Initech.")])
    clock.advance()
    ra, rb = await asyncio.gather(port.sync(USER_A), port.sync(USER_B))
    assert ra.erasures_applied == 1 and rb.erasures_applied == 0
    assert await texts(port, USER_A, "Zorblax") == []
    assert await texts(port, USER_B, "Quibble") == ["Quibble works at Quibblecorp"]  # untouched
    assert await texts(port, USER_B, "Erin") == ["Erin works at Initech"]
    assert await texts(port, USER_A, "Dana Jazz") == ["Dana likes Jazz"]
    assert [a.value["text"] for a in await d.actions.standing(f"user:{USER_B}")] == ["I will send the deck"]
    assert len(await d.actions.standing(f"user:{USER_A}")) == 1  # A's promise was in line 2: kept
    everything_a = (await d.tables.queue.for_user(USER_A), await d.tables.erased.for_user(USER_A))
    assert all(r[0] == "rec-c1" for r in everything_a[1]) and await d.tables.erased.for_user(USER_B) == []
    assert "zorblax" not in await everything(d) and "quibble" in await everything(d)

    # a rebuild of one user leaves the other alone
    await port.rebuild(USER_A)
    assert await texts(port, USER_B, "Quibble") == ["Quibble works at Quibblecorp"]
    assert await texts(port, USER_A, "Zorblax") == []


async def test_two_workers_on_one_user_ingest_each_unit_once(tables):
    clock, [d1, d2] = workers(tables, 2)
    p1, p2 = MemoryPort(d1), MemoryPort(d2)
    for i, name in enumerate(["Alpha", "Bravo", "Charlie", "Delta"]):
        seed(d1, USER_A, f"c{i}", T0 + i * DAY, [("S1", f"{name} works at {name}corp."),
                                                 ("S0", f"I will call {name}.")])
    clock.advance()
    r1, r2 = await asyncio.gather(p1.sync(USER_A), p2.sync(USER_A))
    clock.advance()
    await asyncio.gather(p1.sync(USER_A), p2.sync(USER_A))  # a second round settles any deferral
    await asyncio.gather(p1.run_pending(USER_A), p2.run_pending(USER_A))

    assert d1.engine.calls == 4  # each conversation went to the engine exactly once
    units = await p1.queue(USER_A)
    assert [(u.status, u.attempts) for u in units] == [(UnitStatus.done, 1)] * 4
    assert len(d1.engine.groups[group_id(USER_A)].episodes) == 4
    assert len(await d1.actions.standing(f"user:{USER_A}")) == 4
    assert len(await d1.engine.facts(group_id(USER_A))) == 4
    assert await d1.tables.collections["leases"].find() == []
    assert len(r1.units) + len(r2.units) >= 4


async def test_two_workers_ticking_one_user_and_a_late_erasure(tables):
    clock, [d1, d2] = workers(tables, 2)
    p = MemoryPort(d1)
    seed(d1, USER_A, "c1", T0, [("S1", "Zorblax works at Quuxcorp."), ("S1", "Dana likes Jazz.")])
    seed(d1, USER_B, "c1", T0, [("S1", "Zorblax works at Quuxcorp."), ("S1", "Gus likes Tea.")])
    clock.advance()
    await asyncio.gather(worker.tick(d1, (USER_A, USER_B)), worker.tick(d2, (USER_A, USER_B)))
    clock.advance()
    assert d1.engine.calls == 2  # one per user, not four

    d1.ledger.add_erasure(USER_A, LedgerErasure(
        id="er1", recordingId="rec-c1", range=TimeRange(**seg_range(T0, 0).model_dump())))
    clock.advance()
    await asyncio.gather(worker.tick(d1), worker.tick(d2))
    await asyncio.gather(worker.tick(d1), worker.tick(d2))
    assert await texts(p, USER_A, "Zorblax") == []  # erased for A
    assert await texts(p, USER_B, "Zorblax") == ["Zorblax works at Quuxcorp"]  # B keeps it
    assert await texts(p, USER_A, "Dana Jazz") == ["Dana likes Jazz"]
    units_a = await p.queue(USER_A)
    assert [u.status for u in units_a] == [UnitStatus.done]
    assert await d1.tables.applied.has(USER_A, "er1") and not await d1.tables.applied.has(USER_B, "er1")
    assert await d1.tables.collections["leases"].find() == []


async def test_two_workers_racing_the_same_erasure_apply_it_once(tables):
    clock, [d1, d2] = workers(tables, 2)
    p1, p2 = MemoryPort(d1), MemoryPort(d2)
    seed(d1, USER_A, "c1", T0, [("S1", "Zorblax works at Quuxcorp."), ("S1", "Dana likes Jazz.")])
    await p1.sync(USER_A)
    d1.ledger.add_erasure(USER_A, LedgerErasure(
        id="er1", recordingId="rec-c1", range=TimeRange(**seg_range(T0, 0).model_dump())))
    clock.advance()
    r1, r2 = await asyncio.gather(p1.sync(USER_A), p2.sync(USER_A))
    assert r1.erasures_applied + r2.erasures_applied == 1
    assert 1 in (r1.deferred, r2.deferred) or {r1.erasures_applied, r2.erasures_applied} == {0, 1}
    await p2.sync(USER_A)
    assert "zorblax" not in await everything(d1)
    assert await texts(p1, USER_A, "Dana Jazz") == ["Dana likes Jazz"]
    assert d1.engine.calls == 2  # first ingest + one re-ingest after the erase: not three
