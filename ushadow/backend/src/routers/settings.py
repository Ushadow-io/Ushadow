"""
Settings and configuration endpoints (OmegaConf-based)

Provides REST API for reading and updating settings with:
- Automatic config merging (defaults → secrets → MongoDB)
- Variable interpolation support
- Single source of truth via OmegaConf
"""

import logging
from typing import Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from omegaconf import OmegaConf

from src.config.settings import get_settings
from src.services.omegaconf_settings import get_omegaconf_settings

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


class SettingsResponse(BaseModel):
    """Settings response model."""
    env_name: str
    mongodb_database: str
    chronicle_url: str
    mcp_enabled: bool
    agent_zero_enabled: bool
    n8n_enabled: bool


@router.get("", response_model=SettingsResponse)
async def get_settings_info():
    """Get current settings information."""
    return SettingsResponse(
        env_name=settings.ENV_NAME,
        mongodb_database=settings.MONGODB_DATABASE,
        chronicle_url=settings.CHRONICLE_URL,
        mcp_enabled=settings.MCP_ENABLED,
        agent_zero_enabled=settings.AGENT_ZERO_ENABLED,
        n8n_enabled=settings.N8N_ENABLED
    )


@router.get("/config")
async def get_config():
    """Get merged configuration with secrets masked."""
    try:
        omegaconf_mgr = get_omegaconf_settings()
        merged = await omegaconf_mgr.load_config()
        config = OmegaConf.to_container(merged, resolve=True)

        # Mask sensitive values in api_keys
        if config.get("api_keys"):
            for key, value in config["api_keys"].items():
                if value and len(str(value)) > 4:
                    config["api_keys"][key] = "***" + str(value)[-4:]

        return config
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
