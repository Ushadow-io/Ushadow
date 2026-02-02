"""
Feature flags API endpoints.

Simple endpoints to verify feature flags are working.
"""

from fastapi import APIRouter, Depends
from typing import Optional
from src.services.feature_flags import get_feature_flag_service
from src.services.keycloak_auth import get_current_user_hybrid

router = APIRouter(prefix="/api/feature-flags", tags=["feature-flags"])


@router.get("/status")
async def get_feature_flags_status():
    """
    Get feature flag service status and list all flags.

    This is a public endpoint (no auth required) so it can be called on app startup.
    """
    service = get_feature_flag_service()

    if not service:
        return {
            "enabled": False,
            "message": "Feature flag service not initialized"
        }

    # Get the flags from YAML backend
    if hasattr(service, '_flags'):
        flags = {}
        for flag_name, flag_config in service._flags.items():
            flags[flag_name] = {
                "enabled": flag_config.get("enabled", False),
                "description": flag_config.get("description", ""),
                "type": flag_config.get("type", ""),
            }

        return {
            "enabled": True,
            "backend": "yaml",
            "flag_count": len(flags),
            "flags": flags
        }

    return {
        "enabled": True,
        "backend": "unknown",
        "message": "Unknown backend"
    }


@router.get("/check/{flag_name}")
async def check_feature_flag(flag_name: str, user=Depends(get_current_user_hybrid)):
    """
    Check if a specific feature flag is enabled for the current user.

    Args:
        flag_name: Name of the feature flag to check
    """
    service = get_feature_flag_service()

    if not service:
        return {
            "flag_name": flag_name,
            "enabled": False,
            "error": "Feature flag service not initialized"
        }

    user_id = str(user.get("id")) if user and isinstance(user, dict) else None
    is_enabled = service.is_enabled(flag_name, context={"userId": user_id} if user_id else None)

    return {
        "flag_name": flag_name,
        "enabled": is_enabled,
        "user_id": user_id
    }


@router.post("/toggle/{flag_name}")
async def toggle_feature_flag(flag_name: str, user=Depends(get_current_user_hybrid)):
    """
    Toggle a feature flag's enabled state.

    Args:
        flag_name: Name of the feature flag to toggle
    """
    service = get_feature_flag_service()

    if not service:
        return {
            "success": False,
            "error": "Feature flag service not initialized"
        }

    # Get current state
    flag_details = service.get_flag_details(flag_name)
    if not flag_details:
        return {
            "success": False,
            "error": f"Flag '{flag_name}' not found"
        }

    current_state = flag_details.get("enabled", False)
    new_state = not current_state

    # Update the flag
    success = await service.update_flag(flag_name, new_state)

    if success:
        return {
            "success": True,
            "flag_name": flag_name,
            "enabled": new_state,
            "previous_state": current_state
        }
    else:
        return {
            "success": False,
            "error": "Failed to update flag"
        }
