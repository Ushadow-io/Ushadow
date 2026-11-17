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


async def _group_text(store, group: str) -> tuple[int, str]:
    """Every node and relationship property of the group (vectors left out), as lower-case text."""
    rows = await store._q(
        "MATCH (n) WHERE n.group_id = $g OPTIONAL MATCH (n)-[r]-() "
        "RETURN properties(n) AS n, collect(properties(r)) AS rs", g=group)
    skip = {"name_embedding", "fact_embedding"}
    parts = [{k: v for k, v in p.items() if k not in skip} for r in rows for p in [r["n"], *r["rs"]]]
    return len(rows), repr(parts).lower()


def _kathy_match(req):
    out = []
    for it in req.payload:
        kath = next((c["id"] for c in it["candidates"] if c["name"].startswith("Kath")), None)
        same = it["name"] == "Kathy" and kath
        out.append({"id": it["id"], "answer": "same" if same else "new", "candidate": kath if same else None,
                    "certainty": "high"})
    return {"decisions": out}


async def test_erase_on_neo4j_leaves_no_trace(setup):
    from tests.staged_helpers import facts

    llm = FakeLLM({"extract": [facts(("Katherine", "works at", "Acme", ["L1"])),
                               facts(("Kathy", "likes", "Tea", ["L1"]),
                                     ("Kathy", "works at", "Acme", ["L1"]))],
                   "match": _kathy_match,
                   "reconcile": lambda r: {"decisions": [{"id": it["id"], "answer": "new", "known_ids": [],
                                                          "certainty": "high"} for it in r.payload]}})
    eng = StagedEngine(setup.store, llm, StagedSettings(store="neo4j", same_above=0.999, new_below=0.0))
    g = setup.group
    a = await eng.add_episode(g, episode("conv-a@1", [("Sam", "Katherine works at Acme, as you know.")]))
    b = await eng.add_episode(g, episode("conv-b@1", [("Sam", "Kathy likes Tea and Kathy works at Acme.")],
                                         T0 + DAY))
    [x] = await setup.store.find_entities(g, ["Kathy"])
    assert x.name == "Katherine" and x.alias_sources == {"Kathy": [b.engine_episode_id]}
    keys = await setup.store._q("MATCH (d:StagedDecision) WHERE d.group_id = $g RETURN d.key AS k", g=g)
    assert keys and all(len(r["k"]) == 64 and "kath" not in r["k"] for r in keys)  # digests

    await eng.remove_episode(g, a.engine_episode_id)
    _, text = await _group_text(setup.store, g)
    assert "katherine" not in text and "as you know" not in text
    [x] = await setup.store.find_entities(g, ["Kathy"])
    assert (x.name, x.aliases) == ("Kathy", [])
    assert sorted(f.text for f in await eng.facts(g)) == ["Kathy likes Tea", "Kathy works at Acme"]

    await eng.remove_episode(g, b.engine_episode_id)
    n, text = await _group_text(setup.store, g)
    assert n == 0, text


async def test_known_names_on_neo4j(setup):
    """The word list on the real store: merge, rename, keep without facts, match by alias."""
    eng, g = setup.eng, setup.group
    await eng.add_episode(g, episode("k1", [("Sam", "Bob likes Millone."), ("Sam", "Alice works at Acme.")]))
    known = await eng.name_entity(g, "Mill One", ["Millone", "Themill"], "Organization")
    again = await eng.name_entity(g, "Mill One", ["Millone", "Themill"], "Organization")
    assert again.engine_id == known.engine_id and known.name == "Mill One"
    e = await setup.store.get_entity(g, known.engine_id)
    assert sorted(e.aliases) == ["Millone", "Themill"] and e.named_by_human
    assert [f.text for f in await eng.entity_facts(g, known.engine_id)] == ["Bob likes Millone"]
    head = (await setup.store.current_decisions(g, [e.match_root]))[e.match_root]
    assert (head.decided_by, head.confidence) == ("human", 1.0)

    for f in await eng.entity_facts(g, known.engine_id):  # no fact left: it still stays
        await eng.delete_fact(g, f.engine_id)
    assert (await setup.store.get_entity(g, known.engine_id)) is not None
    r = await eng.add_episode(g, episode("k2", [("Sam", "Bob likes Themill.")], T0 + DAY))
    assert r.facts[0].target_entity_id == known.engine_id
