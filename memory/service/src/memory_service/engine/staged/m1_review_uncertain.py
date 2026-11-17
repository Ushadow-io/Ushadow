"""Maintenance 1 - Review uncertain entities (Model, background). Work is selected by a QUERY:
current entity-match decisions (new or inconclusive, with candidates) whose confidence is below
`review_below`, not yet deeply reviewed, not human, lowest confidence first. One call per
decision, this time WITH the stored episode lines that mention the entity, plus the candidates
and their facts. same -> merge it into the candidate (facts re-pointed, names kept as aliases);
distinct -> it stays new; inconclusive -> it stays as is. Each result is a NEW decision that
supersedes the old one (the old one is kept), with `deep` set so it is not reviewed again."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

from memory_service.engine.staged import confidence as conf
from memory_service.engine.staged import prompts
from memory_service.engine.staged.s5_write import new_id
from memory_service.engine.staged.types import Ctx, Decision, StoredEntity
from memory_service.textutil import norm

MAX_LINES = 40


@dataclass
class ReviewReport:
    reviewed: int = 0
    merged: int = 0
    distinct: int = 0
    calls: int = 0
    more: bool = False


async def merge_entities(ctx: Ctx, keep: StoredEntity, drop: StoredEntity) -> None:
    """Re-point every fact of `drop` to `keep`, keep its names as aliases, delete it. Fact names
    stay as written (see StoredFact), so the service's fact ids do not change."""
    for f in await ctx.store.entity_facts(ctx.group, drop.id):
        f.source_id = keep.id if f.source_id == drop.id else f.source_id
        f.target_id = keep.id if f.target_id == drop.id else f.target_id
        await ctx.store.update_fact(ctx.group, f)
    have = keep.names()
    keep.aliases += [n for n in (drop.name, *drop.aliases) if norm(n) and norm(n) not in have]
    await ctx.store.update_entity(ctx.group, keep)
    await ctx.store.delete_entity(ctx.group, drop.id)


def supersede(ctx: Ctx, old: Decision, **change: Any) -> Decision:
    """A new decision in the old one's chain. The old one is not changed."""
    return replace(old, id=new_id(), root=old.root, supersedes=old.id, deep=True, decided_by="model",
                   model=ctx.llm.model, policy_version=conf.POLICY_VERSION, at=ctx.clock(), **change)


async def _mentions(ctx: Ctx, e: StoredEntity, episode_ids: list[str]) -> list[str]:
    names = [n for n in e.names() if n]
    out: list[str] = []
    for ep_id in episode_ids:
        ep = await ctx.store.get_episode(ctx.group, ep_id)
        out += [ln for ln in (ep.lines if ep else []) if any(f" {n} " in f" {norm(ln)} " for n in names)]
    return out[:MAX_LINES]


async def _view(ctx: Ctx, e: StoredEntity, cands: list[StoredEntity]) -> tuple[dict[str, Any], list[str]]:
    facts = await ctx.store.entity_facts(ctx.group, e.id, limit=ctx.cfg.candidate_facts)
    item: dict[str, Any] = {"name": e.name, "type": e.type, "aliases": e.aliases,
                            "facts": [f.text for f in facts], "candidates": []}
    for i, c in enumerate(cands, start=1):
        cf = await ctx.store.entity_facts(ctx.group, c.id, limit=ctx.cfg.candidate_facts)
        item["candidates"].append({"id": f"c{i}", "name": c.name, "type": c.type, "aliases": c.aliases,
                                   "facts": [f.text for f in cf]})
    episodes = sorted({ep for f in facts for ep in f.episodes})
    return item, await _mentions(ctx, e, episodes)


async def _review_one(ctx: Ctx, old: Decision, rep: ReviewReport) -> None:
    e = await ctx.store.get_entity(ctx.group, old.subject_id)
    cands = [c for i in old.candidates if (c := await ctx.store.get_entity(ctx.group, i))]
    rep.reviewed += 1
    if e is None or not cands:  # nothing left to compare: it is new
        await ctx.store.add_decision(ctx.group, supersede(
            ctx, old, outcome="new", confidence=conf.NO_CANDIDATE, decided_by="rule", model=None))
        rep.distinct += 1
        return
    item, lines = await _view(ctx, e, cands)
    answer = await ctx.llm.ask(prompts.review_request(item, lines))
    rep.calls += 1
    local = {f"c{i}": c for i, c in enumerate(cands, start=1)}
    if answer.get("answer") == "same" and answer.get("candidate") in local:
        keep = local[answer["candidate"]]
        await merge_entities(ctx, keep, e)
        new = supersede(ctx, old, outcome="same", subject_id=keep.id, target_ids=[keep.id],
                        confidence=conf.REVIEW_DECIDED)
        rep.merged += 1
    elif answer.get("answer") == "distinct":
        new = supersede(ctx, old, outcome="new", confidence=conf.REVIEW_DECIDED)
        rep.distinct += 1
    else:
        new = supersede(ctx, old, outcome="inconclusive", confidence=conf.REVIEW_INCONCLUSIVE)
    await ctx.store.add_decision(ctx.group, new)


async def review_uncertain(ctx: Ctx, budget: int) -> ReviewReport:
    rep = ReviewReport()
    queue = await ctx.store.review_queue(ctx.group, ctx.cfg.review_below, budget + 1)
    for old in queue:
        if rep.calls >= budget:
            break
        await _review_one(ctx, old, rep)
    rep.more = len(queue) > rep.reviewed
    return rep
