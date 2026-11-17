"""GraphStore on Neo4j, in Graphiti's own shape (graphiti-core 0.31.2): `Entity` nodes,
`RELATES_TO` edges and `Episodic` nodes with `MENTIONS` edges, written with Graphiti's
EntityNode / EntityEdge / EpisodicNode / EpisodicEdge `save` and embedded with its embedder
client. So `engine/graphiti.py`'s read methods work on this data too (it is reused here for
queries, delete and clear). Every query is scoped by group.

Our extra fields are plain node/edge properties: entity `entity_type`, `aliases`, `names_norm`,
`match_root`, `name_sources`, `alias_sources` (JSON), `source_episodes`; edge `source_name`,
`target_name`, `relation_norm`, `confidence`, `source_match`, `target_match`, `decided_by`.
Decision records are `StagedDecision` nodes (not linked to the graph).
Similarity is cosine of Graphiti's embeddings, as raw cosine in -1..1 (Neo4j's
vector.similarity.cosine gives (1 + cos) / 2; it is converted back)."""

from __future__ import annotations

import itertools
import json
import os
import time
import uuid
from collections.abc import Mapping
from dataclasses import asdict
from types import SimpleNamespace
from typing import Any

from memory_service.engine.graphiti import GraphitiEngine, _dt
from memory_service.engine.staged.store import REVIEWABLE
from memory_service.engine.staged.types import (
    Decision,
    FactKey,
    FactQuery,
    StoredEntity,
    StoredEpisode,
    StoredFact,
)
from memory_service.textutil import norm

_ENTITY = """n.uuid AS id, n.name AS name, n.entity_type AS type, n.aliases AS aliases,
    n.match_root AS match_root, n.summary AS summary, n.created_at AS created_at,
    n.name_sources AS name_sources, n.alias_sources AS alias_sources"""
_FACT = """e.uuid AS id, s.uuid AS source_id, t.uuid AS target_id,
    coalesce(e.source_name, s.name) AS source_name, coalesce(e.target_name, t.name) AS target_name,
    e.name AS relation, e.fact AS text, e.valid_at AS valid_at,
    coalesce(e.invalid_at, e.expired_at) AS invalid_at, e.episodes AS episodes,
    e.decided_by AS decided_by, e.created_at AS created_at, e.confidence AS confidence,
    e.source_match AS source_match, e.target_match AS target_match,
    e.variants AS variants, e.text_episode AS text_episode"""
_EDGE = "MATCH (s:Entity)-[e:RELATES_TO]->(t:Entity) WHERE e.group_id = $g"
_OPEN = "e.invalid_at IS NULL AND e.expired_at IS NULL"
_CURRENT = """MATCH (d:StagedDecision) WHERE d.group_id = $g {where}
    WITH d ORDER BY d.seq DESC WITH d.root AS root, collect(d)[0] AS d"""
_seq = itertools.count()


def _entity(r: dict[str, Any]) -> StoredEntity:
    return StoredEntity(id=r["id"], name=r["name"], type=r.get("type") or "Entity",
                        aliases=list(r.get("aliases") or []), match_root=r.get("match_root"),
                        summary=r.get("summary") or "", created_at=_dt(r["created_at"]),  # type: ignore[arg-type]
                        name_sources=list(r.get("name_sources") or []),
                        alias_sources=json.loads(r.get("alias_sources") or "{}"))


def _name_props(e: StoredEntity) -> dict[str, Any]:
    """Name provenance as node properties. A map cannot be a Neo4j property: `alias_sources` is
    JSON; `source_episodes` lists every episode in it, so an erase can find the node."""
    return {"aliases": e.aliases, "names_norm": sorted(e.names()), "name_sources": e.name_sources,
            "alias_sources": json.dumps(e.alias_sources, sort_keys=True),
            "source_episodes": sorted({*e.name_sources, *(x for s in e.alias_sources.values() for x in s)})}


