"""Staged engine maintenance (review of low-confidence entity matches, duplicate facts), the
worker's idle-only rule, and the JSON client."""

from __future__ import annotations

import json
from datetime import timedelta

import httpx

from memory_service.engine.staged import FakeLLM, LLMConfig, OpenAICompatibleLLM
from memory_service.engine.staged import confidence as conf
from memory_service.engine.staged.llm import LLMRequest
from memory_service.engine.staged.types import Decision
from memory_service.services import worker
from memory_service.services.port import MemoryPort
from memory_service.textutil import group_id
from tests.helpers import T0 as SEED_T0
from tests.helpers import USER_A, make_deps, seed
from tests.staged_helpers import T0, G, episode, facts, rule_llm, staged

DAY = timedelta(days=1)
INCONCLUSIVE = {"decisions": [{"id": "n1", "answer": "inconclusive", "candidate": None, "certainty": "low"}]}


async def _uncertain_alicia(review: list, **settings):
    llm = FakeLLM({"extract": [facts(("Alice", "works at", "Acme", ["L1"])),
                               facts(("Alicia", "lives in", "Rome", ["L1"]))],
                   "match": [INCONCLUSIVE], "review": review,
                   "dup_facts": lambda r: {"decisions": []}})
    eng = staged(llm, same_above=0.99, new_below=0.6, **settings)
    await eng.add_episode(G, episode("e1", [("Sam", "Alice works at Acme.")]))
    await eng.add_episode(G, episode("e2", [("Sam", "Alicia lives in Rome now, she said.")], T0 + DAY))
    return eng, llm


async def test_review_picks_the_low_confidence_match_by_query_and_merges_it():
    eng, llm = await _uncertain_alicia([{"answer": "same", "candidate": "c1", "certainty": "high"}])
    [old] = await eng.store.review_queue(G, eng.cfg.review_below, 5)
    alice = (await eng.store.find_entities(G, ["Alice"]))[0]
    [rome] = [f for f in await eng.facts(G) if f.target == "Rome"]
    assert rome.confidence == conf.MODEL_INCONCLUSIVE

    rep = await eng.maintain(G, budget=3)
    assert (rep.entities_reviewed, rep.entities_merged, rep.llm_calls) == (1, 1, 1)
    assert "Alicia lives in Rome now, she said." in llm.prompts("review")[0]  # the deeper look has the lines
    [rome] = [f for f in await eng.facts(G) if f.target == "Rome"]
    assert rome.source_entity_id == alice.id and rome.source == "Alicia"  # re-pointed, name kept
    # follows the new decision (the fact was not rewritten); Rome's own rule-new score caps it
    assert rome.confidence == min(conf.REVIEW_DECIDED, conf.similar_new(0.5, 0.6))
    assert await eng.store.get_entity(G, old.subject_id) is None
    assert "Alicia" in (await eng.store.get_entity(G, alice.id)).aliases
    chain = [d for d in await eng.store.decisions(G) if d.root == old.root]
    assert [(d.outcome, d.decided_by, d.deep, d.supersedes) for d in chain] == [
        ("inconclusive", "model", False, None), ("same", "model", True, old.id)]  # old one kept
    assert await eng.store.review_queue(G, eng.cfg.review_below, 5) == []


async def test_review_distinct_and_inconclusive_are_not_asked_again():
    eng, llm = await _uncertain_alicia([{"answer": "distinct", "candidate": None, "certainty": "high"}])
    await eng.maintain(G, budget=3)
    await eng.maintain(G, budget=3)
    assert llm.meter.calls("review") == 1
    roots = [d.root for d in await eng.store.decisions(G, "entity_match") if d.outcome == "inconclusive"]
    [cur] = (await eng.store.current_decisions(G, roots)).values()
    assert (cur.outcome, cur.confidence, cur.deep) == ("new", conf.REVIEW_DECIDED, True)

    eng, llm = await _uncertain_alicia([{"answer": "inconclusive", "candidate": None, "certainty": "low"}])
    await eng.maintain(G, budget=3)
    await eng.maintain(G, budget=3)
    assert llm.meter.calls("review") == 1


async def test_a_human_decision_wins_and_is_never_reviewed():
    eng, llm = await _uncertain_alicia([])
    [old] = await eng.store.review_queue(G, eng.cfg.review_below, 5)
    await eng.store.add_decision(G, Decision(
        id="h1", kind="entity_match", key=old.key, subject_id=old.subject_id, outcome="new", confidence=0.2,
        decided_by="human", candidates=old.candidates, root=old.root, supersedes=old.id))
    rep = await eng.maintain(G, budget=3)
    assert rep.entities_reviewed == 0 and llm.meter.calls("review") == 0


