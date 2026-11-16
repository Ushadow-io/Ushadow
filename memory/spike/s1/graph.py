"""Graphiti factory (env-configured, instrumented) and read-only Cypher helpers."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

import httpx
from graphiti_core import Graphiti
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from graphiti_core.utils.maintenance.graph_data_operations import clear_data
from openai import AsyncOpenAI

from .instrument import CallLedger, current_episode, current_prompt, stub_transport

GROUP_RE = re.compile(r"^[a-zA-Z0-9_-]+$")  # graphiti_core.helpers.validate_group_id


class SettingsError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    llm_base_url: str
    llm_api_key: str
    llm_model: str
    llm_small_model: str
    embed_base_url: str
    embed_api_key: str
    embed_model: str
    embed_dim: int
    structured_output: str
    neo4j_uri: str
    neo4j_user: str
    neo4j_password: str
    stub: bool

    @classmethod
    def from_env(cls, stub: bool = False) -> Settings:
        env = os.environ
        need = ["SPIKE_LLM_BASE_URL", "SPIKE_LLM_MODEL", "SPIKE_EMBED_MODEL"]
        missing = [k for k in need if not env.get(k)]
        if missing and not stub:
            raise SettingsError(
                "missing env: " + ", ".join(missing) + " (see README; OPENAI_API_KEY is "
                "deliberately NOT used as a fallback)")
        base = env.get("SPIKE_LLM_BASE_URL", "http://stub.invalid/v1")
        return cls(
            llm_base_url=base,
            llm_api_key=env.get("SPIKE_LLM_API_KEY", "none"),
            llm_model=env.get("SPIKE_LLM_MODEL", "stub-llm"),
            llm_small_model=env.get("SPIKE_LLM_SMALL_MODEL") or env.get("SPIKE_LLM_MODEL", "stub-llm"),
            embed_base_url=env.get("SPIKE_EMBED_BASE_URL", base),
            embed_api_key=env.get("SPIKE_EMBED_API_KEY") or env.get("SPIKE_LLM_API_KEY", "none"),
            embed_model=env.get("SPIKE_EMBED_MODEL", "stub-embed"),
            embed_dim=int(env.get("SPIKE_EMBED_DIM", "768")),
            structured_output=env.get("SPIKE_STRUCTURED_OUTPUT", "json_schema"),
            neo4j_uri=env.get("S1_NEO4J_URI", "bolt://localhost:17687"),
            neo4j_user=env.get("S1_NEO4J_USER", "neo4j"),
            neo4j_password=env.get("S1_NEO4J_PASSWORD", "s1-spike-password"),
            stub=stub,
        )

    def public(self) -> dict[str, Any]:
        """Config for the report. Hosts only, never keys."""
        return {
            "llm_host": "stub" if self.stub else urlparse(self.llm_base_url).netloc,
            "llm_model": self.llm_model,
            "llm_small_model": self.llm_small_model,
            "embed_host": "stub" if self.stub else urlparse(self.embed_base_url).netloc,
            "embed_model": self.embed_model,
            "embed_dim": self.embed_dim,
            "structured_output": self.structured_output,
            "neo4j_uri": self.neo4j_uri,
            "semaphore_limit": os.environ.get("SEMAPHORE_LIMIT"),
            "stub_llm": self.stub,
        }


class InstrumentedLLMClient(OpenAIGenericClient):
    """Counts logical generate_response calls and labels HTTP calls by prompt."""

    def __init__(self, ledger: CallLedger, **kw: Any) -> None:
        super().__init__(**kw)
        self._ledger = ledger

    async def generate_response(self, messages, response_model=None, *args, **kwargs):  # type: ignore[override]
        name = kwargs.get("prompt_name") or (
            response_model.__name__ if response_model is not None else "(no-model)")
        self._ledger.logical_llm_calls[current_episode.get()] += 1
        token = current_prompt.set(name)
        try:
            return await super().generate_response(messages, response_model, *args, **kwargs)
        finally:
            current_prompt.reset(token)


def _http(ledger: CallLedger, s: Settings) -> httpx.AsyncClient:
    transport = stub_transport(s.embed_dim) if s.stub else None
    return httpx.AsyncClient(event_hooks=ledger.event_hooks(), transport=transport,
                             timeout=httpx.Timeout(600.0, connect=20.0))


def make_graphiti(s: Settings, ledger: CallLedger) -> Graphiti:
    llm_cfg = LLMConfig(api_key=s.llm_api_key, model=s.llm_model,
                        small_model=s.llm_small_model, base_url=s.llm_base_url)
    llm_oa = AsyncOpenAI(api_key=s.llm_api_key, base_url=s.llm_base_url,
                         http_client=_http(ledger, s), max_retries=2)
    emb_oa = AsyncOpenAI(api_key=s.embed_api_key, base_url=s.embed_base_url,
                         http_client=_http(ledger, s), max_retries=2)
    llm = InstrumentedLLMClient(ledger, config=llm_cfg, client=llm_oa,
                                structured_output_mode=s.structured_output)  # type: ignore[arg-type]
    embedder = OpenAIEmbedder(
        OpenAIEmbedderConfig(api_key=s.embed_api_key, base_url=s.embed_base_url,
                             embedding_model=s.embed_model, embedding_dim=s.embed_dim),
        client=emb_oa)
    reranker = OpenAIRerankerClient(config=llm_cfg, client=llm_oa)
    return Graphiti(s.neo4j_uri, s.neo4j_user, s.neo4j_password, llm_client=llm,
                    embedder=embedder, cross_encoder=reranker)


# -- Cypher reads ----------------------------------------------------------------
def _dt(v: Any) -> str | None:
    if v is None:
        return None
    if hasattr(v, "to_native"):
        v = v.to_native()
    return v.isoformat() if isinstance(v, datetime) else str(v)


async def q(g: Graphiti, cypher: str, /, **params: Any) -> list[dict[str, Any]]:
    records, _, _ = await g.driver.execute_query(cypher, params=params)
    return [r.data() for r in records]


async def edges(g: Graphiti, group: str) -> list[dict[str, Any]]:
    rows = await q(g, """
        MATCH (s:Entity)-[e:RELATES_TO]->(t:Entity) WHERE e.group_id = $g
        RETURN e.uuid AS uuid, e.name AS name, e.fact AS fact, e.episodes AS episodes,
               e.valid_at AS valid_at, e.invalid_at AS invalid_at, e.expired_at AS expired_at,
               e.created_at AS created_at, e.decided_by AS decided_by,
               s.name AS source, t.name AS target, s.group_id AS sg, t.group_id AS tg
        ORDER BY e.uuid""", g=group)
    for r in rows:
        for k in ("valid_at", "invalid_at", "expired_at", "created_at"):
            r[k] = _dt(r[k])
        r["episodes"] = list(r["episodes"] or [])
    return rows


async def entities(g: Graphiti, group: str) -> list[dict[str, Any]]:
    return await q(g, "MATCH (n:Entity) WHERE n.group_id=$g RETURN n.uuid AS uuid, "
                      "n.name AS name ORDER BY n.uuid", g=group)


async def episodes(g: Graphiti, group: str) -> list[dict[str, Any]]:
    return await q(g, "MATCH (n:Episodic) WHERE n.group_id=$g RETURN n.uuid AS uuid, "
                      "n.name AS name, n.entity_edges AS entity_edges", g=group)


async def counts(g: Graphiti, group: str) -> dict[str, int]:
    rows = await q(g, """
        CALL () { MATCH (n:Entity) WHERE n.group_id=$g RETURN count(n) AS entities }
        CALL () { MATCH (n:Episodic) WHERE n.group_id=$g RETURN count(n) AS episodes }
        CALL () { MATCH ()-[e:RELATES_TO]->() WHERE e.group_id=$g RETURN count(e) AS facts }
        CALL () { MATCH ()-[e:RELATES_TO]->() WHERE e.group_id=$g AND
                  (e.invalid_at IS NOT NULL OR e.expired_at IS NOT NULL) RETURN count(e) AS closed }
        RETURN entities, episodes, facts, closed""", g=group)
    return rows[0]


async def marker_hits(g: Graphiti, group: str, marker: str) -> list[dict[str, Any]]:
    """Any string property (node or relationship) in the group that contains marker."""
    m = marker.lower()
    nodes = await q(g, """
        MATCH (n) WHERE n.group_id=$g
        WITH n, [k IN keys(n) WHERE n[k] IS :: STRING AND toLower(n[k]) CONTAINS $m] AS ks
        WHERE size(ks) > 0 RETURN 'node' AS kind, labels(n) AS labels, n.uuid AS uuid, ks""",
        g=group, m=m)
    rels = await q(g, """
        MATCH ()-[r]->() WHERE r.group_id=$g
        WITH r, [k IN keys(r) WHERE r[k] IS :: STRING AND toLower(r[k]) CONTAINS $m] AS ks
        WHERE size(ks) > 0 RETURN 'rel' AS kind, type(r) AS labels, r.uuid AS uuid, ks""",
        g=group, m=m)
    return nodes + rels


async def delete_group(g: Graphiti, group: str) -> None:
    await clear_data(g.driver, group_ids=[group])
