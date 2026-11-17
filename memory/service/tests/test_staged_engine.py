"""The staged engine, stage by stage, with FakeLLM + MemoryGraphStore (no network)."""

from __future__ import annotations

from datetime import timedelta

from memory_service.engine.staged import FakeLLM
from memory_service.engine.staged import confidence as conf
from memory_service.models import Statement
from tests.staged_helpers import T0, G, episode, facts, rule_extract, rule_llm, rule_reconcile, staged

DAY = timedelta(days=1)


def _no_line_text(prompts: list[str], ep) -> bool:
    return all(ln.text not in p for p in prompts for ln in ep.lines)


async def test_one_extract_call_per_chunk_and_lines_never_reach_later_stages():
    llm = rule_llm()
    eng = staged(llm, chunk_chars=120, new_below=0.3)  # small chunks; most names are "unclear"
    first = episode("e1", [("Owner", "Okay so, Alice works at Acme, right."),
                           ("Sam", "Yes and Dana likes Jazz a lot these days."),
                           ("Owner", "And Bob lives in Paris since spring, I think.")])
    await eng.add_episode(G, first)
    assert llm.meter.calls("extract") == 3  # one line per chunk at this budget
    later = episode("e2", [("Owner", "Well, Alice works at Initech now, she told me."),
                           ("Sam", "And Alise likes Jazz too, funnily enough.")], T0 + DAY)
    await eng.add_episode(G, later)
    joined = "\n".join(llm.prompts("extract"))
    for ln in [*first.lines, *later.lines]:
        assert joined.count(ln.text) == 1  # every line read exactly once, never re-sent
    assert llm.meter.calls("match") >= 1 and llm.meter.calls("reconcile") >= 1
    assert _no_line_text(llm.prompts("match") + llm.prompts("reconcile"), later)
    assert _no_line_text(llm.prompts("match") + llm.prompts("reconcile"), first)


async def test_exact_name_match_needs_no_model_call():
    llm = FakeLLM({"extract": [facts(("Alice", "works at", "Acme", ["L1"])),
                               facts(("Alice", "likes", "Acme", ["L1"]))],
                   "reconcile": rule_reconcile})
    eng = staged(llm)
    await eng.add_episode(G, episode("e1", [("Sam", "Alice works at Acme.")]))
    await eng.add_episode(G, episode("e2", [("Sam", "Alice likes Acme.")], T0 + DAY))
    assert llm.meter.calls("match") == 0
    assert len({f.source_entity_id for f in await eng.facts(G)}) == 1
    assert eng.tally["entities_same_by_rule"] == 2


async def test_unclear_entities_go_to_the_model_in_one_call():
    llm = FakeLLM({"extract": [facts(("Alice", "works at", "Acme", ["L1"]),
                                     ("Robert", "likes", "Jazz", ["L1"])),
                               facts(("Alicia", "works at", "Acmee", ["L1"]),
                                     ("Roberto", "likes", "Jazz", ["L1"]))],
                   "match": [lambda r: {"decisions": [
                       {"id": it["id"], "answer": "same", "candidate": "c1", "certainty": "high"}
                       for it in r.payload]}],
                   "reconcile": rule_reconcile})
    eng = staged(llm, same_above=0.99, new_below=0.5)
    await eng.add_episode(G, episode("e1", [("Sam", "x")]))
    await eng.add_episode(G, episode("e2", [("Sam", "y")], T0 + DAY))
    assert llm.meter.calls("match") == 1
    [req] = [r for r in llm.requests if r.stage == "match"]
    assert sorted(it["name"] for it in req.payload) == ["Acmee", "Alicia", "Roberto"]
    assert eng.tally["entities_same_by_model"] == 3


