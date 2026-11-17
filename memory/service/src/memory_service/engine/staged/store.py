"""The graph store the stages read and write. `MemoryGraphStore` is in-process (tests, demos);
`store_neo4j.Neo4jGraphStore` keeps the same data in Neo4j in Graphiti's shape.

Every call takes the group. Similarity here is deterministic and simple: entity names compare
by character sequence (difflib ratio), facts by shared words (Jaccard)."""

from __future__ import annotations

import copy
import json
from dataclasses import asdict, dataclass, field
from difflib import SequenceMatcher
from typing import Protocol

from memory_service.engine.staged.types import (
    Decision,
    FactKey,
    FactQuery,
    StoredEntity,
    StoredEpisode,
    StoredFact,
)
from memory_service.textutil import norm, words


class GraphStore(Protocol):
    # entities
    async def find_entities(self, group: str, names: list[str]) -> list[StoredEntity]: ...
    async def similar_entities(self, group: str, name: str, k: int) -> list[tuple[StoredEntity, float]]: ...
    async def get_entity(self, group: str, entity_id: str) -> StoredEntity | None: ...
    async def create_entity(self, group: str, e: StoredEntity) -> None: ...
    async def update_entity(self, group: str, e: StoredEntity) -> None: ...
    async def delete_entity(self, group: str, entity_id: str) -> None: ...
    async def get_entities(self, group: str, ids: list[str]) -> dict[str, StoredEntity]: ...
    async def drop_orphan_entities(self, group: str) -> None: ...
    async def entities_from_episode(self, group: str, episode_id: str) -> list[StoredEntity]:
        """Entities the episode created or gave an alias to."""
        ...
    # facts
    async def entity_facts(self, group: str, entity_id: str,
                           limit: int | None = None) -> list[StoredFact]: ...
    async def same_facts(self, group: str, key: FactKey) -> list[StoredFact]: ...
    async def similar_facts(self, group: str, q: FactQuery) -> list[tuple[StoredFact, float]]: ...
    async def duplicate_pairs(self, group: str, threshold: float, limit: int) -> list[tuple[str, str]]:
        """Open fact pairs on one subject: similarity >= threshold, or same relation and object."""
        ...
    async def get_fact(self, group: str, fact_id: str) -> StoredFact | None: ...
    async def all_facts(self, group: str) -> list[StoredFact]: ...
    async def search_facts(self, group: str, query: str, limit: int) -> list[StoredFact]: ...
    async def create_fact(self, group: str, f: StoredFact) -> None: ...
    async def update_fact(self, group: str, f: StoredFact) -> None: ...
    async def delete_fact(self, group: str, fact_id: str) -> None: ...
    # episodes, decisions, everything
    async def save_episode(self, group: str, ep: StoredEpisode) -> None: ...
    async def get_episode(self, group: str, episode_id: str) -> StoredEpisode | None: ...
    async def delete_episode(self, group: str, episode_id: str) -> None: ...
    async def add_decision(self, group: str, rec: Decision) -> None: ...
    async def decisions(self, group: str, kind: str | None = None) -> list[Decision]: ...
    async def current_decisions(self, group: str, roots: list[str]) -> dict[str, Decision]: ...
    async def review_queue(self, group: str, below: float, limit: int) -> list[Decision]: ...
    async def delete_decisions(self, group: str, roots: list[str]) -> None:
        """Delete whole chains (every decision whose root is listed)."""
        ...
    async def clear(self, group: str) -> None: ...


REVIEWABLE = ("new", "inconclusive")  # a "same" decision folded the mention in; not split later


def is_reviewable(d: Decision, below: float) -> bool:
    """The review query: a current entity match, below the threshold, with candidates, made by a
    machine, and not already the result of a deeper review."""
    return (d.kind == "entity_match" and d.outcome in REVIEWABLE and d.confidence < below
            and bool(d.candidates) and d.decided_by != "human" and not d.deep)


def _same_signature(a: StoredFact, b: StoredFact) -> bool:
    return (norm(a.relation), a.target_id) == (norm(b.relation), b.target_id)


def name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, norm(a), norm(b)).ratio()


