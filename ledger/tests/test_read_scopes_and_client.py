"""The scope book (config, default deny, owner seam) and the HTTP memory client."""

from __future__ import annotations

import json
import logging

import httpx
import pytest

from ledger.clients.memory import (
    FactQuery,
    HttpMemoryClient,
    MemoryRejected,
    MemoryUnavailable,
    action_fact,
)
from ledger.read_models import Item, ItemKind
from ledger.scopes import Principal, load_scope_book, owner_for, principal_kind
from ledger.services.read.gate import allows
from ledger.services.read.views import fact_item

SECRET = "Kim has a hospital visit"


def test_scope_book_from_env_and_file(monkeypatch, tmp_path):
    monkeypatch.delenv("LEDGER_SCOPES", raising=False)
    monkeypatch.delenv("LEDGER_SCOPES_FILE", raising=False)
    assert load_scope_book().principals == {}
    path = tmp_path / "scopes.json"
    path.write_text(json.dumps({"principals": {"ui": {"kinds": ["action:commitment"],
                                                     "sensitivity": ["normal", "private"]}}}))
    monkeypatch.setenv("LEDGER_SCOPES_FILE", str(path))
    scope = load_scope_book().get("ui")
    assert scope is not None and not scope.write and scope.users is None
    commitment = Item(kind=ItemKind.action, subKind="commitment", id="a", sensitivity="private")
    assert allows(scope, commitment)
    assert not allows(scope, commitment.model_copy(update={"subKind": "task"}))
    assert not allows(scope, commitment.model_copy(update={"sensitivity": "health"}))
    assert not allows(scope, commitment.model_copy(update={"requires": ["conversation"]}))
    assert principal_kind("ui", load_scope_book()) == "agent"
    assert principal_kind("chronicle", load_scope_book()) == "service"


def test_invalid_book_denies_everyone(monkeypatch, caplog):
    monkeypatch.setenv("LEDGER_SCOPES", json.dumps({"principals": {"x": {"kinds": ["secrets"]}}}))
    with caplog.at_level(logging.ERROR):
        assert load_scope_book().principals == {}
    assert "secrets" not in caplog.text
    monkeypatch.setenv("LEDGER_SCOPES", "{not json")
    assert load_scope_book().principals == {}


def test_owner_seam():
    service, agent = Principal("chronicle"), Principal("ui", kind="agent")
    assert owner_for(service, "u1") == "u1" and owner_for(agent, "u1") is None
    from ledger.scopes import Scope

    bound = Scope(kinds=frozenset({"*"}), users=frozenset({"u1"}))
    assert owner_for(agent, "u1", bound) == "u1" and owner_for(agent, "u2", bound) is None
    assert owner_for(agent, " ", Scope()) is None


def _client(handler) -> HttpMemoryClient:
    return HttpMemoryClient("http://memory:8210", "mem-token", httpx.MockTransport(handler))


async def test_client_sends_bearer_and_maps_shapes():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/search":
            return httpx.Response(200, json={"facts": [{"id": "mf_1", "userId": "u", "kind":
                                                        "knowledge", "key": "likes", "text": "x",
                                                        "source": "agent", "evidence": [],
                                                        "confidence": 0.5, "heard": "unknown"}]})
        if request.url.path == "/correct":
            return httpx.Response(404, json={"detail": "no such fact"})
        return httpx.Response(200, json={"facts": [{
            "id": "f1", "subject": {"kind": "commitment", "id": "a"}, "key": "promise_made",
            "occurred_at": "2026-11-14T09:00:00Z", "recorded_at": "2026-11-14T09:00:00Z",
            "source": "agent", "value": {"text": "I will call", "direction": "owed_by_me",
                                         "conversation": {"id": "c1", "revision": 2}}}]})

    c = _client(handler)
    facts = await c.search("u", FactQuery(q="hello", kinds=["knowledge"]))
    assert facts[0].id == "mf_1"
    item = fact_item(facts[0])
    assert (item.confidence, item.heard) == (0.5, "unknown")
    assert seen[0].headers["authorization"] == "Bearer mem-token"
    assert seen[0].url.params["userId"] == "u" and seen[0].url.params["kinds"] == "knowledge"
    [a] = await c.action_facts("u")
    assert (a.id, a.kind, a.direction, a.conversationId) == ("act_f1", "action", "owed_by_me", "c1")
    assert await c.correct({"userId": "u", "factId": "mf_x", "retract": True}) is None


