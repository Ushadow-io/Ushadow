"""Keycloak User-Managed Access (UMA) implementation.

This module handles resource-based permissions for voice message sharing.
Complete the TODOs based on your performance and consistency requirements.

Three implementation strategies are provided - choose the best fit for your use case.
"""

import logging
from typing import Optional
from functools import lru_cache
from datetime import datetime, timedelta

import httpx
from keycloak import KeycloakOpenID, KeycloakAdmin

from src.services.keycloak_auth import get_keycloak_openid, get_keycloak_admin, KeycloakUser

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════
# LEARNING OPPORTUNITY: Choose Your Permission Check Strategy
# ═══════════════════════════════════════════════════════════════════════
#
# There are three ways to implement check_voice_message_access():
#
# Strategy 1: UMA Token Request (Standard, Secure)
#   - Request a token with permissions from Keycloak
#   - Cache the token for subsequent requests
#   - Pros: Standard UMA pattern, secure, auditable
#   - Cons: Extra round-trip to Keycloak on cache miss
#   - Best for: High security, audit requirements, real-time revocation
#
# Strategy 2: Pre-loaded Permissions (Fast, Eventually Consistent)
#   - Fetch all user permissions at login
#   - Store in token claims or Redis cache
#   - Pros: Very fast, no per-request Keycloak calls
#   - Cons: Permissions may be stale until token refresh
#   - Best for: High-traffic, tolerate 5-10 min delay on revocation
#
# Strategy 3: Direct Authorization API (Simple, Flexible)
#   - Query Keycloak authorization endpoint directly
#   - Check permission for specific resource + scope
#   - Pros: Simple, always up-to-date, flexible policies
#   - Cons: More API calls to Keycloak
#   - Best for: Moderate traffic, need real-time, simple to understand
#
# Consider:
# - How many voice messages does a typical user access per session?
# - How critical is instant revocation? (life or death vs. convenience)
# - What's your Keycloak infrastructure? (local vs. remote, latency)
# - What's acceptable permission check latency? (<10ms, <100ms, <500ms)
#
# Your task: Implement the strategy that fits your requirements in
# check_voice_message_access() below. Remove the other strategies.


# ─────────────────────────────────────────────────────────────────────
# Strategy 1: UMA Token Request (Recommended for Most Cases)
# ─────────────────────────────────────────────────────────────────────

class UMATokenCache:
    """Simple in-memory cache for UMA tokens.

    In production, consider using Redis for distributed caching.
    """
    def __init__(self):
        self._cache: dict[str, tuple[str, datetime]] = {}

    def get(self, key: str) -> Optional[str]:
        """Get cached token if not expired."""
        if key in self._cache:
            token, expires_at = self._cache[key]
            if datetime.utcnow() < expires_at:
                return token
            del self._cache[key]
        return None

    def set(self, key: str, token: str, ttl_seconds: int = 300):
        """Cache token with TTL (default 5 minutes)."""
        expires_at = datetime.utcnow() + timedelta(seconds=ttl_seconds)
        self._cache[key] = (token, expires_at)


_uma_token_cache = UMATokenCache()


async def check_voice_message_access_uma(
    message_id: str,
    user: KeycloakUser,
    required_scope: str = "view"
) -> bool:
    """Check permission using UMA token request.

    This is the standard UMA pattern:
    1. Request a token with specific permission from Keycloak
    2. If granted, user has permission
    3. If denied, user doesn't have permission
    4. Cache the result for performance

    Implementation status: TODO - Complete the REST API calls below
    """
    cache_key = f"uma:{user.sub}:{message_id}:{required_scope}"

    # Check cache first
    cached_token = _uma_token_cache.get(cache_key)
    if cached_token:
        return True  # Has cached permission

    try:
        keycloak = get_keycloak_openid()

        # Request UMA token with permission
        # TODO: Implement this using Keycloak's token endpoint
        # POST /realms/{realm}/protocol/openid-connect/token
        # {
        #   "grant_type": "urn:ietf:params:oauth:grant-type:uma-ticket",
        #   "audience": "ushadow-backend",
        #   "permission": f"voice-message-{message_id}#{required_scope}"
        # }

        # For now, return placeholder
        # In real implementation:
        # response = await keycloak.uma_ticket(...)
        # if response successful, cache and return True

        logger.warning(f"UMA token request not implemented - defaulting to allow")
        return True  # TODO: Replace with actual check

    except Exception as e:
        logger.error(f"UMA permission check failed: {e}")
        return False


# ─────────────────────────────────────────────────────────────────────
# Strategy 2: Pre-loaded Permissions (Fastest, Eventually Consistent)
# ─────────────────────────────────────────────────────────────────────

async def load_user_permissions(user: KeycloakUser) -> dict[str, list[str]]:
    """Load all resources the user has access to.

    Call this once at login, store in Redis or token claims.

    Returns:
        {
            "voice-message-123": ["view"],
            "voice-message-456": ["view", "share", "delete"],
        }

    Implementation status: TODO - Complete the authorization query
    """
    # TODO: Query Keycloak for all user permissions
    # GET /realms/{realm}/authz/protection/permission
    # Or use Keycloak's authorization client

    logger.warning("User permission loading not implemented")
    return {}


