"""The read API's single entry point. HTTP routes (/v1) and MCP tools both call `read` and
`write` here, and nothing else: so the owner check, the scope lookup (default deny), the write
check and the scope gate run for every call, in this one place.

Returns data (an answer or a Refusal); the adapters map a Refusal to 403/404/... or a tool error.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from ledger.read_models import (
    Answer,
    BriefRequest,
    ContextRequest,
    CorrectRequest,
    ForgetRequest,
    ReadRequest,
    Refusal,
    RefusalCode,
    ResolveRequest,
    SearchRequest,
    TimelineRequest,
    WhyRequest,
    WriteAnswer,
    WriteRequest,
)
from ledger.scopes import Principal, Scope, ScopeBook, load_scope_book, owner_for
from ledger.services.read import gate
from ledger.services.read.answers import ReadDeps, ReadHandlers
from ledger.services.read.brief import BriefHandlers
from ledger.services.read.writes import WriteHandlers

log = logging.getLogger("ledger.read")

FORBIDDEN = Refusal(code=RefusalCode.forbidden, detail="this principal has no scope for this")
NOT_FOUND = Refusal(code=RefusalCode.not_found, detail="not found for this user")
Handler = Callable[[Any], Awaitable[Any]]


class ReadGateway:
    def __init__(self, deps: ReadDeps, scopes: Callable[[], ScopeBook] = load_scope_book) -> None:
        reads, briefs, self._writes = ReadHandlers(deps), BriefHandlers(deps), WriteHandlers(deps)
        self._scopes = scopes
        self._readers: dict[type, Handler] = {
            ContextRequest: reads.context, ResolveRequest: reads.resolve,
            SearchRequest: reads.search, TimelineRequest: reads.timeline,
            BriefRequest: briefs.brief, WhyRequest: briefs.why,
        }
        self._writers: dict[type, Handler] = {
            CorrectRequest: self._writes.correct, ForgetRequest: self._writes.forget,
        }

    def scope_for(self, principal: Principal, user_id: str) -> Scope | Refusal:
        scope = self._scopes().get(principal.name)
        if scope is None or owner_for(principal, user_id, scope) is None:
            log.info("read api refused principal=%s", principal.name)
            return FORBIDDEN
        return scope

    async def read(self, principal: Principal, req: ReadRequest) -> Answer | Refusal:
        scope = self.scope_for(principal, req.userId)
        if isinstance(scope, Refusal):
            return scope
        answer = await self._readers[type(req)](req)
        if isinstance(answer, Refusal):
            return answer
        answer.withheld += gate.apply(scope, answer)
        answer.after_scope()
        return answer

    async def write(self, principal: Principal, req: WriteRequest) -> WriteAnswer | Refusal:
        scope = self.scope_for(principal, req.userId)
        if isinstance(scope, Refusal):
            return scope
        if not scope.write:
            return FORBIDDEN
        targets = await self._writes.target_items(req)
        if isinstance(targets, Refusal):
            return targets
        if not all(gate.allows(scope, t) for t in targets):
            return NOT_FOUND  # out of scope looks the same as absent: no hint that it exists
        return await self._writers[type(req)](req)
