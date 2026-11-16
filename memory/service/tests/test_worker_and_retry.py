"""Background worker, a failed unit that is not lost, lease heartbeat, rebuild and erasures."""

from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import timedelta

import httpx

from memory_service.config import Settings
from memory_service.engine import FakeEngine
from memory_service.ledger_client import FakeLedger, LedgerErasure, LedgerUnavailable
from memory_service.main import create_app
from memory_service.models import UnitStatus, WorkUnit
from memory_service.schema import TimeRange
from memory_service.services import ingest as ingest_svc
from memory_service.services import worker
from memory_service.services.port import MemoryPort
from memory_service.textutil import group_id
from tests.helpers import (
    T0,
    USER_A,
    USER_B,
    Clock,
    clocked_deps,
    everything,
    make_deps,
    seed,
    seg_range,
    texts,
)


class FlakyLedger(FakeLedger):
    """Answers the change feed but cannot read transcripts while `down`."""

    down = False

    async def transcripts(self, user_id, recording_id):
        if self.down:
            raise LedgerUnavailable("/transcripts", 503)
        return await super().transcripts(user_id, recording_id)


class BoomEngine(FakeEngine):
    async def add_episode(self, group, episode):
        raise RuntimeError("secret words: Zorblax works at Quuxcorp")


class DelayEngine(FakeEngine):
    def __init__(self, delay: float) -> None:
        super().__init__()
        self.delay, self.calls = delay, 0

    async def add_episode(self, group, episode):
        self.calls += 1
        await asyncio.sleep(self.delay)
        return await super().add_episode(group, episode)


LINES = [("S1", "Zorblax works at Quuxcorp."), ("S0", "I will send the deck.")]


# ---- task 2: a failed unit is not lost ---------------------------------------------------------


async def test_ledger_down_mid_ingest_then_back_the_next_sync_finishes_the_unit():
    clock = Clock()
    deps = clocked_deps(clock, ledger=FlakyLedger(clock=clock))
    port = MemoryPort(deps)
    seed(deps, USER_A, "c1", T0, LINES)
    clock.advance()
    deps.ledger.down = True
    rep = await port.sync(USER_A)  # the change feed works, the transcript read fails
    [u] = rep.units
    assert u.status == UnitStatus.failed and u.last_error == "LedgerUnavailable" and u.attempts == 1
    assert rep.cursor is not None  # the cursor moved past it: that is the old gap

    clock.advance(5)
    deps.ledger.down = False
    rep = await port.sync(USER_A)  # still inside the backoff: not hammered
    assert rep.retried == 0 and (await port.queue(USER_A))[0].attempts == 1

    clock.advance(30)
    rep = await port.sync(USER_A)  # cursor is past it; the sync picks the unit up anyway
    assert rep.retried == 1
    [u] = await port.queue(USER_A)
    assert u.status == UnitStatus.done and u.attempts == 2 and u.last_error is None
    assert u.next_attempt_at is None
    assert await texts(port, USER_A, "Zorblax") == ["Zorblax works at Quuxcorp"]
    assert len(await deps.actions.standing(f"user:{USER_A}")) == 1  # once


async def test_manual_queue_run_ignores_backoff_but_not_the_attempt_limit():
    clock = Clock()
    deps = clocked_deps(clock, ledger=FlakyLedger(clock=clock), max_attempts=2)
    port = MemoryPort(deps)
    seed(deps, USER_A, "c1", T0, LINES)
    clock.advance()
    deps.ledger.down = True
    await port.sync(USER_A)
    [u] = await port.run_pending(USER_A)  # no waiting for backoff
    assert u.attempts == 2 and u.status == UnitStatus.failed
    assert await port.run_pending(USER_A) == []  # out of attempts


async def test_a_unit_that_keeps_failing_ends_failed_with_the_type_name_only():
    clock = Clock()
    deps = clocked_deps(clock, engine=BoomEngine(), max_attempts=3, retry_backoff=timedelta(seconds=10))
    port = MemoryPort(deps)
    seed(deps, USER_A, "c1", T0, LINES)
    clock.advance()
    await port.sync(USER_A)
    seen = []
    for _ in range(8):
        clock.advance(60)
        await worker.tick(deps)
        seen.append((await port.queue(USER_A))[0].attempts)
    [u] = await port.queue(USER_A)
    assert seen[-1] == 3 and u.attempts == 3  # bounded, then left alone
    assert u.status == UnitStatus.failed and u.last_error == "RuntimeError"
    assert u.next_attempt_at is None
    assert "zorblax" not in u.model_dump_json().lower()
    # a later sync of the same conversation does not run it again
    assert (await port.sync(USER_A, T0 - timedelta(days=1), T0 + timedelta(days=1))).retried == 0
    assert (await port.queue(USER_A))[0].attempts == 3


