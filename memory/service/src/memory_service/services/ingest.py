"""Ingest queue. One work unit per (user, conversation id, revision):
- a done unit is never run again (ingest twice = one set of facts);
- a new revision first unwinds the old one (episode removed, the facts it closed reopened, its
  proofs and action facts retracted), so revisions never leave duplicates;
- a retry after a crash unwinds its own half-written episode first;
- a lease per (user, conversation) keeps two workers off the same unit. The running worker
  renews it (heartbeat) every third of the TTL, so it expires only when the worker is gone; an
  expired lease can be taken over;
- a failed unit waits `retry_backoff * 2**(attempts-1)` (capped) before an automatic retry and
  ends `failed` for good after `max_attempts`;
- a conversation whose owner said too few words is `skipped`, with a counted reason.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from memory_service.actions import SUBJECT_KIND, ActionFactDraft, ActionSubject
from memory_service.engine import EngineFact
from memory_service.models import EpisodeInput, UnitStatus, WorkUnit
from memory_service.schema import Conversation
from memory_service.services import human_wins
from memory_service.services.deps import Deps, action_key, action_scope, knowledge_fact_id
from memory_service.services.episode import (
    EpisodeContext,
    build_lines,
    locate_fact,
    locate_quote,
    owner_gate,
    pick_transcript,
    verify,
)
from memory_service.stores import Proof
from memory_service.textutil import digest, group_id, norm

log = logging.getLogger("memory.ingest")


class NotClosed(ValueError):
    """Only closed conversations are ingested."""


class NoFinalTranscript(RuntimeError):
    """A recording has transcripts but none is final yet; the unit waits and is retried."""


class LeaseBusy(RuntimeError):
    """Another worker holds the lease on this conversation."""


# ---- knowledge -----------------------------------------------------------------------------------


async def _attach_proofs(d: Deps, ctx: EpisodeContext, facts: list[EngineFact]) -> tuple[int, int]:
    """Keep each machine fact only with valid proof. Gives (kept, rejected)."""
    user, unit, group = ctx.user_id, ctx.unit, group_id(ctx.user_id)
    kept = rejected = 0
    for f in facts:
        if f.human:
            continue
        fid = knowledge_fact_id(user, f.signature())
        valid = [ev for ev in locate_fact(f, ctx.lines) if verify(ev, ctx)]
        for ev in valid:
            await d.tables.proofs.add(user, Proof(fid, ev, unit.conversation_id, unit.revision))
        if valid or await d.tables.proofs.for_fact(user, fid):
            await d.tables.registry.upsert(user, fid, f.engine_id, unit.episode_key)
            kept += 1
        else:
            await d.engine.delete_fact(group, f.engine_id)
            rejected += 1
    await d.tables.rejections.count(user, "knowledge_no_valid_proof", rejected)
    return kept, rejected


async def prune_registry(d: Deps, user_id: str) -> None:
    """Drop registry rows (and their proofs) whose engine facts are gone."""
    group = group_id(user_id)
    for row in await d.tables.registry.for_user(user_id):
        alive = [e for e in row["engine_ids"] if await d.engine.get_fact(group, e) is not None]
        if not alive:
            await d.tables.registry.delete(user_id, row["fact_id"])
            await d.tables.proofs.delete_for_fact(user_id, row["fact_id"])
        elif alive != row["engine_ids"]:
            await d.tables.registry.put({**row, "engine_ids": alive})


# ---- action facts --------------------------------------------------------------------------------


async def _extract_actions(d: Deps, ctx: EpisodeContext, episode: EpisodeInput) -> tuple[int, int]:
    user, unit = ctx.user_id, ctx.unit
    suppressed = (await human_wins.effective(d, user)).suppressed
    written = rejected = 0
    for c in await d.extractor.extract(episode):
        ev = locate_quote(c.quote, ctx.lines)
        if ev is None or not verify(ev, ctx):
            rejected += 1
            continue
        kh = action_key(user, c.key, c.text)
        if kh in suppressed:  # forgotten or corrected by a human: never recreated
            continue
        value = {"text": c.text, "evidence": [ev.model_dump(mode="json", exclude_none=True)],
                 "direction": c.direction, "due": c.due, "about": c.about,
                 "sensitivity": c.sensitivity,
                 "conversation": {"id": unit.conversation_id, "revision": unit.revision},
                 "key_hash": kh,
                 "memory_key": digest(user, unit.episode_key, c.key, norm(c.quote))}
        subject = ActionSubject(kind=SUBJECT_KIND[c.key],
                                id="a_" + digest(user, unit.conversation_id, c.key, norm(c.text))[:24])
        await d.actions.record(ActionFactDraft(
            subject=subject, key=c.key, occurred_at=ev.range.start, source="agent",
            scope=action_scope(user), value={k: v for k, v in value.items() if v is not None}))
        written += 1
    await d.tables.rejections.count(user, "action_no_valid_proof", rejected)
    return written, rejected


async def _retract_unit_actions(d: Deps, unit: WorkUnit) -> None:
    for a in await d.actions.standing(action_scope(unit.user_id)):
        conv = a.value.get("conversation") or {}
        if (conv.get("id"), conv.get("revision")) == (unit.conversation_id, unit.revision):
            await d.actions.retract(a, source="agent")


async def retract_actions_where(d: Deps, user_id: str, gone: Callable[[str], bool]) -> int:
    """Retract the standing action facts of conversations for which `gone(conversation id)`."""
    n = 0
    for a in await d.actions.standing(action_scope(user_id)):
        cid = (a.value.get("conversation") or {}).get("id")
        if cid is not None and gone(cid):  # a person's own fact names no conversation: kept
            await d.actions.retract(a, source="agent")
            n += 1
    return n


# ---- unwinding -----------------------------------------------------------------------------------


async def unwind_unit(d: Deps, unit: WorkUnit, retract_actions: bool) -> int:
    """Take one unit's episode out of the engine and the side tables. Gives facts reopened."""
    user, group = unit.user_id, group_id(unit.user_id)
    if unit.engine_episode_id:
        await d.engine.remove_episode(group, unit.engine_episode_id)
        unit.engine_episode_id = None
    reopened = 0
    for eid in await d.tables.closures.pop_episode(user, unit.episode_key):
        if await d.engine.get_fact(group, eid) is not None:  # Graphiti does not do this step
            await d.engine.reopen_fact(group, eid)
            reopened += 1
    for fid in await d.tables.proofs.delete_for_unit(user, unit.conversation_id, unit.revision):
        if not await d.tables.proofs.for_fact(user, fid):
            await human_wins.drop_fact(d, user, fid)
    await prune_registry(d, user)
    if retract_actions:
        await _retract_unit_actions(d, unit)
    return reopened


