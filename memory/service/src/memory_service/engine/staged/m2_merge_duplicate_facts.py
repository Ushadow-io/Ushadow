"""Maintenance 2 - Merge duplicate facts (Database, Code, Model; background). The store finds
pairs of open facts on the same subject entity that are very similar (`dup_above`). Code merges
a pair with the same resolved relation and object; the model judges the rest in batches of
`dup_batch` pairs per call. A merge keeps one fact (the human one, else the older one), gives it
the union of both facts' episodes and deletes the other. Every judged pair is recorded as a
fact_reconcile decision (key: a digest of the two ids), so it is never asked again; two human
facts are left alone."""

from __future__ import annotations

from dataclasses import dataclass

from memory_service.engine.staged import confidence as conf
from memory_service.engine.staged import prompts
from memory_service.engine.staged.s5_write import new_id
from memory_service.engine.staged.types import Ctx, Decision, StoredFact
from memory_service.textutil import digest, norm

PAIR = "pair"


@dataclass
class DupReport:
    checked: int = 0
    merged: int = 0
    calls: int = 0
    more: bool = False


@dataclass(frozen=True)
class _Pair:
    a: StoredFact
    b: StoredFact

    @property
    def key(self) -> str:
        return digest(PAIR, self.a.id, self.b.id)

    @property
    def same_signature(self) -> bool:
        return (norm(self.a.relation), self.a.target_id) == (norm(self.b.relation), self.b.target_id)


async def _pairs(ctx: Ctx, limit: int) -> list[_Pair]:
    done = await ctx.store.decisions(ctx.group, "fact_reconcile")
    seen = {d.key for d in done}  # pair keys are digests of the two fact ids
    out: list[_Pair] = []
    for a_id, b_id in await ctx.store.duplicate_pairs(ctx.group, ctx.cfg.dup_above, limit + len(seen)):
        a, b = await ctx.store.get_fact(ctx.group, a_id), await ctx.store.get_fact(ctx.group, b_id)
        if a and b and not (a.human and b.human):
            pair = _Pair(*sorted((a, b), key=lambda f: f.id))
            if pair.key not in seen:
                out.append(pair)
    return out[:limit]


async def _record(ctx: Ctx, p: _Pair, merged: tuple[StoredFact, StoredFact] | None, by: str) -> None:
    keep, drop = merged or (p.a, p.b)
    await ctx.store.add_decision(ctx.group, Decision(
        id=new_id(), kind="fact_reconcile", key=p.key, subject_id=drop.id,
        outcome="duplicate" if merged else "new", target_ids=[keep.id] if merged else [],
        candidates=[p.a.id, p.b.id], decided_by=by, model=ctx.llm.model if by == "model" else None,
        confidence=conf.FACT_RULE if by == "rule" else ctx.cfg.model_confidence,
        policy_version=conf.POLICY_VERSION, deep=True, at=ctx.clock()))


async def merge_facts(ctx: Ctx, p: _Pair, by: str) -> bool:
    a, b = await ctx.store.get_fact(ctx.group, p.a.id), await ctx.store.get_fact(ctx.group, p.b.id)
    if a is None or b is None:  # an earlier merge in this batch took one of them
        return False
    keep, drop = sorted((a, b), key=lambda f: (not f.human, f.created_at, f.id))
    keep.episodes += [e for e in drop.episodes if e not in keep.episodes]
    for ep, words in drop.variants.items():
        keep.say(ep, words)
    keep.confidence = max(keep.confidence, drop.confidence)
    keep.heard = "known" if "known" in (keep.heard, drop.heard) else "unknown"
    if drop.valid_at and (keep.valid_at is None or drop.valid_at < keep.valid_at):
        keep.valid_at = drop.valid_at
    await ctx.store.update_fact(ctx.group, keep)
    await ctx.store.delete_fact(ctx.group, drop.id)
    await _record(ctx, p, (keep, drop), by)
    return True


async def _ask(ctx: Ctx, batch: list[_Pair], rep: DupReport) -> None:
    answer = await ctx.llm.ask(prompts.dup_request(
        [{"id": f"p{i}", "a": p.a.text, "b": p.b.text} for i, p in enumerate(batch, start=1)]))
    rep.calls += 1
    said = {d.get("id"): d.get("same") for d in answer.get("decisions") or [] if isinstance(d, dict)}
    for i, p in enumerate(batch, start=1):
        rep.checked += 1
        if said.get(f"p{i}") is True:
            rep.merged += await merge_facts(ctx, p, "model")
        elif said.get(f"p{i}") is False:
            await _record(ctx, p, None, "model")


async def merge_duplicate_facts(ctx: Ctx, budget: int) -> DupReport:
    rep = DupReport()
    size = max(ctx.cfg.dup_batch, 1)
    pairs = await _pairs(ctx, size * max(budget, 0) + 1)
    todo: list[_Pair] = []
    for p in pairs:
        if p.same_signature:  # same subject, relation and object: no model needed
            rep.checked += 1
            rep.merged += await merge_facts(ctx, p, "rule")
        else:
            todo.append(p)
    for start in range(0, min(len(todo), size * budget), size):
        await _ask(ctx, todo[start:start + size], rep)
    rep.more = len(todo) > size * budget or len(pairs) > size * max(budget, 0)
    return rep
