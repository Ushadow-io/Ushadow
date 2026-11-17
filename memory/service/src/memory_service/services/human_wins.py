"""Human wins. Corrections and forget decisions live in the decisions table, outside the engine,
and are applied again after every ingest, erase and rebuild. So neither a later episode (which
in Graphiti can close a human fact) nor a rebuild (which empties the engine) can undo them."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from memory_service.actions import ActionFactDraft
from memory_service.engine import EngineFact, entity_key, knowledge_key
from memory_service.engine.base import Nameable
from memory_service.models import Decision, FactKind, Statement
from memory_service.services.deps import Deps, action_scope, knowledge_fact_id
from memory_service.textutil import group_id


@dataclass
class Effective:
    """The decisions that count now: the latest decision per key wins."""

    suppressed: set[str] = field(default_factory=set)
    asserted: dict[str, Decision] = field(default_factory=dict)
    blocked_entities: set[str] = field(default_factory=set)
    known: dict[str, Decision] = field(default_factory=dict)  # the word list: name key -> entry

    def hides(self, user_id: str, f: EngineFact) -> bool:
        if knowledge_key(user_id, f.signature()) in self.suppressed:
            return True
        ends = {entity_key(user_id, f.source), entity_key(user_id, f.target)}
        return bool(ends & self.blocked_entities)


async def effective(d: Deps, user_id: str) -> Effective:
    eff = Effective()
    for dec in await d.tables.decisions.for_user(user_id):
        if dec.op == "suppress":
            eff.suppressed.add(dec.key_hash)
            eff.asserted.pop(dec.key_hash, None)
        elif dec.op == "assert":
            eff.asserted[dec.key_hash] = dec
            eff.suppressed.discard(dec.key_hash)
        elif dec.op == "suppress_entity":
            eff.blocked_entities.add(dec.key_hash)
        elif dec.op == "name_entity":
            eff.known[dec.key_hash] = dec
        elif dec.op == "unname_entity":
            eff.known.pop(dec.key_hash, None)
    return eff


@dataclass(frozen=True)
class Ask:
    """What a human decided: op is suppress | assert | suppress_entity."""

    kind: FactKind
    op: str
    key_hash: str
    payload: dict[str, Any] | None = None


async def record(d: Deps, user_id: str, ask: Ask) -> Decision:
    dec = Decision(id=f"dec_{time.time_ns():020d}_{uuid.uuid4().hex[:12]}",  # sorts in write order
                   user_id=user_id, kind=ask.kind, op=ask.op,
                   key_hash=ask.key_hash, payload=ask.payload, created_at=d.clock())
    await d.tables.decisions.add(dec)
    return dec


async def drop_fact(d: Deps, user_id: str, fact_id: str) -> None:
    """Remove one of our knowledge facts everywhere: engine edges, registry row, proofs."""
    group = group_id(user_id)
    row = await d.tables.registry.get(user_id, fact_id)
    for eid in (row or {}).get("engine_ids", []):
        await d.engine.delete_fact(group, eid)
    await d.tables.registry.delete(user_id, fact_id)
    await d.tables.proofs.delete_for_fact(user_id, fact_id)


async def _apply_names(d: Deps, user_id: str, eff: Effective) -> None:
    """The word list: each entry is one entity in the engine, whatever was ingested or erased
    since. Before the facts, so a blocked entity is found under its final name."""
    if not isinstance(d.engine, Nameable):
        return
    for dec in eff.known.values():
        p = dec.payload or {}
        if p.get("name"):
            await d.engine.name_entity(group_id(user_id), p["name"], list(p.get("aliases") or []),
                                       p.get("type"))


async def _apply_knowledge(d: Deps, user_id: str, eff: Effective) -> int:
    group, n = group_id(user_id), 0
    present: dict[str, list[EngineFact]] = {}
    for f in await d.engine.facts(group):
        h = knowledge_key(user_id, f.signature())
        if eff.hides(user_id, f):
            await d.engine.delete_fact(group, f.engine_id)
            await drop_fact(d, user_id, knowledge_fact_id(user_id, f.signature()))
            n += 1
            continue
        present.setdefault(h, []).append(f)
    for h, dec in eff.asserted.items():
        if dec.kind != FactKind.knowledge or not dec.payload:
            continue
        found = present.get(h, [])
        if not found:
            await d.engine.assert_fact(group, Statement.model_validate(dec.payload), dec.created_at)
            n += 1
        for f in found:
            if f.closed:
                await d.engine.reopen_fact(group, f.engine_id)
                n += 1
    return n


async def _apply_actions(d: Deps, user_id: str, eff: Effective) -> int:
    n = 0
    for a in await d.actions.standing(action_scope(user_id)):
        if a.value.get("key_hash") in eff.suppressed:
            await d.actions.retract(a, source="person")
            n += 1
    for h, dec in eff.asserted.items():
        if dec.kind == FactKind.action and dec.payload and h not in eff.suppressed:
            draft = ActionFactDraft.model_validate(dec.payload)
            await d.actions.record(draft)  # idempotent: memory_key is the decision id
    return n


async def reapply(d: Deps, user_id: str) -> int:
    """Make the engine and the action store agree with the human decisions. Gives the changes."""
    eff = await effective(d, user_id)
    await _apply_names(d, user_id, eff)
    return await _apply_knowledge(d, user_id, eff) + await _apply_actions(d, user_id, eff)