def text_similarity(a: str, b: str) -> float:
    wa, wb = words(a), words(b)
    return len(wa & wb) / len(wa | wb) if wa and wb else 0.0


@dataclass
class _Group:
    entities: dict[str, StoredEntity] = field(default_factory=dict)
    facts: dict[str, StoredFact] = field(default_factory=dict)
    episodes: dict[str, StoredEpisode] = field(default_factory=dict)
    decisions: list[Decision] = field(default_factory=list)  # in write order


class MemoryGraphStore:
    """In-process graph store. Returns copies, so callers change the store only by writing."""

    def __init__(self) -> None:
        self.groups: dict[str, _Group] = {}

    def _g(self, group: str) -> _Group:
        if not group:
            raise ValueError("a group is required")
        return self.groups.setdefault(group, _Group())

    # ---- entities --------------------------------------------------------------------------------

    async def find_entities(self, group: str, names: list[str]) -> list[StoredEntity]:
        wanted = {norm(n) for n in names if norm(n)}
        return [copy.deepcopy(e) for e in self._g(group).entities.values() if e.names() & wanted]

    async def similar_entities(self, group: str, name: str, k: int) -> list[tuple[StoredEntity, float]]:
        scored = [(e, max(name_similarity(name, n) for n in (e.name, *e.aliases)))
                  for e in self._g(group).entities.values()]
        scored.sort(key=lambda s: (-s[1], s[0].created_at, s[0].id))
        return [(copy.deepcopy(e), s) for e, s in scored[:k]]

    async def get_entity(self, group: str, entity_id: str) -> StoredEntity | None:
        e = self._g(group).entities.get(entity_id)
        return copy.deepcopy(e) if e else None

    async def create_entity(self, group: str, e: StoredEntity) -> None:
        self._g(group).entities[e.id] = copy.deepcopy(e)

    async def update_entity(self, group: str, e: StoredEntity) -> None:
        self._g(group).entities[e.id] = copy.deepcopy(e)

    async def delete_entity(self, group: str, entity_id: str) -> None:
        self._g(group).entities.pop(entity_id, None)

    async def get_entities(self, group: str, ids: list[str]) -> dict[str, StoredEntity]:
        g = self._g(group)
        return {i: copy.deepcopy(g.entities[i]) for i in ids if i in g.entities}

    async def entities_from_episode(self, group: str, episode_id: str) -> list[StoredEntity]:
        return [copy.deepcopy(e) for e in self._g(group).entities.values()
                if episode_id in e.name_sources or any(episode_id in s for s in e.alias_sources.values())]

    async def drop_orphan_entities(self, group: str) -> None:
        g = self._g(group)
        used = {i for f in g.facts.values() for i in (f.source_id, f.target_id)}
        for eid in [eid for eid, e in g.entities.items() if eid not in used and not e.named_by_human]:
            del g.entities[eid]

    # ---- facts -----------------------------------------------------------------------------------

    async def entity_facts(self, group: str, entity_id: str, limit: int | None = None) -> list[StoredFact]:
        hits = [f for f in self._g(group).facts.values() if entity_id in (f.source_id, f.target_id)]
        hits.sort(key=lambda f: f.created_at, reverse=True)
        return [copy.deepcopy(f) for f in hits[:limit]]

    async def same_facts(self, group: str, key: FactKey) -> list[StoredFact]:
        return [copy.deepcopy(f) for f in self._g(group).facts.values()
                if not f.closed and (f.source_id, norm(f.relation), f.target_id)
                == (key.subject_id, norm(key.relation), key.object_id)]

    async def similar_facts(self, group: str, q: FactQuery) -> list[tuple[StoredFact, float]]:
        pool = [f for f in self._g(group).facts.values()
                if f.source_id == q.subject_id and not (q.open_only and f.closed)]
        scored = sorted(((f, text_similarity(q.text, f.text)) for f in pool),
                        key=lambda s: (-s[1], s[0].created_at))
        return [(copy.deepcopy(f), s) for f, s in scored[:q.k]]

    async def duplicate_pairs(self, group: str, threshold: float, limit: int) -> list[tuple[str, str]]:
        live = [f for f in self._g(group).facts.values() if not f.closed]
        pairs = [(a, b, text_similarity(a.text, b.text)) for i, a in enumerate(live) for b in live[i + 1:]
                 if a.source_id == b.source_id]
        pairs = [p for p in pairs if p[2] >= threshold or _same_signature(p[0], p[1])]
        pairs.sort(key=lambda p: -p[2])
        return [(a.id, b.id) for a, b, _ in pairs[:limit]]

    async def get_fact(self, group: str, fact_id: str) -> StoredFact | None:
        f = self._g(group).facts.get(fact_id)
        return copy.deepcopy(f) if f else None

    async def all_facts(self, group: str) -> list[StoredFact]:
        return [copy.deepcopy(f) for f in self._g(group).facts.values()]

    async def search_facts(self, group: str, query: str, limit: int) -> list[StoredFact]:
        q = words(query)
        scored = [(len(q & words(f.text)), f) for f in self._g(group).facts.values()]
        hits = [f for s, f in sorted(scored, key=lambda s: (-s[0], s[1].created_at)) if s]
        return [copy.deepcopy(f) for f in hits[:limit]]

    async def create_fact(self, group: str, f: StoredFact) -> None:
        self._g(group).facts[f.id] = copy.deepcopy(f)

    async def update_fact(self, group: str, f: StoredFact) -> None:
        self._g(group).facts[f.id] = copy.deepcopy(f)

    async def delete_fact(self, group: str, fact_id: str) -> None:
        self._g(group).facts.pop(fact_id, None)

    # ---- episodes, decisions ---------------------------------------------------------------------

    async def save_episode(self, group: str, ep: StoredEpisode) -> None:
        self._g(group).episodes[ep.id] = copy.deepcopy(ep)

    async def get_episode(self, group: str, episode_id: str) -> StoredEpisode | None:
        ep = self._g(group).episodes.get(episode_id)
        return copy.deepcopy(ep) if ep else None

    async def delete_episode(self, group: str, episode_id: str) -> None:
        self._g(group).episodes.pop(episode_id, None)

    async def add_decision(self, group: str, rec: Decision) -> None:
        self._g(group).decisions.append(copy.deepcopy(rec))

    async def decisions(self, group: str, kind: str | None = None) -> list[Decision]:
        return [copy.deepcopy(d) for d in self._g(group).decisions if kind is None or d.kind == kind]

    def _current(self, group: str) -> dict[str, Decision]:
        out: dict[str, Decision] = {}
        for d in self._g(group).decisions:  # later ones supersede earlier ones of the chain
            out[d.root] = d
        return out

    async def current_decisions(self, group: str, roots: list[str]) -> dict[str, Decision]:
        cur = self._current(group)
        return {r: copy.deepcopy(cur[r]) for r in roots if r in cur}

    async def review_queue(self, group: str, below: float, limit: int) -> list[Decision]:
        g = self._g(group)
        todo = [d for d in self._current(group).values() if is_reviewable(d, below)
                and d.subject_id in g.entities]
        todo.sort(key=lambda d: (d.confidence, d.at))
        return [copy.deepcopy(d) for d in todo[:limit]]

    async def delete_decisions(self, group: str, roots: list[str]) -> None:
        g, gone = self._g(group), set(roots)
        g.decisions = [d for d in g.decisions if d.root not in gone]

    async def clear(self, group: str) -> None:
        self.groups.pop(group, None)

    def dump(self) -> str:
        """Everything held, as text (for "no erased words anywhere" checks in tests)."""
        parts: list[str] = []
        for g in self.groups.values():
            parts += [ln for ep in g.episodes.values() for ln in ep.lines]
            parts += [f"{f.source_name} {f.relation} {f.target_name} {f.text} {json.dumps(f.variants)}"
                      for f in g.facts.values()]
            parts += [f"{e.name} {' '.join(e.aliases)} {json.dumps(e.alias_sources)} {e.name_sources}"
                      for e in g.entities.values()]
            parts += [json.dumps(asdict(d), default=str) for d in g.decisions]
        return "\n".join(parts)
