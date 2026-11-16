"""MCP server over the read API: one tool per /v1 route, Streamable HTTP at POST /mcp.

Mounted in the ledger app (same process, same port), not a second entrypoint: the tools call
the SAME gateway object as the HTTP routes (services.read), so the owner check, the scope book
and the scope gate are the same code; there is no second path that could skip them, and one
port/token/deploy is enough. Stateless + JSON responses: every call is one HTTP request with
its own bearer token, nothing is kept between calls.

Auth: the bearer token is checked twice with the same function (ledger.routers.auth.
authenticate): by `BearerGate` before the MCP transport sees the request (no session without a
token), and again in each tool to get the principal the gateway needs.

SDK: `mcp==2.3.0` (MCPServer, streamable_http_app; verified against the installed source).
LEDGER_MCP_ALLOWED_HOSTS (comma list) sets the Host allow-list of the SDK's DNS-rebinding
check; default: loopback and the compose alias `ledger`.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any

from mcp.server.mcpserver import Context, MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from ledger.read_models import (
    BriefAnswer,
    BriefRequest,
    ContextAnswer,
    ContextRequest,
    CorrectRequest,
    ForgetRequest,
    ReadRequest,
    Refusal,
    ResolveAnswer,
    ResolveRequest,
    SearchAnswer,
    SearchRequest,
    TimelineAnswer,
    TimelineRequest,
    WhyAnswer,
    WhyRequest,
    WriteAnswer,
    WriteRequest,
)
from ledger.routers.auth import AuthError, authenticate
from ledger.services import Services

MCP_PATH = "/mcp"
DEFAULT_HOSTS = "127.0.0.1:*,localhost:*,[::1]:*,ledger,ledger:*"


def _security() -> TransportSecuritySettings:
    hosts = os.environ.get("LEDGER_MCP_ALLOWED_HOSTS", "") or DEFAULT_HOSTS
    allowed = [h.strip() for h in hosts.split(",") if h.strip()]
    origins = [f"http://{h}" for h in allowed] + [f"https://{h}" for h in allowed]
    return TransportSecuritySettings(allowed_hosts=allowed, allowed_origins=origins)


class BearerGate:
    """ASGI wrapper: no valid token, no MCP. Answers 401/503 itself."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
            try:
                authenticate(headers.get("authorization"))
            except AuthError as exc:
                extra = {"WWW-Authenticate": "Bearer"} if exc.status == 401 else None
                await JSONResponse({"detail": exc.detail}, exc.status, extra)(scope, receive, send)
                return
        await self.app(scope, receive, send)


def _tools(mcp: MCPServer, services: Callable[[], Services]) -> None:  # noqa: C901 - flat list
    async def read(ctx: Context, req: ReadRequest) -> Any:
        return _unwrap(await services().read.read(_principal(ctx), req))

    async def write(ctx: Context, req: WriteRequest) -> Any:
        return _unwrap(await services().read.write(_principal(ctx), req))

    @mcp.tool(description="What is going on now: open/latest conversations, people, their facts")
    async def context(request: ContextRequest, ctx: Context) -> ContextAnswer:
        return await read(ctx, request)

    @mcp.tool(description="A name to entities; several matches are all shown (ambiguous)")
    async def resolve(request: ResolveRequest, ctx: Context) -> ResolveAnswer:
        return await read(ctx, request)

    @mcp.tool(description="Facts and conversations that match, each with its evidence")
    async def search(request: SearchRequest, ctx: Context) -> SearchAnswer:
        return await read(ctx, request)

    @mcp.tool(description="Brief on an entity or a conversation: last talk, tasks, commitments")
    async def brief(request: BriefRequest, ctx: Context) -> BriefAnswer:
        return await read(ctx, request)

    @mcp.tool(description="Conversations in order plus the capture gaps of a time range")
    async def timeline(request: TimelineRequest, ctx: Context) -> TimelineAnswer:
        return await read(ctx, request)

    @mcp.tool(description="Why: evidence of a fact or conversation, the decisions, who decided")
    async def why(request: WhyRequest, ctx: Context) -> WhyAnswer:
        return await read(ctx, request)

    @mcp.tool(description="A human correction of a fact (memory) or a conversation (ledger)")
    async def correct(request: CorrectRequest, ctx: Context) -> WriteAnswer:
        return await write(ctx, request)

    @mcp.tool(description="Forget facts or an entity; they are blocked from being made again")
    async def forget(request: ForgetRequest, ctx: Context) -> WriteAnswer:
        return await write(ctx, request)


def _principal(ctx: Context) -> Any:
    headers = ctx.headers or {}
    try:
        return authenticate(headers.get("authorization"))
    except AuthError as exc:
        raise ToolError(exc.detail) from None


def _unwrap(result: Any) -> Any:
    if isinstance(result, Refusal):
        raise ToolError(f"{result.code.value}: {result.detail}")
    return result


def build_mcp(services: Callable[[], Services]) -> tuple[MCPServer, ASGIApp]:
    """The MCP server and its ASGI app (serves MCP_PATH). The caller must run
    `mcp.session_manager.run()` in its lifespan."""
    mcp = MCPServer("ushadow-ledger", instructions="Read the user's memory: conversations from "
                    "the ledger and facts from memory, each with evidence, within your scope.")
    _tools(mcp, services)
    app = mcp.streamable_http_app(streamable_http_path=MCP_PATH, stateless_http=True,
                                  json_response=True, transport_security=_security())
    return mcp, BearerGate(app)
