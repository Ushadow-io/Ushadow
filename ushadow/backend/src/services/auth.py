"""Authentication for ushadow.

Casdoor is the identity provider. This module validates Casdoor JWTs via JWKS,
syncs users into MongoDB on first login, and provides FastAPI dependencies used
across all routers.

Also exposes generate_jwt_for_service for cross-service tokens (Tailscale, etc.).
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from jose import jwt as jose_jwt

from src.config.casdoor_settings import get_casdoor_config
from src.config.secrets import get_auth_secret_key
from src.models.user import User

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)

SECRET_KEY = get_auth_secret_key()
JWT_LIFETIME_SECONDS = 86400
ALGORITHM = "HS256"


# ---------------------------------------------------------------------------
# JWKS cache
# ---------------------------------------------------------------------------

class JWKSCache:
    _TTL = timedelta(hours=1)

    def __init__(self) -> None:
        self._keys: list[dict[str, Any]] = []
        self._fetched_at: datetime | None = None

    def _is_stale(self) -> bool:
        return self._fetched_at is None or (
            datetime.now(timezone.utc) - self._fetched_at > self._TTL
        )

    async def _refresh(self) -> None:
        url = f"{get_casdoor_config()['url']}/.well-known/jwks"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10)
            response.raise_for_status()
        self._keys = response.json().get("keys", [])
        self._fetched_at = datetime.now(timezone.utc)
        logger.info("JWKS refreshed (%d keys)", len(self._keys))

    async def get_key(self, kid: str) -> dict[str, Any]:
        if self._is_stale():
            await self._refresh()
        key = next((k for k in self._keys if k.get("kid") == kid), None)
        if key is None:
            await self._refresh()
            key = next((k for k in self._keys if k.get("kid") == kid), None)
        if key is None:
            raise KeyError(f"Unknown signing key: {kid!r}")
        return key


_jwks_cache = JWKSCache()


# ---------------------------------------------------------------------------
# Token validation + user sync
# ---------------------------------------------------------------------------

async def _validate_casdoor_token(token: str) -> dict[str, Any]:
    from fastapi import HTTPException, status
    try:
        header = jose_jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format") from exc

    config = get_casdoor_config()
    try:
        raw_key = await _jwks_cache.get_key(header.get("kid", ""))
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown token signing key") from exc

    try:
        return jose_jwt.decode(
            token, raw_key, algorithms=["RS256"],
            audience=config["client_id"], issuer=config["public_url"],
        )
    except JWTError as exc:
        unverified = jose_jwt.get_unverified_claims(token)
        logger.warning("Token validation failed: %s | iss=%s aud=%s", exc, unverified.get("iss"), unverified.get("aud"))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token validation failed") from exc


async def _get_or_create_user(claims: dict[str, Any]) -> User:
    sub = claims["sub"]
    email = claims.get("email", "")
    display_name = claims.get("displayName") or claims.get("name") or sub

    user = await User.find_one(User.oidc_sub == sub)

    if user is None and email:
        user = await User.find_one(User.email == email)
        if user is not None:
            user.oidc_sub = sub
            await user.save()

    if user is None:
        user = User(oidc_sub=sub, email=email, display_name=display_name, hashed_password="", is_active=True)
        await user.insert()
        logger.info("New user from Casdoor: %s", email)
    else:
        changed = False
        if email and user.email != email:
            user.email = email
            changed = True
        if display_name and user.display_name != display_name:
            user.display_name = display_name
            changed = True
        if changed:
            await user.save()

    return user


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> User:
    from fastapi import HTTPException, status
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    claims = await _validate_casdoor_token(credentials.credentials)
    return await _get_or_create_user(claims)


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[User]:
    """Returns None for unauthenticated requests instead of raising 401."""
    if credentials is None:
        return None
    try:
        claims = await _validate_casdoor_token(credentials.credentials)
        return await _get_or_create_user(claims)
    except Exception as exc:
        logger.warning("get_optional_current_user: token validation failed: %s", exc)
        return None


async def get_user_from_token(token: str) -> Optional[User]:
    """Validate a Casdoor token string and return the User. Used for SSE/WebSocket."""
    if not token:
        return None
    try:
        claims = await _validate_casdoor_token(token)
        user = await _get_or_create_user(claims)
        return user if user.is_active else None
    except Exception as e:
        logger.warning("get_user_from_token failed: %s", e)
        return None


async def websocket_auth(websocket, token: Optional[str] = None) -> Optional[User]:
    """WebSocket authentication via Bearer token or cookie."""
    import re
    if token:
        user = await get_user_from_token(token)
        if user:
            return user
    try:
        cookie_header = next(
            (v.decode() for k, v in websocket.headers.items() if k.lower() == b"cookie"), None
        )
        if cookie_header:
            from src.services.user_manager import get_auth_cookie_name
            cookie_name = re.escape(get_auth_cookie_name())
            match = re.search(rf"{cookie_name}=([^;]+)", cookie_header)
            if match:
                return await get_user_from_token(match.group(1))
    except Exception as e:
        logger.warning("WebSocket cookie auth failed: %s", e)
    return None


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def get_accessible_user_ids(user: User) -> list[str] | None:
    return None if user.is_superuser else [str(user.id)]


def generate_jwt_for_service(user_id: str, user_email: str, audiences: list[str] | None = None) -> str:
    if audiences is None:
        audiences = ["ushadow", "chronicle"]
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id, "email": user_email, "iss": "ushadow", "aud": audiences,
        "exp": now + timedelta(seconds=JWT_LIFETIME_SECONDS),
        "iat": now,
        "principal": user_email,
        "policies": [{"resource": "**", "action": "*", "effect": "allow"}],
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