async def test_backoff_doubles_up_to_the_cap():
    deps = make_deps(retry_backoff=timedelta(seconds=30), retry_backoff_cap=timedelta(seconds=100))

    def u(n):
        return WorkUnit(id="x", user_id=USER_A, conversation_id="c", revision=1, parts=[],
                        reference_time=T0, attempts=n)

    assert [ingest_svc.backoff(deps, u(n)).total_seconds() for n in (1, 2, 3, 4)] == [30, 60, 100, 100]


# ---- task 1: the worker ------------------------------------------------------------------------


async def test_worker_tick_syncs_known_users_and_keeps_going_when_one_fails():
    clock = Clock()
    deps = clocked_deps(clock, ledger=FlakyLedger(clock=clock))
    port = MemoryPort(deps)
    seed(deps, USER_A, "c1", T0, LINES)
    seed(deps, USER_B, "c1", T0, [("S1", "Dana likes Jazz.")])
    clock.advance()
    assert await worker.known_users(deps) == []  # nobody has synced yet
    assert await worker.tick(deps, extra_users=(USER_A, USER_B)) == 2
    assert await worker.known_users(deps) == [USER_A, USER_B]  # now they have cursors

    clock.advance()
    seed(deps, USER_A, "c2", T0 + timedelta(days=1), [("S1", "Erin works at Initech.")])
    seed(deps, USER_B, "c2", T0 + timedelta(days=1), [("S1", "Gus likes Tea.")])
    clock.advance()
    real = deps.ledger.changes

    async def changes(user, since):
        if user == USER_A:
            raise LedgerUnavailable("/conversations/changes", 503)
        return await real(user, since)

    deps.ledger.changes = changes
    assert await worker.tick(deps) == 1  # A failed, B still synced
    assert await texts(port, USER_B, "Gus Tea") == ["Gus likes Tea"]
    assert await texts(port, USER_A, "Erin") == []
    deps.ledger.changes = real
    assert await worker.tick(deps) == 2
    assert await texts(port, USER_A, "Erin") == ["Erin works at Initech"]


async def test_worker_loop_runs_until_cancelled_and_picks_up_new_work():
    deps = make_deps()
    port = MemoryPort(deps)
    seed(deps, USER_A, "c1", T0, LINES)
    await port.sync(USER_A)  # makes the user known
    seed(deps, USER_A, "c2", T0 + timedelta(days=1), [("S1", "Erin works at Initech.")])
    task = asyncio.create_task(worker.run_forever(deps, 0.01))
    try:
        for _ in range(100):
            if await texts(port, USER_A, "Erin"):
                break
            await asyncio.sleep(0.02)
    finally:
        task.cancel()
    assert await texts(port, USER_A, "Erin") == ["Erin works at Initech"]


async def test_app_starts_the_worker_only_when_the_interval_is_set():
    deps = make_deps()
    seed(deps, USER_A, "c1", T0, LINES)
    await MemoryPort(deps).sync(USER_A)
    seed(deps, USER_A, "c2", T0 + timedelta(days=1), [("S1", "Erin works at Initech.")])
    off = create_app(Settings(memory_token="t", store="memory", engine="fake"), deps)
    async with off.router.lifespan_context(off):
        await asyncio.sleep(0.05)
    assert await texts(MemoryPort(deps), USER_A, "Erin") == []

    on = create_app(Settings(memory_token="t", store="memory", engine="fake",
                             worker_interval_seconds=0.01), deps)
    async with on.router.lifespan_context(on):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=on),
                                     base_url="http://memory") as http:
            for _ in range(100):
                r = await http.get(f"/search?userId={USER_A}&q=Erin",
                                   headers={"Authorization": "Bearer t"})
                if r.json()["facts"]:
                    break
                await asyncio.sleep(0.02)
    assert r.json()["facts"][0]["text"] == "Erin works at Initech"


# ---- task 3: lease heartbeat -------------------------------------------------------------------


def one_unit(deps, conv_id="c1"):
    conv = seed(deps, USER_A, conv_id, T0, [("S0", "Alice works at Acme."), ("S0", "I will call Bob.")])
    return WorkUnit(id=WorkUnit.make_id(USER_A, conv.id, conv.revision), user_id=USER_A,
                    conversation_id=conv.id, revision=conv.revision, parts=conv.parts,
                    reference_time=conv.range.start)


