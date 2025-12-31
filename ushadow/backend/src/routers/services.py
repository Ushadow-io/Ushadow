"""
Services API - Compose-first service discovery.

Services are discovered from Docker Compose files with x-ushadow extensions.
Environment variables are extracted from compose and mapped to settings by users.

Endpoints:
- GET /services/installed - Compose-discovered services (flat list)
- GET /services/{id}/enabled - Get enabled state
- PUT /services/{id}/enabled - Set enabled state
"""

import logging
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.compose_registry import get_compose_registry, DiscoveredService
from src.config.omegaconf_settings import get_settings_store

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Request/Response Models
# =============================================================================

class EnabledRequest(BaseModel):
    enabled: bool


# =============================================================================
# Helper - Build response for compose-discovered service
# =============================================================================

async def build_compose_service_response(
    service: DiscoveredService,
    settings
) -> Dict[str, Any]:
    """Build response dict for a compose-discovered service."""
    # Get enabled state from settings (default True for all services)
    enabled = await settings.get(f"installed_services.{service.service_name}.enabled")
    if enabled is None:
        enabled = True

    return {
        "service_id": service.service_id,
        "service_name": service.service_name,
        "compose_file": str(service.compose_file),
        "image": service.image,
        "requires": service.requires,
        "depends_on": service.depends_on,
        "ports": service.ports,
        "enabled": enabled,
        "required_env_count": len(service.required_env_vars),
        "optional_env_count": len(service.optional_env_vars),
    }


# =============================================================================
# List Endpoints
# =============================================================================

@router.get("/installed")
async def get_installed_services() -> List[Dict[str, Any]]:
    """
    Get all compose-discovered services.

    Returns a flat list of services found in compose/*-compose.yaml files.
    Use /api/compose/services/{id}/env for env var configuration.
    """
    registry = get_compose_registry()
    settings = get_settings_store()

    return [
        await build_compose_service_response(service, settings)
        for service in registry.get_services()
    ]


# =============================================================================
# Enable/Disable
# =============================================================================

@router.get("/{service_name}/enabled")
async def get_service_enabled(service_name: str) -> Dict[str, Any]:
    """Get enabled state for a service."""
    registry = get_compose_registry()
    service = registry.get_service_by_name(service_name)

    if not service:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")

    settings = get_settings_store()
    enabled = await settings.get(f"installed_services.{service_name}.enabled")

    return {
        "service_id": service.service_id,
        "service_name": service_name,
        "enabled": enabled if enabled is not None else True,
    }


@router.put("/{service_name}/enabled")
async def set_service_enabled(service_name: str, request: EnabledRequest) -> Dict[str, Any]:
    """Enable or disable a service."""
    registry = get_compose_registry()
    service = registry.get_service_by_name(service_name)

    if not service:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")

    settings = get_settings_store()
    await settings.update({
        f"installed_services.{service_name}.enabled": request.enabled
    })

    action = "enabled" if request.enabled else "disabled"
    logger.info(f"Service {service_name} {action}")

    return {
        "service_id": service.service_id,
        "service_name": service_name,
        "enabled": request.enabled,
        "message": f"Service '{service_name}' {action}"
    }
