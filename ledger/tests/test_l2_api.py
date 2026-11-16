"""HTTP: the L2 routes, the auth rules, and the compare helper."""

from __future__ import annotations

import json

import httpx
import pytest

from ledger.compare import compare_table
from ledger.main import create_app
from tests.conftest import TOKEN
from tests.fixtures.l2_day import USER, l2_day
from tests.l2_helpers import l2_services

DAY = {"start": "2026-11-14T00:00:00Z", "end": "2026-11-15T00:00:00Z"}


@pytest.fixture
async def l2_client(monkeypatch):
    monkeypatch.setenv("LEDGER_TOKEN", TOKEN)
    monkeypatch.setenv("LEDGER_TOKENS", "memory:memory-token-abc")
    app = create_app(db=object(), sweep=False)
    app.state.services = l2_services()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://ledger") as http:
        yield http


def _auth(token: str = TOKEN) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _load_day(http) -> dict:
    body = {"userId": USER, "bundle": json.loads(l2_day().model_dump_json())}
    assert (await http.post("/ingest", json=body, headers=_auth())).status_code == 200
    run = await http.post("/pipeline/run", json={"userId": USER, "range": DAY}, headers=_auth())
    assert run.status_code == 200
    return run.json()


async def test_pipeline_conversations_why_and_stats_over_http(l2_client):
    run = await _load_day(l2_client)
    assert run["conversations"]["created"] == 4 and run["model"]["layers"]["state"]["calls"] > 0

    resp = await l2_client.get("/conversations", params={"userId": USER, **DAY}, headers=_auth())
    views = resp.json()
    assert resp.status_code == 200 and len(views) == 4
    first = views[0]
    assert {"conversation", "fragments", "state"} <= set(first)
    conv = first["conversation"]
    assert {"id", "revision", "range", "parts", "title", "summary", "citations", "closedAt"} <= set(
        conv
    )
    assert first["fragments"][0]["range"] and first["fragments"][0]["recordingId"] == "rec-m"

    why = await l2_client.get(
        f"/conversations/{conv['id']}/why", params={"userId": USER}, headers=_auth()
    )
    assert why.status_code == 200
    roles = {(d["role"], d["source"]) for d in why.json()["decisions"]}
    assert ("closed_by", "model") in roles
    missing = await l2_client.get(
        "/conversations/nope/why", params={"userId": USER}, headers=_auth()
    )
    assert missing.status_code == 404

    stats = (await l2_client.get("/stats", headers=_auth())).json()
    assert stats["layers"]["state"]["calls"] == run["model"]["layers"]["state"]["calls"]
    again = await l2_client.post(
        "/pipeline/run", json={"userId": USER, "range": DAY}, headers=_auth()
    )
    assert again.json()["model"]["layers"] == {}  # no model call on a re-run

    table = compare_table(
        views,
        {
            "date": "2026-11-14",
            "timezone": "UTC",
            "conversations": [
                {
                    "conversationId": "chron-1",
                    "start": "2026-11-14T09:00:00Z",
                    "end": "2026-11-14T09:16:00Z",
                }
            ],
            "episodes": [
                {
                    "episodeId": "ep-1",
                    "start": "2026-11-14T09:00:00Z",
                    "end": "2026-11-14T10:00:00Z",
                    "human": True,
                }
            ],
        },
    )
    assert conv["id"] in table and "ep-1" in table and "chron-1" in table
    assert "pineapple" not in table and (conv["title"] or "x") not in table  # ids and times only


PROTECTED = [
    ("GET", "/conversations", {"params": {"userId": USER}}),
    ("GET", "/conversations/x/why", {"params": {"userId": USER}}),
    ("GET", "/stats", {}),
    ("POST", "/pipeline/run", {"json": {"userId": USER, "range": DAY}}),
    ("GET", "/moments", {"params": {"userId": USER}}),
    ("GET", "/recordings", {"params": {"userId": USER}}),
    ("GET", "/links", {"params": {"userId": USER}}),
    ("POST", "/ingest", {"json": {"userId": USER, "bundle": {}}}),
    ("POST", "/erase", {"json": {"userId": USER, "recordingId": "x"}}),
    ("POST", "/decisions", {"json": {"userId": USER}}),
]


@pytest.mark.parametrize(("method", "path", "kw"), PROTECTED)
async def test_protected_routes_need_a_valid_token(l2_client, method, path, kw):
    assert (await l2_client.request(method, path, **kw)).status_code == 401
    bad = await l2_client.request(method, path, headers=_auth("wrong"), **kw)
    assert bad.status_code == 401
    basic = await l2_client.request(method, path, headers={"Authorization": f"Basic {TOKEN}"}, **kw)
    assert basic.status_code == 401
    ok = await l2_client.request(method, path, headers=_auth(), **kw)
    assert ok.status_code not in (401, 403, 503)


async def test_named_tokens_from_ledger_tokens_work(l2_client):
    resp = await l2_client.get("/stats", headers=_auth("memory-token-abc"))
    assert resp.status_code == 200


async def test_unconfigured_auth_fails_closed_but_health_is_open(l2_client, monkeypatch):
    monkeypatch.delenv("LEDGER_TOKEN")
    monkeypatch.delenv("LEDGER_TOKENS")
    assert (await l2_client.get("/health")).status_code == 200
    for method, path, kw in PROTECTED:
        resp = await l2_client.request(method, path, headers=_auth(), **kw)
        assert resp.status_code == 503, path
    monkeypatch.setenv("LEDGER_TOKEN", "   ")  # blank is not a token
    assert (await l2_client.get("/stats", headers=_auth("   "))).status_code == 503


async def test_human_decision_over_http_rebuilds_conversations(l2_client):
    await _load_day(l2_client)
    decided = await l2_client.post(
        "/decisions",
        json={
            "userId": USER,
            "kind": "split_at",
            "fromId": "rec-n",
            "at": "2026-11-14T09:13:05Z",
            "key": "split:human:rec-n:1",
        },
        headers=_auth(),
    )
    assert decided.status_code == 200
    views = (
        await l2_client.get("/conversations", params={"userId": USER, **DAY}, headers=_auth())
    ).json()
    assert len(views) == 5
