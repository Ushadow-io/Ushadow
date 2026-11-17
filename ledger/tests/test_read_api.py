"""L6 read API over HTTP: answers with evidence and gaps, scopes, writes, memory outage."""

from __future__ import annotations

import httpx
import pytest

from ledger.main import create_app
from tests.fixtures.l2_day import USER
from tests.read_api_helpers import auth, env, read_services

DAY = {"start": "2026-11-14T00:00:00Z", "end": "2026-11-15T00:00:00Z"}


@pytest.fixture
async def api(monkeypatch):
    env(monkeypatch)
    services, mem = await read_services()
    app = create_app(db=object(), sweep=False)
    app.state.services = services
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://ledger") as http:
        yield http, mem


async def _get(http, path: str, who: str = "agent", **params):
    return await http.get(f"/v1/{path}", params={"userId": USER, **params}, headers=auth(who))


async def test_default_deny_and_agents_kept_off_internal_routes(api):
    http, _ = api
    assert (await _get(http, "search", "chronicle", q="venue")).status_code == 403
    assert (await _get(http, "search", "bound", q="venue")).status_code == 403
    assert (await http.get("/v1/search", params={"userId": USER, "q": "x"})).status_code == 401
    internal = await http.get("/conversations", params={"userId": USER}, headers=auth("agent"))
    assert internal.status_code == 403
    ok = await http.get("/conversations", params={"userId": USER}, headers=auth("chronicle"))
    assert ok.status_code == 200


async def test_timeline_orders_conversations_and_shows_the_erase_gap(api):
    http, _ = api
    body = (await _get(http, "timeline", **DAY)).json()
    starts = [c["at"] for c in body["conversations"]]
    assert starts == sorted(starts) and len(starts) == 4
    assert all(c["kind"] == "conversation" and "requires" not in c for c in body["conversations"])
    assert [(g["recordingId"], g["cause"]) for g in body["gaps"]] == [("rec-x", "excluded")]
    bad = await _get(http, "timeline", start=DAY["start"])
    assert bad.status_code == 422


async def test_search_merges_facts_and_conversations_with_proof(api):
    http, _ = api
    body = (await _get(http, "search", q="venue", **DAY)).json()
    kinds = {i["kind"] for i in body["items"]}
    assert kinds == {"knowledge", "action", "conversation"}
    fact = next(i for i in body["items"] if i["id"] == "mf_alexjob")
    assert fact["evidence"][0]["recordingId"] == "rec-m" and fact["evidence"][0]["quote"]
    conv = next(i for i in body["items"] if i["kind"] == "conversation")
    assert "venue" in (conv["state"]["topic"] + " ".join(conv["state"]["threads"]) +
                       (conv["text"] or "") + (conv["summary"] or "")).lower()
    assert body["withheld"] == 0 and not body["partial"]
    assert body["gaps"] and body["gaps"][0]["cause"] == "excluded"


async def test_private_fact_withheld_without_the_private_scope(api):
    http, _ = api
    full = (await _get(http, "search", q="venue health")).json()
    assert "act_private" in {i["id"] for i in full["items"]}
    body = (await _get(http, "search", "reader", q="venue health")).json()
    assert "act_private" not in {i["id"] for i in body["items"]}
    assert body["withheld"] == 1
    assert "health" not in str([i["text"] for i in body["items"] if i["kind"] != "conversation"])
    conv = (await _get(http, "search", "convonly", q="venue")).json()
    assert {i["kind"] for i in conv["items"]} == {"conversation"} and conv["withheld"] == 5


async def test_resolve_shows_ambiguity_and_never_picks(api):
    http, _ = api
    body = (await _get(http, "resolve", text="Alex")).json()
    assert [(c["id"], c["match"]) for c in body["candidates"]] == [
        ("ent_alex", "exact"), ("ent_alexs", "partial")]
    assert body["ambiguous"] is True and body["resolved"] is None
    both = (await _get(http, "resolve", text="Alex Smith")).json()
    assert both["ambiguous"] is True and both["resolved"] is None  # "Alex" may be Alex Smith
    one = (await _get(http, "resolve", text="Smith")).json()
    assert one["resolved"] == "ent_alexs" and one["ambiguous"] is False
    hidden = (await _get(http, "resolve", "convonly", text="Alex")).json()
    assert hidden["candidates"] == [] and hidden["withheld"] == 2 and hidden["resolved"] is None


