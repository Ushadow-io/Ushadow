"""
Setup wizard routes for ushadow initial configuration.
Uses OmegaConf for configuration management.
"""

import logging
from typing import Optional, List, Dict, Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.config.omegaconf_settings import (
    get_settings_store,
    SettingSuggestion,
    infer_setting_type,
)
from src.services.compose_registry import get_compose_registry
from src.services.provider_registry import get_provider_registry

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
    hf_token: Optional[str] = None  # HuggingFace token for speaker-recognition


class ApiKeysUpdateResponse(BaseModel):
    """Response for API keys update operation."""
    api_keys: ApiKeysStep = Field(..., description="Updated API keys (masked)")
    success: bool = Field(default=True, description="Whether update was successful")


class IncompleteEnvVar(BaseModel):
    """An environment variable that needs configuration."""
    name: str
    service_id: str
    service_name: str
    has_default: bool = False
    default_value: Optional[str] = None
    suggestions: List[Dict[str, Any]] = []  # SettingSuggestion as dicts
    setting_type: str = "secret"  # secret, url, string


class QuickstartResponse(BaseModel):
    """Response for quickstart wizard."""
    incomplete_env_vars: List[IncompleteEnvVar]
    services_needing_setup: List[str]
    total_services: int
    ready_services: int


class HuggingFaceStatusResponse(BaseModel):
    """Response for HuggingFace connection status."""
    connected: bool = Field(..., description="Whether HF token is valid and connected")
    username: Optional[str] = Field(None, description="HuggingFace username if connected")
    has_token: bool = Field(..., description="Whether an HF token is configured")
    error: Optional[str] = Field(None, description="Error message if connection failed")


class ModelAccessStatus(BaseModel):
    """Access status for a single model."""
    model_id: str
    has_access: bool
    error: Optional[str] = None


class HuggingFaceModelsResponse(BaseModel):
    """Response for HuggingFace model access check."""
    models: List[ModelAccessStatus]
    all_accessible: bool = Field(..., description="Whether all required models are accessible")


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
            hf_token=mask_key(await settings_store.get("api_keys.hf_token")),
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
        if api_keys.hf_token is not None and not api_keys.hf_token.startswith("***"):
            updates["api_keys.hf_token"] = api_keys.hf_token

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
                hf_token=mask_key(await settings_store.get("api_keys.hf_token")),
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


@router.get("/huggingface/status", response_model=HuggingFaceStatusResponse)
async def get_huggingface_status():
    """
    Check HuggingFace connection status.

    Validates the stored HF token by calling the HuggingFace API.
    Returns connection status and username if connected.
    """
    try:
        hf_token = await settings_store.get("api_keys.hf_token")

        if not hf_token:
            return HuggingFaceStatusResponse(
                connected=False,
                has_token=False,
                username=None,
                error=None
            )

        # Validate token with HuggingFace API
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://huggingface.co/api/whoami-v2",
                headers={"Authorization": f"Bearer {hf_token}"}
            )

            if response.status_code == 200:
                data = response.json()
                return HuggingFaceStatusResponse(
                    connected=True,
                    has_token=True,
                    username=data.get("name") or data.get("fullname"),
                    error=None
                )
            elif response.status_code == 401:
                return HuggingFaceStatusResponse(
                    connected=False,
                    has_token=True,
                    username=None,
                    error="Invalid or expired token"
                )
            else:
                return HuggingFaceStatusResponse(
                    connected=False,
                    has_token=True,
                    username=None,
                    error=f"HuggingFace API error: {response.status_code}"
                )

    except httpx.TimeoutException:
        return HuggingFaceStatusResponse(
            connected=False,
            has_token=bool(await settings_store.get("api_keys.hf_token")),
            username=None,
            error="Connection timeout - check your internet connection"
        )
    except Exception as e:
        logger.error(f"Error checking HuggingFace status: {e}")
        return HuggingFaceStatusResponse(
            connected=False,
            has_token=bool(await settings_store.get("api_keys.hf_token")),
            username=None,
            error=str(e)
        )


# Required PyAnnote models for speaker recognition
REQUIRED_PYANNOTE_MODELS = [
    "pyannote/speaker-diarization-3.1",
    "pyannote/segmentation-3.0",
]


@router.get("/huggingface/models", response_model=HuggingFaceModelsResponse)
async def check_huggingface_models():
    """
    Check if user has access to required PyAnnote models.

    Uses the stored HF token to check model access.
    Returns access status for each required model.
    """
    hf_token = await settings_store.get("api_keys.hf_token")

    if not hf_token:
        return HuggingFaceModelsResponse(
            models=[
                ModelAccessStatus(model_id=m, has_access=False, error="No token configured")
                for m in REQUIRED_PYANNOTE_MODELS
            ],
            all_accessible=False
        )

    model_statuses = []

    async with httpx.AsyncClient(timeout=10.0) as client:
        for model_id in REQUIRED_PYANNOTE_MODELS:
            try:
                # Try to access model info - gated models return 403 if not accepted
                response = await client.get(
                    f"https://huggingface.co/api/models/{model_id}",
                    headers={"Authorization": f"Bearer {hf_token}"}
                )

                if response.status_code == 200:
                    model_statuses.append(ModelAccessStatus(
                        model_id=model_id,
                        has_access=True,
                        error=None
                    ))
                elif response.status_code == 403:
                    model_statuses.append(ModelAccessStatus(
                        model_id=model_id,
                        has_access=False,
                        error="License terms not accepted"
                    ))
                elif response.status_code == 401:
                    model_statuses.append(ModelAccessStatus(
                        model_id=model_id,
                        has_access=False,
                        error="Invalid token"
                    ))
                else:
                    model_statuses.append(ModelAccessStatus(
                        model_id=model_id,
                        has_access=False,
                        error=f"API error: {response.status_code}"
                    ))

            except Exception as e:
                logger.error(f"Error checking model {model_id}: {e}")
                model_statuses.append(ModelAccessStatus(
                    model_id=model_id,
                    has_access=False,
                    error=str(e)
                ))

    all_accessible = all(m.has_access for m in model_statuses)

    return HuggingFaceModelsResponse(
        models=model_statuses,
        all_accessible=all_accessible
    )


