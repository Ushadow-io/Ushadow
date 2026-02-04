"""
Keycloak Token Validation

Validates Keycloak JWT access tokens using python-keycloak library.
Provides FastAPI dependencies for authentication.
"""

import logging
from typing import Optional, Union

from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from keycloak.exceptions import KeycloakError

from .keycloak_client import get_keycloak_client

logger = logging.getLogger(__name__)

# Security scheme for extracting Bearer tokens
security = HTTPBearer(auto_error=False)


def validate_keycloak_token(token: str) -> Optional[dict]:
    """
    Validate a Keycloak access token using python-keycloak.

    This properly validates:
    - Token signature using Keycloak's public keys (JWKS)
    - Token expiration
    - Issuer
    - Other standard JWT claims

    Args:
        token: JWT access token from Keycloak

    Returns:
        Decoded token payload if valid, None if invalid
    """
    try:
        kc_client = get_keycloak_client()

        # Decode and validate token (checks signature, expiration, etc.)
        payload = kc_client.decode_token(token, validate=True)

        logger.info(f"✓ Validated Keycloak token for user: {payload.get('preferred_username')}")
        return payload

    except KeycloakError as e:
        logger.warning(f"Keycloak token validation failed: {e}")
        return None
    except Exception as e:
        logger.error(f"Error validating Keycloak token: {e}", exc_info=True)
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