async def test_context_latest_conversations_and_people(api):
    http, _ = api
    body = (await _get(http, "context", now="2026-11-14T09:20:00Z", hours=1)).json()
    assert body["conversations"] and all("Alex" in c["people"] for c in body["conversations"])
    alex = next(p for p in body["people"] if p["id"] == "ent_alex")
    assert [f["id"] for f in alex["facts"]] == ["mf_alexjob"]
    hidden = (await _get(http, "context", "convonly", now="2026-11-14T09:20:00Z")).json()
    assert hidden["people"] == [] and hidden["withheld"] >= 1 and hidden["conversations"]


async def test_brief_entity_and_conversation(api):
    http, _ = api
    body = (await _get(http, "brief", entityId="ent_alex")).json()
    assert body["entity"]["name"] == "Alex" and body["lastTalk"]["kind"] == "conversation"
    assert [i["id"] for i in body["commitmentsByMe"]] == ["act_promise"]
    assert [i["id"] for i in body["commitmentsToMe"]] == ["act_owed"]
    assert [i["id"] for i in body["openTasks"]] == ["act_private"]
    reader = (await _get(http, "brief", "reader", entityId="ent_alex")).json()
    assert reader["openTasks"] == [] and reader["withheld"] == 1
    conv_id = body["conversations"][-1]["id"]
    first = (await _get(http, "timeline", **DAY)).json()["conversations"][0]["id"]
    c = (await _get(http, "brief", conversationId=first)).json()
    assert c["conversation"]["id"] == first and [i["id"] for i in c["commitmentsByMe"]] == [
        "act_promise"]
    assert conv_id
    assert (await _get(http, "brief", entityId="ent_nobody")).status_code == 404
    assert (await _get(http, "brief")).status_code == 422


async def test_why_conversation_and_facts(api):
    http, _ = api
    first = (await _get(http, "timeline", **DAY)).json()["conversations"][0]["id"]
    body = (await _get(http, "why", conversationId=first)).json()
    assert body["item"]["id"] == first and body["steps"]
    assert {s["decidedBy"] for s in body["steps"]} <= {"rule", "model", "human"}
    act = (await _get(http, "why", factId="act_promise")).json()
    assert act["item"]["evidence"][0]["quote"] and act["steps"][0]["decidedBy"] == "model"
    know = (await _get(http, "why", factId="mf_alexjob")).json()
    assert not know["partial"] and know["item"]["evidence"][0]["quote"] == (
        "Alex works at Northwind")
    assert know["steps"][0]["role"] == "asserted"
    private_r = await _get(http, "why", "reader", factId="act_private")
    assert private_r.status_code == 404
    assert "health" not in private_r.text


async def test_correct_and_forget_are_human_decisions_in_scope(api):
    http, mem = api
    fact = {"userId": USER, "fact": {"factId": "mf_alexjob", "statement": {
        "subject": "Alex", "relation": "works at", "object": "Southgate venue"}}}
    assert (await http.post("/v1/correct", json=fact, headers=auth("reader"))).status_code == 403
    r = await http.post("/v1/correct", json=fact, headers=auth("agent"))
    assert r.status_code == 200 and [d["op"] for d in r.json()["decisions"]] == [
        "suppress", "assert"]
    texts = [i["text"] for i in (await _get(http, "search", q="Southgate")).json()["items"]]
    assert texts == ["Alex works at Southgate venue"]
    private = {"userId": USER, "fact": {"factId": "act_private", "retract": True}}
    assert (await http.post("/v1/correct", json=private, headers=auth("writer"))).status_code == 404
    forget = {"userId": USER, "factIds": ["act_owed"]}
    f = await http.post("/v1/forget", json=forget, headers=auth("agent"))
    assert f.status_code == 200 and f.json()["decisions"][0]["op"] == "suppress"
    after = (await _get(http, "search", q="book")).json()["items"]
    assert "act_owed" not in {i["id"] for i in after}
    unknown = {"userId": USER, "factIds": ["zzz_1"]}
    assert (await http.post("/v1/forget", json=unknown, headers=auth("agent"))).status_code == 404
    assert "correct" in mem.calls and "forget" in mem.calls