async def test_inconclusive_creates_new_entity_with_low_confidence_decision():
    llm = FakeLLM({"extract": [facts(("Alice", "works at", "Acme", ["L1"])),
                               facts(("Alicia", "lives in", "Rome", ["L1"]))],
                   "match": [{"decisions": [{"id": "n1", "answer": "inconclusive", "candidate": None,
                                             "certainty": "low"}]}]})
    eng = staged(llm, same_above=0.99, new_below=0.6)
    await eng.add_episode(G, episode("e1", [("Sam", "x")]))
    await eng.add_episode(G, episode("e2", [("Sam", "y")], T0 + DAY))
    alice = (await eng.store.find_entities(G, ["Alice"]))[0]
    alicia = (await eng.store.find_entities(G, ["Alicia"]))[0]
    assert alicia.id != alice.id  # a new entity now, no extra call
    queue = await eng.store.review_queue(G, eng.cfg.review_below, 10)
    assert [(d.subject_id, d.outcome, d.confidence, d.decided_by) for d in queue] == [
        (alicia.id, "inconclusive", conf.MODEL_INCONCLUSIVE, "model")]
    assert alice.id in queue[0].candidates
    [rome] = [f for f in await eng.facts(G) if f.target == "Rome"]
    assert rome.confidence == conf.MODEL_INCONCLUSIVE  # the fact follows its subject's decision


async def test_identical_signature_is_a_duplicate_without_a_model_call():
    llm = FakeLLM({"extract": rule_extract})
    eng = staged(llm)
    r1 = await eng.add_episode(G, episode("e1", [("Sam", "Alice works at Acme.")]))
    r2 = await eng.add_episode(G, episode("e2", [("Sam", "Alice works at Acme.")], T0 + DAY))
    assert llm.meter.calls("reconcile") == llm.meter.calls("match") == 0
    [f] = await eng.facts(G)
    assert r2.facts[0].engine_id == r1.facts[0].engine_id == f.engine_id
    assert f.episodes == [r1.engine_episode_id, r2.engine_episode_id]
    assert eng.tally["facts_duplicate_by_rule"] == 1


def _three_facts_script(mode_calls: list[int]):
    def answer(req):
        mode_calls.append(len(req.payload))
        return {"decisions": [
            {"id": it["id"], "certainty": "high",
             **({"answer": "contradicts", "known_ids": ["k1"]} if it["relation"] == "works at" else
                {"answer": "duplicate", "known_ids": ["k1"]} if it["object"] == "Jazz" else
                {"answer": "new", "known_ids": []})} for it in req.payload]}
    return answer


async def _three_facts(mode: str) -> tuple[list, list[int], list[str]]:
    sizes: list[int] = []
    llm = FakeLLM({"extract": [facts(("Alice", "works at", "Acme", ["L1"]),
                                     ("Alice", "likes", "Jazz", ["L1"])),
                               facts(("Alice", "works at", "Initech", ["L1"]),
                                     ("Alice", "enjoys", "Jazz", ["L1"]),
                                     ("Alice", "plays", "Chess", ["L1"]))],
                   "reconcile": _three_facts_script(sizes)})
    eng = staged(llm, fact_reconcile=mode, fact_top_k=1)
    await eng.add_episode(G, episode("e1", [("Sam", "x")]))
    res = await eng.add_episode(G, episode("e2", [("Sam", "y")], T0 + DAY))
    state = sorted((f.text, f.closed, len(f.episodes)) for f in await eng.facts(G))
    return state, sizes, res.closed


async def test_collection_is_one_call_and_per_fact_one_call_each_with_the_same_outcome():
    coll_state, coll_sizes, coll_closed = await _three_facts("collection")
    per_state, per_sizes, per_closed = await _three_facts("per_fact")
    assert coll_sizes == [3] and per_sizes == [1, 1, 1]
    assert coll_state == per_state
    assert len(coll_closed) == len(per_closed) == 1


async def test_contradiction_closes_the_old_fact_at_the_new_valid_at():
    llm = FakeLLM({"extract": [facts(("Alice", "works at", "Acme", ["L1"])),
                               facts(("Alice", "works at", "Initech", ["L1"], {"valid_from": "2024-03-01"}))],
                   "reconcile": rule_reconcile})
    eng = staged(llm)
    r1 = await eng.add_episode(G, episode("e1", [("Sam", "x")]))
    r2 = await eng.add_episode(G, episode("e2", [("Sam", "y")], T0 + DAY))
    old = await eng.get_fact(G, r1.facts[0].engine_id)
    assert r2.closed == [old.engine_id]
    assert old.invalid_at is not None and old.invalid_at.date().isoformat() == "2024-03-01"
    assert not r2.facts[0].closed


