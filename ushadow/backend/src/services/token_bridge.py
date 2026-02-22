"""
Token Bridge Utility

Automatically converts Keycloak OIDC tokens to service-compatible JWT tokens.
This allows proxy and audio relay to transparently bridge authentication.

Usage:
    token = extract_token_from_request(request)
    service_token = await bridge_to_service_token(token, audiences=["chronicle"])
"""

import logging
from typing import Optional
from fastapi import Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .keycloak import get_keycloak_user_from_token, get_mongodb_user_id_for_keycloak_user
from .auth import generate_jwt_for_service

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


def extract_token_from_request(request: Request) -> Optional[str]:
    """
    Extract Bearer token from Authorization header or query parameter.

    Args:
        request: FastAPI request object

    Returns:
        Token string if found, None otherwise
    """
    # Try Authorization header first
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]  # Remove "Bearer " prefix

    # Try query parameter (for WebSocket connections)
    token = request.query_params.get("token")
    if token:
        return token

    return None


async def bridge_to_service_token(
    token: str,
    audiences: Optional[list[str]] = None
) -> Optional[str]:
    """
    Convert a Keycloak token to a service-compatible JWT token.

    If the token is already a service token (not a Keycloak token),
    returns it unchanged. Otherwise, validates the Keycloak token
    and generates a new service token.

    Args:
        token: Token to bridge (Keycloak or service token)
        audiences: Audiences for the service token (defaults to ["ushadow", "chronicle"])

    Returns:
        Service token if bridging succeeded, None if token is invalid
    """
    if not token:
        return None

    # Peek at the JWT header (no verification) to detect token type
    try:
        import base64 as _b64, json as _json
        _header = _json.loads(_b64.urlsafe_b64decode(token.split('.')[0] + '=='))
        _alg = _header.get('alg', '')
    except Exception:
        _alg = ''

    # Try to validate as Keycloak token
    keycloak_user = get_keycloak_user_from_token(token)

    if not keycloak_user:
        if _alg == 'RS256':
            # Looks like a Keycloak token but failed validation (expired, JWKS unreachable, etc.)
            # Do NOT pass through — Chronicle cannot validate RS256 tokens
            logger.warning("[TOKEN-BRIDGE] RS256 token failed Keycloak validation (expired or JWKS error) — rejecting")
            return None
        # Not a Keycloak token — could be a service token already, pass through
        logger.debug("[TOKEN-BRIDGE] Non-Keycloak token (alg=%s), passing through", _alg)
        return token

    # It's a Keycloak token - bridge it
    user_email = keycloak_user.get("email")
    keycloak_sub = keycloak_user.get("sub")
    user_name = keycloak_user.get("name")

    logger.debug(f"[TOKEN-BRIDGE] Extracted from token - email: {user_email}, name: '{user_name}', sub: {keycloak_sub}")

    if not user_email or not keycloak_sub:
        logger.error(f"[TOKEN-BRIDGE] Missing user info: email={user_email}, keycloak_sub={keycloak_sub}")
        return None

    # Sync Keycloak user to MongoDB (creates User record if needed)
    # This gives us a MongoDB ObjectId that Chronicle can use
    try:
        mongodb_user_id = await get_mongodb_user_id_for_keycloak_user(
            keycloak_sub=keycloak_sub,
            email=user_email,
            name=user_name
        )
        logger.debug(f"[TOKEN-BRIDGE] Keycloak {keycloak_sub} → MongoDB {mongodb_user_id}")
    except Exception as e:
        logger.error(f"[TOKEN-BRIDGE] Failed to sync Keycloak user to MongoDB: {e}", exc_info=True)
        return None

    # Generate service token with MongoDB ObjectId
    audiences = audiences or ["ushadow", "chronicle"]
    service_token = generate_jwt_for_service(
        user_id=mongodb_user_id,  # Use MongoDB ObjectId, not Keycloak UUID
        user_email=user_email,
        audiences=audiences
    )

    logger.info(f"[TOKEN-BRIDGE] ✓ Bridged Keycloak token for {user_email} → service token (MongoDB ID: {mongodb_user_id})")
    logger.debug(f"[TOKEN-BRIDGE] Audiences: {audiences}, token: {service_token[:30]}...")

    return service_token


def is_keycloak_token(token: str) -> bool:
    """
    Check if a token is a Keycloak token (vs service token).

    Args:
        token: JWT token to check

    Returns:
        True if token is from Keycloak, False otherwise
    """
    keycloak_user = get_keycloak_user_from_token(token)
    return keycloak_user is not None