async def test_a_slow_unit_keeps_its_lease_and_nobody_takes_it_over():
    ttl = timedelta(seconds=0.3)
    d1 = make_deps(engine=DelayEngine(1.0), lease_ttl=ttl)  # real clock, run 3x longer than the TTL
    d2 = replace(d1, worker_id="worker-2")
    unit = one_unit(d1)
    await d1.tables.queue.save(unit)
    renewals = []
    real_renew = d1.tables.leases.renew

    async def counting(*a, **k):
        renewals.append(1)
        return await real_renew(*a, **k)

    d1.tables.leases.renew = counting
    run = asyncio.create_task(ingest_svc.process(d1, unit))
    await asyncio.sleep(0.7)  # well past the TTL: without a heartbeat the lease would be gone
    assert not await ingest_svc.take_lease(d2, USER_A, "c1")
    assert [u.status for u in await ingest_svc.run_pending(d2, USER_A)] == [UnitStatus.running]
    done = await run
    assert done.status == UnitStatus.done and d1.engine.calls == 1  # nobody ran it twice
    assert len(renewals) >= 2
    assert await d1.tables.collections["leases"].find() == []  # released

    n = len(renewals)
    await asyncio.sleep(0.5)
    assert len(renewals) == n  # no renewing after the unit is done
    assert await ingest_svc.take_lease(d2, USER_A, "c1")  # free at once


async def test_a_dead_workers_lease_is_taken_over_only_after_it_really_expires():
    ttl = timedelta(seconds=0.3)
    d = make_deps(lease_ttl=ttl)
    await d.tables.queue.save(one_unit(d))
    assert await d.tables.leases.acquire(USER_A, "c1", "dead-worker", d.clock(), ttl)  # never renewed
    await asyncio.sleep(0.1)
    [u] = await ingest_svc.run_pending(d, USER_A)
    assert u.status == UnitStatus.pending  # still live: left alone
    await asyncio.sleep(0.35)
    [u] = await ingest_svc.run_pending(d, USER_A)
    assert u.status == UnitStatus.done


async def test_renew_only_works_for_the_owner_and_pushes_the_expiry_out():
    clock = Clock()
    leases = make_deps().tables.leases
    ttl = timedelta(seconds=10)
    assert await leases.acquire(USER_A, "c1", "w1", clock(), ttl)
    clock.advance(8)
    assert not await leases.renew(USER_A, "c1", "w2", clock(), ttl)
    assert await leases.renew(USER_A, "c1", "w1", clock(), ttl)
    clock.advance(8)  # 16 s after the start: past the first expiry, inside the renewed one
    assert not await leases.acquire(USER_A, "c1", "w2", clock(), ttl)
    clock.advance(3)
    assert await leases.acquire(USER_A, "c1", "w2", clock(), ttl)
    assert not await leases.renew(USER_A, "c1", "w1", clock(), ttl)  # taken over: not ours any more
    assert not await leases.renew(USER_A, "never", "w1", clock(), ttl)


# ---- task 4: rebuild applies ledger erasures ---------------------------------------------------


async def test_rebuild_applies_ledger_erasures_that_sync_never_saw():
    clock = Clock()
    deps = clocked_deps(clock)
    port = MemoryPort(deps)
    seed(deps, USER_A, "c1", T0, [("S0", "Dana likes Jazz."), ("S1", "Zorblax works at Quuxcorp."),
                                  ("S0", "I will send the deck.")])
    await port.sync(USER_A)
    assert "zorblax" in await everything(deps)

    # erased in the ledger; the ledger still holds the words; memory has not synced since
    deps.ledger.add_erasure(USER_A, LedgerErasure(
        id="er1", recordingId="rec-c1", range=TimeRange(**seg_range(T0, 1).model_dump())))
    deps.ledger.add_erasure(USER_A, LedgerErasure(
        id="er2", recordingId="rec-c1", range=TimeRange(**seg_range(T0, 2).model_dump())))
    assert not await deps.tables.applied.has(USER_A, "er1")

    rep = await port.rebuild(USER_A)
    assert rep.erasures_applied == 2 and rep.units_failed == 0
    text = await everything(deps)
    assert "zorblax" not in text and "quuxcorp" not in text and "send the deck" not in text
    assert await texts(port, USER_A, "Dana Jazz") == ["Dana likes Jazz"]
    assert await deps.actions.standing(f"user:{USER_A}") == []
    assert await deps.tables.applied.has(USER_A, "er1") and await deps.tables.applied.has(USER_A, "er2")

    clock.advance()
    assert (await port.sync(USER_A)).erasures_applied == 0  # not run twice
    again = await port.rebuild(USER_A)
    assert again.erasures_applied == 0 and "zorblax" not in await everything(deps)


async def test_rebuild_with_a_range_also_applies_erasures_outside_the_range():
    deps = make_deps()
    port = MemoryPort(deps)
    seed(deps, USER_A, "c1", T0, [("S1", "Zorblax works at Quuxcorp.")])
    seed(deps, USER_A, "c2", T0 + timedelta(days=5), [("S1", "Erin works at Initech.")])
    await port.sync(USER_A, T0 - timedelta(days=1), T0 + timedelta(days=10))
    deps.ledger.add_erasure(USER_A, LedgerErasure(
        id="er1", recordingId="rec-c1", range=TimeRange(**seg_range(T0, 0).model_dump())))
    await port.rebuild(USER_A, T0 + timedelta(days=4), T0 + timedelta(days=10))
    assert "zorblax" not in await everything(deps)
    assert group_id(USER_A) in deps.engine.groups
