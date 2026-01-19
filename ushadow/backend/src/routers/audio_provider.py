"""
Audio Consumer Router - Exposes audio consumer provider configuration

Allows mobile apps and audio sources to discover where to send audio.
Audio consumers are services that RECEIVE and PROCESS audio (Chronicle, Mycelia, etc.)
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import yaml
import os

from ..services.auth import get_current_user
from ..config.omegaconf_settings import get_settings_store

router = APIRouter(prefix="/api/providers/audio_consumer", tags=["providers"])


class AudioConsumerConfig(BaseModel):
    """Audio consumer provider configuration"""
    provider_id: str
    name: str
    websocket_url: str
    protocol: str
    format: str
    mode: Optional[str] = None
    destinations: Optional[List[Dict[str, str]]] = None


class AudioConsumerResponse(BaseModel):
    """Response with full audio consumer details"""
    capability: str = "audio_consumer"
    selected_provider: str
    config: AudioConsumerConfig
    available_providers: List[str]


class SetProviderRequest(BaseModel):
    """Request to change active provider"""
    provider_id: str


def load_audio_consumers() -> Dict[str, Any]:
    """Load audio consumer providers from config file"""
    config_path = os.path.join(
        os.path.dirname(__file__),
        "../../..",  # Go up to project root
        "config/providers/audio_consumer.yaml"
    )

    if not os.path.exists(config_path):
        raise HTTPException(
            status_code=500,
            detail="Audio consumer provider config not found"
        )

    with open(config_path, 'r') as f:
        data = yaml.safe_load(f)

    return data


async def get_selected_consumer_id() -> str:
    """Get the currently selected audio consumer ID"""
    config = get_settings_store()
    provider_id = await config.get("selected_providers.audio_consumer")

    if not provider_id:
        # Default to chronicle if not set
        provider_id = "chronicle"

    return provider_id


def find_provider_by_id(providers_data: Dict[str, Any], provider_id: str) -> Optional[Dict[str, Any]]:
    """Find provider configuration by ID"""
    providers = providers_data.get("providers", [])
    for provider in providers:
        if provider.get("id") == provider_id:
            return provider
    return None


def build_consumer_config(provider: Dict[str, Any]) -> AudioConsumerConfig:
    """Build AudioConsumerConfig from provider definition"""
    provider_id = provider["id"]
    name = provider["name"]

    # Extract credentials
    credentials = provider.get("credentials", {})
    websocket_url = credentials.get("websocket_url", {}).get("default", "")
    protocol = credentials.get("protocol", {}).get("value", "wyoming")
    format_val = credentials.get("format", {}).get("value", "pcm_s16le_16khz_mono")

    # Extract config
    config = provider.get("config", {})
    mode = None
    destinations = None

    # Get mode from config (recording_mode, processing_mode, etc.)
    for key in ["recording_mode", "processing_mode"]:
        if key in config:
            mode = config[key].get("default")
            break

    # Get destinations for relay provider
    if "destinations" in config:
        dest_str = config["destinations"].get("default", "[]")
        try:
            import json
            destinations = json.loads(dest_str)
        except:
            destinations = None

    return AudioConsumerConfig(
        provider_id=provider_id,
        name=name,
        websocket_url=websocket_url,
        protocol=protocol,
        format=format_val,
        mode=mode,
        destinations=destinations,
    )


@router.get("/active", response_model=AudioConsumerResponse)
async def get_active_consumer(user = Depends(get_current_user)):
    """
    Get the currently active audio consumer configuration.

    Returns the selected consumer with connection details that mobile apps
    and audio sources can use to send audio streams.
    """
    try:
        # Load consumers config
        providers_data = load_audio_consumers()

        # Get selected consumer ID
        selected_id = await get_selected_consumer_id()

        # Find provider config
        provider = find_provider_by_id(providers_data, selected_id)
        if not provider:
            raise HTTPException(
                status_code=404,
                detail=f"Provider '{selected_id}' not found"
            )

        # Build config
        config = build_consumer_config(provider)

        # Get available consumers
        available = [p["id"] for p in providers_data.get("providers", [])]

        return AudioConsumerResponse(
            selected_provider=selected_id,
            config=config,
            available_providers=available,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/available")
async def get_available_consumers(user = Depends(get_current_user)):
    """
    Get list of available audio consumer providers.

    Returns consumer IDs and basic info for all configured consumers.
    """
    try:
        providers_data = load_audio_consumers()
        providers = providers_data.get("providers", [])

        return {
            "capability": "audio_consumer",
            "providers": [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "description": p["description"],
                    "mode": p.get("mode", "unknown"),
                }
                for p in providers
            ]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/active")
async def set_active_consumer(
    request: SetProviderRequest,
    user = Depends(get_current_user)
):
    """
    Set the active audio consumer.

    Requires admin permission. Updates the selected consumer in configuration.
    """
    try:
        # TODO: Add admin permission check
        # if not user.is_admin:
        #     raise HTTPException(status_code=403, detail="Admin permission required")

        # Load consumers to validate
        providers_data = load_audio_consumers()
        provider = find_provider_by_id(providers_data, request.provider_id)

        if not provider:
            raise HTTPException(
                status_code=404,
                detail=f"Consumer '{request.provider_id}' not found"
            )

        # Update selected consumer
        config = get_settings_store()
        await config.set("selected_providers.audio_consumer", request.provider_id)

        return {
            "success": True,
            "selected_provider": request.provider_id,
            "message": f"Audio consumer set to '{provider['name']}'"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def check_consumer_health(user = Depends(get_current_user)):
    """
    Check health of the active audio consumer.

    Attempts to connect to the consumer's WebSocket endpoint.
    """
    # TODO: Implement WebSocket health check
    return {
        "status": "ok",
        "message": "Health check not yet implemented"
    }
