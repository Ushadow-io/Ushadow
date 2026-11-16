"""Deterministic in-memory engine for tests. It copies the Graphiti behaviours that matter
(memory/spike/README.md): per-group storage, dedupe onto open facts, a newer single-valued
fact closes an older one (human facts too), and remove_episode does NOT reopen what the
episode closed. Extraction is a few regexes, not a model."""

from __future__ import annotations

import itertools
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from memory_service.engine.base import EngineEntity, EngineFact, EpisodeResult
from memory_service.models import EpisodeInput, EpisodeLine, Statement
from memory_service.schema import EvidenceRef, TimeRange
from memory_service.textutil import norm, words

_PATTERN = re.compile(
    r"\b(?P<s>[A-Z][a-zA-Z]+) (?P<rel>works at|lives in|likes|prefers|is married to) "
    r"(?P<o>[A-Z0-9][\w ]*?)(?=[.,!?]|$)"
)
SINGLE_VALUED = {"works at", "lives in", "is married to"}


@dataclass
class _Group:
    facts: dict[str, EngineFact] = field(default_factory=dict)
    episodes: dict[str, str] = field(default_factory=dict)  # engine episode id -> body
    entities: dict[str, EngineEntity] = field(default_factory=dict)  # engine id -> entity


class FakeEngine:
    def __init__(self) -> None:
        self.groups: dict[str, _Group] = {}
        self._ids = itertools.count(1)

    def _g(self, group: str) -> _Group:
        if not group:
            raise ValueError("a group is required")
        return self.groups.setdefault(group, _Group())

    def _entity(self, g: _Group, name: str) -> str:
        for e in g.entities.values():
            if norm(e.name) == norm(name):
                return e.engine_id
        eid = f"e{next(self._ids)}"
        g.entities[eid] = EngineEntity(engine_id=eid, name=name)
        return eid

    def _new_fact(self, g: _Group, source: str, rel: str, target: str) -> EngineFact:
        fid = f"x{next(self._ids)}"
        f = EngineFact(engine_id=fid, source=source, relation=rel, target=target,
                       text=f"{source} {rel} {target}",
                       source_entity_id=self._entity(g, source),
                       target_entity_id=self._entity(g, target))
        g.facts[fid] = f
        return f

    def _close_conflicts(self, g: _Group, new: EngineFact) -> list[str]:
        if norm(new.relation) not in SINGLE_VALUED:
            return []
        closed = []
        for f in g.facts.values():
            same_slot = norm(f.source) == norm(new.source) and norm(f.relation) == norm(new.relation)
            if (f is new or not same_slot or f.closed or norm(f.target) == norm(new.target)):
                continue
            if f.valid_at is None or new.valid_at is None or f.valid_at <= new.valid_at:
                f.invalid_at = new.valid_at
                closed.append(f.engine_id)
        return closed

    def _absorb(self, g: _Group, line: EpisodeLine, m: re.Match, ep_id: str) -> EngineFact:
        source, rel, target = m.group("s"), m.group("rel"), m.group("o").strip()
        for f in g.facts.values():
            if not f.closed and f.signature() == f"k|{norm(source)}|{norm(rel)}|{norm(target)}":
                break
        else:
            f = self._new_fact(g, source, rel, target)
            f.valid_at = line.start
        if ep_id not in f.episodes:
            f.episodes.append(ep_id)
        f.hints.append(EvidenceRef(recordingId=line.recording_id,
                                   range=TimeRange(start=line.start, end=line.end),
                                   transcriptRevision=line.transcript_revision, quote=m.group(0)))
        return f

    async def add_episode(self, group: str, episode: EpisodeInput) -> EpisodeResult:
        g = self._g(group)
        ep_id = f"ep{next(self._ids)}"
        g.episodes[ep_id] = episode.body
        touched: list[EngineFact] = []
        closed: list[str] = []
        for line in episode.lines:
            for m in _PATTERN.finditer(line.text):
                f = self._absorb(g, line, m, ep_id)
                if f not in touched:
                    touched.append(f)
                closed += self._close_conflicts(g, f)
        out = [_copy(f) for f in touched]
        for f in touched:
            f.hints = []  # hints are for this episode's answer only
        return EpisodeResult(engine_episode_id=ep_id, facts=out, closed=closed)

    async def remove_episode(self, group: str, engine_episode_id: str) -> None:
        g = self._g(group)
        g.episodes.pop(engine_episode_id, None)
        for fid, f in list(g.facts.items()):
            if engine_episode_id in f.episodes:
                f.episodes.remove(engine_episode_id)
                if not f.episodes and not f.human:
                    del g.facts[fid]
        self._drop_orphans(g)

    def _drop_orphans(self, g: _Group) -> None:
        used = {i for f in g.facts.values() for i in (f.source_entity_id, f.target_entity_id)}
        for eid in list(g.entities):
            if eid not in used:
                del g.entities[eid]

    async def facts(self, group: str) -> list[EngineFact]:
        return [_copy(f) for f in self._g(group).facts.values()]

    async def get_fact(self, group: str, engine_id: str) -> EngineFact | None:
        f = self._g(group).facts.get(engine_id)
        return _copy(f) if f else None

    async def search(self, group: str, query: str, limit: int) -> list[EngineFact]:
        q = words(query)
        scored = [(len(q & words(f.text)), f) for f in self._g(group).facts.values()]
        hits = [f for score, f in sorted(scored, key=lambda s: (-s[0], s[1].engine_id)) if score]
        return [_copy(f) for f in hits[:limit]]

    async def entity(self, group: str, engine_id: str) -> EngineEntity | None:
        return self._g(group).entities.get(engine_id)

    async def entity_facts(self, group: str, engine_id: str) -> list[EngineFact]:
        return [_copy(f) for f in self._g(group).facts.values()
                if engine_id in (f.source_entity_id, f.target_entity_id)]

    async def assert_fact(self, group: str, statement: Statement, at: datetime) -> EngineFact:
        g = self._g(group)
        f = self._new_fact(g, statement.subject, statement.relation, statement.object)
        f.human, f.valid_at = True, at
        if statement.text:
            f.text = statement.text
        return _copy(f)

    async def delete_fact(self, group: str, engine_id: str) -> None:
        g = self._g(group)
        g.facts.pop(engine_id, None)
        self._drop_orphans(g)

    async def reopen_fact(self, group: str, engine_id: str) -> None:
        f = self._g(group).facts.get(engine_id)
        if f is not None:
            f.invalid_at = None

    async def clear(self, group: str) -> None:
        self.groups.pop(group, None)

    def dump(self) -> str:
        """Everything the engine holds, as text, for 'no erased words anywhere' checks."""
        parts = []
        for g in self.groups.values():
            parts += list(g.episodes.values())
            parts += [f"{f.source} {f.relation} {f.target} {f.text}" for f in g.facts.values()]
            parts += [e.name for e in g.entities.values()]
        return "\n".join(parts)


