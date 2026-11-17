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
    KnownEntityRemove,
    KnownEntityRequest,
    ReadRequest,
    Refusal,
    RefusalCode,
    ResolveRequest,
    SearchRequest,
    TimelineRequest,
    WhyAnswer,
    WhyRequest,
    WriteAnswer,
    WriteRequest,
)
from ledger.scopes import Principal, Scope, ScopeBook, load_scope_book, owner_for, scope_of
from ledger.services.read import gate
from ledger.services.read.answers import ReadDeps, ReadHandlers
from ledger.services.read.brief import BriefHandlers
from ledger.services.read.known import KnownHandlers
from ledger.services.read.writes import WriteHandlers

log = logging.getLogger("ledger.read")

FORBIDDEN = Refusal(code=RefusalCode.forbidden, detail="this principal has no scope for this")
NOT_FOUND = Refusal(code=RefusalCode.not_found, detail="not found for this user")
Handler = Callable[[Any], Awaitable[Any]]


class ReadGateway:
    def __init__(self, deps: ReadDeps, scopes: Callable[[], ScopeBook] = load_scope_book) -> None:
        reads, briefs, self._writes = ReadHandlers(deps), BriefHandlers(deps), WriteHandlers(deps)
        self._known = KnownHandlers(deps)
        self._scopes = scopes
        self._readers: dict[type, Handler] = {
            ContextRequest: reads.context, ResolveRequest: reads.resolve,
            SearchRequest: reads.search, TimelineRequest: reads.timeline,
            BriefRequest: briefs.brief, WhyRequest: briefs.why,
        }
        self._writers: dict[type, Handler] = {
            CorrectRequest: self._writes.correct, ForgetRequest: self._writes.forget,
        }

    def scope_for(self, principal: Principal, user_id: str) -> tuple[Scope, str] | Refusal:
        """The caller's scope and the owner it acts for (a user principal's `me` is resolved)."""
        scope = scope_of(principal, self._scopes())
        owner = owner_for(principal, user_id, scope) if scope is not None else None
        if scope is None or owner is None:
            log.info("read api refused principal=%s", principal.name)
            return FORBIDDEN
        return scope, owner

    async def read(self, principal: Principal, req: ReadRequest) -> Answer | Refusal:
        allowed = self.scope_for(principal, req.userId)
        if isinstance(allowed, Refusal):
            return allowed
        scope, owner = allowed
        req = req.model_copy(update={"userId": owner})
        answer = await self._readers[type(req)](req)
        if isinstance(answer, Refusal):
            return answer
        if isinstance(req, WhyRequest) and req.factId and isinstance(answer, WhyAnswer) and (
            answer.item is not None and not gate.allows(scope, answer.item)
        ):
            return NOT_FOUND  # an out-of-scope fact looks the same as a missing one
        answer.withheld += gate.apply(scope, answer)
        answer.after_scope()
        return answer

    def _word_list(self, principal: Principal, user_id: str, write: bool) -> str | Refusal:
        """The owner a word-list call acts for. The list names people and things: it needs a
        knowledge scope, and a write scope to change it."""
        allowed = self.scope_for(principal, user_id)
        if isinstance(allowed, Refusal):
            return allowed
        scope, owner = allowed
        if not scope.allows_class("knowledge") or (write and not scope.write):
            return FORBIDDEN
        return owner

    async def known_entities(self, principal: Principal, user_id: str) -> Any:
        owner = self._word_list(principal, user_id, write=False)
        return owner if isinstance(owner, Refusal) else await self._known.list(owner)

    async def name_entity(self, principal: Principal, req: KnownEntityRequest) -> Any:
        owner = self._word_list(principal, req.userId, write=True)
        if isinstance(owner, Refusal):
            return owner
        return await self._known.add(req.model_copy(update={"userId": owner}))

    async def unname_entity(self, principal: Principal, req: KnownEntityRemove) -> Any:
        owner = self._word_list(principal, req.userId, write=True)
        if isinstance(owner, Refusal):
            return owner
        return await self._known.remove(req.model_copy(update={"userId": owner}))

    async def write(self, principal: Principal, req: WriteRequest) -> WriteAnswer | Refusal:
        allowed = self.scope_for(principal, req.userId)
        if isinstance(allowed, Refusal):
            return allowed
        scope, owner = allowed
        req = req.model_copy(update={"userId": owner})
        if not scope.write:
            return FORBIDDEN
        targets = await self._writes.target_items(req)
        if isinstance(targets, Refusal):
            return targets
        if not all(gate.allows(scope, t) for t in targets):
            return NOT_FOUND  # out of scope looks the same as absent: no hint that it exists
        return await self._writers[type(req)](req)
