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

from src.config.omegaconf_settings import get_settings_store
from src.config.secrets import mask_dict_secrets
from src.services.compose_registry import get_compose_registry
from src.services.provider_registry import get_provider_registry

logger = logging.getLogger(__name__)
router = APIRouter()
config = get_settings_store()


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
    """Get merged configuration with secrets masked."""
    try:
        settings_store = get_settings_store()
        merged = await settings_store.load_config()
        config = OmegaConf.to_container(merged, resolve=True)

        # Recursively mask all sensitive values
        masked_config = mask_dict_secrets(config)

        return masked_config
    except Exception as e:
        logger.error(f"Error getting config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config")
async def update_config(updates: Dict[str, Any]):
    """Update configuration values."""
    try:
        settings_store = get_settings_store()
        
        # Filter out masked values to prevent accidental overwrites
        filtered = settings_store._filter_masked_values(updates)
        if not filtered:
            return {"success": True, "message": "No updates to apply"}

        await settings_store.update(filtered)
        return {"success": True, "message": "Configuration updated"}
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/service-configs")
async def get_all_service_configs():
    """Get all service-specific configurations."""
    try:
        settings_store = get_settings_store()
        merged = await settings_store.load_config()
        return OmegaConf.to_container(merged.service_preferences, resolve=True)
    except Exception as e:
        logger.error(f"Error getting service configs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/service-configs/{service_id}")
async def get_service_config(service_id: str):
    """Get configuration for a specific service (with secrets masked)."""
    try:
        settings_store = get_settings_store()
        merged = await settings_store.load_config()
        service_prefs = getattr(merged.service_preferences, service_id, None)
        if service_prefs:
            config_dict = OmegaConf.to_container(service_prefs, resolve=True)
            # Mask secrets before returning
            return mask_dict_secrets(config_dict)
        return {}
    except Exception as e:
        logger.error(f"Error getting service config for {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/service-configs/{service_id}")
async def update_service_config(service_id: str, updates: Dict[str, Any]):
    """Update configuration for a specific service."""
    try:
        settings_store = get_settings_store()
        await settings_store.update({
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
        settings_store = get_settings_store()
        await settings_store.update({
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
        settings_store = get_settings_store()
        deleted = await settings_store.reset(include_secrets=True)
        return {
            "success": True,
            "message": "All settings reset to defaults",
            "deleted": deleted
        }
    except Exception as e:
        logger.error(f"Error resetting config: {e}")
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
        settings_store = get_settings_store()
        settings_store.clear_cache()

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
