"""
Setup wizard routes for ushadow initial configuration.
Uses OmegaConf for configuration management.
"""

import logging
from typing import Optional, List, Dict, Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.config import get_settings
from src.services.capability_resolver import get_capability_resolver
from src.services.compose_registry import get_compose_registry

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


# Models

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


class ServiceProfile(BaseModel):
    """A named set of default services selectable in the wizard."""
    name: str
    display_name: str
    services: List[str]


class QuickstartResponse(BaseModel):
    """Response for quickstart wizard - aggregated capability requirements."""
    required_capabilities: List[CapabilityRequirement]
    services: List[ServiceInfo]  # Full service info, not just names
    all_configured: bool
    profiles: List[ServiceProfile] = []
    active_profile: Optional[str] = None


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

@router.get("/api-keys", response_model=ApiKeysStep)
async def get_wizard_api_keys():
    """
    Get current API keys configuration from OmegaConf.

    Returns masked values to show which keys are configured.
    """
    try:
        return ApiKeysStep(
            openai_api_key=mask_key(await settings.get("api_keys.openai_api_key")),
            deepgram_api_key=mask_key(await settings.get("api_keys.deepgram_api_key")),
            mistral_api_key=mask_key(await settings.get("api_keys.mistral_api_key")),
            anthropic_api_key=mask_key(await settings.get("api_keys.anthropic_api_key")),
            hf_token=mask_key(await settings.get("api_keys.hf_token")),
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
            await settings.update(updates)
            logger.info(f"Wizard: API keys updated: {list(updates.keys())}")

        # Return masked values
        return ApiKeysUpdateResponse(
            api_keys=ApiKeysStep(
                openai_api_key=mask_key(await settings.get("api_keys.openai_api_key")),
                deepgram_api_key=mask_key(await settings.get("api_keys.deepgram_api_key")),
                mistral_api_key=mask_key(await settings.get("api_keys.mistral_api_key")),
                anthropic_api_key=mask_key(await settings.get("api_keys.anthropic_api_key")),
                hf_token=mask_key(await settings.get("api_keys.hf_token")),
            ),
            success=True
        )
    except Exception as e:
        logger.error(f"Error updating wizard API keys: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update API keys: {str(e)}")


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
        hf_token = await settings.get("api_keys.hf_token")

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
            has_token=bool(await settings.get("api_keys.hf_token")),
            username=None,
            error="Connection timeout - check your internet connection"
        )
    except Exception as e:
        logger.error(f"Error checking HuggingFace status: {e}")
        return HuggingFaceStatusResponse(
            connected=False,
            has_token=bool(await settings.get("api_keys.hf_token")),
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
    
    For gated models (like PyAnnote), we verify actual access by attempting
    to resolve a file, not just checking model metadata.
    """
    hf_token = await settings.get("api_keys.hf_token")

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
                # First get model info to check if it's gated
                response = await client.get(
                    f"https://huggingface.co/api/models/{model_id}",
                    headers={"Authorization": f"Bearer {hf_token}"}
                )

                if response.status_code == 401:
                    model_statuses.append(ModelAccessStatus(
                        model_id=model_id,
                        has_access=False,
                        error="Invalid token"
                    ))
                    continue
                elif response.status_code == 403:
                    model_statuses.append(ModelAccessStatus(
                        model_id=model_id,
                        has_access=False,
                        error="License terms not accepted"
                    ))
                    continue
                elif response.status_code != 200:
                    model_statuses.append(ModelAccessStatus(
                        model_id=model_id,
                        has_access=False,
                        error=f"API error: {response.status_code}"
                    ))
                    continue

                # Parse model info to check gating status
                model_info = response.json()
                gated = model_info.get("gated")

                # If model is not gated, we have access
                if not gated:
                    model_statuses.append(ModelAccessStatus(
                        model_id=model_id,
                        has_access=True,
                        error=None
                    ))
                    continue

                # Model is gated - verify actual access by trying to resolve a file
                # This will return 401/403 if license terms haven't been accepted
                # or if token doesn't have proper permissions
                resolve_response = await client.head(
                    f"https://huggingface.co/{model_id}/resolve/main/config.yaml",
                    headers={"Authorization": f"Bearer {hf_token}"},
                    follow_redirects=False
                )

                # 302 redirect means we have access (redirects to CDN)
                # 200 means direct access granted
                if resolve_response.status_code in (200, 302):
                    model_statuses.append(ModelAccessStatus(
                        model_id=model_id,
                        has_access=True,
                        error=None
                    ))
                elif resolve_response.status_code == 401:
                    model_statuses.append(ModelAccessStatus(
                        model_id=model_id,
                        has_access=False,
                        error="Token lacks read permission or license not accepted"
                    ))
                elif resolve_response.status_code == 403:
                    model_statuses.append(ModelAccessStatus(
                        model_id=model_id,
                        has_access=False,
                        error="License terms not accepted"
                    ))
                else:
                    model_statuses.append(ModelAccessStatus(
                        model_id=model_id,
                        has_access=False,
                        error=f"Access check failed: {resolve_response.status_code}"
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
    settings = get_settings()
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
            service_infos.append(ServiceInfo(
                name=service_name,
                display_name=service_name,
            ))

    # Build profile list and detect active profile
    raw_profiles = await settings.get("service_profiles") or {}
    profiles = []
    active_profile = None
    for name, profile_data in raw_profiles.items():
        profile_services = profile_data.get("services", []) if isinstance(profile_data, dict) else list(profile_data)
        display_name = profile_data.get("display_name", name.title()) if isinstance(profile_data, dict) else name.title()
        profiles.append(ServiceProfile(name=name, display_name=display_name, services=profile_services))
        if sorted(profile_services) == sorted(default_services):
            active_profile = name

    return QuickstartResponse(
        required_capabilities=[
            CapabilityRequirement(**cap) for cap in requirements["required_capabilities"]
        ],
        services=service_infos,
        all_configured=requirements["all_configured"],
        profiles=profiles,
        active_profile=active_profile,
    )


@router.post("/quickstart/profile")
async def select_service_profile(body: Dict[str, str]) -> Dict[str, Any]:
    """
    Switch to a named service profile.

    Writes the profile's services as default_services in config.overrides.yaml.
    The wizard reloads after this to show the new service list.
    """
    profile_name = body.get("profile")
    if not profile_name:
        raise HTTPException(status_code=400, detail="profile is required")

    settings = get_settings()
    raw_profiles = await settings.get("service_profiles") or {}

    if profile_name not in raw_profiles:
        raise HTTPException(status_code=404, detail=f"Profile '{profile_name}' not found")

    profile_data = raw_profiles[profile_name]
    services = profile_data.get("services", []) if isinstance(profile_data, dict) else list(profile_data)

    await settings.set("default_services", services)
    return {"profile": profile_name, "services": services}


@router.post("/quickstart")
async def save_quickstart_config(key_values: Dict[str, str]) -> Dict[str, Any]:
    """
    Save key values from quickstart wizard.

    Accepts a dict of settings_path -> value (e.g., api_keys.openai_api_key -> sk-xxx).
    Saves directly to the settings store.
    """
    settings = get_settings()

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


# ============================================================================
# Setup State - Persisted wizard progress (synced across origins)
# ============================================================================

@router.get("/setup-state")
async def get_setup_state() -> Dict[str, Any]:
    """Get persisted wizard state.
    
    Returns wizard progress from config.overrides.yaml → wizard section.
    """
    from omegaconf import OmegaConf
    settings = get_settings()
    state = await settings.get("wizard", {})
    # Convert OmegaConf to plain dict for JSON serialization
    if state and hasattr(state, '_content'):
        return OmegaConf.to_container(state, resolve=True)
    return state if state else {}


@router.put("/setup-state")
async def save_setup_state(state: Dict[str, Any]) -> Dict[str, Any]:
    """Save wizard state to config.overrides.yaml → wizard section."""
    settings = get_settings()
    await settings.update({"wizard": state})
    return {"success": True}