def _fact(r: dict[str, Any]) -> StoredFact:
    return StoredFact(id=r["id"], source_id=r["source_id"], target_id=r["target_id"],
                      source_name=r["source_name"] or "", target_name=r["target_name"] or "",
                      relation=r["relation"] or "", text=r["text"] or "", valid_at=_dt(r["valid_at"]),
                      invalid_at=_dt(r["invalid_at"]), episodes=list(r["episodes"] or []),
                      human=r.get("decided_by") == "human", created_at=_dt(r["created_at"]),  # type: ignore[arg-type]
                      confidence=1.0 if r.get("confidence") is None else float(r["confidence"]),
                      source_match=r.get("source_match"), target_match=r.get("target_match"),
                      variants=json.loads(r.get("variants") or "{}"), text_episode=r.get("text_episode"))


def _words(f: StoredFact) -> dict[str, Any]:
    """The fact's shown words and each supporting episode's words (JSON: no map properties)."""
    return {"fact": f.text, "source_name": f.source_name, "target_name": f.target_name,
            "variants": json.dumps(f.variants, sort_keys=True), "text_episode": f.text_episode}


def _decision(props: dict[str, Any]) -> Decision:
    d = {k: v for k, v in props.items() if k in Decision.__dataclass_fields__}
    d["at"] = _dt(d["at"])
    return Decision(**d)


