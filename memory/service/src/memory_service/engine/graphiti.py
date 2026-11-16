"""Graphiti adapter (graphiti-core==0.31.2, optional extra `graphiti`).

NOT TESTED against a live Neo4j or a real model. It is kept thin on purpose and follows the
API facts verified by reading the 0.31.2 source in the S1 spike (memory/spike/README.md):

- telemetry is on by default: forced off here, before graphiti_core is imported;
- `add_episode(uuid=...)` loads an existing episode, so our episode key goes in `name` and the
  service keeps the map our key <-> Graphiti uuid (WorkUnit.engine_episode_id);
- `search` without `group_ids` searches every user: every call here passes the group;
- `remove_episode` does not reopen facts the episode closed: the service does that (closures);
- `add_triplet` human facts can be closed by later episodes: the service re-applies human wins.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any

from memory_service.engine.base import EngineEntity, EngineFact, EpisodeResult
from memory_service.models import EpisodeInput, Statement

os.environ["GRAPHITI_TELEMETRY_ENABLED"] = "false"  # before any graphiti_core import

_EDGE_FIELDS = """e.uuid AS uuid, e.name AS name, e.fact AS fact, e.episodes AS episodes,
    e.valid_at AS valid_at, e.invalid_at AS invalid_at, e.expired_at AS expired_at,
    e.decided_by AS decided_by, s.name AS source, t.name AS target,
    s.uuid AS source_id, t.uuid AS target_id"""


def _dt(v: Any) -> datetime | None:
    if v is None:
        return None
    if hasattr(v, "to_native"):
        v = v.to_native()
    return v if v.tzinfo else v.replace(tzinfo=UTC)


def _row_fact(r: dict[str, Any]) -> EngineFact:
    closed = _dt(r.get("invalid_at")) or _dt(r.get("expired_at"))
    return EngineFact(engine_id=r["uuid"], source=r["source"] or "", relation=r["name"] or "",
                      target=r["target"] or "", text=r["fact"] or "",
                      valid_at=_dt(r.get("valid_at")), invalid_at=closed,
                      episodes=list(r.get("episodes") or []),
                      human=r.get("decided_by") == "human",
                      source_entity_id=r.get("source_id"), target_entity_id=r.get("target_id"))


class GraphitiEngine:
    """Wraps a configured `graphiti_core.Graphiti`. Build it with `make_graphiti_engine`."""

    def __init__(self, graphiti: Any) -> None:
        self.g = graphiti

    async def _q(self, cypher: str, **params: Any) -> list[dict[str, Any]]:
        records, _, _ = await self.g.driver.execute_query(cypher, params=params)
        return [r.data() for r in records]

    async def _edges(self, group: str, where: str = "", **params: Any) -> list[EngineFact]:
        rows = await self._q(
            f"MATCH (s:Entity)-[e:RELATES_TO]->(t:Entity) WHERE e.group_id = $g {where} "
            f"RETURN {_EDGE_FIELDS} ORDER BY e.uuid", g=group, **params)
        return [_row_fact(r) for r in rows]

    async def add_episode(self, group: str, episode: EpisodeInput) -> EpisodeResult:
        from graphiti_core.nodes import EpisodeType

        res = await self.g.add_episode(
            name=episode.name, episode_body=episode.body, source_description="ushadow conversation",
            reference_time=episode.reference_time, source=EpisodeType.message, group_id=group)
        ep = res.episode.uuid
        ids = [e.uuid for e in res.edges]
        current = {f.engine_id: f for f in await self._edges(group, "AND e.uuid IN $ids", ids=ids)}
        touched = [f for f in current.values() if ep in f.episodes]
        closed = [f.engine_id for f in current.values() if ep not in f.episodes and f.closed]
        return EpisodeResult(engine_episode_id=ep, facts=touched, closed=closed)

    async def remove_episode(self, group: str, engine_episode_id: str) -> None:
        rows = await self._q("MATCH (n:Episodic {uuid: $u}) WHERE n.group_id = $g RETURN n.uuid AS u",
                             u=engine_episode_id, g=group)
        if rows:  # never touch an episode of another group
            await self.g.remove_episode(engine_episode_id)

    async def facts(self, group: str) -> list[EngineFact]:
        return await self._edges(group)

    async def get_fact(self, group: str, engine_id: str) -> EngineFact | None:
        rows = await self._edges(group, "AND e.uuid = $u", u=engine_id)
        return rows[0] if rows else None

    async def search(self, group: str, query: str, limit: int) -> list[EngineFact]:
        edges = await self.g.search(query, group_ids=[group], num_results=limit)
        ids = [e.uuid for e in edges if e.group_id == group]
        by_id = {f.engine_id: f for f in await self._edges(group, "AND e.uuid IN $ids", ids=ids)}
        return [by_id[i] for i in ids if i in by_id]

    async def entity(self, group: str, engine_id: str) -> EngineEntity | None:
        rows = await self._q("MATCH (n:Entity {uuid: $u}) WHERE n.group_id = $g "
                             "RETURN n.uuid AS uuid, n.name AS name, n.summary AS summary",
                             u=engine_id, g=group)
        return EngineEntity(engine_id=rows[0]["uuid"], name=rows[0]["name"],
                            summary=rows[0]["summary"]) if rows else None

    async def entity_facts(self, group: str, engine_id: str) -> list[EngineFact]:
        return await self._edges(group, "AND (s.uuid = $u OR t.uuid = $u)", u=engine_id)

    async def assert_fact(self, group: str, statement: Statement, at: datetime) -> EngineFact:
        from graphiti_core.edges import EntityEdge
        from graphiti_core.nodes import EntityNode

        now = datetime.now(UTC)
        src = EntityNode(name=statement.subject, group_id=group, labels=["Entity"], created_at=now)
        dst = EntityNode(name=statement.object, group_id=group, labels=["Entity"], created_at=now)
        edge = EntityEdge(source_node_uuid=src.uuid, target_node_uuid=dst.uuid,
                          name=statement.relation, group_id=group, created_at=now, valid_at=at,
                          fact=statement.text or
                          f"{statement.subject} {statement.relation} {statement.object}",
                          episodes=[], attributes={"decided_by": "human"})
        res = await self.g.add_triplet(src, edge, dst)
        uuid = res.edges[0].uuid if res.edges else edge.uuid
        fact = await self.get_fact(group, uuid)
        if fact is None:
            raise RuntimeError("add_triplet stored no edge")
        return fact

    async def delete_fact(self, group: str, engine_id: str) -> None:
        await self._q("MATCH ()-[e:RELATES_TO {uuid: $u}]->() WHERE e.group_id = $g DELETE e",
                      u=engine_id, g=group)

    async def reopen_fact(self, group: str, engine_id: str) -> None:
        await self._q("MATCH ()-[e:RELATES_TO {uuid: $u}]->() WHERE e.group_id = $g "
                      "SET e.invalid_at = null, e.expired_at = null", u=engine_id, g=group)

    async def clear(self, group: str) -> None:
        from graphiti_core.utils.maintenance.graph_data_operations import clear_data

        await clear_data(self.g.driver, group_ids=[group])


def make_graphiti_engine(env: dict[str, str] | None = None) -> GraphitiEngine:
    """Build from MEMORY_LLM_* / MEMORY_EMBED_* / MEMORY_NEO4J_* env. No OPENAI_API_KEY fallback."""
    from graphiti_core import Graphiti
    from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient

    e = env if env is not None else dict(os.environ)
    missing = [k for k in ("MEMORY_LLM_BASE_URL", "MEMORY_LLM_MODEL", "MEMORY_EMBED_MODEL") if not e.get(k)]
    if missing:
        raise RuntimeError("graphiti engine needs env: " + ", ".join(missing))
    key = e.get("MEMORY_LLM_API_KEY", "none")
    llm_cfg = LLMConfig(api_key=key, model=e["MEMORY_LLM_MODEL"], base_url=e["MEMORY_LLM_BASE_URL"],
                        small_model=e.get("MEMORY_LLM_SMALL_MODEL") or e["MEMORY_LLM_MODEL"])
    embed_cfg = OpenAIEmbedderConfig(
        api_key=e.get("MEMORY_EMBED_API_KEY") or key,
        base_url=e.get("MEMORY_EMBED_BASE_URL") or e["MEMORY_LLM_BASE_URL"],
        embedding_model=e["MEMORY_EMBED_MODEL"], embedding_dim=int(e.get("MEMORY_EMBED_DIM", "768")))
    graphiti = Graphiti(
        e.get("MEMORY_NEO4J_URI", "bolt://neo4j:7687"), e.get("MEMORY_NEO4J_USER", "neo4j"),
        e.get("MEMORY_NEO4J_PASSWORD", "password"),
        llm_client=OpenAIGenericClient(config=llm_cfg),
        embedder=OpenAIEmbedder(embed_cfg), cross_encoder=OpenAIRerankerClient(config=llm_cfg))
    return GraphitiEngine(graphiti)
