"""Stage 4 - Reconcile facts (Code, then Model). Code first: a fact whose resolved subject,
relation and object equal an open stored fact is a duplicate (this episode just supports it).
A fact about a new subject, or with no known fact of its subject to compare, is new. The rest go
to the model with the top-k known facts of their subject: all in one call (`collection`) or one
call each (`per_fact`). Answers: new | duplicate | contradicts. A human fact is never closed.
Rule decisions score FACT_RULE; model ones the model confidence (see confidence.py)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from memory_service.engine.staged import confidence as conf
from memory_service.engine.staged import prompts
from memory_service.engine.staged.types import (
    Ctx,
    EntityMatch,
    Extraction,
    FactDecision,
    FactKey,
    FactQuery,
    NewFact,
    StoredFact,
)


@dataclass
class _Open:
    """A new fact the model must judge, with the known facts it is compared to."""

    index: int
    fact: NewFact
    known: list[StoredFact]


def _view(item: _Open, ext: Extraction) -> dict[str, Any]:
    f = item.fact
    return {"id": f"f{item.index}", "fact": f.text, "subject": ext.entities[f.subject].name,
            "relation": f.relation, "object": ext.entities[f.object].name,
            "valid_at": f.valid_at.isoformat() if f.valid_at else None,
            "known": [{"id": f"k{i}", "fact": k.text,
                       "valid_at": k.valid_at.isoformat() if k.valid_at else None}
                      for i, k in enumerate(item.known, start=1)]}


def _read(ctx: Ctx, answer: dict[str, Any], item: _Open) -> FactDecision:
    got = next((d for d in answer.get("decisions") or []
                if isinstance(d, dict) and d.get("id") == f"f{item.index}"), {})
    local = {f"k{i}": k for i, k in enumerate(item.known, start=1)}
    picked = [local[i] for i in got.get("known_ids") or [] if isinstance(i, str) and i in local]
    seen = [k.id for k in item.known]
    score = conf.model_answer(got, ctx.cfg.model_confidence)
    if got.get("answer") == "duplicate" and picked:
        return FactDecision(index=item.index, outcome="duplicate", confidence=score, ids=[picked[0].id],
                            candidates=seen, by="model")
    ends = [k.id for k in picked if not k.human]  # a machine decision never closes a human fact
    if got.get("answer") == "contradicts" and ends:
        return FactDecision(index=item.index, outcome="contradicts", confidence=score, ids=ends,
                            candidates=seen, by="model")
    if got.get("answer") != "new":  # no usable answer: keep it as new, with a low score
        score = conf.MODEL_INCONCLUSIVE
    return FactDecision(index=item.index, outcome="new", confidence=score, candidates=seen, by="model")


async def _by_rule(ctx: Ctx, i: int, f: NewFact, match: EntityMatch) -> FactDecision | _Open:
    subject, obj = match.resolved(f.subject), match.resolved(f.object)
    if subject is None:
        return FactDecision(index=i, outcome="new", confidence=conf.FACT_RULE)
    if obj is not None:
        same = await ctx.store.same_facts(ctx.group, FactKey(subject, f.relation, obj))
        if same:
            return FactDecision(index=i, outcome="duplicate", confidence=conf.FACT_RULE, ids=[same[0].id],
                                candidates=[same[0].id])
    known = [k for k, _ in await ctx.store.similar_facts(
        ctx.group, FactQuery(subject_id=subject, text=f.text, k=ctx.cfg.fact_top_k))]
    if not known:
        return FactDecision(index=i, outcome="new", confidence=conf.FACT_RULE)
    return _Open(index=i, fact=f, known=known)


async def _ask(ctx: Ctx, ext: Extraction, batch: list[_Open]) -> list[FactDecision]:
    answer = await ctx.llm.ask(prompts.reconcile_request([_view(o, ext) for o in batch]))
    return [_read(ctx, answer, o) for o in batch]


async def reconcile_facts(ctx: Ctx, ext: Extraction, match: EntityMatch) -> list[FactDecision]:
    done: list[FactDecision] = []
    open_: list[_Open] = []
    for i, f in enumerate(ext.facts):
        r = await _by_rule(ctx, i, f, match)
        (open_ if isinstance(r, _Open) else done).append(r)  # type: ignore[arg-type]
    if open_ and ctx.cfg.fact_reconcile == "per_fact":
        for o in open_:
            done += await _ask(ctx, ext, [o])
    elif open_:
        done += await _ask(ctx, ext, open_)
    done.sort(key=lambda d: d.index)
    for d in done:
        ctx.tally[f"facts_{d.outcome}_by_{d.by}"] += 1
    return done
