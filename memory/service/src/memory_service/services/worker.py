"""Optional background worker (MEMORY_WORKER_INTERVAL_SECONDS > 0). Each tick, per known user:
sync with the ledger (which also retries failed units whose backoff is over). Safe with several
service instances: every unit runs under its conversation lease, erasures under a per-user
lease, so two workers never ingest the same unit twice. Logs hold user counts and exception
type names only: no user ids, no text."""

from __future__ import annotations

import asyncio
import logging

from memory_service.models import UnitStatus
from memory_service.services.deps import Deps
from memory_service.services.sync import sync

log = logging.getLogger("memory.worker")


async def known_users(d: Deps, extra: tuple[str, ...] = ()) -> list[str]:
    """Users with a sync cursor or unfinished work in the queue, plus any configured ones."""
    live = (UnitStatus.pending, UnitStatus.running, UnitStatus.failed)
    return sorted({*await d.tables.cursors.users(), *await d.tables.queue.users_with(*live), *extra})


async def tick(d: Deps, extra_users: tuple[str, ...] = ()) -> int:
    """One pass over all known users. A failing user never stops the others. Gives users synced."""
    ok = 0
    for user in await known_users(d, extra_users):
        try:
            await sync(d, user)
            ok += 1
        except Exception as exc:  # noqa: BLE001 - ledger down, store blip: next tick tries again
            log.warning("worker sync failed error=%s", type(exc).__name__)
    return ok


async def run_forever(d: Deps, interval: float, extra_users: tuple[str, ...] = ()) -> None:
    log.info("worker started interval=%ss", interval)
    while True:
        try:
            await tick(d, extra_users)
        except Exception as exc:  # noqa: BLE001 - never let the loop die
            log.warning("worker tick failed error=%s", type(exc).__name__)
        await asyncio.sleep(interval)
