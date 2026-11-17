"""How the ledger reads the memory service: HTTP only, never an import of memory code.

Memory routes used (all with `Authorization: Bearer $MEMORY_TOKEN`, all scoped by `userId`):
  GET  /search?userId&q&kinds&includeClosed&limit  -> {"facts": [MemoryFact (camelCase)]}
  GET  /entities/{entityId}?userId                  -> MemoryEntity | 404
  GET  /action-facts?userId                         -> {"facts": [taskfacts ActionFact (snake)]}
  GET  /facts/{factId}?userId                       -> MemoryFact | 404
  GET  /facts/{factId}/decisions?userId             -> {"decisions": [FactDecision]} | 404
  POST /correct  {userId, factId, retract, statement, text, due, direction} -> {"decisions"} | 404
  POST /forget   {userId, factIds, entityId}                                -> {"decisions"}
Fact ids: memory's public format, `mf_...` (knowledge), `act_...` (action), entities `ent_...`.

Failure: any transport error, timeout, 5xx, 401/403/503 (memory refuses us: a config problem)
raises MemoryUnavailable with a FIXED reason; the caller degrades the answer. Nothing from the
response body is put in an error or a log (it can quote speech).
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from datetime import datetime
from typing import Any, Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field

from ledger.schema import EvidenceRef

log = logging.getLogger("ledger.memory_client")
# httpx logs each request URL at INFO; ours carry userId and search text. Keep it quiet.
logging.getLogger("httpx").setLevel(logging.WARNING)

KNOWLEDGE_PREFIX = "mf_"
ACTION_PREFIX = "act_"
ENTITY_PREFIX = "ent_"
TIMEOUT = httpx.Timeout(15.0, connect=3.0)


class MemoryUnavailable(Exception):  # noqa: N818 - a state, not a bug
    """Memory cannot answer now. `reason` is a fixed code, safe to show."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class MemoryRejected(Exception):  # noqa: N818
    """Memory refused the request itself (4xx other than auth). `status` only."""

    def __init__(self, status: int) -> None:
        super().__init__(f"memory refused the request ({status})")
        self.status = status


class _Loose(BaseModel):
    model_config = ConfigDict(extra="ignore")


class MemoryFact(_Loose):
    """A fact as memory shows it. `conversationId` is set for action facts (from /action-facts)."""

    id: str
    kind: str  # knowledge | action
    key: str
    text: str | None = None
    subject: dict[str, str] | None = None
    about: list[str] = Field(default_factory=list)
    validAt: datetime | None = None
    invalidAt: datetime | None = None
    source: str = "agent"  # person | agent | sensor
    evidence: list[EvidenceRef] = Field(default_factory=list)
    direction: str | None = None
    due: str | None = None
    sensitivity: str | None = None
    conversationId: str | None = None
    confidence: float | None = None  # 0..1, how sure the memory engine is (None: it tells none)
    heard: str | None = None  # known | unknown: did the owner or a recognised speaker say it


class MemoryEntity(_Loose):
    id: str
    name: str
    summary: str | None = None
    facts: list[MemoryFact] = Field(default_factory=list)


class MemoryDecision(_Loose):
    id: str
    kind: str
    op: str  # suppress | assert | suppress_entity
    createdAt: datetime | None = None


class MemoryFactDecision(_Loose):
    """A human decision on one fact: kind correct | suppress; `statement` / `text` is the
    human's own words (correct only)."""

    id: str
    kind: str
    by: str = "person"
    at: datetime | None = None
    statement: dict[str, Any] | None = None
    text: str | None = None
    due: str | None = None
    direction: str | None = None


class MemoryKnownEntity(_Loose):
    """One entry of the word list, as memory shows it."""

    id: str
    name: str
    aliases: list[str] = Field(default_factory=list)
    type: str | None = None
    at: datetime | None = None


class FactQuery(BaseModel):
    q: str = Field(min_length=1)
    kinds: list[str] = Field(default_factory=lambda: ["knowledge", "action"])
    includeClosed: bool = False
    limit: int = Field(default=20, ge=1, le=200)


class MemoryClient(Protocol):
    async def search(self, user_id: str, query: FactQuery) -> list[MemoryFact]: ...

    async def entity(self, user_id: str, entity_id: str) -> MemoryEntity | None: ...

    async def action_facts(self, user_id: str) -> list[MemoryFact]: ...

    async def fact(self, user_id: str, fact_id: str) -> MemoryFact | None: ...

    async def fact_decisions(
        self, user_id: str, fact_id: str
    ) -> list[MemoryFactDecision] | None: ...

    async def correct(self, body: dict[str, Any]) -> list[MemoryDecision] | None: ...

    async def forget(
        self, user_id: str, fact_ids: list[str], entity_id: str | None
    ) -> list[MemoryDecision]: ...

    async def known_entities(self, user_id: str) -> list[MemoryKnownEntity]: ...

    async def name_entity(self, body: dict[str, Any]) -> MemoryKnownEntity: ...

    async def unname_entity(self, user_id: str, name: str) -> bool: ...


def action_fact(raw: dict[str, Any]) -> MemoryFact:
    """taskfacts ActionFact (as /action-facts gives it) -> MemoryFact, as memory's own mapping."""
    value = raw.get("value") or {}
    return MemoryFact(
        id=ACTION_PREFIX + raw["id"],
        kind="action",
        key=raw["key"],
        text=value.get("text"),
        subject=raw.get("subject"),
        about=list(value.get("about") or []),
        validAt=raw.get("occurred_at"),
        source=raw.get("source", "agent"),
        evidence=[EvidenceRef.model_validate(e) for e in value.get("evidence") or []],
        direction=value.get("direction"),
        due=value.get("due"),
        sensitivity=value.get("sensitivity"),
        conversationId=(value.get("conversation") or {}).get("id"),
    )


