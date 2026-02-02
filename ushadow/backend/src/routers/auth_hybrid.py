"""Hybrid authentication router (supports both Keycloak and legacy auth).

This router enables gradual migration from fastapi-users to Keycloak:
- When keycloak.enabled=false: Uses existing fastapi-users auth
- When keycloak.enabled=true: Uses Keycloak OIDC auth
- Hybrid mode: Validates both token types (for migration period)

Migration path:
1. Deploy Keycloak, keep it disabled (keycloak.enabled=false)
2. Run setup script to configure realm/clients
3. Enable Keycloak (keycloak.enabled=true)
4. Both systems work in parallel
5. Update frontend to use OIDC
6. Deprecate fastapi-users routes

"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from src.models.user import User, UserRead
from src.services.auth import get_current_user as get_legacy_user
from src.services.keycloak_auth import (
    KeycloakUser,
    get_current_user_keycloak,
    is_keycloak_enabled,
)
from src.config.keycloak_settings import is_keycloak_enabled

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = HTTPBearer(auto_error=False)


# ═══════════════════════════════════════════════════════════════════════
# DECISION POINT: How should hybrid auth behave?
# ═══════════════════════════════════════════════════════════════════════
#
# TODO: Implement get_current_user_hybrid() below
#
# You have three strategies to choose from:
#
# Strategy 1: Keycloak First (Recommended for migration)
#   - Try Keycloak validation first
#   - Fall back to legacy JWT if Keycloak fails
#   - Pros: Encourages migration, Keycloak becomes primary
#   - Cons: Extra latency if Keycloak is down
#
# Strategy 2: Legacy First (Conservative)
#   - Try legacy JWT first
#   - Fall back to Keycloak if legacy fails
#   - Pros: Minimal disruption, legacy still primary
#   - Cons: Delays Keycloak adoption
#
# Strategy 3: Strict Mode (No fallback)
#   - If keycloak.enabled=true: ONLY accept Keycloak tokens
#   - If keycloak.enabled=false: ONLY accept legacy tokens
#   - Pros: Clear separation, easier to debug
#   - Cons: Hard cutover, risky
#
# Consider:
# - Do you want a gradual migration or hard cutover?
# - What if Keycloak is temporarily down during migration?
# - Should old mobile apps (with legacy tokens) keep working?
# - How will you communicate the change to users?
#
# Implementation location: src/routers/auth_hybrid.py:76


async def get_current_user_hybrid(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(oauth2_scheme)
) -> User | KeycloakUser:
    """Hybrid authentication: supports both Keycloak and legacy JWT tokens.

    TODO: Choose and implement one of the three strategies above.

    Args:
        credentials: Bearer token from Authorization header

    Returns:
        User (legacy) or KeycloakUser (new) object

    Raises:
        HTTPException: If authentication fails with both methods
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    # Strategy 3: Strict Mode - Clean separation
    # When Keycloak is enabled, ONLY accept Keycloak tokens
    # When Keycloak is disabled, ONLY accept legacy tokens

    if is_keycloak_enabled():
        # Keycloak mode: Only accept OIDC tokens
        logger.info("Keycloak enabled - validating OIDC token")
        return await get_current_user_keycloak(credentials)
    else:
        # Legacy mode: Only accept fastapi-users JWT tokens
        logger.info("Keycloak disabled - validating legacy JWT token")
        return await get_legacy_user(credentials)


# ─────────────────────────────────────────────────────────────────────
# Example endpoint using hybrid auth
# ─────────────────────────────────────────────────────────────────────

@router.get("/me")
async def get_current_user_info(user = Depends(get_current_user_hybrid)):
    """Get current user info (works with both auth systems).

    This endpoint demonstrates hybrid auth:
    - Accepts legacy JWT tokens (fastapi-users)
    - Accepts Keycloak OIDC tokens
    - Returns user info in consistent format
    """
    # Check if it's a Keycloak user or legacy user
    if isinstance(user, KeycloakUser):
        # Keycloak user - return in compatible format
        return {
            "id": user.sub,
            "email": user.email,
            "display_name": user.name or user.preferred_username,
            "is_active": True,  # Keycloak users are always active (if authenticated)
            "is_superuser": user.is_superuser,
            "auth_provider": "keycloak"
        }
    else:
        # Legacy user - return existing format
        return {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "is_active": user.is_active,
            "is_superuser": user.is_superuser,
            "auth_provider": "legacy"
        }


@router.get("/status")
async def get_auth_status():
    """Get authentication system status.

    Useful for debugging and monitoring during migration.
    """
    return {
        "keycloak_enabled": is_keycloak_enabled(),
        "legacy_enabled": True,  # Always available during migration
        "migration_mode": "hybrid" if is_keycloak_enabled() else "legacy-only"
    }