class Neo4jGraphStore:
    def __init__(self, driver: Any, embedder: Any) -> None:
        self.driver, self.embedder = driver, embedder
        self.reader = GraphitiEngine(SimpleNamespace(driver=driver))  # Graphiti's read side
        self._ready = False

    async def _q(self, cypher: str, **params: Any) -> list[dict[str, Any]]:
        if not self._ready:
            await self.driver.build_indices_and_constraints()
            self._ready = True
        return await self.reader._q(cypher, **params)

    async def _vec(self, text: str) -> list[float]:
        return await self.embedder.create(input_data=[text.replace("\n", " ")])

    # ---- entities --------------------------------------------------------------------------------

    async def find_entities(self, group: str, names: list[str]) -> list[StoredEntity]:
        rows = await self._q(f"MATCH (n:Entity) WHERE n.group_id = $g AND any(x IN n.names_norm "
                             f"WHERE x IN $names) RETURN {_ENTITY} ORDER BY n.created_at",
                             g=group, names=[norm(n) for n in names if norm(n)])
        return [_entity(r) for r in rows]

    async def similar_entities(self, group: str, name: str, k: int) -> list[tuple[StoredEntity, float]]:
        rows = await self._q(f"MATCH (n:Entity) WHERE n.group_id = $g AND n.name_embedding IS NOT NULL "
                             f"WITH n, vector.similarity.cosine(n.name_embedding, $v) AS score "
                             f"ORDER BY score DESC LIMIT $k RETURN {_ENTITY}, score",
                             g=group, v=await self._vec(name), k=k)
        return [(_entity(r), 2 * r["score"] - 1) for r in rows]

    async def get_entity(self, group: str, entity_id: str) -> StoredEntity | None:
        found = await self.get_entities(group, [entity_id])
        return found.get(entity_id)

    async def get_entities(self, group: str, ids: list[str]) -> dict[str, StoredEntity]:
        rows = await self._q(f"MATCH (n:Entity) WHERE n.group_id = $g AND n.uuid IN $ids RETURN {_ENTITY}",
                             g=group, ids=ids)
        return {r["id"]: _entity(r) for r in rows}

    async def create_entity(self, group: str, e: StoredEntity) -> None:
        from graphiti_core.nodes import EntityNode

        node = EntityNode(uuid=e.id, name=e.name, group_id=group, labels=[], created_at=e.created_at,
                          summary=e.summary, attributes={
                              "entity_type": e.type, "match_root": e.match_root, **_name_props(e)})
        await node.generate_name_embedding(self.embedder)
        await self._q("RETURN 1")  # indices first
        await node.save(self.driver)

    async def update_entity(self, group: str, e: StoredEntity) -> None:
        old = await self.get_entity(group, e.id)
        await self._q("MATCH (n:Entity {uuid: $u}) WHERE n.group_id = $g SET n += $p",
                      u=e.id, g=group, p={"name": e.name, "match_root": e.match_root, "summary": e.summary,
                                          **_name_props(e)})
        if old is not None and old.name != e.name:  # renamed (erase): the old name's vector goes too
            await self._q("MATCH (n:Entity {uuid: $u}) WHERE n.group_id = $g "
                          "CALL db.create.setNodeVectorProperty(n, 'name_embedding', $v)",
                          u=e.id, g=group, v=await self._vec(e.name))

    async def entities_from_episode(self, group: str, episode_id: str) -> list[StoredEntity]:
        rows = await self._q(f"MATCH (n:Entity) WHERE n.group_id = $g AND $ep IN n.source_episodes "
                             f"RETURN {_ENTITY}", g=group, ep=episode_id)
        return [_entity(r) for r in rows]

    async def delete_entity(self, group: str, entity_id: str) -> None:
        await self._q("MATCH (n:Entity {uuid: $u}) WHERE n.group_id = $g DETACH DELETE n",
                      u=entity_id, g=group)

    async def drop_orphan_entities(self, group: str) -> None:
        await self._q("MATCH (n:Entity) WHERE n.group_id = $g AND NOT (n)-[:RELATES_TO]-() DETACH DELETE n",
                      g=group)

    # ---- facts -----------------------------------------------------------------------------------

    async def _facts(self, group: str, where: str = "", tail: str = "", **p: Any) -> list[StoredFact]:
        return [_fact(r) for r in await self._q(f"{_EDGE} {where} RETURN {_FACT} {tail}", g=group, **p)]

    async def entity_facts(self, group: str, entity_id: str, limit: int | None = None) -> list[StoredFact]:
        tail = "ORDER BY e.created_at DESC" + (" LIMIT $n" if limit is not None else "")
        return await self._facts(group, "AND (s.uuid = $u OR t.uuid = $u)", tail, u=entity_id, n=limit)

    async def same_facts(self, group: str, key: FactKey) -> list[StoredFact]:
        return await self._facts(group, f"AND s.uuid = $s AND t.uuid = $t AND {_OPEN} AND "
                                 "coalesce(e.relation_norm, e.name) = $r", "ORDER BY e.created_at",
                                 s=key.subject_id, t=key.object_id, r=norm(key.relation))

    async def similar_facts(self, group: str, q: FactQuery) -> list[tuple[StoredFact, float]]:
        rows = await self._q(f"{_EDGE} AND s.uuid = $s {'AND ' + _OPEN if q.open_only else ''} "
                             f"AND e.fact_embedding IS NOT NULL "
                             f"WITH s, e, t, vector.similarity.cosine(e.fact_embedding, $v) AS score "
                             f"ORDER BY score DESC LIMIT $k RETURN {_FACT}, score",
                             g=group, s=q.subject_id, v=await self._vec(q.text), k=q.k)
        return [(_fact(r), 2 * r["score"] - 1) for r in rows]

    async def duplicate_pairs(self, group: str, threshold: float, limit: int) -> list[tuple[str, str]]:
        rows = await self._q(
            "MATCH (s:Entity)-[a:RELATES_TO]->(ta), (s)-[b:RELATES_TO]->(tb) WHERE a.group_id = $g "
            "AND b.group_id = $g AND a.uuid < b.uuid AND a.invalid_at IS NULL AND a.expired_at IS NULL "
            "AND b.invalid_at IS NULL AND b.expired_at IS NULL "
            "WITH a, b, vector.similarity.cosine(a.fact_embedding, b.fact_embedding) AS score "
            "WHERE score >= $t OR (ta = tb AND coalesce(a.relation_norm, a.name) = "
            "coalesce(b.relation_norm, b.name)) RETURN a.uuid AS a, b.uuid AS b ORDER BY score DESC LIMIT $n",
            g=group, t=(1 + threshold) / 2, n=limit)
        return [(r["a"], r["b"]) for r in rows]

    async def get_fact(self, group: str, fact_id: str) -> StoredFact | None:
        rows = await self._facts(group, "AND e.uuid = $u", u=fact_id)
        return rows[0] if rows else None

    async def all_facts(self, group: str) -> list[StoredFact]:
        return await self._facts(group, tail="ORDER BY e.created_at, e.uuid")

    async def search_facts(self, group: str, query: str, limit: int) -> list[StoredFact]:
        rows = await self._q(f"{_EDGE} AND e.fact_embedding IS NOT NULL "
                             f"WITH s, e, t, vector.similarity.cosine(e.fact_embedding, $v) AS score "
                             f"ORDER BY score DESC LIMIT $k RETURN {_FACT}",
                             g=group, v=await self._vec(query), k=limit)
        return [_fact(r) for r in rows]

    async def create_fact(self, group: str, f: StoredFact) -> None:
        from graphiti_core.edges import EntityEdge

        edge = EntityEdge(uuid=f.id, source_node_uuid=f.source_id, target_node_uuid=f.target_id,
                          name=f.relation, fact=f.text, group_id=group, created_at=f.created_at,
                          valid_at=f.valid_at, invalid_at=f.invalid_at, episodes=list(f.episodes),
                          attributes={"decided_by": "human" if f.human else "staged",
                                      "source_name": f.source_name, "target_name": f.target_name,
                                      "relation_norm": norm(f.relation), "confidence": f.confidence,
                                      "source_match": f.source_match, "target_match": f.target_match,
                                      **_words(f)})
        await edge.generate_embedding(self.embedder)
        await self._q("RETURN 1")  # indices first
        await edge.save(self.driver)

    async def update_fact(self, group: str, f: StoredFact) -> None:
        await self._q(  # a relationship cannot change its ends: copy it onto the new ends first
            "MATCH (s:Entity)-[e:RELATES_TO {uuid: $u}]->(t:Entity) WHERE e.group_id = $g "
            "AND (s.uuid <> $s OR t.uuid <> $t) MATCH (ns:Entity {uuid: $s}), (nt:Entity {uuid: $t}) "
            "CREATE (ns)-[e2:RELATES_TO]->(nt) SET e2 = properties(e) DELETE e",
            u=f.id, g=group, s=f.source_id, t=f.target_id)
        old = await self.get_fact(group, f.id)
        await self._q(
            "MATCH ()-[e:RELATES_TO {uuid: $u}]->() WHERE e.group_id = $g SET e.episodes = $episodes, "
            "e.valid_at = $valid, e.invalid_at = $invalid, e.confidence = $conf, e += $words, "
            "e.expired_at = CASE WHEN $invalid IS NULL THEN null ELSE coalesce(e.expired_at, $now) END",
            u=f.id, g=group, episodes=f.episodes, valid=f.valid_at, invalid=f.invalid_at,
            conf=f.confidence, now=f.invalid_at, words=_words(f))
        if old is not None and old.text != f.text:  # reworded (erase): the old words' vector goes too
            await self._q("MATCH ()-[e:RELATES_TO {uuid: $u}]->() WHERE e.group_id = $g "
                          "CALL db.create.setRelationshipVectorProperty(e, 'fact_embedding', $v)",
                          u=f.id, g=group, v=await self._vec(f.text))

    async def delete_fact(self, group: str, fact_id: str) -> None:
        await self.reader.delete_fact(group, fact_id)

    # ---- episodes, decisions ---------------------------------------------------------------------

    async def save_episode(self, group: str, ep: StoredEpisode) -> None:
        from graphiti_core.edges import EpisodicEdge
        from graphiti_core.nodes import EpisodeType, EpisodicNode

        await self._q("RETURN 1")
        await EpisodicNode(uuid=ep.id, name=ep.name, group_id=group, source=EpisodeType.message,
                           source_description="ushadow staged", content="\n".join(ep.lines),
                           valid_at=ep.reference_time, entity_edges=list(ep.fact_ids)).save(self.driver)
        for eid in ep.entity_ids:
            mention = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{ep.id}|{eid}"))
            await EpisodicEdge(uuid=mention, source_node_uuid=ep.id, target_node_uuid=eid,
                               group_id=group, created_at=ep.reference_time).save(self.driver)

    async def get_episode(self, group: str, episode_id: str) -> StoredEpisode | None:
        rows = await self._q("MATCH (n:Episodic {uuid: $u}) WHERE n.group_id = $g OPTIONAL MATCH "
                             "(n)-[:MENTIONS]->(m:Entity) RETURN n.name AS name, n.valid_at AS at, "
                             "n.content AS content, n.entity_edges AS facts, collect(m.uuid) AS ents",
                             u=episode_id, g=group)
        if not rows:
            return None
        r = rows[0]
        return StoredEpisode(id=episode_id, name=r["name"], reference_time=_dt(r["at"]),  # type: ignore[arg-type]
                             lines=(r["content"] or "").split("\n"), fact_ids=list(r["facts"] or []),
                             entity_ids=list(r["ents"] or []))

    async def delete_episode(self, group: str, episode_id: str) -> None:
        await self._q("MATCH (n:Episodic {uuid: $u}) WHERE n.group_id = $g DETACH DELETE n",
                      u=episode_id, g=group)

    async def add_decision(self, group: str, rec: Decision) -> None:
        props = {**asdict(rec), "group_id": group, "seq": time.time_ns() // 1000 * 1000 + next(_seq) % 1000}
        await self._q("CREATE (d:StagedDecision) SET d = $p", p=props)

    async def decisions(self, group: str, kind: str | None = None) -> list[Decision]:
        rows = await self._q("MATCH (d:StagedDecision) WHERE d.group_id = $g AND ($k IS NULL OR d.kind = $k) "
                             "RETURN properties(d) AS p ORDER BY d.seq", g=group, k=kind)
        return [_decision(r["p"]) for r in rows]

    async def current_decisions(self, group: str, roots: list[str]) -> dict[str, Decision]:
        rows = await self._q(_CURRENT.format(where="AND d.root IN $roots")
                             + " RETURN root, properties(d) AS p", g=group, roots=roots)
        return {r["root"]: _decision(r["p"]) for r in rows}

    async def review_queue(self, group: str, below: float, limit: int) -> list[Decision]:
        rows = await self._q(
            _CURRENT.format(where="AND d.kind = 'entity_match'")
            + " WHERE d.outcome IN $outcomes AND d.confidence < $below AND NOT d.deep "
            "AND d.decided_by <> 'human' AND size(d.candidates) > 0 "
            "AND EXISTS { MATCH (n:Entity {uuid: d.subject_id}) WHERE n.group_id = $g } "
            "RETURN properties(d) AS p ORDER BY d.confidence, d.seq LIMIT $n",
            g=group, outcomes=list(REVIEWABLE), below=below, n=limit)
        return [_decision(r["p"]) for r in rows]

    async def delete_decisions(self, group: str, roots: list[str]) -> None:
        await self._q("MATCH (d:StagedDecision) WHERE d.group_id = $g AND d.root IN $roots DELETE d",
                      g=group, roots=roots)

    async def clear(self, group: str) -> None:
        await self.reader.clear(group)
        await self._q("MATCH (d:StagedDecision) WHERE d.group_id = $g DELETE d", g=group)


def make_neo4j_store(env: Mapping[str, str] | None = None) -> Neo4jGraphStore:
    """MEMORY_NEO4J_* and MEMORY_EMBED_* (as the graphiti engine reads them)."""
    from graphiti_core.driver.neo4j_driver import Neo4jDriver
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig

    e = env if env is not None else os.environ
    if not e.get("MEMORY_EMBED_MODEL"):
        raise RuntimeError("staged engine on neo4j needs MEMORY_EMBED_MODEL")
    driver = Neo4jDriver(e.get("MEMORY_NEO4J_URI", "bolt://neo4j:7687"), e.get("MEMORY_NEO4J_USER", "neo4j"),
                         e.get("MEMORY_NEO4J_PASSWORD", "password"))
    embedder = OpenAIEmbedder(OpenAIEmbedderConfig(
        api_key=e.get("MEMORY_EMBED_API_KEY") or e.get("MEMORY_LLM_API_KEY") or "none",
        base_url=e.get("MEMORY_EMBED_BASE_URL") or e.get("MEMORY_LLM_BASE_URL"),
        embedding_model=e["MEMORY_EMBED_MODEL"], embedding_dim=int(e.get("MEMORY_EMBED_DIM", "768"))))
    return Neo4jGraphStore(driver, embedder)