# ---- running a unit ------------------------------------------------------------------------------


async def _context(d: Deps, unit: WorkUnit) -> EpisodeContext:
    user = unit.user_id
    recs = sorted({p.recordingId for p in unit.parts})
    transcripts = {r: await d.ledger.transcripts(user, r) for r in recs}
    if any(ts and pick_transcript(ts) is None for ts in transcripts.values()):
        raise NoFinalTranscript(unit.episode_key)
    corrections = {r: await d.ledger.corrections(user, r) for r in recs if transcripts[r]}
    return EpisodeContext(unit=unit, transcripts=transcripts, corrections=corrections,
                          erased=await d.tables.erased.for_user(user))


async def _run(d: Deps, unit: WorkUnit) -> UnitStatus:
    user = unit.user_id
    ctx = await _context(d, unit)
    ctx.lines = build_lines(ctx)
    unit.facts_written = unit.facts_rejected = unit.actions_written = unit.actions_rejected = 0
    if not ctx.lines:
        return UnitStatus.done
    # "Owner conversations only" needs at least one owner word, whatever the word minimum is.
    need = max(d.min_owner_words, 1) if d.owner_conversations_only else d.min_owner_words
    gate = owner_gate(ctx, need) if need > 0 else "ok"
    if gate == "owner_unknown":  # no speaker is the owner
        await d.tables.rejections.count(user, "owner_unknown")
        if d.owner_conversations_only:
            return UnitStatus.skipped
    elif gate == "below":
        await d.tables.rejections.count(user, "conversation_below_owner_words")
        return UnitStatus.skipped
    episode = EpisodeInput(name=unit.episode_key, reference_time=unit.reference_time, lines=ctx.lines)
    res = await d.engine.add_episode(group_id(user), episode)
    unit.engine_episode_id = res.engine_episode_id
    await d.tables.queue.save(unit)  # the id map first: a crash after this can be unwound
    await d.tables.closures.add(user, unit.episode_key, res.closed)
    unit.facts_written, unit.facts_rejected = await _attach_proofs(d, ctx, res.facts)
    unit.actions_written, unit.actions_rejected = await _extract_actions(d, ctx, episode)
    return UnitStatus.done


async def _supersede_older(d: Deps, unit: WorkUnit) -> None:
    for old in await d.tables.queue.for_conversation(unit.user_id, unit.conversation_id):
        if old.revision < unit.revision and old.status != UnitStatus.superseded:
            await unwind_unit(d, old, retract_actions=True)
            old.status = UnitStatus.superseded
            await d.tables.queue.save(old)


async def take_lease(d: Deps, user_id: str, conversation_id: str) -> bool:
    return await d.tables.leases.acquire(user_id, conversation_id, d.worker_id, d.clock(), d.lease_ttl)


@asynccontextmanager
async def heartbeat(d: Deps, user_id: str, key: str) -> AsyncIterator[None]:
    """Keep a lease this worker holds alive while the body runs; stop renewing when it ends.
    Call after `take_lease`, release after leaving. A lease lost anyway is logged (by key only)."""

    async def beat() -> None:
        while True:
            await asyncio.sleep(d.lease_ttl.total_seconds() / 3)
            try:
                if not await d.tables.leases.renew(user_id, key, d.worker_id, d.clock(), d.lease_ttl):
                    log.warning("lease lost key=%s", key)
                    return
            except Exception as exc:  # noqa: BLE001 - a store blip: try again next beat
                log.warning("lease renew failed key=%s error=%s", key, type(exc).__name__)

    task = asyncio.create_task(beat())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