def _copy(f: EngineFact) -> EngineFact:
    return EngineFact(**{**f.__dict__, "episodes": list(f.episodes), "hints": list(f.hints)})


def _fact_doc(f: EngineFact) -> dict:
    d = {**f.__dict__, "hints": [h.model_dump(mode="json") for h in f.hints]}
    for k in ("valid_at", "invalid_at"):
        d[k] = d[k].isoformat() if d[k] else None
    return d


def _fact_from(d: dict) -> EngineFact:
    d = {**d, "hints": [EvidenceRef.model_validate(h) for h in d.get("hints") or []]}
    for k in ("valid_at", "invalid_at"):
        d[k] = datetime.fromisoformat(d[k]) if d[k] else None
    return EngineFact(**d)


class PersistentFakeEngine(FakeEngine):
    """The fake engine, kept in a Mongo collection (one document per group), so a test of
    restarts and a scan of "every byte the service holds" can see it, as Neo4j would hold
    Graphiti's graph. Tests and demos only (MEMORY_ENGINE=fake-mongo)."""

    def __init__(self, coll: Any) -> None:
        super().__init__()
        self.coll = coll
        self._loaded: set[str] = set()
        self._ids_loaded = False

    async def _load(self, group: str) -> None:
        if not self._ids_loaded:
            meta = await self.coll.find_one({"_id": "__ids__"})
            self._ids = itertools.count((meta or {}).get("n", 0) + 1)
            self._ids_loaded = True
        if group in self._loaded:
            return
        d = await self.coll.find_one({"_id": group})
        if d:
            self.groups[group] = _Group(
                facts={k: _fact_from(v) for k, v in d["facts"].items()}, episodes=d["episodes"],
                entities={k: EngineEntity(**v) for k, v in d["entities"].items()})
        self._loaded.add(group)

    async def _save(self, group: str) -> None:
        g = self.groups.get(group)
        if g is None:
            await self.coll.delete_one({"_id": group})
        else:
            await self.coll.replace_one({"_id": group}, {
                "_id": group, "facts": {k: _fact_doc(f) for k, f in g.facts.items()},
                "episodes": g.episodes, "entities": {k: e.__dict__ for k, e in g.entities.items()}},
                upsert=True)
        n = next(self._ids)  # remember how far the ids went (the count moves on by one)
        await self.coll.replace_one({"_id": "__ids__"}, {"_id": "__ids__", "n": n}, upsert=True)

    async def add_episode(self, group: str, episode: EpisodeInput) -> EpisodeResult:
        await self._load(group)
        out = await super().add_episode(group, episode)
        await self._save(group)
        return out

    async def remove_episode(self, group: str, engine_episode_id: str) -> None:
        await self._load(group)
        await super().remove_episode(group, engine_episode_id)
        await self._save(group)

    async def assert_fact(self, group: str, statement: Statement, at: datetime) -> EngineFact:
        await self._load(group)
        out = await super().assert_fact(group, statement, at)
        await self._save(group)
        return out

    async def delete_fact(self, group: str, engine_id: str) -> None:
        await self._load(group)
        await super().delete_fact(group, engine_id)
        await self._save(group)

    async def reopen_fact(self, group: str, engine_id: str) -> None:
        await self._load(group)
        await super().reopen_fact(group, engine_id)
        await self._save(group)

    async def clear(self, group: str) -> None:
        await self._load(group)
        await super().clear(group)
        await self._save(group)

    async def facts(self, group: str) -> list[EngineFact]:
        await self._load(group)
        return await super().facts(group)

    async def get_fact(self, group: str, engine_id: str) -> EngineFact | None:
        await self._load(group)
        return await super().get_fact(group, engine_id)

    async def search(self, group: str, query: str, limit: int) -> list[EngineFact]:
        await self._load(group)
        return await super().search(group, query, limit)

    async def entity(self, group: str, engine_id: str) -> EngineEntity | None:
        await self._load(group)
        return await super().entity(group, engine_id)

    async def entity_facts(self, group: str, engine_id: str) -> list[EngineFact]:
        await self._load(group)
        return await super().entity_facts(group, engine_id)
