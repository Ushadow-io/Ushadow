"""Optional background worker (MEMORY_WORKER_INTERVAL_SECONDS > 0). Each tick, per known user:
sync with the ledger (which also retries failed units whose backoff is over). Safe with several
service instances: every unit runs under its conversation lease, erasures under a per-user
lease, so two workers never ingest the same unit twice. Logs hold user counts and exception
type names only: no user ids, no text.

Maintenance (engines that have `maintain`, e.g. staged): only on a tick where sync and retry
found nothing to do and no unit is pending or running, one bounded batch per user, so
conversation work is never kept waiting behind it."""

from __future__ import annotations

import asyncio
import logging

from memory_service.engine.base import Maintainable
from memory_service.models import SyncReport, UnitStatus
from memory_service.services.deps import Deps
from memory_service.services.sync import sync
from memory_service.textutil import group_id

log = logging.getLogger("memory.worker")


async def known_users(d: Deps, extra: tuple[str, ...] = ()) -> list[str]:
    """Users with a sync cursor or unfinished work in the queue, plus any configured ones."""
    live = (UnitStatus.pending, UnitStatus.running, UnitStatus.failed)
    return sorted({*await d.tables.cursors.users(), *await d.tables.queue.users_with(*live), *extra})


def did_work(rep: SyncReport) -> bool:
    return bool(rep.units or rep.retried or rep.retired or rep.erasures_applied or rep.deferred)


async def maintain_idle(d: Deps, users: list[str]) -> int:
    """One maintenance batch per user. Gives the model calls made."""
    if d.maintain_budget <= 0 or not isinstance(d.engine, Maintainable):
        return 0
    calls = 0
    for user in users:
        try:
            calls += (await d.engine.maintain(group_id(user), d.maintain_budget)).llm_calls
        except Exception as exc:  # noqa: BLE001 - model or store blip: a later idle tick tries again
            log.warning("worker maintain failed error=%s", type(exc).__name__)
    return calls


async def tick(d: Deps, extra_users: tuple[str, ...] = ()) -> int:
    """One pass over all known users. A failing user never stops the others. Gives users synced.
    When nothing needed doing, runs maintenance (see the module doc)."""
    ok, busy = 0, False
    users = await known_users(d, extra_users)
    for user in users:
        try:
            busy = did_work(await sync(d, user)) or busy
            ok += 1
        except Exception as exc:  # noqa: BLE001 - ledger down, store blip: next tick tries again
            busy = True
            log.warning("worker sync failed error=%s", type(exc).__name__)
    if not busy and not await d.tables.queue.users_with(UnitStatus.pending, UnitStatus.running):
        await maintain_idle(d, users)
    return ok


async def run_forever(d: Deps, interval: float, extra_users: tuple[str, ...] = ()) -> None:
    log.info("worker started interval=%ss", interval)
    while True:
        try:
            await tick(d, extra_users)
        except Exception as exc:  # noqa: BLE001 - never let the loop die
            log.warning("worker tick failed error=%s", type(exc).__name__)
        await asyncio.sleep(interval)
