"""Authentication. Every route except GET /health needs `Authorization: Bearer <token>`.

Tokens (env, read on each request so a rotation needs no restart):
- LEDGER_TOKEN:  one token, principal name "service";
- LEDGER_TOKENS: more tokens as comma-separated `name:token` (e.g. `chronicle:abc,memory:def`),
  so principals can be told apart in logs and scoped (ledger.scopes).
Fail closed: with no token configured every protected route answers 503. A missing or wrong
token is 401. Tokens are compared in constant time and never logged.

A principal with an entry in the scope book is an "agent": it may use the read API (/v1, /mcp)
within its scope, and not the internal service routes. Any other principal is a trusted
SERVICE (the Chronicle adapter, the memory service) that may assert a `userId` on the internal
routes.

A person signed in to Ushadow: the Ushadow backend proxy (/api/services/ledger/proxy/...) sends
a JWT that Ushadow signs with AUTH_SECRET_KEY (HS256, issuer and audience `ushadow`, `sub` =
the user id). With AUTH_SECRET_KEY set (LEDGER_USER_JWT_SECRET wins), such a token is a USER
principal: the read API for its own data only (`ledger.scopes.owner_for`). The user id comes
from the token, never from the request. No secret set: no user tokens are accepted.
"""

from __future__ import annotations

import hmac
import logging
import os

import jwt
from fastapi import Depends, HTTPException, Query, Request

from ledger.scopes import Principal, load_scope_book, owner_for, principal_kind

log = logging.getLogger("ledger.auth")

__all__ = ["AuthError", "Principal", "authenticate", "require_principal", "resolve_owner"]


class AuthError(Exception):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


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


USER_JWT_ISSUER = "ushadow"
USER_JWT_AUDIENCE = "ushadow"


def user_jwt_secret() -> str:
    env = os.environ
    return (env.get("LEDGER_USER_JWT_SECRET") or env.get("AUTH_SECRET_KEY") or "").strip()


def user_from_jwt(token: str | None, secret: str) -> Principal | None:
    """A valid Ushadow user token, or None. HS256 only; signature, expiry, issuer, audience and
    a subject are all required."""
    if not token or not secret:
        return None
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"], audience=USER_JWT_AUDIENCE,
                            issuer=USER_JWT_ISSUER,
                            options={"require": ["exp", "sub", "iss", "aud"]})
    except jwt.PyJWTError:
        return None
    sub = str(claims.get("sub") or "").strip()
    return Principal(name="user", kind="user", user_id=sub) if sub else None


def bearer(header: str | None) -> str | None:
    scheme, _, value = (header or "").partition(" ")
    return value.strip() if scheme.lower() == "bearer" and value.strip() else None


def authenticate(authorization: str | None) -> Principal:
    """The one token check, for HTTP routes and the MCP endpoint alike. Raises AuthError."""
    tokens, secret = configured_tokens(), user_jwt_secret()
    if not tokens and not secret:
        raise AuthError(503, "ledger auth is not configured (set LEDGER_TOKEN)")
    given = bearer(authorization)
    match = None
    for name, token in tokens.items():  # compare against all, in constant time each
        if given is not None and hmac.compare_digest(given.encode(), token.encode()):
            match = name
    if match is not None:
        return Principal(name=match, kind=principal_kind(match, load_scope_book()))
    user = user_from_jwt(given, secret)
    if user is None:
        raise AuthError(401, "missing or invalid bearer token")
    return user


def require_principal(request: Request) -> Principal:
    try:
        return authenticate(request.headers.get("authorization"))
    except AuthError as exc:
        if exc.status == 401:
            log.info("auth refused path=%s", request.url.path)
            raise HTTPException(401, exc.detail, {"WWW-Authenticate": "Bearer"}) from None
        raise HTTPException(exc.status, exc.detail) from None


def resolve_owner(principal: Principal, requested_user_id: str) -> str:
    """The owner an internal-route request acts for (see ledger.scopes.owner_for)."""
    owner = owner_for(principal, requested_user_id)
    if owner is None:
        raise HTTPException(403, "this principal may not act for this user here")
    return owner


def owner_query(
    userId: str = Query(min_length=1, description="Owner"),  # noqa: N803
    principal: Principal = Depends(require_principal),
) -> str:
    return resolve_owner(principal, userId)
