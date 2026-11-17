"""Stage 5 - Write (Database). Entities (new ones, or new aliases on a matched one), facts (new
ones; this episode as support on duplicates), closures (an old fact contradicted by a new one
gets invalid_at = the new fact's valid_at, else the episode's reference time; it is closed, never
deleted, and never if it is a human fact), one decision record per entity match and per fact,
and the episode itself. Gives the port's EpisodeResult: the facts this episode created or now
supports (with proof hints and effective confidence), and the ids of the facts it closed."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from memory_service.engine.base import EpisodeResult
from memory_service.engine.staged import confidence as conf
from memory_service.engine.staged.types import (
    Ctx,
    Decision,
    EntityDecision,
    EntityMatch,
    Extraction,
    FactDecision,
    NewEntity,
    NewFact,
    StoredEntity,
    StoredEpisode,
    StoredFact,
)
from memory_service.schema import EvidenceRef
from memory_service.textutil import digest


@dataclass(frozen=True)
class WriteInput:
    name: str  # the service's episode key
    reference_time: datetime
    ext: Extraction
    match: EntityMatch
    decisions: list[FactDecision]
    episode_id: str = field(default_factory=lambda: str(uuid.uuid4()))  # known before anything is written


@dataclass(frozen=True)
class _End:
    """A written entity as facts need it: id, name, and the match decision that linked it."""

    id: str
    name: str
    match: str


def new_id() -> str:
    return str(uuid.uuid4())


def _record(ctx: Ctx, d: EntityDecision | FactDecision, kind: str, key: str, inp: WriteInput) -> Decision:
    """The key is a digest: the parts hold the episode name and a spoken name."""
    return Decision(id=new_id(), kind=kind, key=digest(kind, inp.name, key), subject_id="",
                    outcome=d.outcome, confidence=d.confidence, decided_by=d.by,
                    model=ctx.llm.model if d.by == "model" else None, candidates=list(d.candidates),
                    policy_version=conf.POLICY_VERSION, at=ctx.clock(), episode_id=inp.episode_id)


async def _entity(ctx: Ctx, e: NewEntity, d: EntityDecision, rec: Decision) -> StoredEntity:
    """Every alias is recorded with this episode as its source."""
    ep = rec.episode_id or ""
    stored = await ctx.store.get_entity(ctx.group, d.entity_id) if d.entity_id else None
    if stored is None:  # new, inconclusive, or the matched one is gone meanwhile
        stored = StoredEntity(id=new_id(), name=e.name, type=e.type, match_root=rec.id,
                              created_at=ctx.clock(), name_sources=[ep])
        for alias in e.aliases:
            stored.add_name(alias, [ep])
        await ctx.store.create_entity(ctx.group, stored)
        return stored
    changed = [stored.add_name(n, [ep]) for n in e.names()]  # names used here: its name or aliases
    if any(changed):
        await ctx.store.update_entity(ctx.group, stored)
    return stored


async def write_entities(ctx: Ctx, inp: WriteInput) -> dict[str, _End]:
    ends: dict[str, _End] = {}
    for key, e in inp.ext.entities.items():
        d = inp.match.decisions[key]
        rec = _record(ctx, d, "entity_match", key, inp)
        stored = await _entity(ctx, e, d, rec)
        rec.subject_id = stored.id
        rec.target_ids = [stored.id] if d.outcome == "same" else []
        await ctx.store.add_decision(ctx.group, rec)
        ends[key] = _End(id=stored.id, name=stored.name, match=rec.id)
    return ends


def hints(ext: Extraction, f: NewFact) -> list[EvidenceRef]:
    out = []
    for ref in f.line_refs:
        line = ext.line(ref)
        proof = line.proof(f.quote) if line else None
        if proof is not None:
            out.append(proof)
    return out


def _valid_at(inp: WriteInput, f: NewFact) -> datetime:
    first = inp.ext.line(f.line_refs[0]) if f.line_refs else None
    return f.valid_at or (first.at if first and first.at else None) or inp.reference_time


async def _close(ctx: Ctx, fact_id: str, at: datetime) -> bool:
    old = await ctx.store.get_fact(ctx.group, fact_id)
    if old is None or old.human or old.closed or (old.valid_at and old.valid_at > at):
        return False
    old.invalid_at = at
    await ctx.store.update_fact(ctx.group, old)
    return True


async def _support(ctx: Ctx, d: FactDecision, ep: StoredEpisode, words: list[str]) -> StoredFact | None:
    old = await ctx.store.get_fact(ctx.group, d.ids[0])
    if old is not None:
        if ep.id not in old.episodes:
            old.episodes.append(ep.id)
        old.say(ep.id, words)
        old.confidence = max(old.confidence, d.confidence)  # said again: at least as sure
        await ctx.store.update_fact(ctx.group, old)
    return old


async def _one_fact(ctx: Ctx, inp: WriteInput, d: FactDecision, ep: StoredEpisode,
                    ends: dict[str, _End]) -> tuple[StoredFact, list[str]]:
    f = inp.ext.facts[d.index]
    # this episode's own words: the names as said here, not the stored entity's name
    words = [f.text, inp.ext.entities[f.subject].name, inp.ext.entities[f.object].name]
    if d.outcome == "duplicate" and (old := await _support(ctx, d, ep, words)) is not None:
        return old, []
    s, o = ends[f.subject], ends[f.object]
    new = StoredFact(id=new_id(), source_id=s.id, target_id=o.id, source_name=words[1], target_name=words[2],
                     relation=f.relation, text=f.text, valid_at=_valid_at(inp, f),
                     invalid_at=f.invalid_at, episodes=[ep.id], created_at=ctx.clock(),
                     confidence=d.confidence, source_match=s.match, target_match=o.match,
                     variants={ep.id: words}, text_episode=ep.id)
    await ctx.store.create_fact(ctx.group, new)
    at = new.valid_at or inp.reference_time
    closed = [i for i in d.ids if d.outcome == "contradicts" and await _close(ctx, i, at)]
    return new, closed


async def write_episode(ctx: Ctx, inp: WriteInput) -> EpisodeResult:
    ep = StoredEpisode(id=inp.episode_id, name=inp.name, reference_time=inp.reference_time,
                       lines=[ln.render() for ln in inp.ext.lines])
    # first, so its entities, facts and decisions always have an episode (an erase running at
    # the same time sweeps decisions whose episode is gone)
    await ctx.store.save_episode(ctx.group, ep)
    ends = await write_entities(ctx, inp)
    ep.entity_ids = sorted({e.id for e in ends.values()})
    touched: list[tuple[StoredFact, list[EvidenceRef]]] = []
    closed: list[str] = []
    for d in inp.decisions:
        fact, ended = await _one_fact(ctx, inp, d, ep, ends)
        closed += ended
        rec = _record(ctx, d, "fact_reconcile", str(d.index), inp)
        rec.subject_id, rec.target_ids = fact.id, list(d.ids)
        await ctx.store.add_decision(ctx.group, rec)
        if fact.id not in ep.fact_ids:
            ep.fact_ids.append(fact.id)
            touched.append((fact, hints(inp.ext, inp.ext.facts[d.index])))
    await ctx.store.save_episode(ctx.group, ep)
    scores = await conf.effective(ctx.store, ctx.group, [f for f, _ in touched])
    return EpisodeResult(engine_episode_id=ep.id, closed=closed,
                         facts=[f.to_engine(h, scores.get(f.id)) for f, h in touched])
