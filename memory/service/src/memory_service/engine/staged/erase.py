"""Removing one episode (the service does this on erase, a new revision, a retired
conversation). After it, nothing said only in that episode is left in the engine:

1. facts: the episode leaves each fact's support and its words go; a fact it worded shows a
   surviving episode's words; a machine fact left with no support (or no words) is deleted
   (like Graphiti, facts it closed stay closed: the service reopens them). A fact that changes
   words gets a new service fact id (a hash of its names), so its older proofs no longer match;
   it stays hidden until it is proved again (a later ingest or a rebuild). Nothing leaks;
2. the episode node and its text, then entities no fact points at;
3. names: the episode leaves every name/alias source list; an alias with no source left is
   dropped; an entity whose own name has no source left is renamed (see `_settle_name`);
4. decisions: every decision chain of the episode, except a chain a surviving entity or fact
   still reads its confidence from (its `match_root`, `source_match`, `target_match`); such a
   chain holds only ids, numbers and a digest key.
"""

from __future__ import annotations

from memory_service.engine.staged.types import Ctx, StoredEntity
from memory_service.textutil import norm


async def _facts(ctx: Ctx, episode_id: str) -> None:
    """A fact still supported by other episodes shows their words from now on (`unsay`)."""
    for f in await ctx.store.all_facts(ctx.group):
        if episode_id in f.episodes or episode_id in f.variants:
            if episode_id in f.episodes:
                f.episodes.remove(episode_id)
            worded = f.unsay(episode_id)
            if f.human or (f.episodes and worded):
                await ctx.store.update_fact(ctx.group, f)
            else:
                await ctx.store.delete_fact(ctx.group, f.id)


async def _settle_name(ctx: Ctx, e: StoredEntity) -> None:
    """The name stays if an episode that said it survives, or a surviving fact was written with
    it (a fact's frozen source/target name). Else the alias with most sources becomes the name;
    with no alias left, a surviving fact's frozen name does."""
    if e.name_sources:
        return
    facts = await ctx.store.entity_facts(ctx.group, e.id)
    frozen = [(f.source_name if f.source_id == e.id else f.target_name, f.episodes) for f in facts]
    if any(norm(n) == norm(e.name) for n, _ in frozen):
        e.name_sources = sorted({ep for n, eps in frozen if norm(n) == norm(e.name) for ep in eps})
        return
    if e.aliases:
        best = max(e.aliases, key=lambda a: len(e.alias_sources.get(a, [])))
        e.aliases.remove(best)
        e.name, e.name_sources = best, e.alias_sources.pop(best, [])
    elif frozen:
        e.name, e.name_sources = frozen[0][0], sorted(set(frozen[0][1]))


async def _names(ctx: Ctx, episode_id: str) -> None:
    for e in await ctx.store.entities_from_episode(ctx.group, episode_id):
        e.forget_episode(episode_id)
        await _settle_name(ctx, e)
        await ctx.store.update_entity(ctx.group, e)


async def _in_use(ctx: Ctx) -> set[str]:
    """Decision roots a surviving entity or fact still reads its confidence from."""
    facts = await ctx.store.all_facts(ctx.group)
    ids = sorted({i for f in facts for i in (f.source_id, f.target_id)})
    ends = await ctx.store.get_entities(ctx.group, ids)
    roots = {r for f in facts for r in (f.source_match, f.target_match) if r}
    return roots | {e.match_root for e in ends.values() if e.match_root}


async def _decisions(ctx: Ctx, episode_id: str) -> None:
    """Chains of this episode, and of episodes removed earlier whose chains were kept only
    because something used them then."""
    decs = await ctx.store.decisions(ctx.group)
    gone = {episode_id} | {e for e in {d.episode_id for d in decs if d.episode_id}
                           if await ctx.store.get_episode(ctx.group, e) is None}
    roots = {d.root for d in decs if d.episode_id in gone}
    await ctx.store.delete_decisions(ctx.group, sorted(roots - await _in_use(ctx)))


async def remove_episode(ctx: Ctx, episode_id: str) -> None:
    await _facts(ctx, episode_id)
    await ctx.store.delete_episode(ctx.group, episode_id)
    await ctx.store.drop_orphan_entities(ctx.group)
    await _names(ctx, episode_id)
    await _decisions(ctx, episode_id)
