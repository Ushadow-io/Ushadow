"""Stage 3 - Match entities (Code, then Model for the unclear ones). Decides same/new WITHOUT the
conversation text, and gives every decision a confidence (see confidence.py).

Code: exact name/alias -> same (1.0); best similarity >= same_above -> same; < new_below (or no
candidate) -> new (both scored from the similarity). The unclear middle goes to the model, all of
the episode's unclear entities in ONE call, comparing "new entity + facts just extracted" with
"candidate + facts we hold". same/new get the model confidence; inconclusive becomes a new entity
whose decision has low confidence and lists the candidates (maintenance reviews it later)."""

from __future__ import annotations

from typing import Any

from memory_service.engine.staged import confidence as conf
from memory_service.engine.staged import prompts
from memory_service.engine.staged.types import (
    Ctx,
    EntityCandidates,
    EntityDecision,
    EntityMatch,
    Extraction,
)


def decide_by_rule(ctx: Ctx, ec: EntityCandidates) -> EntityDecision | None:
    key = ec.entity.key
    ids = [c.entity.id for c in ec.candidates]
    exact = [c for c in ec.candidates if c.exact]
    if exact:
        return EntityDecision(key=key, outcome="same", confidence=conf.EXACT, entity_id=exact[0].entity.id,
                              candidates=ids)
    best = max(ec.candidates, key=lambda c: c.score, default=None)
    if best is None or best.score < ctx.cfg.new_below:
        score = conf.similar_new(best.score if best else None, ctx.cfg.new_below)
        return EntityDecision(key=key, outcome="new", confidence=score, candidates=ids)
    if best.score >= ctx.cfg.same_above:
        return EntityDecision(key=key, outcome="same", entity_id=best.entity.id, candidates=ids,
                              confidence=conf.similar_same(best.score, ctx.cfg.same_above))
    return None


def _item(n: int, ec: EntityCandidates, ext: Extraction, ctx: Ctx) -> tuple[dict[str, Any], dict[str, str]]:
    """The model's view of one unclear entity, and its local candidate ids -> stored ids."""
    e = ec.entity
    cands = [c for c in ec.candidates if c.score >= ctx.cfg.new_below]
    local = {f"c{i}": c.entity.id for i, c in enumerate(cands, start=1)}
    return {"id": f"n{n}", "name": e.name, "type": e.type, "aliases": e.aliases,
            "facts": [f.text for f in ext.facts_about(e.key)][:ctx.cfg.candidate_facts],
            "candidates": [{"id": f"c{i}", "name": c.entity.name, "type": c.entity.type,
                            "aliases": c.entity.aliases, "facts": [f.text for f in c.facts]}
                           for i, c in enumerate(cands, start=1)]}, local


def _read(ctx: Ctx, answer: dict[str, Any], item_id: str, key: str, local: dict[str, str]) -> EntityDecision:
    got = next((d for d in answer.get("decisions") or []
                if isinstance(d, dict) and d.get("id") == item_id), {})
    ids = list(local.values())
    score = conf.model_answer(got, ctx.cfg.model_confidence)
    if got.get("answer") == "same" and got.get("candidate") in local:
        return EntityDecision(key=key, outcome="same", confidence=score, entity_id=local[got["candidate"]],
                              candidates=ids, by="model")
    if got.get("answer") == "new":
        return EntityDecision(key=key, outcome="new", confidence=score, candidates=ids, by="model")
    # inconclusive, or an answer we cannot use: a new entity now, a low score, reviewed later
    return EntityDecision(key=key, outcome="inconclusive", confidence=conf.MODEL_INCONCLUSIVE,
                          candidates=ids, by="model")


async def match_entities(ctx: Ctx, ext: Extraction, cands: dict[str, EntityCandidates]) -> EntityMatch:
    match = EntityMatch()
    unclear: list[EntityCandidates] = []
    for key, ec in cands.items():
        d = decide_by_rule(ctx, ec)
        if d is None:
            unclear.append(ec)
        else:
            match.decisions[key] = d
    if unclear:
        views = [_item(n, ec, ext, ctx) for n, ec in enumerate(unclear, start=1)]
        answer = await ctx.llm.ask(prompts.match_request([item for item, _ in views]))
        for (item, local), ec in zip(views, unclear, strict=True):
            match.decisions[ec.entity.key] = _read(ctx, answer, item["id"], ec.entity.key, local)
    for d in match.decisions.values():
        ctx.tally[f"entities_{d.outcome}_by_{d.by}"] += 1
    return match