async def test_correct_conversation_goes_to_the_ledger_as_human(api):
    http, _ = api
    body = {"userId": USER, "conversation": {"kind": "split_at", "fromId": "rec-n",
                                             "at": "2026-11-14T09:13:00Z",
                                             "key": "split:human:rec-n:1"}}
    r = await http.post("/v1/correct", json=body, headers=auth("agent"))
    assert r.status_code == 200, r.text
    assert r.json()["owner"] == "ledger" and r.json()["link"]["decidedBy"] == "human"
    nope = {**body, "conversation": {**body["conversation"], "retracts": "no-such-link"}}
    assert (await http.post("/v1/correct", json=nope, headers=auth("agent"))).status_code == 404


async def test_memory_down_degrades_never_500(api):
    http, mem = api
    mem.down = True
    r = await _get(http, "search", q="venue", **DAY)
    body = r.json()
    assert r.status_code == 200 and body["partial"] is True
    assert body["partialReasons"] == ["memory_unreachable"]
    assert body["items"] and {i["kind"] for i in body["items"]} == {"conversation"}
    ctx = (await _get(http, "context", now="2026-11-14T09:20:00Z")).json()
    assert ctx["partial"] and ctx["conversations"]
    w = await http.post("/v1/forget", json={"userId": USER, "factIds": ["mf_alexjob"]},
                        headers=auth("agent"))
    assert w.status_code == 503 and w.json() == {"detail": "memory is unavailable"}


async def test_why_knowledge_fact_shows_evidence_conversations_and_human_decisions(api):
    http, mem = api
    body = (await _get(http, "why", factId="mf_alexjob")).json()
    assert body["partial"] is False and body["item"]["id"] == "mf_alexjob"
    assert body["item"]["evidence"][0]["recordingId"] == "rec-m"
    assert body["conversations"] and all(c["kind"] == "conversation" for c in body["conversations"])
    ids = {c["id"] for c in body["conversations"]}
    forming = [s for s in body["steps"] if s["conversationId"]]
    assert forming and {s["conversationId"] for s in forming} <= ids
    assert {s["decidedBy"] for s in forming} <= {"rule", "model", "human"}
    assert not [s for s in body["steps"] if s["decidedBy"] == "human"]
    fact = {"userId": USER, "fact": {"factId": "mf_alexjob", "statement": {
        "subject": "Alex", "relation": "works at", "object": "Southgate venue"}}}
    assert (await http.post("/v1/correct", json=fact, headers=auth("agent"))).status_code == 200
    gone = await _get(http, "why", factId="mf_alexjob")
    assert gone.status_code == 404  # the corrected-away fact is not shown
    new_id = next(i for i in mem.facts if i.startswith("mf_human"))
    new = (await _get(http, "why", factId=new_id)).json()
    [human] = [s for s in new["steps"] if s["decidedBy"] == "human" and s["role"] == "corrected"]
    assert human["text"] == "Alex works at Southgate venue" and human["at"]


async def test_why_fact_scope_missing_forgotten_and_memory_down(api):
    http, mem = api
    assert (await _get(http, "why", factId="mf_nothing")).status_code == 404
    out = await _get(http, "why", "convonly", factId="mf_alexjob")
    assert out.status_code == 404 and out.json() == (await _get(http, "why", factId="mf_x")).json()
    assert (await _get(http, "why", "reader", factId="act_private")).status_code == 404
    assert (await _get(http, "why", factId="act_private")).status_code == 200
    await http.post("/v1/forget", json={"userId": USER, "factIds": ["mf_alexsmith"]},
                    headers=auth("agent"))
    assert (await _get(http, "why", factId="mf_alexsmith")).status_code == 404
    mem.down = True
    r = await _get(http, "why", factId="mf_alexjob")
    assert r.status_code == 200 and r.json()["partial"] is True
    assert r.json()["partialReasons"] == ["memory_unreachable"] and r.json()["item"] is None


async def test_search_kinds_as_one_comma_value_equals_repeated_keys(api):
    """The Ushadow proxy keeps one value of a repeated key, so the UI sends kinds=a,b."""
    http, _ = api
    base = {"userId": USER, "q": "venue"}
    repeated = await http.get("/v1/search", headers=auth("agent"),
                              params=[*base.items(), ("kinds", "knowledge"), ("kinds", "action")])
    comma = await http.get("/v1/search", headers=auth("agent"),
                           params={**base, "kinds": "knowledge,action"})
    assert repeated.status_code == 200 and comma.json() == repeated.json()
    assert {i["kind"] for i in comma.json()["items"]} == {"knowledge", "action"}
    bad = await http.get("/v1/search", headers=auth("agent"), params={**base, "kinds": "x,action"})
    assert bad.status_code == 422
