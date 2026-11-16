"""Queue lease (two workers, one unit) and the owner word gate."""

from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import timedelta

from memory_service.engine import FakeEngine
from memory_service.models import UnitStatus, WorkUnit
from memory_service.schema import Transcript
from memory_service.services import ingest as ingest_svc
from memory_service.services.port import MemoryPort
from memory_service.textutil import group_id
from tests.helpers import T0, USER_A, Clock, clocked_deps, conversation, seed


class SlowEngine(FakeEngine):
    """Yields to the other worker in the middle of add_episode, and counts the calls."""

    def __init__(self) -> None:
        super().__init__()
        self.calls = 0

    async def add_episode(self, group, episode):
        self.calls += 1
        await asyncio.sleep(0.02)
        return await super().add_episode(group, episode)


def pending_unit(deps, conv) -> WorkUnit:
    return WorkUnit(id=WorkUnit.make_id(USER_A, conv.id, conv.revision), user_id=USER_A,
                    conversation_id=conv.id, revision=conv.revision, parts=conv.parts,
                    reference_time=conv.range.start)


async def test_two_concurrent_runs_process_a_unit_once():
    clock = Clock()
    d1 = clocked_deps(clock, engine=SlowEngine())
    d2 = replace(d1, worker_id="worker-2")
    conv = seed(d1, USER_A, "c1", T0, [("S0", "Alice works at Acme."), ("S0", "I will call Bob.")])
    await d1.tables.queue.save(pending_unit(d1, conv))

    r1, r2 = await asyncio.gather(ingest_svc.run_pending(d1, USER_A), ingest_svc.run_pending(d2, USER_A))

    assert d1.engine.calls == 1
    [u] = await d1.tables.queue.for_user(USER_A)
    assert u.status == UnitStatus.done and u.attempts == 1
    assert len(d1.engine.groups[group_id(USER_A)].episodes) == 1
    assert len(await d1.actions.standing(f"user:{USER_A}")) == 1
    assert len(r1) + len(r2) == 2  # both saw it; only one ran it
    assert await d1.tables.collections["leases"].find() == []  # released


async def test_live_lease_blocks_and_expired_lease_is_taken_over():
    clock = Clock()
    deps = clocked_deps(clock)
    conv = seed(deps, USER_A, "c1", T0, [("S0", "Alice works at Acme.")])
    unit = pending_unit(deps, conv)
    await deps.tables.queue.save(unit)
    assert await deps.tables.leases.acquire(USER_A, "c1", "dead-worker", clock(), timedelta(minutes=5))

    [blocked] = await ingest_svc.run_pending(deps, USER_A)
    assert blocked.status == UnitStatus.pending and await deps.engine.facts(group_id(USER_A)) == []

    clock.advance(301)  # the other worker's lease ran out
    [done] = await ingest_svc.run_pending(deps, USER_A)
    assert done.status == UnitStatus.done and len(await deps.engine.facts(group_id(USER_A))) == 1


async def test_two_takeovers_of_an_expired_lease_only_one_wins():
    clock = Clock()
    deps = clocked_deps(clock)
    leases = deps.tables.leases
    assert await leases.acquire(USER_A, "c1", "old", clock(), timedelta(seconds=10))
    clock.advance(11)
    won = await asyncio.gather(*(leases.acquire(USER_A, "c1", f"w{i}", clock(), timedelta(seconds=10))
                                 for i in range(5)))
    assert sum(won) == 1


async def test_new_unit_met_while_leased_is_saved_for_later():
    clock = Clock()
    deps = clocked_deps(clock)
    conv = seed(deps, USER_A, "c1", T0, [("S0", "Alice works at Acme.")])
    await deps.tables.leases.acquire(USER_A, "c1", "other", clock(), timedelta(minutes=5))
    unit = await MemoryPort(deps).ingest(USER_A, conv)
    assert unit.status == UnitStatus.pending
    assert [u.status for u in await deps.tables.queue.for_user(USER_A)] == [UnitStatus.pending]


# ---- owner gate ----------------------------------------------------------------------------------

LONG = "Alice works at Acme and " + "we talked about many other things today " * 3  # > 20 words


def tr(rec: str, owner_role: str, text: str) -> Transcript:
    return Transcript.model_validate({
        "recordingId": rec, "revision": "f1", "createdAt": T0.isoformat(),
        "speakers": [{"label": "S0", "role": owner_role}, {"label": "S1", "role": "participant"}],
        "segments": [{"id": "s0", "text": text, "speakerLabel": "S0", "start": T0.isoformat(),
                      "end": (T0 + timedelta(seconds=9)).isoformat()},
                     {"id": "s1", "text": "Dana likes Jazz.", "speakerLabel": "S1",
                      "start": (T0 + timedelta(seconds=10)).isoformat(),
                      "end": (T0 + timedelta(seconds=19)).isoformat()}]})


async def gated(role: str, text: str, n: int = 20):
    deps = clocked_deps(Clock(), min_owner_words=n)
    deps.ledger.add_transcript(USER_A, tr("rec-c1", role, text))
    unit = await MemoryPort(deps).ingest(USER_A, conversation("c1", "rec-c1", T0, 2))
    return deps, unit


async def test_owner_with_too_few_words_is_skipped_and_counted():
    deps, unit = await gated("owner", "Alice works at Acme.")
    assert unit.status == UnitStatus.skipped
    assert await deps.engine.facts(group_id(USER_A)) == []
    assert await deps.tables.rejections.counts(USER_A) == {"conversation_below_owner_words": 1}
    assert deps.engine.groups[group_id(USER_A)].episodes == {}  # nothing reached the engine


async def test_owner_with_enough_words_is_ingested():
    deps, unit = await gated("owner", LONG)
    assert unit.status == UnitStatus.done and len(await deps.engine.facts(group_id(USER_A))) >= 1
    assert await deps.tables.rejections.counts(USER_A) == {}


async def test_no_owner_speaker_does_not_skip_and_is_counted():
    deps, unit = await gated("unknown", "Alice works at Acme.")
    assert unit.status == UnitStatus.done and len(await deps.engine.facts(group_id(USER_A))) == 2
    assert await deps.tables.rejections.counts(USER_A) == {"owner_unknown": 1}


async def test_gate_can_be_turned_off_and_threshold_is_configurable():
    _, unit = await gated("owner", "Alice works at Acme.", n=0)
    assert unit.status == UnitStatus.done
    _, unit = await gated("owner", "Alice works at Acme.", n=4)
    assert unit.status == UnitStatus.done
    _, unit = await gated("owner", "Alice works at Acme.", n=5)
    assert unit.status == UnitStatus.skipped