def backoff(d: Deps, unit: WorkUnit) -> timedelta:
    return min(d.retry_backoff * 2 ** max(unit.attempts - 1, 0), d.retry_backoff_cap)


def is_due(d: Deps, unit: WorkUnit) -> bool:
    """Whether the worker may run this unit now: attempts left and no backoff still waiting."""
    return unit.attempts < d.max_attempts and (
        unit.next_attempt_at is None or unit.next_attempt_at <= d.clock())


async def _execute(d: Deps, unit: WorkUnit) -> WorkUnit:
    unit.status, unit.attempts, unit.last_error = UnitStatus.running, unit.attempts + 1, None
    await d.tables.queue.save(unit)
    try:
        await _supersede_older(d, unit)
        if unit.engine_episode_id:  # a retry: remove the half-written episode first
            await unwind_unit(d, unit, retract_actions=False)
        unit.status = await _run(d, unit)
        unit.next_attempt_at = None
        await human_wins.reapply(d, unit.user_id)
    except Exception as exc:  # noqa: BLE001 - saved on the unit; the message can quote text
        unit.status, unit.last_error = UnitStatus.failed, type(exc).__name__
        unit.next_attempt_at = None if unit.attempts >= d.max_attempts else d.clock() + backoff(d, unit)
        log.warning("ingest failed conversation=%s revision=%s error=%s",
                    unit.conversation_id, unit.revision, type(exc).__name__)
    await d.tables.queue.save(unit)
    return unit


async def process(d: Deps, unit: WorkUnit, only_due: bool = False) -> WorkUnit:
    """Run one unit under the conversation's lease. Without the lease the unit is left (and saved
    as pending when new) for a later run_pending. A unit another worker finished meanwhile is
    returned as stored, not run again: callers that want a re-run save it as pending first.
    `only_due` (the worker): also leave a unit another worker just failed and put into backoff."""
    if not await take_lease(d, unit.user_id, unit.conversation_id):
        stored = await d.tables.queue.get(unit.id)
        if stored is None:
            unit.status = UnitStatus.pending
            if not await d.tables.queue.save_new(unit):  # the lease holder saved it first
                return await d.tables.queue.get(unit.id) or unit
        return stored or unit
    try:
        stored = await d.tables.queue.get(unit.id)
        if stored and stored.status in (UnitStatus.done, UnitStatus.superseded, UnitStatus.skipped):
            return stored
        if only_due and stored and not is_due(d, stored):
            return stored
        async with heartbeat(d, unit.user_id, unit.conversation_id):
            return await _execute(d, stored or unit)
    finally:
        await d.tables.leases.release(unit.user_id, unit.conversation_id, d.worker_id)


async def ingest(d: Deps, user_id: str, conv: Conversation,
                 reference_time: datetime | None = None) -> WorkUnit:
    if conv.closedAt is None:
        raise NotClosed(f"conversation {conv.id} is not closed")
    unit_id = WorkUnit.make_id(user_id, conv.id, conv.revision)
    existing = await d.tables.queue.get(unit_id)
    if existing and existing.status in (UnitStatus.done, UnitStatus.superseded,
                                        UnitStatus.running, UnitStatus.skipped):
        return existing
    if existing and existing.status == UnitStatus.failed and existing.attempts >= d.max_attempts:
        return existing  # out of attempts: stays failed (erase or rebuild reset it)
    unit = existing or WorkUnit(id=unit_id, user_id=user_id, conversation_id=conv.id,
                                revision=conv.revision, parts=conv.parts,
                                reference_time=reference_time or conv.range.start)
    siblings = await d.tables.queue.for_conversation(user_id, conv.id)
    if any(u.revision > conv.revision and u.status != UnitStatus.superseded for u in siblings):
        unit.status = UnitStatus.superseded  # a newer revision is already in
        await d.tables.queue.save(unit)
        return unit
    return await process(d, unit)


async def run_pending(d: Deps, user_id: str, only_due: bool = False) -> list[WorkUnit]:
    """Retry pending, failed and stuck-running units (below max_attempts), oldest revision first.
    Safe with several workers: a unit whose conversation another worker holds is left alone.
    `only_due` (sync and the worker) also waits out each failed unit's backoff; the manual
    /queue/run does not."""
    retry = (UnitStatus.pending, UnitStatus.failed, UnitStatus.running)
    units = [u for u in await d.tables.queue.for_user(user_id)
             if u.status in retry and u.attempts < d.max_attempts and (not only_due or is_due(d, u))]
    return [await process(d, u, only_due) for u in sorted(units,
                                                          key=lambda u: (u.conversation_id, u.revision))]
