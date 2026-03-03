"""
OIDC Token Validation

Validates JWT access tokens with signature verification but issuer-agnostic.
Works with any OIDC provider (Keycloak, Authentik, Auth0, etc.) by resolving
the JWKS endpoint from the OIDC settings layer.

This allows the app to work from any domain (localhost, Tailscale, public URLs).
"""

import logging
from typing import Optional, Union
import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError

from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

# Security scheme for extracting Bearer tokens
security = HTTPBearer(auto_error=False)

# Cache for JWKS client (fetches provider's public keys)
_jwks_client: Optional[PyJWKClient] = None


def get_jwks_client() -> PyJWKClient:
    """Get cached JWKS client for fetching the OIDC provider's public keys.

    Resolves the JWKS URL from the provider's OIDC discovery document via
    the oidc_settings layer (works for Keycloak, Authentik, or any OIDC IdP).
    Falls back to Keycloak-style URL pattern if discovery is unavailable.
    """
    global _jwks_client
    if _jwks_client is None:
        import httpx
        from src.config.oidc_settings import get_oidc_config

        config = get_oidc_config()
        internal_url = config["internal_url"]

        jwks_url = None

        # Try OIDC discovery to find jwks_uri
        if internal_url:
            try:
                well_known = f"{internal_url}/.well-known/openid-configuration"
                resp = httpx.get(well_known, timeout=5.0)
                if resp.status_code == 200:
                    doc = resp.json()
                    discovered_jwks = doc.get("jwks_uri")
                    if discovered_jwks:
                        # Rewrite host to internal URL for backend reachability
                        from urllib.parse import urlparse, urlunparse
                        parsed_internal = urlparse(internal_url)
                        parsed_jwks = urlparse(discovered_jwks)
                        rewritten = parsed_jwks._replace(
                            scheme=parsed_internal.scheme,
                            netloc=parsed_internal.netloc,
                        )
                        jwks_url = urlunparse(rewritten)
            except Exception as e:
                logger.debug(f"[OIDC-AUTH] Discovery failed for JWKS, using fallback: {e}")

        # Fallback: Keycloak-style certs endpoint
        if not jwks_url and internal_url:
            if "/realms/" in internal_url:
                jwks_url = f"{internal_url}/protocol/openid-connect/certs"
            else:
                # Generic fallback
                jwks_url = f"{internal_url}/.well-known/jwks.json"

        if not jwks_url:
            raise RuntimeError("Cannot resolve JWKS URL: no OIDC config available")

        _jwks_client = PyJWKClient(jwks_url)
        logger.info(f"[OIDC-AUTH] Initialized JWKS client: {jwks_url}")
    return _jwks_client


def clear_jwks_cache() -> None:
    """Clear the JWKS client cache. Call this when provider keys change."""
    global _jwks_client
    _jwks_client = None
    logger.info("[OIDC-AUTH] Cleared JWKS cache")


def validate_keycloak_token(token: str) -> Optional[dict]:
    """
    Validate a JWT access token with signature verification but issuer-agnostic.

    Works with any OIDC provider (Keycloak, Authentik, Auth0, etc.).

    This approach:
    - Verifies JWT signature using provider's public keys (JWKS)
    - Checks token expiration
    - Works from ANY domain (localhost, Tailscale, public URLs)
    - No backend client or introspection permissions needed
    - Fast (no network call after JWKS cached)

    The issuer check is skipped to allow multi-domain deployments where
    users access the app from different URLs (localhost:3000, tailscale, etc).

    Args:
        token: JWT access token from the OIDC provider

    Returns:
        Decoded token payload if valid, None if invalid/expired
    """
    try:
        # Get JWKS client (fetches provider's public keys for signature verification)
        jwks_client = get_jwks_client()

        # Get the signing key from JWKS
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        # Decode and validate JWT
        # - Verify signature using provider's public key (RS256 via JWKS)
        # - Check expiration
        # - Skip issuer check: tokens may be issued from different URLs
        # - Verify audience: token must be intended for the backend
        from src.config.oidc_settings import get_oidc_config
        backend_audience = get_oidc_config()["backend_audience"]

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_iss": False},  # Allow any issuer (multi-domain support)
            audience=backend_audience,
        )

        logger.debug(f"[OIDC-AUTH] Token validated for user: {payload.get('preferred_username') or payload.get('email')}")
        return payload

    except jwt.ExpiredSignatureError:
        logger.warning("[OIDC-AUTH] Token expired")
        return None

    except PyJWKClientError as e:
        logger.warning(f"[OIDC-AUTH] Signing key not found (kid mismatch or key rotation): {e}")
        return None

    except jwt.InvalidTokenError as e:
        logger.warning(f"[OIDC-AUTH] Invalid token: {e}")
        return None

    except Exception as e:
        # Unexpected errors still get logged with full trace
        logger.error(f"[OIDC-AUTH] Unexpected error validating token: {e}", exc_info=True)
        return None


def get_keycloak_user_from_token(token: str) -> Optional[dict]:
    """
    Extract user info from an OIDC access token.

    Works with any OIDC provider (Keycloak, Authentik, Auth0, etc.).

    Args:
        token: JWT access token from the OIDC provider

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

    return {
        "sub": payload.get("sub"),
        "email": payload.get("email"),
        "name": name,
        "preferred_username": payload.get("preferred_username"),
        "email_verified": payload.get("email_verified", False),
        # Mark as OIDC-authenticated user for backend logic
        "auth_type": "oidc",
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
    logger.debug(f"[AUTH] Validating token: {token_preview}")

    # Try Keycloak token validation first (with proper signature validation)
    keycloak_user = get_keycloak_user_from_token(token)
    if keycloak_user:
        logger.debug(f"[AUTH] ✅ Keycloak authentication successful: {keycloak_user.get('email')}")
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
        logger.debug(f"[AUTH] ✅ Optional auth - Keycloak user: {keycloak_user.get('email')}")
        return keycloak_user

    # Token provided but invalid - return None for optional auth
    logger.debug("[AUTH] Optional auth - token invalid, returning None")
    return None
