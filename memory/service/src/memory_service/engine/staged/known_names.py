"""Known names (Code, on a human's word). A person says: "this name, with these other names, is
ONE thing". The engine then holds exactly one entity for all of those names:

- no entity has any of the names: one is made;
- several entities have them: they are merged into one (facts re-pointed, names kept);
- the entity gets the given name; every other name is an alias.

A name a person gave has the source HUMAN, so an erase of an episode never removes it. Stage 3
matches an exact alias by rule (confidence 1.0), so a later episode that says any of the names
joins this entity with no model call. Safe to repeat: the service applies the list again after
every ingest, erase and rebuild.
"""

from __future__ import annotations

from dataclasses import replace

from memory_service.engine.staged import confidence as conf
from memory_service.engine.staged.m1_review_uncertain import merge_entities
from memory_service.engine.staged.s5_write import new_id
from memory_service.engine.staged.types import HUMAN, Ctx, Decision, StoredEntity
from memory_service.textutil import digest, norm


async def _decided_by_human(ctx: Ctx, chain: str | None, target: StoredEntity) -> str:
    """Put a human decision at the head of the entity's match chain: "it is `target`", 1.0.
    Gives the chain root. Nothing is written when the head already says so."""
    old = (await ctx.store.current_decisions(ctx.group, [chain])).get(chain) if chain else None
    if old is not None and old.decided_by == "human" and old.subject_id == target.id:
        return old.root
    if old is None:
        rec = Decision(id=new_id(), kind="entity_match", key=digest("known-name", target.id),
                       subject_id=target.id, outcome="same", confidence=1.0)
    else:
        rec = replace(old, id=new_id(), supersedes=old.id, outcome="same", subject_id=target.id,
                      confidence=1.0)
    rec = replace(rec, decided_by="human", model=None, deep=True, target_ids=[target.id],
                  policy_version=conf.POLICY_VERSION, at=ctx.clock())
    await ctx.store.add_decision(ctx.group, rec)
    return rec.root


def _rename(e: StoredEntity, name: str) -> None:
    """`name` becomes the entity's name; the old name stays as an alias with its sources."""
    if norm(e.name) == norm(name):
        e.name = name.strip()  # the person's spelling
        return
    old, old_sources = e.name, e.name_sources
    alias = next((a for a in e.aliases if norm(a) == norm(name)), None)
    sources = e.alias_sources.pop(alias, []) if alias else []
    if alias:
        e.aliases.remove(alias)
    e.name, e.name_sources = name.strip(), sources
    e.add_name(old, old_sources)


async def name_entity(ctx: Ctx, name: str, aliases: list[str], type_: str | None = None) -> StoredEntity:
    names = [n.strip() for n in (name, *aliases) if norm(n)]
    if not names or not norm(name):
        raise ValueError("a known entity needs a name")
    found = {e.id: e for e in await ctx.store.find_entities(ctx.group, names)}
    have = sorted(found.values(), key=lambda e: (norm(e.name) != norm(name), e.created_at, e.id))
    if have:
        keep = have[0]
    else:
        keep = StoredEntity(id=new_id(), name=names[0], type=type_ or "Entity", created_at=ctx.clock())
        await ctx.store.create_entity(ctx.group, keep)
    for drop in have[1:]:
        await merge_entities(ctx, keep, drop)
        await _decided_by_human(ctx, drop.match_root, keep)
        keep = await ctx.store.get_entity(ctx.group, keep.id) or keep
    _rename(keep, names[0])
    for n in names:
        keep.add_name(n, [HUMAN])
    keep.type = type_ or keep.type
    keep.match_root = await _decided_by_human(ctx, keep.match_root, keep)
    await ctx.store.update_entity(ctx.group, keep)
    return keep
