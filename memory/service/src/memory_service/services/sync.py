"""Pull from the ledger: what changed since a saved cursor (or a given range), retired
conversations undone, ledger erasures applied first. Idempotent: a repeat does no new work."""

from __future__ import annotations

import logging
from datetime import datetime

from memory_service.ledger_client import EPOCH, ConversationItem
from memory_service.models import SyncReport, UnitStatus
from memory_service.services.deps import Deps
from memory_service.services.erase import apply_ledger_erasures
from memory_service.services.ingest import (
    LeaseBusy,
    heartbeat,
    ingest,
    retract_actions_where,
    run_pending,
    take_lease,
    unwind_unit,
)

log = logging.getLogger("memory.sync")


async def retire(d: Deps, user_id: str, conversation_id: str) -> int:
    """The ledger retired this conversation: undo every revision the way a superseded revision is
    undone (episode out, closures reopened, proofs deleted, action facts retracted). Gives the
    units undone. Conversations named in `replacedBy` come through the normal ingest."""
    if not await take_lease(d, user_id, conversation_id):
        raise LeaseBusy(conversation_id)
    try:
        async with heartbeat(d, user_id, conversation_id):
            n = 0
            for u in await d.tables.queue.for_conversation(user_id, conversation_id):
                if u.status != UnitStatus.superseded:
                    await unwind_unit(d, u, retract_actions=True)
                    u.status = UnitStatus.superseded
                    await d.tables.queue.save(u)
                    n += 1
            await retract_actions_where(d, user_id, lambda cid: cid == conversation_id)
            return n
    finally:
        await d.tables.leases.release(user_id, conversation_id, d.worker_id)


async def _apply(d: Deps, user_id: str, items: list[ConversationItem], rep: SyncReport) -> None:
    retired = {i.conversation_id for i in items if i.retired}
    for item in sorted(items, key=lambda i: (i.conversation_id,
                                             i.conversation.revision if i.conversation else 0)):
        try:
            if item.retired:
                rep.retired += 1 if await retire(d, user_id, item.conversation_id) else 0
            elif item.conversation and item.conversation.closedAt and (
                    item.conversation_id not in retired):
                unit = await ingest(d, user_id, item.conversation)
                rep.units.append(unit)
                if unit.status == UnitStatus.pending:  # another worker holds the conversation
                    rep.deferred += 1
        except LeaseBusy:
            rep.deferred += 1


async def sync(d: Deps, user_id: str, start: datetime | None = None,
               end: datetime | None = None) -> SyncReport:
    """No range: ask the ledger what changed since this user's saved cursor, then save the
    cursor the LEDGER gave (its changedAt, strictly greater on the next call; never our own
    clock, so clock skew between the services cannot lose a change). With a range: that range,
    cursor kept. Work held by another worker (deferred) leaves the cursor where it was."""
    rep = SyncReport()
    try:
        rep.erasures_applied = await apply_ledger_erasures(d, user_id)
    except LeaseBusy:  # another worker is applying erasures: ingest nothing until they are in
        rep.deferred += 1
        return rep
    if start is not None and end is not None:
        items = await d.ledger.conversations(user_id, start, end, include_retired=True)
        await _apply(d, user_id, items, rep)
        rep.retried = len(await run_pending(d, user_id, only_due=True))
        return rep
    page = await d.ledger.changes(user_id, await d.tables.cursors.get(user_id) or EPOCH)
    await _apply(d, user_id, page.items, rep)
    # A unit that failed in an earlier sync is behind the cursor now: pick it up here (once its
    # backoff is over) instead of leaving it for a manual /queue/run.
    rep.retried = len(await run_pending(d, user_id, only_due=True))
    if not rep.deferred:
        rep.cursor = page.cursor
        await d.tables.cursors.set(user_id, rep.cursor)
    return rep