# =============================================================================
# Quickstart Wizard Endpoints
# =============================================================================

async def get_installed_service_names(settings) -> tuple[set, set]:
    """
    Get the sets of installed and removed service names.

    Returns:
        Tuple of (installed_names, removed_names)
    """
    # Get default services from config
    default_services = await settings.get("default_services") or []
    installed = set(default_services)
    removed = set()

    # Get user modifications
    user_installed = await settings.get("installed_services") or {}

    for service_name, state in user_installed.items():
        if hasattr(state, 'items'):
            state_dict = dict(state)
        else:
            state_dict = state if isinstance(state, dict) else {}

        is_removed = state_dict.get("removed") == True
        is_added = state_dict.get("added") == True

        if is_removed:
            installed.discard(service_name)
            removed.add(service_name)
        elif is_added:
            installed.add(service_name)

    return installed, removed


def service_matches_installed(service, installed_names: set, removed_names: set) -> bool:
    """Check if a service matches any of the installed service names."""
    if service.service_name in removed_names:
        return False

    if service.service_name in installed_names:
        return True

    # Check compose file name
    compose_base = service.compose_file.stem.replace('-compose', '')
    if compose_base in installed_names:
        return True

    return False


@router.get("/quickstart", response_model=QuickstartResponse)
async def get_quickstart_config() -> QuickstartResponse:
    """
    Get all incomplete required env vars across installed services.

    This endpoint powers the quickstart wizard by:
    1. Finding all installed services (default + user-added)
    2. Identifying required env vars without values
    3. Deduplicating common vars (e.g., OPENAI_API_KEY used by multiple services)
    4. Including setting suggestions for each var

    Returns a flat list of env vars to configure, deduplicated by name.
    """
    registry = get_compose_registry()
    settings = get_settings_store()
    provider_registry = get_provider_registry()

    # Get installed service names
    installed_names, removed_names = await get_installed_service_names(settings)

    # Get all services and filter to installed ones
    all_services = registry.get_services()
    installed_services = [
        s for s in all_services
        if service_matches_installed(s, installed_names, removed_names)
    ]

    # Track incomplete vars and which services need them
    incomplete_vars: Dict[str, IncompleteEnvVar] = {}
    services_needing_setup = set()

    for service in installed_services:
        # Load saved config for this service
        config_key = f"service_env_config.{service.service_id.replace(':', '_')}"
        saved_config = await settings.get(config_key) or {}

        for ev in service.required_env_vars:
            # Skip if has default
            if ev.has_default:
                continue

            # Check if already configured
            saved = saved_config.get(ev.name, {})

            # Check saved mapping
            if saved.get("source") == "setting" and saved.get("setting_path"):
                value = await settings.get(saved["setting_path"])
                if value:
                    continue
            elif saved.get("source") == "literal" and saved.get("value"):
                continue

            # Check for auto-mappable setting
            if await settings.has_value_for_env_var(ev.name):
                continue

            # This env var is incomplete
            services_needing_setup.add(service.service_name)

            # Add to incomplete vars (deduplicate by name)
            if ev.name not in incomplete_vars:
                # Get suggestions for this var
                suggestions = await settings.get_suggestions_for_env_var(
                    ev.name, provider_registry, service.requires
                )

                incomplete_vars[ev.name] = IncompleteEnvVar(
                    name=ev.name,
                    service_id=service.service_id,
                    service_name=service.service_name,
                    has_default=ev.has_default,
                    default_value=ev.default_value,
                    suggestions=[s.to_dict() for s in suggestions],
                    setting_type=infer_setting_type(ev.name),
                )

    return QuickstartResponse(
        incomplete_env_vars=list(incomplete_vars.values()),
        services_needing_setup=list(services_needing_setup),
        total_services=len(installed_services),
        ready_services=len(installed_services) - len(services_needing_setup),
    )


@router.post("/quickstart")
async def save_quickstart_config(env_values: Dict[str, str]) -> Dict[str, Any]:
    """
    Save env var values from quickstart wizard.

    Accepts a dict of env_var_name -> value.
    Creates settings in api_keys.{name} or security.{name} as appropriate.
    """
    settings = get_settings_store()

    # Use centralized method to save env var values
    counts = await settings.save_env_var_values(env_values)
    total_saved = counts["api_keys"] + counts["security"] + counts["admin"]

    if total_saved > 0:
        logger.info(f"Quickstart saved {total_saved} env vars: {counts}")

    return {
        "success": True,
        "saved": total_saved,
        "counts": counts,
        "message": "Configuration saved successfully"
    }
