"""Erase cascade and full rebuild."""

from __future__ import annotations

from datetime import datetime

from memory_service.actions import ActionFact, ControlledEraseUnsupported
from memory_service.ledger_client import EPOCH
from memory_service.models import EraseReport, RebuildReport, UnitStatus, WorkUnit
from memory_service.schema import TimeRange
from memory_service.services import human_wins
from memory_service.services.deps import Deps, action_scope
from memory_service.services.ingest import process, retract_actions_where, unwind_unit
from memory_service.textutil import group_id, overlaps, parse_iso


def _hits(a: ActionFact, recording_id: str, rng: TimeRange) -> bool:
    for ev in a.value.get("evidence") or []:
        r = ev.get("range") or {}
        if ev.get("recordingId") == recording_id and r and overlaps(
                parse_iso(r["start"]), parse_iso(r["end"]), rng.start, rng.end):
            return True
    return False


async def _erase_actions(d: Deps, user_id: str, recording_id: str, rng: TimeRange,
                         rep: EraseReport) -> None:
    for a in await d.actions.rows(action_scope(user_id)):
        if a.retracts or not _hits(a, recording_id, rng):
            continue
        try:
            await d.actions.erase(a)
            rep.action_facts_erased += 1
        except ControlledEraseUnsupported:
            # The words stay in the store (taskfacts today). At least the fact stops standing.
            await d.actions.retract(a, source="person")
            rep.action_facts_erase_unsupported += 1


async def _erase_knowledge(d: Deps, user_id: str, hit: list[str], rep: EraseReport) -> None:
    for fid in sorted(set(hit)):
        if await d.tables.proofs.for_fact(user_id, fid):
            rep.facts_kept += 1  # it has proof outside the erased range
        else:
            await human_wins.drop_fact(d, user_id, fid)
            rep.facts_deleted += 1


def _touches(unit: WorkUnit, recording_id: str, rng: TimeRange) -> bool:
    return any(p.recordingId == recording_id and overlaps(p.range.start, p.range.end,
                                                          rng.start, rng.end) for p in unit.parts)


async def erase(d: Deps, user_id: str, recording_id: str, rng: TimeRange) -> EraseReport:
    """Remove the words of (recording, range) from everything the memory service holds."""
    rep = EraseReport()
    await d.tables.erased.add(user_id, recording_id, rng)  # stops any re-ingest of these words
    hit = await d.tables.proofs.remove_in_range(user_id, recording_id, rng)
    rep.proofs_removed = len(hit)
    await _erase_knowledge(d, user_id, hit, rep)
    await _erase_actions(d, user_id, recording_id, rng, rep)
    for unit in await d.tables.queue.for_user(user_id, UnitStatus.done):
        if not _touches(unit, recording_id, rng):
            continue
        # The engine episode holds the words. Remove it, reopen what it closed (Graphiti does
        # not), then ingest the conversation again without the erased segments.
        rep.closures_reopened += await unwind_unit(d, unit, retract_actions=False)
        rep.episodes_removed += 1
        unit.status, unit.attempts = UnitStatus.pending, 0
        await d.tables.queue.save(unit)
        if (await process(d, unit)).status == UnitStatus.done:
            rep.episodes_reingested += 1
    await human_wins.reapply(d, user_id)
    return rep


async def apply_ledger_erasures(d: Deps, user_id: str) -> int:
    """Run the erase cascade for every ledger erasure not yet applied here (by erasure id), so an
    erase done in the ledger reaches memory even if nobody called memory /erase. Gives the count."""
    n = 0
    for e in sorted(await d.ledger.erasures(user_id), key=lambda e: e.id):
        if await d.tables.applied.has(user_id, e.id):
            continue
        await erase(d, user_id, e.recordingId, e.range)
        await d.tables.applied.add(user_id, e.id)
        n += 1
    return n


async def rebuild(d: Deps, user_id: str, start: datetime | None = None,
                  end: datetime | None = None) -> RebuildReport:
    """Empty the engine for the user and ingest again from the ledger. Human wins, erased ranges
    and action facts are kept (action writes are idempotent). Action facts of conversations that
    no longer exist in the ledger (retired; for a full rebuild also any unknown one) are retracted."""
    rep = RebuildReport()
    await d.engine.clear(group_id(user_id))
    for table in (d.tables.registry, d.tables.proofs, d.tables.closures):
        await table.delete_user(user_id)
    items = await d.ledger.conversations(user_id, start or EPOCH, end or d.clock(),
                                         include_retired=True)
    latest = {}
    for i in sorted((i for i in items if not i.retired and i.conversation and i.conversation.closedAt),
                    key=lambda i: i.conversation.revision):  # type: ignore[union-attr]
        latest[i.conversation_id] = i.conversation
    exists = {i.conversation_id for i in items if not i.retired}
    retired = {i.conversation_id for i in items if i.retired}
    if start is None and end is None:
        await retract_actions_where(d, user_id, lambda cid: cid not in exists)
    else:
        await retract_actions_where(d, user_id, lambda cid: cid in retired)
    rep.conversations = len(latest)
    for u in await d.tables.queue.for_user(user_id):
        keep = u.conversation_id in latest and latest[u.conversation_id].revision == u.revision
        if not keep and u.status != UnitStatus.superseded:
            u.status = UnitStatus.superseded
        u.engine_episode_id = None
        await d.tables.queue.save(u)
    for c in latest.values():
        unit = await d.tables.queue.get(WorkUnit.make_id(user_id, c.id, c.revision)) or WorkUnit(
            id=WorkUnit.make_id(user_id, c.id, c.revision), user_id=user_id, conversation_id=c.id,
            revision=c.revision, parts=c.parts, reference_time=c.range.start)
        unit.status, unit.attempts = UnitStatus.pending, 0
        await d.tables.queue.save(unit)
        status = (await process(d, unit)).status
        rep.units_done += status == UnitStatus.done
        rep.units_skipped += status == UnitStatus.skipped
        rep.units_failed += status not in (UnitStatus.done, UnitStatus.skipped)
    rep.decisions_applied = await human_wins.reapply(d, user_id)
    return rep
