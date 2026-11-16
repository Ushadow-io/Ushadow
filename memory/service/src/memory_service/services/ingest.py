"""Ingest queue. One work unit per (user, conversation id, revision):
- a done unit is never run again (ingest twice = one set of facts);
- a new revision first unwinds the old one (episode removed, the facts it closed reopened, its
  proofs and action facts retracted), so revisions never leave duplicates;
- a retry after a crash unwinds its own half-written episode first.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

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
    verify,
)
from memory_service.stores import Proof
from memory_service.textutil import digest, group_id, norm

log = logging.getLogger("memory.ingest")
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


class NotClosed(ValueError):
    """Only closed conversations are ingested."""


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


async def _run(d: Deps, unit: WorkUnit) -> None:
    user = unit.user_id
    recs = sorted({p.recordingId for p in unit.parts})
    ctx = EpisodeContext(unit=unit, transcripts={r: await d.ledger.transcripts(user, r) for r in recs},
                         erased=await d.tables.erased.for_user(user))
    ctx.lines = build_lines(ctx)
    unit.facts_written = unit.facts_rejected = unit.actions_written = unit.actions_rejected = 0
    if not ctx.lines:
        return
    episode = EpisodeInput(name=unit.episode_key, reference_time=unit.reference_time, lines=ctx.lines)
    res = await d.engine.add_episode(group_id(user), episode)
    unit.engine_episode_id = res.engine_episode_id
    await d.tables.queue.save(unit)  # the id map first: a crash after this can be unwound
    await d.tables.closures.add(user, unit.episode_key, res.closed)
    unit.facts_written, unit.facts_rejected = await _attach_proofs(d, ctx, res.facts)
    unit.actions_written, unit.actions_rejected = await _extract_actions(d, ctx, episode)


async def _supersede_older(d: Deps, unit: WorkUnit) -> None:
    for old in await d.tables.queue.for_conversation(unit.user_id, unit.conversation_id):
        if old.revision < unit.revision and old.status != UnitStatus.superseded:
            await unwind_unit(d, old, retract_actions=True)
            old.status = UnitStatus.superseded
            await d.tables.queue.save(old)


async def process(d: Deps, unit: WorkUnit) -> WorkUnit:
    unit.status, unit.attempts, unit.last_error = UnitStatus.running, unit.attempts + 1, None
    await d.tables.queue.save(unit)
    try:
        await _supersede_older(d, unit)
        if unit.engine_episode_id:  # a retry: remove the half-written episode first
            await unwind_unit(d, unit, retract_actions=False)
        await _run(d, unit)
        await human_wins.reapply(d, unit.user_id)
        unit.status = UnitStatus.done
    except Exception as exc:  # noqa: BLE001 - saved on the unit; the message can quote text
        unit.status, unit.last_error = UnitStatus.failed, type(exc).__name__
        log.warning("ingest failed conversation=%s revision=%s error=%s",
                    unit.conversation_id, unit.revision, type(exc).__name__)
    await d.tables.queue.save(unit)
    return unit


async def ingest(d: Deps, user_id: str, conv: Conversation,
                 reference_time: datetime | None = None) -> WorkUnit:
    if conv.closedAt is None:
        raise NotClosed(f"conversation {conv.id} is not closed")
    unit_id = WorkUnit.make_id(user_id, conv.id, conv.revision)
    existing = await d.tables.queue.get(unit_id)
    if existing and existing.status in (UnitStatus.done, UnitStatus.superseded, UnitStatus.running):
        return existing
    unit = existing or WorkUnit(id=unit_id, user_id=user_id, conversation_id=conv.id,
                                revision=conv.revision, parts=conv.parts,
                                reference_time=reference_time or conv.range.start)
    siblings = await d.tables.queue.for_conversation(user_id, conv.id)
    if any(u.revision > conv.revision and u.status != UnitStatus.superseded for u in siblings):
        unit.status = UnitStatus.superseded  # a newer revision is already in
        await d.tables.queue.save(unit)
        return unit
    return await process(d, unit)


async def run_pending(d: Deps, user_id: str) -> list[WorkUnit]:
    """Retry pending, failed and stuck-running units (below max_attempts), oldest revision first.
    Assumes ONE worker per user: there is no lease on `running` yet."""
    retry = (UnitStatus.pending, UnitStatus.failed, UnitStatus.running)
    units = [u for u in await d.tables.queue.for_user(user_id)
             if u.status in retry and u.attempts < d.max_attempts]
    return [await process(d, u) for u in sorted(units, key=lambda u: (u.conversation_id, u.revision))]


async def sync(d: Deps, user_id: str, start: datetime, end: datetime) -> list[WorkUnit]:
    """Pull closed conversations from the ledger and ingest each (conversation, revision) once."""
    convs = [c for c in await d.ledger.conversations(user_id, start, end) if c.closedAt]
    return [await ingest(d, user_id, c) for c in sorted(convs, key=lambda c: (c.id, c.revision))]