@pytest.mark.parametrize("status", [500, 502, 503, 401])
async def test_client_outage_is_a_fixed_reason(status, caplog):
    c = _client(lambda r: httpx.Response(status, json={"detail": SECRET}))
    with caplog.at_level(logging.INFO), pytest.raises(MemoryUnavailable) as exc:
        await c.search("u", FactQuery(q="hospital visit"))
    assert exc.value.reason == f"memory_status_{status}"
    assert SECRET not in caplog.text and "hospital" not in caplog.text


async def test_client_unreachable_and_unconfigured(caplog):
    def boom(request):
        raise httpx.ConnectError("connection refused to " + str(request.url))

    with caplog.at_level(logging.INFO), pytest.raises(MemoryUnavailable) as exc:
        await _client(boom).search("user-secret", FactQuery(q="hospital"))
    assert exc.value.reason == "memory_unreachable"
    assert "user-secret" not in caplog.text and "hospital" not in caplog.text
    with pytest.raises(MemoryUnavailable) as exc:
        await HttpMemoryClient("", "").search("u", FactQuery(q="x"))
    assert exc.value.reason == "memory_not_configured"
    with pytest.raises(MemoryRejected):
        await _client(lambda r: httpx.Response(422, json={})).search("u", FactQuery(q="x"))


def test_action_fact_mapping_defaults():
    f = action_fact({"id": "9", "key": "decision_made", "subject": {"kind": "decision", "id": "d"},
                     "occurred_at": "2026-11-14T09:00:00Z", "source": "person", "value": {}})
    assert f.id == "act_9" and f.sensitivity is None and f.evidence == []


async def test_client_unreadable_answer_is_an_outage():
    c = _client(lambda r: httpx.Response(200, content=b"<html>proxy error</html>"))
    with pytest.raises(MemoryUnavailable) as exc:
        await c.search("u", FactQuery(q="x"))
    assert exc.value.reason == "memory_bad_response"
    shape = _client(lambda r: httpx.Response(200, json={"facts": [{"no": "id"}]}))
    with pytest.raises(MemoryUnavailable):
        await shape.action_facts("u")


async def test_client_fact_and_decisions_routes():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.url.path == "/facts/mf_gone" or request.url.path.startswith("/facts/mf_gone/"):
            return httpx.Response(404, json={"detail": "no such fact"})
        if request.url.path.endswith("/decisions"):
            return httpx.Response(200, json={"decisions": [{
                "id": "dec_1", "factId": "mf_1", "kind": "correct", "by": "person",
                "at": "2026-11-14T10:00:00Z",
                "statement": {"subject": "A", "relation": "likes", "object": "B"}}]})
        return httpx.Response(200, json={"id": "mf_1", "userId": "u", "kind": "knowledge",
                                         "key": "likes", "text": "A likes B", "source": "person",
                                         "evidence": []})

    c = _client(handler)
    assert (await c.fact("u", "mf_1")).text == "A likes B"
    [d] = await c.fact_decisions("u", "mf_1")
    assert (d.kind, d.statement["object"]) == ("correct", "B")
    assert await c.fact("u", "mf_gone") is None and await c.fact_decisions("u", "mf_gone") is None
    assert seen[:2] == ["/facts/mf_1", "/facts/mf_1/decisions"]
    bad = _client(lambda r: httpx.Response(200, json={"decisions": [{"no": "id"}]}))
    with pytest.raises(MemoryUnavailable):
        await bad.fact_decisions("u", "mf_1")


async def test_client_word_list_routes():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path))
        if request.url.path == "/known-entities/remove":
            return httpx.Response(404, json={"detail": "no such known entity"})
        entry = {"id": "dec_1", "name": "Mill One", "aliases": ["millone"], "type": None,
                 "at": "2026-11-14T09:00:00Z"}
        if request.method == "GET":
            return httpx.Response(200, json={"entities": [entry]})
        return httpx.Response(200, json=entry)

    c = _client(handler)
    assert [e.name for e in await c.known_entities("u")] == ["Mill One"]
    made = await c.name_entity({"userId": "u", "name": "Mill One", "aliases": ["millone"]})
    assert (made.id, made.aliases) == ("dec_1", ["millone"])
    assert await c.unname_entity("u", "Mill One") is False
    assert seen == [("GET", "/known-entities"), ("POST", "/known-entities"),
                    ("POST", "/known-entities/remove")]