async def test_contradiction_without_dates_uses_the_line_time():
    llm = FakeLLM({"extract": rule_extract, "reconcile": rule_reconcile})
    eng = staged(llm)
    r1 = await eng.add_episode(G, episode("e1", [("Sam", "Bob lives in Paris.")]))
    r2 = await eng.add_episode(G, episode("e2", [("Sam", "Bob lives in Lyon.")], T0 + DAY))
    old = await eng.get_fact(G, r1.facts[0].engine_id)
    assert r2.closed == [old.engine_id] and old.invalid_at == T0 + DAY


async def test_a_human_fact_is_never_closed_by_a_machine_decision():
    llm = FakeLLM({"extract": rule_extract, "reconcile": rule_reconcile})
    eng = staged(llm)
    human = await eng.assert_fact(G, Statement(subject="Carol", relation="lives in", object="Lyon"), T0)
    res = await eng.add_episode(G, episode("e1", [("Sam", "Carol lives in Paris.")], T0 + DAY))
    assert llm.meter.calls("reconcile") == 1  # the model said "contradicts" the human fact
    assert res.closed == []
    assert not (await eng.get_fact(G, human.engine_id)).closed


async def test_hints_carry_the_line_refs_and_a_quote_from_the_line():
    llm = FakeLLM({"extract": [facts(("Alice", "works at", "Acme", ["L2"], {"quote": "works at Acme"}),
                                     ("Dana", "likes", "Jazz", ["L1", "L9"], {"quote": "made up words"}))]})
    eng = staged(llm)
    ep = episode("e1", [("Sam", "Dana likes Jazz."), ("Owner", "Alice works at Acme now.")])
    res = await eng.add_episode(G, ep)
    by = {f.text: f for f in res.facts}
    [h] = by["Alice works at Acme"].hints
    assert (h.recordingId, h.range.start, h.range.end, h.transcriptRevision, h.quote) == (
        "rec-e1", ep.lines[1].start, ep.lines[1].end, "final-1", "works at Acme")
    [h] = by["Dana likes Jazz"].hints  # L9 is not in the episode; the made-up quote is not used
    assert (h.range.start, h.quote) == (ep.lines[0].start, ep.lines[0].text)


async def test_facts_without_a_line_are_dropped():
    llm = FakeLLM({"extract": [facts(("Alice", "works at", "Acme", ["L7"]))]})
    eng = staged(llm)
    res = await eng.add_episode(G, episode("e1", [("Sam", "Alice works at Acme.")]))
    assert res.facts == [] and eng.tally["facts_dropped_no_line"] == 1


async def test_min_confidence_filters_facts_and_search_but_not_lookups():
    llm = FakeLLM({"extract": [facts(("Alice", "works at", "Acme", ["L1"])),
                               facts(("Alicia", "lives in", "Rome", ["L1"]))],
                   "match": [{"decisions": [{"id": "n1", "answer": "inconclusive", "candidate": None,
                                             "certainty": "low"}]}]})
    eng = staged(llm, same_above=0.99, new_below=0.6, min_confidence=0.5)
    await eng.add_episode(G, episode("e1", [("Sam", "x")]))
    res = await eng.add_episode(G, episode("e2", [("Sam", "y")], T0 + DAY))
    assert [f.target for f in await eng.facts(G)] == ["Acme"]
    assert await eng.search(G, "Alicia Rome", 5) == []
    assert (await eng.get_fact(G, res.facts[0].engine_id)).target == "Rome"


async def test_every_entity_match_and_fact_is_a_decision_record():
    llm = FakeLLM({"extract": rule_extract})
    eng = staged(llm)
    await eng.add_episode(G, episode("e1", [("Sam", "Alice works at Acme.")]))
    decs = await eng.store.decisions(G)
    assert sorted((d.kind, d.outcome, d.decided_by, d.confidence) for d in decs) == [
        ("entity_match", "new", "rule", 1.0), ("entity_match", "new", "rule", 1.0),
        ("fact_reconcile", "new", "rule", 1.0)]
    assert all(d.policy_version == conf.POLICY_VERSION and d.root == d.id for d in decs)
