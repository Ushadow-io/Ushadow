"""Service authentication. Fail closed.

- `MEMORY_TOKEN` unset or empty: every protected route answers 503.
- Missing or wrong `Authorization: Bearer <token>`: 401.
- The token names one trusted service principal. Only behind it is the `userId` of a request
  honoured, in `authorize_user` (the seam for per-user / per-agent tokens and scopes later).
"""

from __future__ import annotations

import hmac
from dataclasses import dataclass

from fastapi import HTTPException, Request


@dataclass(frozen=True)
class Principal:
    id: str
    kind: str  # "service" today; later "agent" / "user" with scopes


def require_service(request: Request) -> Principal:
    expected = request.app.state.settings.memory_token
    if not expected:
        raise HTTPException(503, "memory service has no MEMORY_TOKEN configured")
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token.strip().encode(),
                                                             expected.encode()):
        raise HTTPException(401, "missing or invalid bearer token",
                            headers={"WWW-Authenticate": "Bearer"})
    request.state.principal = Principal(id="memory-service-token", kind="service")
    return request.state.principal


def authorize_user(principal: Principal, user_id: str) -> str:
    """THE SEAM: may `principal` act for `user_id`? Today the one service token may act for any
    user. Per-user tokens (principal bound to one user) and per-agent scopes (which fact kinds
    and sensitivity classes an agent may read or write, design L6) are checked here."""
    if principal.kind != "service":
        raise HTTPException(403, "principal may not act for this user")
    if not user_id or not user_id.strip():
        raise HTTPException(422, "userId is required")
    return user_id
