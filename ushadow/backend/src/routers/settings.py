"""
Settings and configuration endpoints (OmegaConf-based)

Provides REST API for reading and updating settings with:
- Automatic config merging (defaults → secrets → overrides)
- Variable interpolation support
- Single source of truth via OmegaConf
"""

import logging
from typing import Dict, Any, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from omegaconf import OmegaConf

from src.config import get_settings
from src.config.secrets import mask_dict_secrets
from src.services.compose_registry import get_compose_registry
from src.services.provider_registry import get_provider_registry

logger = logging.getLogger(__name__)
router = APIRouter()
config = get_settings()


class SettingsResponse(BaseModel):
    """Settings response model - infrastructure settings."""
    env_name: str
    mongodb_database: str


@router.get("", response_model=SettingsResponse)
async def get_settings_info():
    """Get current infrastructure settings."""
    env_name = await config.get("environment.name") or "ushadow"
    mongodb_database = await config.get("infrastructure.mongodb_database") or "ushadow"
    return SettingsResponse(
        env_name=env_name,
        mongodb_database=mongodb_database,
    )


@router.get("/config")
async def get_config():
    """Get merged configuration with secrets masked.

    Dynamically injects keycloak.public_url based on Tailscale configuration.
    """
    try:
        from src.config.keycloak_settings import get_keycloak_config

        settings = get_settings()
        all_config = await settings.get_all()

        # Inject dynamic Keycloak config (public_url determined from tailscale.hostname)
        keycloak_config = get_keycloak_config()
        if "keycloak" not in all_config:
            all_config["keycloak"] = {}
        all_config["keycloak"]["public_url"] = keycloak_config["public_url"]
        all_config["keycloak"]["realm"] = keycloak_config["realm"]
        all_config["keycloak"]["frontend_client_id"] = keycloak_config["frontend_client_id"]

        # Recursively mask all sensitive values
        masked_config = mask_dict_secrets(all_config)

        return masked_config
    except Exception as e:
        logger.error(f"Error getting config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config")
async def update_config(updates: Dict[str, Any]):
    """Update configuration values."""
    try:
        settings = get_settings()

        if not updates:
            return {"success": True, "message": "No updates to apply"}

        await settings.update(updates)
        return {"success": True, "message": "Configuration updated"}
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/service-configs")
async def get_all_service_configs():
    """Get all service-specific configurations."""
    try:
        settings = get_settings()
        return await settings.get("service_preferences", {})
    except Exception as e:
        logger.error(f"Error getting service configs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/service-configs/{service_id}")
async def get_service_config(service_id: str):
    """Get configuration for a specific service."""
    try:
        settings = get_settings()
        return await settings.get(f"service_preferences.{service_id}", {})
    except Exception as e:
        logger.error(f"Error getting service config for {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/service-configs/{service_id}")
async def update_service_config(service_id: str, updates: Dict[str, Any]):
    """Update configuration for a specific service."""
    try:
        settings = get_settings()
        await settings.update({
            "service_preferences": {
                service_id: updates
            }
        })
        return {"success": True, "message": f"Configuration updated for {service_id}"}
    except Exception as e:
        logger.error(f"Error updating service config for {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/service-configs/{service_id}")
async def delete_service_config(service_id: str):
    """Delete configuration for a specific service."""
    try:
        settings = get_settings()
        await settings.update({
            "service_preferences": {
                service_id: {}
            }
        })
        return {"success": True, "message": f"Configuration deleted for {service_id}"}
    except Exception as e:
        logger.error(f"Error deleting service config for {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset")
async def reset_config():
    """
    Reset all configuration including API keys.

    Deletes both config_settings.yaml and secrets.yaml,
    returning to factory defaults.
    """
    try:
        settings = get_settings()
        deleted = await settings.reset(include_secrets=True)
        return {
            "success": True,
            "message": "All settings reset to defaults",
            "deleted": deleted
        }
    except Exception as e:
        logger.error(f"Error resetting config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/secret/{key_path:path}")
async def get_secret_value(key_path: str):
    """
    Get an unmasked secret value by path.

    This is a server-side only endpoint for retrieving actual secret values
    for operations like service configuration. The value is never sent to
    the frontend - only used in backend operations.

    Args:
        key_path: Dot-separated path to secret (e.g., "security.auth_secret_key")

    Returns:
        {"value": "actual_secret_value"}
    """
    try:
        settings = get_settings()
        value = await settings.get(key_path)

        if value is None:
            raise HTTPException(status_code=404, detail=f"Secret not found at path: {key_path}")

        return {"value": value}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting secret at {key_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh")
async def refresh_config() -> Dict[str, Any]:
    """
    Refresh all cached configuration.

    Reloads:
    - OmegaConf settings cache
    - Compose service registry (compose files)
    - Provider registry (capabilities and providers)

    Use after editing YAML config files to pick up changes without restart.
    """
    try:
        # Clear OmegaConf settings cache
        settings = get_settings()
        settings.clear_cache()

        # Refresh compose registry
        compose_registry = get_compose_registry()
        compose_registry.refresh()

        # Refresh provider registry
        provider_registry = get_provider_registry()
        provider_registry.refresh()

        return {
            "success": True,
            "message": "Configuration refreshed",
            "services": len(compose_registry.get_services()),
            "providers": len(provider_registry.get_providers()),
        }
    except Exception as e:
        logger.error(f"Error refreshing config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
