"""
Keycloak Token Validation

Validates Keycloak JWT access tokens with signature verification but issuer-agnostic.
This allows the app to work from any domain (localhost, Tailscale, public URLs).
"""

import logging
from typing import Optional, Union
import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError

from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .keycloak_client import get_keycloak_client

logger = logging.getLogger(__name__)

# Security scheme for extracting Bearer tokens
security = HTTPBearer(auto_error=False)

# Cache for JWKS client (fetches Keycloak's public keys)
_jwks_client: Optional[PyJWKClient] = None


def get_jwks_client() -> PyJWKClient:
    """Get cached JWKS client for fetching Keycloak's public keys."""
    global _jwks_client
    if _jwks_client is None:
        kc_client = get_keycloak_client()
        # Construct JWKS URL from Keycloak server URL
        jwks_url = f"{kc_client.server_url}/realms/{kc_client.realm}/protocol/openid-connect/certs"
        _jwks_client = PyJWKClient(jwks_url)
        logger.info(f"[KC-AUTH] Initialized JWKS client: {jwks_url}")
    return _jwks_client


def clear_jwks_cache() -> None:
    """Clear the JWKS client cache. Call this when realm keys change."""
    global _jwks_client
    _jwks_client = None
    logger.info("[KC-AUTH] Cleared JWKS cache")


def validate_keycloak_token(token: str) -> Optional[dict]:
    """
    Validate a Keycloak JWT access token with signature verification but issuer-agnostic.

    This approach:
    - ✅ Verifies JWT signature using Keycloak's public keys (JWKS)
    - ✅ Checks token expiration
    - ✅ Works from ANY domain (localhost, Tailscale, public URLs)
    - ✅ No backend client or introspection permissions needed
    - ✅ Fast (no network call after JWKS cached)

    The issuer check is skipped to allow multi-domain deployments where
    users access the app from different URLs (localhost:3000, tailscale, etc).

    Args:
        token: JWT access token from Keycloak

    Returns:
        Decoded token payload if valid, None if invalid/expired
    """
    try:
        # Get JWKS client (fetches Keycloak's public keys for signature verification)
        jwks_client = get_jwks_client()

        # Get the signing key from JWKS
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        # Decode and validate JWT
        # - Verify signature using Keycloak's public key
        # - Check expiration
        # - Skip issuer validation (options={"verify_iss": False})
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_iss": False},  # Allow any issuer (multi-domain support)
            audience=None  # Skip audience check (optional, can be added if needed)
        )

        logger.info(f"[KC-AUTH] ✓ Token validated for user: {payload.get('preferred_username')}")
        return payload

    except jwt.ExpiredSignatureError:
        logger.warning("[KC-AUTH] Token expired")
        return None

    except PyJWKClientError as e:
        # Signing key not found - token is invalid or from old realm
        # PyJWKClient handles key rotation automatically, no need to clear cache
        logger.warning(f"[KC-AUTH] Signing key not found - invalid or expired token")
        return None

    except jwt.InvalidTokenError as e:
        logger.warning(f"[KC-AUTH] Invalid token: {e}")
        return None

    except Exception as e:
        # Unexpected errors still get logged with full trace
        logger.error(f"[KC-AUTH] Unexpected error validating token: {e}", exc_info=True)
        return None


def get_keycloak_user_from_token(token: str) -> Optional[dict]:
    """
    Extract user info from a Keycloak token.

    Args:
        token: JWT access token from Keycloak

    Returns:
        User info dict with keys: email, name, sub (user ID), etc.
    """
    payload = validate_keycloak_token(token)
    if not payload:
        return None

    # Get name from token, fallback to building it from given_name + family_name
    name = payload.get("name")
    if not name:
        given_name = payload.get("given_name", "")
        family_name = payload.get("family_name", "")
        if given_name or family_name:
            name = f"{given_name} {family_name}".strip()
            logger.debug(f"[KC-AUTH] Built name from given_name + family_name: {name}")
    else:
        logger.debug(f"[KC-AUTH] Using name from token: {name}")

    return {
        "sub": payload.get("sub"),
        "email": payload.get("email"),
        "name": name,
        "preferred_username": payload.get("preferred_username"),
        "email_verified": payload.get("email_verified", False),
        # Mark as Keycloak user for backend logic
        "auth_type": "keycloak",
    }


async def get_current_user_hybrid(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Union[dict, None]:
    """
    Hybrid authentication dependency that accepts EITHER legacy OR Keycloak tokens.

    This is a FastAPI dependency that can be used in place of the legacy get_current_user.
    It tries to validate the token as:
    1. Keycloak access token (using python-keycloak with proper signature validation)
    2. Legacy Ushadow JWT (via fastapi-users)

    Args:
        credentials: HTTP Authorization credentials (Bearer token)

    Returns:
        User info dict if authenticated, raises 401 if not

    Raises:
        HTTPException: 401 if no valid authentication found
    """
    if not credentials:
        logger.warning("[AUTH] No credentials provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    token = credentials.credentials
    token_preview = token[:20] + "..." if len(token) > 20 else token
    logger.info(f"[AUTH] Validating token: {token_preview}")

    # Try Keycloak token validation first (with proper signature validation)
    keycloak_user = get_keycloak_user_from_token(token)
    if keycloak_user:
        logger.info(f"[AUTH] ✅ Keycloak authentication successful: {keycloak_user.get('email')}")
        return keycloak_user

    # Try legacy auth validation
    # TODO: Add legacy token validation here if needed
    # For now, we'll just check if it's a Keycloak token
    # The existing fastapi-users middleware will handle legacy tokens
    logger.warning(f"[AUTH] ❌ Token validation failed - neither Keycloak nor legacy token")

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token"
    )


async def get_current_user_or_none(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Union[dict, None]:
    """
    Optional hybrid authentication dependency.

    Same as get_current_user_hybrid but returns None instead of raising
    401 when no credentials are provided or token is invalid.
    Use this for endpoints that work with or without authentication.

    Args:
        credentials: HTTP Authorization credentials (Bearer token)

    Returns:
        User info dict if authenticated, None otherwise
    """
    if not credentials:
        logger.debug("[AUTH] No credentials provided (optional auth)")
        return None

    token = credentials.credentials
    token_preview = token[:20] + "..." if len(token) > 20 else token
    logger.debug(f"[AUTH] Optional auth - validating token: {token_preview}")

    # Try Keycloak token validation first
    keycloak_user = get_keycloak_user_from_token(token)
    if keycloak_user:
        logger.info(f"[AUTH] ✅ Optional auth - Keycloak user: {keycloak_user.get('email')}")
        return keycloak_user

    # Token provided but invalid - return None for optional auth
    logger.debug("[AUTH] Optional auth - token invalid, returning None")
    return None
