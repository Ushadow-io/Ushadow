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
from ..config import get_settings_store

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


class AudioDestination(BaseModel):
    """A wired audio destination"""
    consumer_id: str
    consumer_name: str
    websocket_url: str  # External URL (for direct connection) or internal URL (for relay)
    protocol: str = "wyoming"
    format: str = "pcm_s16le_16khz_mono"


class WiredDestinationsResponse(BaseModel):
    """Response with all wired audio destinations"""
    has_destinations: bool
    destinations: List[AudioDestination]
    # Relay mode: frontend connects to relay_url, backend fans out to destinations
    use_relay: bool = False
    relay_url: Optional[str] = None  # e.g., wss://hostname/ws/audio/relay


@router.get("/wired-destinations", response_model=WiredDestinationsResponse)
async def get_wired_audio_destinations(user = Depends(get_current_user)):
    """
    Get audio destinations based on wiring configuration.

    Returns WebSocket URLs for all consumers that have audio_input wired to them.
    Used by the frontend recording component to know where to send audio.

    If Tailscale is configured, returns wss:// URLs via Tailscale hostname.
    Otherwise falls back to ws://localhost for local development.
    """
    import yaml
    from pathlib import Path
    from ..services.service_config_manager import ServiceConfigManager

    destinations = []

    try:
        # Load wiring config from the same location as ServiceConfigManager
        config_manager = ServiceConfigManager()
        wiring_path = config_manager.wiring_path
        if wiring_path.exists():
            with open(wiring_path) as f:
                wiring_data = yaml.safe_load(f) or {}
        else:
            wiring_data = {}

        wiring_list = wiring_data.get("wiring", [])

        # Find all audio_input wiring entries
        audio_wiring = [
            w for w in wiring_list
            if w.get("source_capability") == "audio_input" or
               w.get("target_capability") == "audio_input"
        ]

        if not audio_wiring:
            # Fall back to checking if any known audio consumers are running
            # by looking at the target services
            pass

        # Get settings for port resolution and Tailscale hostname
        settings = get_settings_store()

        # Get Tailscale hostname from settings store (cached, uses TailscaleManager internally)
        tailscale_hostname = settings.get_tailscale_hostname()

        # Get environment name for container naming
        env_name = os.environ.get("COMPOSE_PROJECT_NAME", "ushadow").strip() or "ushadow"

        # Determine if we should use relay mode (when Tailscale is enabled)
        use_relay = bool(tailscale_hostname)
        relay_url = f"wss://{tailscale_hostname}/ws/audio/relay" if use_relay else None

        # For each wired consumer, build the WebSocket URL
        # When using relay, we return INTERNAL URLs (backend connects to services)
        # When not using relay, we return EXTERNAL URLs (frontend connects directly)
        for wire in audio_wiring:
            target_id = wire.get("target_config_id", "")

            # Look up the actual service config to get container name
            target_config = config_manager.get_service_config(target_id)

            # If container_name is missing, try to discover it from Docker
            if target_config and not target_config.container_name:
                config_manager.discover_container_info(target_id)
                # Refresh the config after discovery
                target_config = config_manager.get_service_config(target_id)

            # Extract service type from target_config_id or template
            service_type = ""
            if target_config:
                template_id = target_config.template_id or ""
                service_type = template_id.lower()
            if not service_type:
                service_type = target_id.lower()

            # Build WebSocket URL based on the service
            ws_url = None
            consumer_name = target_config.name if target_config else target_id

            if "chronicle" in service_type:
                consumer_name = "Chronicle"
                if use_relay:
                    # Internal URL - use container_name from deployment or fallback
                    container_name = (target_config.container_name if target_config else None) or f"{env_name}-chronicle-backend"
                    port = await settings.get("chronicle.port") or os.environ.get("CHRONICLE_PORT", "8000")
                    ws_url = f"ws://{container_name}:{port}/ws_pcm"
                else:
                    # Direct localhost connection (no Tailscale)
                    port = await settings.get("chronicle.port") or os.environ.get("CHRONICLE_PORT", "8080")
                    ws_url = f"ws://localhost:{port}/ws_pcm"

            elif "mycelia" in service_type:
                consumer_name = "Mycelia"
                if use_relay:
                    # Internal URL - use discovered container_name
                    container_name = target_config.container_name if target_config else None
                    if not container_name:
                        import logging
                        logging.getLogger(__name__).warning(
                            f"Mycelia service {target_id} has no container_name - container may not be running"
                        )
                        continue  # Skip this destination
                    # Internal port is 5173 (host-mapped to 15173)
                    internal_port = "5173"
                    ws_url = f"ws://{container_name}:{internal_port}/ws_pcm"
                else:
                    # Direct localhost connection (no Tailscale) - use host-mapped port
                    port = await settings.get("mycelia.backend_port") or os.environ.get("MYCELIA_BACKEND_PORT", "15173")
                    ws_url = f"ws://localhost:{port}/ws_pcm"

            if ws_url:
                destinations.append(AudioDestination(
                    consumer_id=target_id,
                    consumer_name=consumer_name,
                    websocket_url=ws_url,
                ))

        return WiredDestinationsResponse(
            has_destinations=len(destinations) > 0,
            destinations=destinations,
            use_relay=use_relay,
            relay_url=relay_url,
        )

    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error getting wired destinations: {e}")
        return WiredDestinationsResponse(
            has_destinations=False,
            destinations=[]
        )
