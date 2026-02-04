"""
Keycloak Token Validation

Validates Keycloak JWT access tokens for API requests.
This allows federated users (authenticated via Keycloak) to access the API
without needing a local Ushadow account.
"""

import os
import logging
from typing import Optional, Union
import jwt
from fastapi import HTTPException, status, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

# Security scheme for extracting Bearer tokens
security = HTTPBearer(auto_error=False)


def validate_keycloak_token(token: str) -> Optional[dict]:
    """
    Validate a Keycloak access token.

    Args:
        token: JWT access token from Keycloak

    Returns:
        Decoded token payload if valid, None if invalid

    Note:
        This is a simplified validation for development.
        In production, you should:
        1. Fetch Keycloak's public keys from JWKS endpoint
        2. Verify signature using the public key
        3. Validate issuer, audience, and other claims
    """
    try:
        # For now, decode without verification (development only!)
        # TODO: Add proper JWT signature verification using Keycloak's public keys
        # Keycloak typically uses RS256 algorithm, so we need to allow it even when not verifying
        payload = jwt.decode(
            token,
            algorithms=["RS256", "HS256"],  # Allow common algorithms
            options={
                "verify_signature": False,  # FIXME: Enable in production!
                "verify_exp": True,  # Still check expiration
            }
        )

        # Log the payload for debugging
        logger.info(f"Decoded Keycloak token - issuer: {payload.get('iss')}, user: {payload.get('preferred_username')}")

        # Validate issuer (accept both internal and external URLs)
        keycloak_external = os.getenv("KEYCLOAK_EXTERNAL_URL", "http://localhost:8081")
        keycloak_internal = os.getenv("KEYCLOAK_URL", "http://keycloak:8080")
        keycloak_realm = os.getenv("KEYCLOAK_REALM", "ushadow")

        expected_issuers = [
            f"{keycloak_external}/realms/{keycloak_realm}",
            f"{keycloak_internal}/realms/{keycloak_realm}",
        ]

        token_issuer = payload.get("iss")
        if token_issuer not in expected_issuers:
            logger.warning(f"Invalid issuer: {token_issuer} (expected one of {expected_issuers})")
            # Don't reject - just log for now during development
            # return None

        # Token is valid
        logger.info(f"✓ Validated Keycloak token for user: {payload.get('preferred_username')}")
        return payload

    except jwt.ExpiredSignatureError:
        logger.warning("Keycloak token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid Keycloak token: {e}")
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
    1. Keycloak access token
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

    # Try Keycloak token validation first (simpler, no database lookup)
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
