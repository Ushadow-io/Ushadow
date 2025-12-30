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

from src.config.infra_settings import get_infra_settings
from src.config.omegaconf_settings import get_omegaconf_settings
from src.config.secrets import mask_dict_secrets

logger = logging.getLogger(__name__)
router = APIRouter()
infra = get_infra_settings()


class SettingsResponse(BaseModel):
    """Settings response model - infrastructure settings."""
    env_name: str
    mongodb_database: str


@router.get("", response_model=SettingsResponse)
async def get_settings_info():
    """Get current infrastructure settings."""
    return SettingsResponse(
        env_name=infra.ENV_NAME,
        mongodb_database=infra.MONGODB_DATABASE,
    )


@router.get("/config")
async def get_config():
    """Get merged configuration with secrets masked."""
    try:
        omegaconf_mgr = get_omegaconf_settings()
        merged = await omegaconf_mgr.load_config()
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
        # Defense-in-depth: reject masked values to prevent accidental overwrites
        if "api_keys" in updates:
            for key, value in list(updates["api_keys"].items()):
                if value and str(value).startswith("***"):
                    logger.warning(f"Rejecting masked value for {key}")
                    del updates["api_keys"][key]
            if not updates["api_keys"]:
                del updates["api_keys"]

        if not updates:
            return {"success": True, "message": "No updates to apply"}

        omegaconf_mgr = get_omegaconf_settings()
        await omegaconf_mgr.update(updates)

        return {"success": True, "message": "Configuration updated"}
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/service-configs")
async def get_all_service_configs():
    """Get all service-specific configurations."""
    try:
        omegaconf_mgr = get_omegaconf_settings()
        merged = await omegaconf_mgr.load_config()
        return OmegaConf.to_container(merged.service_preferences, resolve=True)
    except Exception as e:
        logger.error(f"Error getting service configs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/service-configs/{service_id}")
async def get_service_config(service_id: str):
    """Get configuration for a specific service."""
    try:
        omegaconf_mgr = get_omegaconf_settings()
        merged = await omegaconf_mgr.load_config()
        service_prefs = getattr(merged.service_preferences, service_id, None)
        if service_prefs:
            return OmegaConf.to_container(service_prefs, resolve=True)
        return {}
    except Exception as e:
        logger.error(f"Error getting service config for {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/service-configs/{service_id}")
async def update_service_config(service_id: str, updates: Dict[str, Any]):
    """Update configuration for a specific service."""
    try:
        omegaconf_mgr = get_omegaconf_settings()
        await omegaconf_mgr.update({
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
        omegaconf_mgr = get_omegaconf_settings()
        await omegaconf_mgr.update({
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
    Reset configuration by clearing config_settings.yaml.

    This removes runtime configuration preferences, reverting to
    file-based defaults. Note: secrets.yaml (API keys) is preserved.
    """
    try:
        omegaconf_mgr = get_omegaconf_settings()

        # Delete config_settings.yaml if it exists (preserves secrets.yaml)
        deleted = 0
        if omegaconf_mgr.settings_path.exists():
            omegaconf_mgr.settings_path.unlink()
            logger.info(f"Reset config: deleted {omegaconf_mgr.settings_path}")
            deleted = 1

        # Invalidate the cache
        omegaconf_mgr._cache = None

        return {
            "success": True,
            "message": "Configuration reset to defaults (API keys preserved)",
            "deleted": deleted
        }
    except Exception as e:
        logger.error(f"Error resetting config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
