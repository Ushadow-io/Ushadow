"""Stage 2 - Candidates (Database). For each new entity: the stored entities it may be (exact
normalised name or alias, plus the top-k most similar names), each with a few facts we already
hold about it. No model."""

from __future__ import annotations

from memory_service.engine.staged.types import Candidate, Ctx, EntityCandidates, Extraction, NewEntity


async def _for_entity(ctx: Ctx, e: NewEntity) -> EntityCandidates:
    found: dict[str, Candidate] = {}
    for s in await ctx.store.find_entities(ctx.group, e.names()):
        found[s.id] = Candidate(entity=s, score=1.0, exact=True)
    for s, score in await ctx.store.similar_entities(ctx.group, e.name, ctx.cfg.entity_top_k):
        found.setdefault(s.id, Candidate(entity=s, score=score, exact=False))
    for c in found.values():
        c.facts = await ctx.store.entity_facts(ctx.group, c.entity.id, limit=ctx.cfg.candidate_facts)
    ranked = sorted(found.values(), key=lambda c: (not c.exact, -c.score, c.entity.created_at))
    return EntityCandidates(entity=e, candidates=ranked)


async def find_candidates(ctx: Ctx, ext: Extraction) -> dict[str, EntityCandidates]:
    return {key: await _for_entity(ctx, e) for key, e in ext.entities.items()}
