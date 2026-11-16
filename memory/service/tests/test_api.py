"""HTTP: auth is required and fails closed; the port works over HTTP; ledger calls carry a token."""

from __future__ import annotations

import httpx
import pytest

from memory_service.config import Settings
from memory_service.ledger_client import HttpLedgerClient
from memory_service.main import create_app
from tests.helpers import T0, USER_A, make_deps, seed

TOKEN = "test-token-123"
PROTECTED = [("GET", "/search?userId=u&q=x"), ("GET", "/queue?userId=u"), ("POST", "/forget"),
             ("POST", "/erase"), ("POST", "/rebuild"), ("POST", "/ingest"),
             ("GET", "/entities/ent_x?userId=u")]


def client(token: str, deps=None) -> httpx.AsyncClient:
    app = create_app(Settings(memory_token=token, store="memory", engine="fake"), deps or make_deps())
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://memory")


@pytest.mark.parametrize(("method", "path"), PROTECTED)
async def test_missing_and_wrong_token_are_401(method, path):
    async with client(TOKEN) as http:
        assert (await http.request(method, path, json={})).status_code == 401
        bad = {"Authorization": "Bearer nope"}
        assert (await http.request(method, path, json={}, headers=bad)).status_code == 401
        basic = {"Authorization": f"Basic {TOKEN}"}
        assert (await http.request(method, path, json={}, headers=basic)).status_code == 401


@pytest.mark.parametrize(("method", "path"), PROTECTED)
async def test_unset_token_is_503_but_health_is_200(method, path):
    async with client("") as http:
        assert (await http.get("/health")).status_code == 200
        hdr = {"Authorization": "Bearer anything"}
        assert (await http.request(method, path, json={}, headers=hdr)).status_code == 503


async def test_right_token_runs_the_port_over_http():
    deps = make_deps()
    conv = seed(deps, USER_A, "c1", T0, [("S0", "Alice works at Acme."), ("S0", "I will call Bob.")])
    hdr = {"Authorization": f"Bearer {TOKEN}"}
    async with client(TOKEN, deps) as http:
        r = await http.post("/ingest", headers=hdr, json={
            "userId": USER_A, "conversation": conv.model_dump(mode="json", exclude_none=True)})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "done" and r.json()["factsWritten"] == 1

        r = await http.get("/search", headers=hdr, params={"userId": USER_A, "q": "Alice call"})
        facts = r.json()["facts"]
        assert sorted(f["kind"] for f in facts) == ["action", "knowledge"]
        assert all(f["evidence"][0]["quote"] for f in facts)

        r = await http.get("/search", headers=hdr, params={"userId": "someone-else", "q": "Alice"})
        assert r.json() == {"facts": []}

        kf = next(f for f in facts if f["kind"] == "knowledge")
        r = await http.post("/correct", headers=hdr, json={
            "userId": USER_A, "factId": kf["id"],
            "statement": {"subject": "Alice", "relation": "works at", "object": "Initech"}})
        assert r.status_code == 200 and len(r.json()["decisions"]) == 2
        r = await http.get(f"/entities/{kf['subject']['id']}", headers=hdr, params={"userId": USER_A})
        assert r.status_code in (200, 404)  # the engine entity may be gone after the correction

        r = await http.post("/erase", headers=hdr, json={
            "userId": USER_A, "recordingId": "rec-c1",
            "range": {"start": T0.isoformat(), "end": T0.replace(minute=5).isoformat()}})
        assert r.status_code == 200 and r.json()["actionFactsErased"] == 1

        r = await http.post("/rebuild", headers=hdr, json={"userId": USER_A})
        assert r.status_code == 200 and r.json()["unitsFailed"] == 0
        r = await http.get("/action-facts", headers=hdr, params={"userId": USER_A})
        assert r.json() == {"facts": []}

        r = await http.post("/ingest", headers=hdr, json={
            "userId": USER_A, "conversation": {**conv.model_dump(mode="json", exclude_none=True),
                                               "closedAt": None}})
        assert r.status_code == 409


async def test_ledger_client_sends_bearer_token_and_user():
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, json=[])

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    ledger = HttpLedgerClient("http://ledger:8200", "ledger-secret", http)
    assert await ledger.conversations(USER_A, T0, T0.replace(hour=10)) == []
    assert await ledger.transcripts(USER_A, "rec-1") == []
    assert [r.headers["authorization"] for r in seen] == ["Bearer ledger-secret"] * 2
    assert seen[0].url.params["userId"] == USER_A and seen[1].url.path == "/recordings/rec-1/transcripts"
    with pytest.raises(ValueError):
        HttpLedgerClient("http://ledger:8200", "")


async def test_a_ledger_that_refuses_the_token_is_a_clean_502():
    refuse = httpx.AsyncClient(transport=httpx.MockTransport(
        lambda r: httpx.Response(401, json={"detail": "missing or invalid bearer token"})))
    deps = make_deps(ledger=HttpLedgerClient("http://ledger:8200", "wrong", refuse))
    async with client(TOKEN, deps) as http:
        r = await http.post("/sync", json={"userId": USER_A}, headers={"Authorization": f"Bearer {TOKEN}"})
    assert r.status_code == 502
    assert "ledger answered 401" in r.json()["detail"] and USER_A not in r.text