class HttpMemoryClient:
    def __init__(self, base_url: str, token: str, transport: Any = None) -> None:
        self._base = base_url.rstrip("/")
        self._token = token
        self._transport = transport  # tests: an httpx ASGI/mock transport

    async def _call(self, method: str, path: str, **kw: Any) -> httpx.Response | None:
        """None: 404. Raises MemoryUnavailable / MemoryRejected."""
        if not self._base or not self._token:
            raise MemoryUnavailable("memory_not_configured")
        headers = {"Authorization": f"Bearer {self._token}"}
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT, transport=self._transport) as http:
                r = await http.request(method, self._base + path, headers=headers, **kw)
        except httpx.HTTPError as exc:
            log.warning("memory unreachable route=%s error=%s", path.split("/")[1],
                        type(exc).__name__)
            raise MemoryUnavailable("memory_unreachable") from None
        if r.status_code == 404:
            return None
        if r.status_code in (401, 403, 503) or r.status_code >= 500:
            log.warning("memory refused route=%s status=%s", path.split("/")[1], r.status_code)
            raise MemoryUnavailable(f"memory_status_{r.status_code}")
        if r.status_code >= 400:
            raise MemoryRejected(r.status_code)
        return r

    async def _json(self, method: str, path: str, **kw: Any) -> Any:
        """The parsed body, or None for a 404."""
        r = await self._call(method, path, **kw)
        return _parse(r.json) if r is not None else None

    async def search(self, user_id: str, query: FactQuery) -> list[MemoryFact]:
        params = {"userId": user_id, "q": query.q, "kinds": query.kinds,
                  "includeClosed": str(query.includeClosed).lower(), "limit": query.limit}
        data = await self._json("GET", "/search", params=params)
        return _parse(lambda: [MemoryFact.model_validate(f) for f in (data or {"facts": []})[
            "facts"]])

    async def entity(self, user_id: str, entity_id: str) -> MemoryEntity | None:
        data = await self._json("GET", f"/entities/{entity_id}", params={"userId": user_id})
        return _parse(lambda: MemoryEntity.model_validate(data)) if data is not None else None

    async def action_facts(self, user_id: str) -> list[MemoryFact]:
        data = await self._json("GET", "/action-facts", params={"userId": user_id})
        return _parse(lambda: [action_fact(f) for f in (data or {"facts": []})["facts"]])

    async def fact(self, user_id: str, fact_id: str) -> MemoryFact | None:
        data = await self._json("GET", f"/facts/{fact_id}", params={"userId": user_id})
        return _parse(lambda: MemoryFact.model_validate(data)) if data is not None else None

    async def fact_decisions(
        self, user_id: str, fact_id: str
    ) -> list[MemoryFactDecision] | None:
        data = await self._json("GET", f"/facts/{fact_id}/decisions", params={"userId": user_id})
        if data is None:
            return None
        return _parse(lambda: [MemoryFactDecision.model_validate(d) for d in data["decisions"]])

    async def correct(self, body: dict[str, Any]) -> list[MemoryDecision] | None:
        data = await self._json("POST", "/correct", json=body)
        return _decisions(data) if data is not None else None

    async def forget(
        self, user_id: str, fact_ids: list[str], entity_id: str | None
    ) -> list[MemoryDecision]:
        body = {"userId": user_id, "factIds": fact_ids, "entityId": entity_id}
        data = await self._json("POST", "/forget", json=body)
        return _decisions(data) if data is not None else []

    async def known_entities(self, user_id: str) -> list[MemoryKnownEntity]:
        data = await self._json("GET", "/known-entities", params={"userId": user_id})
        if data is None:
            raise MemoryUnavailable("memory_bad_response")  # the route must exist
        return _parse(lambda: [MemoryKnownEntity.model_validate(e) for e in data["entities"]])

    async def name_entity(self, body: dict[str, Any]) -> MemoryKnownEntity:
        data = await self._json("POST", "/known-entities", json=body)
        if data is None:
            raise MemoryUnavailable("memory_bad_response")
        return _parse(lambda: MemoryKnownEntity.model_validate(data))

    async def unname_entity(self, user_id: str, name: str) -> bool:
        """False: no such entry (memory answers 404)."""
        body = {"userId": user_id, "name": name}
        return await self._json("POST", "/known-entities/remove", json=body) is not None


def _parse[T](build: Callable[[], T]) -> T:
    """A body we cannot read is an outage of memory, not an error of ours (never a 500)."""
    try:
        return build()
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        log.warning("memory answer unreadable error=%s", type(exc).__name__)
        raise MemoryUnavailable("memory_bad_response") from None


def _decisions(data: Any) -> list[MemoryDecision]:
    return _parse(lambda: [MemoryDecision.model_validate(d) for d in data["decisions"]])


def memory_client_from_env() -> HttpMemoryClient:
    """MEMORY_URL (e.g. http://memory:8210) and MEMORY_TOKEN. Unset: every call is
    `memory_not_configured` (the read API still answers its ledger parts)."""
    return HttpMemoryClient(os.environ.get("MEMORY_URL", ""), os.environ.get("MEMORY_TOKEN", ""))
