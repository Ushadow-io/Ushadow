"""
Setup wizard routes for ushadow initial configuration.
Uses OmegaConf for configuration management.
"""

import logging
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.config.omegaconf_settings import get_settings_store
from src.services.capability_resolver import get_capability_resolver
from src.services.compose_registry import get_compose_registry

logger = logging.getLogger(__name__)
router = APIRouter()
settings_store = get_settings_store()


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


class MissingKey(BaseModel):
    """A key/setting that needs to be configured."""
    key: str
    label: str
    settings_path: Optional[str] = None
    link: Optional[str] = None
    type: str = "secret"  # secret, url, string


class CapabilityRequirement(BaseModel):
    """A capability requirement with provider info."""
    id: str
    selected_provider: Optional[str] = None
    provider_name: Optional[str] = None
    provider_mode: Optional[str] = None
    configured: bool = False
    missing_keys: List[MissingKey] = []
    error: Optional[str] = None


class ServiceInfo(BaseModel):
    """Service information for the wizard."""
    name: str  # Technical name (e.g., "mem0")
    display_name: str  # Human-readable name (e.g., "OpenMemory")
    description: Optional[str] = None


class QuickstartResponse(BaseModel):
    """Response for quickstart wizard - aggregated capability requirements."""
    required_capabilities: List[CapabilityRequirement]
    services: List[ServiceInfo]  # Full service info, not just names
    all_configured: bool


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
        # Get API keys from OmegaConf
        openai_key = await settings_store.get("api_keys.openai_api_key")
        anthropic_key = await settings_store.get("api_keys.anthropic_api_key")
        deepgram_key = await settings_store.get("api_keys.deepgram_api_key")
        mistral_key = await settings_store.get("api_keys.mistral_api_key")

        # Wizard is complete if LLM and transcription are configured
        has_llm = bool(openai_key or anthropic_key)
        has_transcription = bool(deepgram_key or mistral_key)
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
    Get current API keys configuration from OmegaConf.

    Returns masked values to show which keys are configured.
    """
    try:
        return ApiKeysStep(
            openai_api_key=mask_key(await settings_store.get("api_keys.openai_api_key")),
            deepgram_api_key=mask_key(await settings_store.get("api_keys.deepgram_api_key")),
            mistral_api_key=mask_key(await settings_store.get("api_keys.mistral_api_key")),
            anthropic_api_key=mask_key(await settings_store.get("api_keys.anthropic_api_key")),
        )
    except Exception as e:
        logger.error(f"Error getting wizard API keys: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get API keys: {str(e)}")


@router.put("/api-keys", response_model=ApiKeysUpdateResponse)
async def update_wizard_api_keys(api_keys: ApiKeysStep):
    """
    Update API keys configuration via OmegaConf.

    Only updates keys that are provided (non-None values).
    Saves to secrets.yaml for persistence.
    """
    try:
        updates = {}

        # Collect updates (skip masked values)
        if api_keys.openai_api_key is not None and not api_keys.openai_api_key.startswith("***"):
            updates["api_keys.openai_api_key"] = api_keys.openai_api_key
        if api_keys.deepgram_api_key is not None and not api_keys.deepgram_api_key.startswith("***"):
            updates["api_keys.deepgram_api_key"] = api_keys.deepgram_api_key
        if api_keys.mistral_api_key is not None and not api_keys.mistral_api_key.startswith("***"):
            updates["api_keys.mistral_api_key"] = api_keys.mistral_api_key
        if api_keys.anthropic_api_key is not None and not api_keys.anthropic_api_key.startswith("***"):
            updates["api_keys.anthropic_api_key"] = api_keys.anthropic_api_key

        # Save to OmegaConf (writes to secrets.yaml)
        if updates:
            await settings_store.update(updates)
            logger.info(f"Wizard: API keys updated: {list(updates.keys())}")

        # Return masked values
        return ApiKeysUpdateResponse(
            api_keys=ApiKeysStep(
                openai_api_key=mask_key(await settings_store.get("api_keys.openai_api_key")),
                deepgram_api_key=mask_key(await settings_store.get("api_keys.deepgram_api_key")),
                mistral_api_key=mask_key(await settings_store.get("api_keys.mistral_api_key")),
                anthropic_api_key=mask_key(await settings_store.get("api_keys.anthropic_api_key")),
            ),
            success=True
        )
    except Exception as e:
        logger.error(f"Error updating wizard API keys: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update API keys: {str(e)}")


@router.get("/detect-keys")
async def detect_configured_keys():
    """
    Detect which API keys are configured in OmegaConf settings.

    Checks secrets.yaml and merged config for existing keys.
    """
    try:
        return {
            "openai_api_key": bool(await settings_store.get("api_keys.openai_api_key")),
            "deepgram_api_key": bool(await settings_store.get("api_keys.deepgram_api_key")),
            "mistral_api_key": bool(await settings_store.get("api_keys.mistral_api_key")),
            "anthropic_api_key": bool(await settings_store.get("api_keys.anthropic_api_key")),
        }
    except Exception as e:
        logger.error(f"Error detecting keys: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to detect keys: {str(e)}")


@router.post("/complete")
async def complete_wizard():
    """
    Mark wizard as complete.

    The wizard is automatically marked as complete when API keys are configured.
    """
    return {"status": "success", "message": "Wizard marked as complete"}


# =============================================================================
# Quickstart Wizard Endpoints
# =============================================================================

@router.get("/quickstart", response_model=QuickstartResponse)
async def get_quickstart_config() -> QuickstartResponse:
    """
    Get setup requirements for default services.

    This endpoint powers the quickstart wizard by:
    1. Getting default services from settings
    2. Using CapabilityResolver to determine what capabilities they need
    3. Returning aggregated provider/key requirements (deduplicated by capability)

    Returns capabilities with their providers and any missing keys.
    Also returns service info with display names for UI rendering.
    """
    settings = get_settings_store()
    resolver = get_capability_resolver()
    registry = get_compose_registry()

    # Get default services from settings
    default_services = await settings.get("default_services") or []

    # Use the reusable method from CapabilityResolver
    requirements = await resolver.get_setup_requirements(default_services)

    # Build service info with display names from compose registry
    service_infos = []
    for service_name in requirements["services"]:
        service = registry.get_service_by_name(service_name)
        if service:
            service_infos.append(ServiceInfo(
                name=service.service_name,
                display_name=service.display_name or service.service_name,
                description=service.description,
            ))
        else:
            # Fallback if service not found in registry
            service_infos.append(ServiceInfo(
                name=service_name,
                display_name=service_name,
            ))

    return QuickstartResponse(
        required_capabilities=[
            CapabilityRequirement(**cap) for cap in requirements["required_capabilities"]
        ],
        services=service_infos,
        all_configured=requirements["all_configured"]
    )


@router.post("/quickstart")
async def save_quickstart_config(key_values: Dict[str, str]) -> Dict[str, Any]:
    """
    Save key values from quickstart wizard.

    Accepts a dict of settings_path -> value (e.g., api_keys.openai_api_key -> sk-xxx).
    Saves directly to the settings store.
    """
    settings = get_settings_store()

    if not key_values:
        return {"success": True, "saved": 0, "message": "No values to save"}

    # Save all key values
    await settings.update(key_values)
    logger.info(f"Quickstart saved {len(key_values)} keys: {list(key_values.keys())}")

    return {
        "success": True,
        "saved": len(key_values),
        "message": "Configuration saved successfully"
    }