async def test_duplicate_facts_are_merged_by_model_and_by_rule_and_recorded():
    llm = FakeLLM({"extract": [facts(("Alice", "works at", "Acme", ["L1"])),
                               facts(("Alice", "works at", "Acme Corp", ["L1"])),
                               facts(("Alicia", "works at", "Acme", ["L1"]))],
                   "reconcile": [{"decisions": [{"id": "f0", "answer": "new", "known_ids": [],
                                                 "certainty": "high"}]}],
                   "match": [INCONCLUSIVE],
                   "review": [{"answer": "same", "candidate": "c1", "certainty": "high"}],
                   "dup_facts": [{"decisions": [{"id": "p1", "same": True}]}]})
    eng = staged(llm, same_above=0.99, new_below=0.65, dup_above=0.75)
    r1 = await eng.add_episode(G, episode("e1", [("Sam", "a")]))
    r2 = await eng.add_episode(G, episode("e2", [("Sam", "b")], T0 + DAY))
    await eng.add_episode(G, episode("e3", [("Sam", "c")], T0 + 2 * DAY))
    assert len(await eng.facts(G)) == 3

    rep = await eng.maintain(G, budget=5)
    assert (rep.entities_merged, rep.facts_merged, llm.meter.calls("dup_facts")) == (1, 2, 1)
    [kept] = await eng.facts(G)
    assert kept.engine_id == r1.facts[0].engine_id  # the older one stays
    assert set(kept.episodes) >= {r1.engine_episode_id, r2.engine_episode_id}
    merges = [d for d in await eng.store.decisions(G, "fact_reconcile") if d.key.startswith("pair|")]
    assert sorted(d.decided_by for d in merges) == ["model", "rule"]
    assert all(d.outcome == "duplicate" and d.target_ids == [kept.engine_id] for d in merges)


async def test_maintain_inline_runs_after_each_episode():
    eng, llm = await _uncertain_alicia([{"answer": "same", "candidate": "c1", "certainty": "high"}],
                                       maintain_inline=True)
    assert llm.meter.calls("review") == 1
    assert len({f.source_entity_id for f in await eng.facts(G)}) == 1


class _Counting:
    def __init__(self, engine) -> None:
        self.engine, self.calls = engine, 0

    def __getattr__(self, name):
        return getattr(self.engine, name)

    async def maintain(self, group, budget):
        self.calls += 1
        return await self.engine.maintain(group, budget)


async def test_worker_runs_maintenance_only_on_an_idle_tick():
    engine = _Counting(staged(rule_llm()))
    deps = make_deps(engine=engine, maintain_budget=2)
    port = MemoryPort(deps)
    seed(deps, USER_A, "c1", SEED_T0, [("S1", "Alice works at Acme.")])
    await worker.tick(deps, extra_users=(USER_A,))
    assert engine.calls == 0  # there was conversation work
    assert len(await port.queue(USER_A)) == 1
    await worker.tick(deps)
    assert engine.calls == 1  # nothing to do: maintenance
    seed(deps, USER_A, "c2", SEED_T0 + DAY, [("S1", "Dana likes Jazz.")])
    await worker.tick(deps)
    assert engine.calls == 1
    assert len(await engine.facts(group_id(USER_A))) == 2


async def test_worker_skips_engines_without_maintain_and_a_zero_budget():
    deps = make_deps(maintain_budget=2)  # FakeEngine: no maintain
    assert await worker.maintain_idle(deps, [USER_A]) == 0
    engine = _Counting(staged(rule_llm()))
    assert await worker.maintain_idle(make_deps(engine=engine, maintain_budget=0), [USER_A]) == 0
    assert engine.calls == 0


async def test_json_client_sends_schema_and_extra_body_and_counts_usage():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok": true}'}}],
                                         "usage": {"prompt_tokens": 120, "completion_tokens": 7}})

    extra = '{"chat_template_kwargs": {"enable_thinking": false}}'
    cfg = LLMConfig.from_env({"MEMORY_LLM_BASE_URL": "http://llm.test/v1", "MEMORY_LLM_MODEL": "qwen",
                              "MEMORY_LLM_EXTRA_BODY": extra})
    llm = OpenAICompatibleLLM(cfg, http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    out = await llm.ask(LLMRequest(stage="extract", prompt="p", schema_name="x", schema={"type": "object"}))
    assert out == {"ok": True}
    assert seen["chat_template_kwargs"] == {"enable_thinking": False}
    assert seen["response_format"]["type"] == "json_schema"
    assert seen["response_format"]["json_schema"]["schema"] == {"type": "object"}
    c = llm.meter.stages["extract"]
    assert (c.calls, c.input_tokens, c.output_tokens, c.failures) == (1, 120, 7, 0)


def test_confidence_bands_and_mappings():
    assert conf.bands([0.1, 0.39, 0.4, 0.59, 0.6, 0.79, 0.8, 1.0]) == {
        "<0.4": 2, "0.4-0.6": 2, "0.6-0.8": 2, ">=0.8": 2}
    assert conf.similar_same(0.95, 0.95) == conf.SIMILAR_SAME_FLOOR and conf.similar_same(1.0, 0.95) == 1.0
    assert conf.similar_new(None, 0.8) == 1.0 and conf.similar_new(0.8, 0.8) == conf.SIMILAR_NEW_FLOOR
    assert conf.model_answer({"certainty": "low"}, 0.75) == conf.CERTAINTY["low"]
    assert conf.model_answer({}, 0.75) == 0.75