async def check_voice_message_access_preloaded(
    message_id: str,
    user_permissions: dict[str, list[str]],  # From user token or cache
    required_scope: str = "view"
) -> bool:
    """Check permission against pre-loaded permissions.

    Fast but may be stale until token refresh (typically 5-10 minutes).
    """
    resource_key = f"voice-message-{message_id}"
    scopes = user_permissions.get(resource_key, [])
    return required_scope in scopes


# ─────────────────────────────────────────────────────────────────────
# Strategy 3: Direct Authorization API (Simple, Always Up-to-Date)
# ─────────────────────────────────────────────────────────────────────

async def check_voice_message_access_direct(
    message_id: str,
    user: KeycloakUser,
    required_scope: str = "view"
) -> bool:
    """Check permission by querying Keycloak authorization API directly.

    Simple and always up-to-date, but makes a Keycloak call on every check.

    Implementation status: TODO - Complete the authorization query
    """
    try:
        admin = get_keycloak_admin()

        # TODO: Query Keycloak authorization endpoint
        # This requires knowing the client's internal UUID and resource ID
        # GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/permission/evaluate

        # Pseudocode:
        # result = await admin.evaluate_permission(
        #     user_id=user.sub,
        #     resource_id=f"voice-message-{message_id}",
        #     scope=required_scope
        # )
        # return result.decision == "PERMIT"

        logger.warning("Direct authorization check not implemented - defaulting to allow")
        return True  # TODO: Replace with actual check

    except Exception as e:
        logger.error(f"Authorization check failed: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════
# DECISION POINT: Which strategy will you implement?
# ═══════════════════════════════════════════════════════════════════════
#
# Uncomment the one you choose and complete the TODOs:

# Option A: UMA Token Request (recommended for most cases)
check_voice_message_access = check_voice_message_access_uma

# Option B: Pre-loaded Permissions (for high-performance requirements)
# check_voice_message_access = check_voice_message_access_preloaded

# Option C: Direct API (for simplicity and real-time requirements)
# check_voice_message_access = check_voice_message_access_direct


# ─────────────────────────────────────────────────────────────────────
# Resource Management (Common to all strategies)
# ─────────────────────────────────────────────────────────────────────

async def create_voice_message_resource(
    message_id: str,
    owner_user_id: str
) -> dict:
    """Create a protected resource in Keycloak for a voice message.

    Implementation status: TODO - Complete the REST API call
    """
    admin = get_keycloak_admin()
    client_uuid = admin.get_client_id("ushadow-backend")

    # TODO: Create resource via Keycloak Admin REST API
    # POST /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource
    # {
    #   "name": f"voice-message-{message_id}",
    #   "type": "voice-message",
    #   "owner": {"id": owner_user_id},
    #   "ownerManagedAccess": true,
    #   "uris": [f"/voice-messages/{message_id}"],
    #   "scopes": [
    #     {"name": "view"},
    #     {"name": "share"},
    #     {"name": "delete"}
    #   ]
    # }

    logger.info(f"Creating Keycloak resource for voice message: {message_id}")
    return {"id": message_id, "owner": owner_user_id}


async def grant_voice_message_access(
    message_id: str,
    user_id: str,
    scopes: list[str] = None,
) -> bool:
    """Grant a user permission to access a voice message.

    Implementation status: TODO - Complete the REST API call
    """
    if scopes is None:
        scopes = ["view"]

    # TODO: Create permission policy in Keycloak
    # This typically involves:
    # 1. Create a user-based policy (if doesn't exist)
    # 2. Create a scope-based permission linking the policy to resource

    logger.info(f"Granting {scopes} access to voice message {message_id} for user {user_id}")
    return True


async def revoke_voice_message_access(
    message_id: str,
    user_id: str,
) -> bool:
    """Revoke a user's permission to access a voice message.

    Implementation status: TODO - Complete the REST API call
    """
    # TODO: Delete the permission policy in Keycloak
    # DELETE /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/permission/{permission-id}

    logger.info(f"Revoking access to voice message {message_id} for user {user_id}")
    return True


# ═══════════════════════════════════════════════════════════════════════
# YOUR TASK: Complete one of the three strategies above
# ═══════════════════════════════════════════════════════════════════════
#
# The TODOs marked above require direct REST API calls to Keycloak.
# The python-keycloak library doesn't fully support Authorization Services,
# so you'll need to use httpx or requests to call the REST endpoints.
#
# Helpful resources:
# - Keycloak Authorization Services REST API:
#   https://www.keycloak.org/docs-api/latest/rest-api/index.html#_authorization_services_resource
# - UMA Grant Type:
#   https://www.keycloak.org/docs/latest/authorization_services/#_service_overview
# - Permission Evaluation:
#   https://www.keycloak.org/docs/latest/authorization_services/#_service_authorization_api
#
# Example REST call structure:
#
# async with httpx.AsyncClient() as client:
#     response = await client.post(
#         f"{keycloak_url}/admin/realms/{realm}/...",
#         json={...},
#         headers={"Authorization": f"Bearer {admin_token}"}
#     )
#     response.raise_for_status()
#     return response.json()
