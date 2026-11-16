"""MCP over the read API: Streamable HTTP in-process, the same auth and the same scope gate."""

from __future__ import annotations

import httpx
import httpx2
import pytest
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from ledger.main import create_app
from tests.fixtures.l2_day import USER
from tests.read_api_helpers import auth, env, read_services

TOOLS = {"context", "resolve", "search", "brief", "timeline", "why", "correct", "forget"}


@pytest.fixture
async def app(monkeypatch):
    env(monkeypatch)
    services, _ = await read_services()
    application = create_app(db=object(), sweep=False)
    application.state.services = services
    return application


def running(app):
    """The session manager the lifespan would run (ASGITransport runs no lifespan). Entered in
    the test itself: anyio needs the same task to enter and leave it."""
    return app.state.mcp.session_manager.run()


def _mcp(app, who: str | None) -> Client:
    headers = auth(who) if who else {}
    http = httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), headers=headers,
                              base_url="http://ledger")
    return Client(streamable_http_client("http://ledger/mcp", http_client=http))


async def _http_search(app, who: str, q: str) -> dict:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://ledger") as http:
        r = await http.get("/v1/search", params={"userId": USER, "q": q}, headers=auth(who))
        return r.json()


async def test_one_tool_per_route_and_search_equals_http(app):
    async with running(app), _mcp(app, "agent") as client:
        assert {t.name for t in (await client.list_tools()).tools} == TOOLS
        result = await client.call_tool("search", {"request": {"userId": USER, "q": "venue"}})
        assert not result.is_error
        via_mcp = result.structured_content
        via_http = await _http_search(app, "agent", "venue")
    assert [i["id"] for i in via_mcp["items"]] == [i["id"] for i in via_http["items"]]
    assert via_mcp["items"] == via_http["items"]


async def test_same_scope_gate_and_refusals(app):
    async with running(app):
        async with _mcp(app, "reader") as client:
            result = await client.call_tool("search", {"request": {"userId": USER,
                                                                   "q": "health"}})
            assert result.structured_content["withheld"] == 1
            assert "act_private" not in {i["id"] for i in result.structured_content["items"]}
            write = await client.call_tool("forget", {"request": {"userId": USER,
                                                                  "factIds": ["mf_alexjob"]}})
            assert write.is_error and "forbidden" in write.content[0].text
        async with _mcp(app, "chronicle") as client:  # a service: no scope entry, denied
            denied = await client.call_tool("search", {"request": {"userId": USER,
                                                                   "q": "venue"}})
            assert denied.is_error and "forbidden" in denied.content[0].text


async def test_no_token_no_mcp(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://ledger") as http:
        body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
        r = await http.post("/mcp", json=body)
        assert r.status_code == 401
        wrong = await http.post("/mcp", json=body, headers={"Authorization": "Bearer nope"})
        assert wrong.status_code == 401
