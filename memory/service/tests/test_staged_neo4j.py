"""Staged engine on a real Neo4j (Graphiti's node/edge shape). Skipped unless
STAGED_TEST_NEO4J_URI is set (plus STAGED_TEST_NEO4J_USER / _PASSWORD). Uses a deterministic
fake embedder (no network) and one throw-away group `staged-test-<random>`, deleted afterwards."""

from __future__ import annotations

import hashlib
import math
import os
import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest

from memory_service.engine.staged import FakeLLM, StagedEngine, StagedSettings
from memory_service.models import Statement
from memory_service.textutil import norm
from tests.staged_helpers import T0, episode, rule_extract, rule_reconcile

URI = os.environ.get("STAGED_TEST_NEO4J_URI")
pytestmark = pytest.mark.skipif(not URI, reason="set STAGED_TEST_NEO4J_URI to run")
DAY = timedelta(days=1)


class HashEmbedder:
    """Character-trigram hashing into 64 dims, normalised. Similar strings get similar vectors."""

    async def create(self, input_data):
        text = f"  {norm(input_data[0] if isinstance(input_data, list) else input_data)}  "
        v = [0.0] * 64
        for i in range(len(text) - 2):
            v[int(hashlib.sha256(text[i:i + 3].encode()).hexdigest(), 16) % 64] += 1.0
        n = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / n for x in v]


def _match(req):
    alicia = [{"answer": "inconclusive", "certainty": "low"}, {"answer": "new", "certainty": "high"}]
    return {"decisions": [{"id": it["id"], "candidate": None, **alicia[it["name"] != "Alicia"]}
                          for it in req.payload]}


@pytest.fixture
async def setup():
    from graphiti_core.driver.neo4j_driver import Neo4jDriver

    from memory_service.engine.staged.store_neo4j import Neo4jGraphStore

    driver = Neo4jDriver(URI, os.environ.get("STAGED_TEST_NEO4J_USER", "neo4j"),
                         os.environ.get("STAGED_TEST_NEO4J_PASSWORD", "s1-spike-password"))
    store = Neo4jGraphStore(driver, HashEmbedder())
    llm = FakeLLM({"extract": rule_extract, "reconcile": rule_reconcile, "match": _match,
                   "review": [{"answer": "same", "candidate": "c1", "certainty": "high"}],
                   "dup_facts": lambda r: {"decisions": [{"id": p["id"], "same": False} for p in r.payload]}})
    eng = StagedEngine(store, llm, StagedSettings(store="neo4j", same_above=0.999, new_below=0.0))
    group = f"staged-test-{uuid.uuid4().hex[:12]}"
    try:
        yield SimpleNamespace(eng=eng, store=store, llm=llm, group=group, driver=driver)
    finally:
        await eng.clear(group)
        rows = await store._q("MATCH (n) WHERE n.group_id = $g RETURN count(n) AS n", g=group)
        assert rows[0]["n"] == 0
        await driver.close()


async def test_staged_engine_on_neo4j(setup):
    from memory_service.engine.graphiti import GraphitiEngine

    eng, g = setup.eng, setup.group
    r1 = await eng.add_episode(g, episode("e1", [("Sam", "Bob lives in Paris."),
                                                 ("Sam", "Alice works at Acme.")]))
    assert sorted(f.text for f in r1.facts) == ["Alice works at Acme", "Bob lives in Paris"]
    assert all(f.hints and f.hints[0].recordingId == "rec-e1" for f in r1.facts)

    r2 = await eng.add_episode(g, episode("e2", [("Sam", "Bob lives in Lyon."),
                                                 ("Sam", "Alice works at Acme."),
                                                 ("Sam", "Alicia likes Tea.")], T0 + DAY))
    paris = next(f for f in r1.facts if "Paris" in f.text)
    assert r2.closed == [paris.engine_id]
    assert (await eng.get_fact(g, paris.engine_id)).invalid_at == T0 + DAY
    acme = next(f for f in r2.facts if "Acme" in f.text)
    assert len(acme.episodes) == 2  # duplicate: this episode added as support

    # Graphiti's own read side sees the same graph
    reader = GraphitiEngine(SimpleNamespace(driver=setup.driver))
    assert sorted(f.text for f in await reader.facts(g)) == sorted(f.text for f in await eng.facts(g))

    [queued] = await setup.store.review_queue(g, eng.cfg.review_below, 5)
    rep = await eng.maintain(g, budget=3)
    assert rep.entities_merged == 1 and await setup.store.review_queue(g, eng.cfg.review_below, 5) == []
    tea = next(f for f in await eng.facts(g) if "Tea" in f.text)
    alice = (await setup.store.find_entities(g, ["Alice"]))[0]
    assert tea.source_entity_id == alice.id and tea.source == "Alicia"
    assert "Alicia" in alice.aliases
    chain = [d for d in await setup.store.decisions(g) if d.root == queued.root]
    assert [d.outcome for d in chain] == ["inconclusive", "same"]

    human = await eng.assert_fact(g, Statement(subject="Carol", relation="lives in", object="Rome"), T0)
    await eng.reopen_fact(g, paris.engine_id)
    assert not (await eng.get_fact(g, paris.engine_id)).closed
    assert [f.engine_id for f in await eng.search(g, "Carol lives in Rome", 1)] == [human.engine_id]

    await eng.remove_episode(g, r1.engine_episode_id)
    assert await eng.get_fact(g, paris.engine_id) is None  # only e1 supported it
    assert len((await eng.get_fact(g, acme.engine_id)).episodes) == 1
    await eng.delete_fact(g, human.engine_id)
    assert await eng.get_fact(g, human.engine_id) is None
