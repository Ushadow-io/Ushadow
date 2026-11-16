"""Authentication. Every route except GET /health needs `Authorization: Bearer <token>`.

Tokens (env, read on each request so a rotation needs no restart):
- LEDGER_TOKEN:  one token, principal name "service";
- LEDGER_TOKENS: more tokens as comma-separated `name:token` (e.g. `chronicle:abc,memory:def`),
  so principals can be told apart in logs and scoped later.
Fail closed: with no token configured every protected route answers 503. A missing or wrong
token is 401. Tokens are compared in constant time and never logged.

A token names a trusted SERVICE principal (the Chronicle adapter, the Ushadow backend, the
memory service). Only such a principal may assert a `userId`. `resolve_owner` is the one seam
where per-user tokens can be added later.
"""

from __future__ import annotations

import hmac
import logging
import os
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Query, Request

log = logging.getLogger("ledger.auth")


@dataclass(frozen=True)
class Principal:
    name: str
    kind: str = "service"


def configured_tokens() -> dict[str, str]:
    """name -> token. Empty when nothing is configured."""
    tokens: dict[str, str] = {}
    single = os.environ.get("LEDGER_TOKEN", "").strip()
    if single:
        tokens["service"] = single
    for item in os.environ.get("LEDGER_TOKENS", "").split(","):
        name, _, token = item.strip().partition(":")
        if name and token.strip():
            tokens[name.strip()] = token.strip()
    return tokens


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    return value.strip() if scheme.lower() == "bearer" and value.strip() else None


def require_principal(request: Request) -> Principal:
    tokens = configured_tokens()
    if not tokens:
        raise HTTPException(503, "ledger auth is not configured (set LEDGER_TOKEN)")
    given = _bearer(request)
    match = None
    for name, token in tokens.items():  # compare against all, in constant time each
        if given is not None and hmac.compare_digest(given.encode(), token.encode()):
            match = name
    if match is None:
        log.info("auth refused path=%s", request.url.path)
        raise HTTPException(401, "missing or invalid bearer token", {"WWW-Authenticate": "Bearer"})
    return Principal(name=match)


def resolve_owner(principal: Principal, requested_user_id: str) -> str:
    """The owner a request acts for. Today every principal is a trusted service, so it may
    act for the userId it names. Per-user tokens: check here that they match."""
    if principal.kind != "service":  # pragma: no cover - no other kind yet
        raise HTTPException(403, "this principal may not act for another user")
    return requested_user_id


def owner_query(
    userId: str = Query(min_length=1, description="Owner"),  # noqa: N803
    principal: Principal = Depends(require_principal),
) -> str:
    return resolve_owner(principal, userId)
