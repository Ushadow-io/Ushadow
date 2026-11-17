"""The word list: a person says that a name and its other names are ONE entity."""

import httpx

from memory_service.config import Settings
from memory_service.engine.staged import FakeLLM
from memory_service.main import create_app
from memory_service.models import KnownEntityRequest
from memory_service.services.port import MemoryPort
from memory_service.textutil import group_id
from tests.helpers import T0, USER_A, USER_B, make_deps, seed
from tests.staged_helpers import G, episode, facts, rule_match, rule_reconcile, staged


def _says(*items):
    """A fake model that answers each extract call with the next item of `items`."""
    answers = iter(items)
    return FakeLLM({"extract": lambda req: next(answers), "match": rule_match, "reconcile": rule_reconcile})


async def _names(engine, group=G):
    out = {}
    for f in await engine.store.all_facts(group):
        for i in (f.source_id, f.target_id):
            e = await engine.store.get_entity(group, i)
            out[e.name] = sorted(e.aliases)
    return out


async def test_a_later_episode_that_says_an_alias_joins_the_known_entity_by_rule():
    engine = staged(_says(facts(("Dana", "uses", "the mill", ["L1"]))))
    known = await engine.name_entity(G, "Mill One", ["the mill", "millone"], "Organization")
    res = await engine.add_episode(G, episode("a", [("Owner", "Dana uses the mill.")]))
    assert res.facts[0].target_entity_id == known.engine_id
    assert engine.tally["entities_same_by_rule"] == 1 and engine.llm.meter.as_dict().get("match") is None
    assert (await _names(engine))["Mill One"] == ["millone", "the mill"]


async def test_entities_that_exist_under_the_names_are_merged_and_renamed():
    engine = staged(_says(facts(("Dana", "uses", "the mill", ["L1"])),
                          facts(("Kim", "likes", "Millone", ["L1"]))))
    await engine.add_episode(G, episode("a", [("Owner", "Dana uses the mill.")]))
    await engine.add_episode(G, episode("b", [("Owner", "Kim likes Millone.")]))
    assert {"the mill", "Millone"} <= set(await _names(engine))
    known = await engine.name_entity(G, "Mill One", ["the mill", "Millone"])
    names = await _names(engine)
    assert names["Mill One"] == ["Millone", "the mill"] and "the mill" not in names
    about = await engine.entity_facts(G, known.engine_id)
    assert sorted(f.source for f in about) == ["Dana", "Kim"]
    e = await engine.store.get_entity(G, known.engine_id)
    head = (await engine.store.current_decisions(G, [e.match_root]))[e.match_root]
    assert (head.decided_by, head.confidence, head.subject_id) == ("human", 1.0, e.id)


async def test_naming_two_times_changes_nothing_and_writes_no_new_decision():
    engine = staged(_says(facts(("Dana", "uses", "the mill", ["L1"]))))
    await engine.add_episode(G, episode("a", [("Owner", "Dana uses the mill.")]))
    first = await engine.name_entity(G, "Mill One", ["the mill"])
    before = engine.dump()
    assert (await engine.name_entity(G, "Mill One", ["the mill"])).engine_id == first.engine_id
    assert engine.dump() == before


async def test_a_known_name_stays_after_the_only_episode_that_said_it_is_removed():
    engine = staged(_says(facts(("Dana", "uses", "the mill", ["L1"])),
                          facts(("Kim", "likes", "millone", ["L1"]))))
    known = await engine.name_entity(G, "Mill One", ["the mill", "millone"])
    res = await engine.add_episode(G, episode("a", [("Owner", "Dana uses the mill.")]))
    await engine.remove_episode(G, res.engine_episode_id)
    e = await engine.store.get_entity(G, known.engine_id)
    assert e is not None and e.name == "Mill One" and sorted(e.aliases) == ["millone", "the mill"]
    again = await engine.add_episode(G, episode("b", [("Owner", "Kim likes millone.")]))
    assert again.facts[0].target_entity_id == known.engine_id


async def test_the_list_is_kept_by_the_service_and_applied_again_after_a_rebuild():
    deps = make_deps(engine=staged(_says(facts(("Dana", "uses", "the mill", ["L1"])),
                                         facts(("Dana", "uses", "the mill", ["L1"])))))
    port = MemoryPort(deps)
    seed(deps, USER_A, "c1", T0, [("S0", "Dana uses the mill.")])
    await port.sync(USER_A)
    await port.run_pending(USER_A)
    entry = await port.name_entity(KnownEntityRequest(user_id=USER_A, name="Mill One",
                                                      aliases=["the mill", " millone "]))
    assert (entry.name, entry.aliases) == ("Mill One", ["millone", "the mill"])
    assert (await _names(deps.engine, group_id(USER_A)))["Mill One"] == ["millone", "the mill"]
    await port.rebuild(USER_A)
    assert (await _names(deps.engine, group_id(USER_A)))["Mill One"] == ["millone", "the mill"]
    assert [k.name for k in await port.known_entities(USER_A)] == ["Mill One"]
    assert await port.known_entities(USER_B) == []  # one user's list is not another user's


async def test_a_new_entry_for_the_same_name_replaces_the_old_one_and_remove_takes_it_off():
    port = MemoryPort(make_deps(engine=staged()))
    await port.name_entity(KnownEntityRequest(user_id=USER_A, name="Mill One", aliases=["m1"]))
    await port.name_entity(KnownEntityRequest(user_id=USER_A, name="mill one", aliases=["m1", "millone"]))
    listed = [(k.name, k.aliases) for k in await port.known_entities(USER_A)]
    assert listed == [("mill one", ["m1", "millone"])]
    assert await port.unname_entity(USER_A, "Mill One") is True
    assert await port.known_entities(USER_A) == [] and await port.unname_entity(USER_A, "Mill One") is False


async def test_an_engine_without_the_extra_keeps_the_list_and_does_not_fail():
    port = MemoryPort(make_deps())  # the fake engine cannot name entities
    await port.name_entity(KnownEntityRequest(user_id=USER_A, name="Mill One", aliases=["m1"]))
    assert [k.name for k in await port.known_entities(USER_A)] == ["Mill One"]


async def test_the_word_list_over_http():
    app = create_app(Settings(memory_token="t", store="memory", engine="fake"), make_deps(engine=staged()))
    hdr = {"Authorization": "Bearer t"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://memory") as http:
        entry = {"userId": USER_A, "name": "Mill One"}
        assert (await http.post("/known-entities", json=entry)).status_code == 401
        r = await http.post("/known-entities", headers=hdr, json={
            "userId": USER_A, "name": "Mill One", "aliases": ["millone"], "type": "Organization"})
        assert r.status_code == 200 and r.json()["aliases"] == ["millone"]
        r = await http.get(f"/known-entities?userId={USER_A}", headers=hdr)
        assert [e["name"] for e in r.json()["entities"]] == ["Mill One"]
        gone = {"userId": USER_A, "name": "Mill One"}
        assert (await http.post("/known-entities/remove", headers=hdr, json=gone)).json() == {"removed": True}
        assert (await http.post("/known-entities/remove", headers=hdr, json=gone)).status_code == 404
