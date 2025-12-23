"""
Setup wizard routes for ushadow initial configuration.
Adapted from Chronicle wizard for ushadow architecture.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.config.settings import get_settings
from src.config.config_parser import get_config_parser, UshadowConfig

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

# Initialize config parser
config_parser = get_config_parser()


# Models

class WizardStatusResponse(BaseModel):
    """Wizard completion status."""
    wizard_completed: bool = Field(..., description="Whether wizard has been completed")
    current_step: str = Field(default="setup_type", description="Current wizard step")
    completed_steps: list[str] = Field(default_factory=list, description="Completed wizard steps")


class ApiKeysStep(BaseModel):
    """API Keys configuration step."""
    openai_api_key: Optional[str] = None
    deepgram_api_key: Optional[str] = None
    mistral_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None


class ApiKeysUpdateResponse(BaseModel):
    """Response for API keys update operation."""
    api_keys: ApiKeysStep = Field(..., description="Updated API keys (masked)")
    success: bool = Field(default=True, description="Whether update was successful")


# Helper functions

def mask_key(key: str | None) -> str | None:
    """Mask API key for display (show only last 4 characters)."""
    if not key:
        return None
    return "***" + key[-4:] if len(key) > 4 else "***"


# Endpoints

@router.get("/status", response_model=WizardStatusResponse)
async def get_wizard_status():
    """
    Get current wizard completion status.

    Wizard is complete when basic API keys are configured.
    """
    try:
        config = await config_parser.load()

        # Wizard is complete if LLM and transcription are configured
        has_llm = bool(config.api_keys.openai_api_key or config.api_keys.anthropic_api_key)
        has_transcription = bool(config.api_keys.deepgram_api_key or config.api_keys.mistral_api_key)
        wizard_completed = has_llm and has_transcription

        # Determine current step and completed steps
        if wizard_completed:
            current_step = "complete"
            completed_steps = ["setup_type", "api_keys"]
        elif has_llm or has_transcription:
            # Some keys configured, on api_keys step
            current_step = "api_keys"
            completed_steps = ["setup_type"]
        else:
            # No keys configured, start at beginning
            current_step = "setup_type"
            completed_steps = []

        return WizardStatusResponse(
            wizard_completed=wizard_completed,
            current_step=current_step,
            completed_steps=completed_steps
        )
    except Exception as e:
        logger.error(f"Error getting wizard status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get wizard status: {str(e)}")


@router.get("/api-keys", response_model=ApiKeysStep)
async def get_wizard_api_keys():
    """
    Get current API keys configuration.

    Returns masked values to show which keys are configured.
    """
    try:
        config = await config_parser.load()

        return ApiKeysStep(
            openai_api_key=mask_key(config.api_keys.openai_api_key),
            deepgram_api_key=mask_key(config.api_keys.deepgram_api_key),
            mistral_api_key=mask_key(config.api_keys.mistral_api_key),
            anthropic_api_key=mask_key(config.api_keys.anthropic_api_key),
        )
    except Exception as e:
        logger.error(f"Error getting wizard API keys: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get API keys: {str(e)}")


@router.put("/api-keys", response_model=ApiKeysUpdateResponse)
async def update_wizard_api_keys(api_keys: ApiKeysStep):
    """
    Update API keys configuration.

    Only updates keys that are provided (non-None values).
    """
    try:
        config = await config_parser.load()

        # Update only provided keys
        if api_keys.openai_api_key is not None and not api_keys.openai_api_key.startswith("***"):
            config.api_keys.openai_api_key = api_keys.openai_api_key
        if api_keys.deepgram_api_key is not None and not api_keys.deepgram_api_key.startswith("***"):
            config.api_keys.deepgram_api_key = api_keys.deepgram_api_key
        if api_keys.mistral_api_key is not None and not api_keys.mistral_api_key.startswith("***"):
            config.api_keys.mistral_api_key = api_keys.mistral_api_key
        if api_keys.anthropic_api_key is not None and not api_keys.anthropic_api_key.startswith("***"):
            config.api_keys.anthropic_api_key = api_keys.anthropic_api_key

        # Save configuration
        await config_parser.save(config)
        logger.info("Wizard: API keys updated")

        # Return masked values
        return ApiKeysUpdateResponse(
            api_keys=ApiKeysStep(
                openai_api_key=mask_key(config.api_keys.openai_api_key),
                deepgram_api_key=mask_key(config.api_keys.deepgram_api_key),
                mistral_api_key=mask_key(config.api_keys.mistral_api_key),
                anthropic_api_key=mask_key(config.api_keys.anthropic_api_key),
            ),
            success=True
        )
    except Exception as e:
        logger.error(f"Error updating wizard API keys: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update API keys: {str(e)}")


@router.get("/detect-env-keys")
async def detect_env_keys():
    """
    Detect API keys in environment variables.

    Checks if keys are set in the environment.
    """
    return {
        "openai_api_key": settings.OPENAI_API_KEY if settings.OPENAI_API_KEY else None,
        "deepgram_api_key": settings.DEEPGRAM_API_KEY if settings.DEEPGRAM_API_KEY else None,
        "mistral_api_key": settings.MISTRAL_API_KEY if settings.MISTRAL_API_KEY else None,
        "anthropic_api_key": settings.ANTHROPIC_API_KEY if settings.ANTHROPIC_API_KEY else None,
    }


@router.post("/import-env-keys")
async def import_env_keys():
    """
    Import API keys from environment variables.

    Copies keys from environment to database configuration.
    """
    try:
        updates = {}
        if settings.OPENAI_API_KEY:
            updates['openai_api_key'] = settings.OPENAI_API_KEY
        if settings.DEEPGRAM_API_KEY:
            updates['deepgram_api_key'] = settings.DEEPGRAM_API_KEY
        if settings.MISTRAL_API_KEY:
            updates['mistral_api_key'] = settings.MISTRAL_API_KEY
        if settings.ANTHROPIC_API_KEY:
            updates['anthropic_api_key'] = settings.ANTHROPIC_API_KEY

        if updates:
            config = await config_service.load_config()
            config.update(updates)
            await config_service.save_config(config)
            logger.info(f"Imported {len(updates)} API keys from environment")

        return updates
    except Exception as e:
        logger.error(f"Error importing env keys: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to import API keys: {str(e)}")


@router.post("/complete")
async def complete_wizard():
    """
    Mark wizard as complete.

    The wizard is automatically marked as complete when API keys are configured.
    """
    return {"status": "success", "message": "Wizard marked as complete"}
