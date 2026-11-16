"""Erase cascade and full rebuild."""

from __future__ import annotations

from datetime import datetime

from memory_service.actions import ActionFact, ControlledEraseUnsupported
from memory_service.models import EraseReport, RebuildReport, UnitStatus, WorkUnit
from memory_service.schema import TimeRange
from memory_service.services import human_wins
from memory_service.services.deps import Deps, action_scope
from memory_service.services.ingest import EPOCH, process, unwind_unit
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
        if (await process(d, unit)).status == UnitStatus.done:
            rep.episodes_reingested += 1
    await human_wins.reapply(d, user_id)
    return rep


async def rebuild(d: Deps, user_id: str, start: datetime | None = None,
                  end: datetime | None = None) -> RebuildReport:
    """Empty the engine for the user and ingest again from the ledger. Human wins, erased ranges
    and action facts are kept (action writes are idempotent)."""
    rep = RebuildReport()
    await d.engine.clear(group_id(user_id))
    for table in (d.tables.registry, d.tables.proofs, d.tables.closures):
        await table.delete_user(user_id)
    convs = [c for c in await d.ledger.conversations(user_id, start or EPOCH, end or d.clock())
             if c.closedAt]
    latest = {}
    for c in sorted(convs, key=lambda c: c.revision):
        latest[c.id] = c
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
        done = (await process(d, unit)).status == UnitStatus.done
        rep.units_done += done
        rep.units_failed += not done
    rep.decisions_applied = await human_wins.reapply(d, user_id)
    return rep
