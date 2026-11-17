"""Removing an episode from the staged engine leaves nothing said only in it: no fact words, no
alias, no decision, no episode text (checked on MemoryGraphStore.dump(), which includes all)."""

from __future__ import annotations

from datetime import timedelta

from memory_service.engine.staged import FakeLLM
from memory_service.engine.staged.types import StoredEntity
from tests.staged_helpers import T0, G, episode, facts, staged

DAY = timedelta(days=1)
A_LINE = "Katherine works at Acme, as you know."
B_LINE = "Kathy likes Tea and Kathy works at Acme."


async def _two_episodes():
    """A creates Katherine; B calls her Kathy (the model says same), adds a fact and repeats one."""
    llm = FakeLLM({"extract": [facts(("Katherine", "works at", "Acme", ["L1"])),
                               facts(("Kathy", "likes", "Tea", ["L1"]),
                                     ("Kathy", "works at", "Acme", ["L1"]))],
                   "match": [{"decisions": [{"id": "n1", "answer": "same", "candidate": "c1",
                                             "certainty": "high"}]}],
                   "reconcile": [{"decisions": [{"id": "f0", "answer": "new", "known_ids": [],
                                                 "certainty": "high"}]}]})
    eng = staged(llm, same_above=0.99, new_below=0.5)
    a = await eng.add_episode(G, episode("conv-a@1", [("Sam", A_LINE)]))
    b = await eng.add_episode(G, episode("conv-b@1", [("Sam", B_LINE)], T0 + DAY))
    [x] = await eng.store.find_entities(G, ["Katherine"])
    assert x.aliases == ["Kathy"] and x.alias_sources == {"Kathy": [b.engine_episode_id]}
    assert len(await eng.facts(G)) == 2
    return eng, a.engine_episode_id, b.engine_episode_id


def _dump(eng) -> str:
    return eng.dump().lower()


async def _decisions_of(eng, episode_id):
    return [d for d in await eng.store.decisions(G) if d.episode_id == episode_id]


async def test_decision_keys_hold_no_clear_text():
    eng, _, _ = await _two_episodes()
    for d in await eng.store.decisions(G):
        assert len(d.key) == 64 and "kath" not in d.key and "conv" not in d.key


async def test_removing_b_leaves_no_trace_of_b():
    eng, a, b = await _two_episodes()
    await eng.remove_episode(G, b)
    text = _dump(eng)
    assert "kathy" not in text and B_LINE.lower() not in text and "tea" not in text
    assert await _decisions_of(eng, b) == []
    assert await eng.store.get_episode(G, b) is None  # the text the review job reads is gone
    [x] = await eng.store.find_entities(G, ["Katherine"])
    assert (x.name, x.aliases, x.alias_sources) == ("Katherine", [], {})
    [f] = await eng.facts(G)
    assert (f.text, f.episodes) == ("Katherine works at Acme", [a])


async def test_removing_a_keeps_the_entity_under_bs_name():
    eng, a, b = await _two_episodes()
    await eng.remove_episode(G, a)
    text = _dump(eng)
    assert "katherine" not in text and A_LINE.lower() not in text
    [x] = await eng.store.find_entities(G, ["Kathy"])
    assert (x.name, x.aliases, x.name_sources) == ("Kathy", [], [b])
    assert sorted((f.text, f.source, f.episodes == [b]) for f in await eng.facts(G)) == [
        ("Kathy likes Tea", "Kathy", True), ("Kathy works at Acme", "Kathy", True)]  # B's words now
    # only A's decisions that a survivor reads its confidence from stay (ids, numbers, a digest)
    kept = await _decisions_of(eng, a)
    assert kept and {d.kind for d in kept} == {"entity_match"}
    assert x.match_root in {d.root for d in kept}
    assert all(f.confidence is not None for f in await eng.facts(G))


async def test_removing_both_leaves_nothing():
    eng, a, b = await _two_episodes()
    await eng.remove_episode(G, a)
    await eng.remove_episode(G, b)
    g = eng.store.groups[G]
    assert (g.entities, g.facts, g.episodes, g.decisions) == ({}, {}, {}, [])
    assert _dump(eng).strip() == ""


async def test_clear_removes_decisions_and_names():
    eng, _, _ = await _two_episodes()
    await eng.clear(G)
    assert G not in eng.store.groups and _dump(eng) == ""
    assert await eng.store.decisions(G) == []


async def test_a_merge_carries_name_sources_and_erase_still_finds_them():
    llm = FakeLLM({"extract": [facts(("Alice", "works at", "Acme", ["L1"])),
                               facts(("Alicia", "lives in", "Rome", ["L1"]))],
                   "match": [{"decisions": [{"id": "n1", "answer": "inconclusive", "candidate": None,
                                             "certainty": "low"}]}],
                   "review": [{"answer": "same", "candidate": "c1", "certainty": "high"}],
                   "dup_facts": lambda r: {"decisions": []}})
    eng = staged(llm, same_above=0.99, new_below=0.6)
    await eng.add_episode(G, episode("e1", [("Sam", "Alice works at Acme.")]))
    b = await eng.add_episode(G, episode("e2", [("Sam", "Alicia lives in Rome now.")], T0 + DAY))
    await eng.maintain(G, budget=2)
    [x] = await eng.store.find_entities(G, ["Alice"])
    assert x.alias_sources == {"Alicia": [b.engine_episode_id]}
    await eng.remove_episode(G, b.engine_episode_id)
    assert "alicia" not in _dump(eng) and "rome" not in _dump(eng)
    assert await _decisions_of(eng, b.engine_episode_id) == []  # the review decision went with its chain


def test_an_alias_needs_a_source():
    e = StoredEntity(id="x", name="Katherine")
    assert not e.add_name("Kathy", []) and e.aliases == []
    assert e.add_name("Kathy", ["ep1"]) and e.alias_sources == {"Kathy": ["ep1"]}
    assert not e.add_name("katherine", [])  # its own name, no source: nothing
    e.forget_episode("ep1")
    assert e.aliases == [] and e.alias_sources == {}
