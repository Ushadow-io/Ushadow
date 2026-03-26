"""
Token Bridge Utility

Automatically converts Casdoor OIDC tokens to service-compatible JWT tokens.
This allows proxy and audio relay to transparently bridge authentication.

Usage:
    token = extract_token_from_request(request)
    service_token = await bridge_to_service_token(token, audiences=["chronicle"])
"""

import logging
from typing import Optional
from fastapi import Request
from fastapi.security import HTTPBearer

from .auth import generate_jwt_for_service, get_user_from_token

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


def extract_token_from_request(request: Request) -> Optional[str]:
    """Extract Bearer token from Authorization header or query parameter."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return request.query_params.get("token")


async def bridge_to_service_token(
    token: str,
    audiences: Optional[list[str]] = None
) -> Optional[str]:
    """
    Convert a Casdoor OIDC token to a service-compatible JWT token.

    If the token is not a valid Casdoor token, returns it unchanged
    (letting the downstream service validate it instead).
    """
    if not token:
        return None

    user = await get_user_from_token(token)

    if not user:
        logger.debug("[TOKEN-BRIDGE] Token is not a Casdoor token, passing through")
        return token

    service_token = generate_jwt_for_service(
        user_id=str(user.id),
        user_email=user.email,
        audiences=audiences or ["ushadow", "chronicle"],
    )
    logger.info("[TOKEN-BRIDGE] ✓ Bridged Casdoor token for %s → service token", user.email)
    return service_token
