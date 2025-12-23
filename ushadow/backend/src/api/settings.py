"""
Settings and configuration endpoints
"""

import logging
from typing import Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.config.settings import get_settings
from src.services.config_service import ConfigService

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()
config_service = ConfigService()


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
    """Get stored configuration."""
    try:
        config = await config_service.load_config()
        # Mask sensitive values
        if "openai_api_key" in config and config["openai_api_key"]:
            config["openai_api_key"] = "***" + config["openai_api_key"][-4:]
        if "deepgram_api_key" in config and config["deepgram_api_key"]:
            config["deepgram_api_key"] = "***" + config["deepgram_api_key"][-4:]
        if "mistral_api_key" in config and config["mistral_api_key"]:
            config["mistral_api_key"] = "***" + config["mistral_api_key"][-4:]
        if "anthropic_api_key" in config and config["anthropic_api_key"]:
            config["anthropic_api_key"] = "***" + config["anthropic_api_key"][-4:]
        return config
    except Exception as e:
        logger.error(f"Error getting config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
