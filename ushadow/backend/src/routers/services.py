"""
Services API - Thin HTTP layer over ServiceRegistry.

Services declare capabilities they USE. The schema includes both:
- Service-specific config (from service YAML)
- Provider env_maps (from selected provider for each capability)

Endpoints:
- GET /services/quickstart - Default services for quickstart wizard
- GET /services/catalog - All services with install status
- GET /services/installed - User's installed services
- GET /services/categories/{category} - Services by category
- POST /services/install - Install a service
- DELETE /services/{id}/uninstall - Uninstall a service
- GET /services/{id}/enabled - Get enabled state
- PUT /services/{id}/enabled - Set enabled state
"""

import logging
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.service_registry import get_service_registry, ServiceConfig
from src.services.provider_registry import get_provider_registry
from src.services.omegaconf_settings import get_omegaconf_settings

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Request/Response Models
# =============================================================================

class EnabledRequest(BaseModel):
    enabled: bool


class InstallRequest(BaseModel):
    service_id: str
    docker_image: Optional[str] = None


# =============================================================================
# Helper - Build config schema for a service
# =============================================================================

async def build_config_schema(service: ServiceConfig, settings) -> List[Dict[str, Any]]:
    """
    Build config schema combining provider env_maps + service-specific config.

    For each capability the service uses, includes the selected provider's
    required env_maps. Then adds service-specific config fields.
    """
    provider_registry = get_provider_registry()
    service_registry = get_service_registry()
    schema = []

    # 1. Provider env_maps for each capability this service uses
    for use in service.uses:
        capability = use.capability
        required = use.required

        # Get selected provider for this capability
        selected_id = await settings.get(f"selected_providers.{capability}")

        # Fall back to default if not selected
        if not selected_id:
            selected_id = provider_registry.get_default_provider_id(capability, 'cloud')

        if not selected_id:
            continue

        provider = provider_registry.get_provider(selected_id)
        if not provider:
            continue

        # Add provider's env_maps that have settings_path (user-configurable)
        for em in provider.env_maps:
            if not em.settings_path:
                continue

            # Check if value exists
            value = await settings.get(em.settings_path)
            has_value = value is not None and str(value).strip() != ""

            schema.append({
                "key": em.key,
                "type": em.type,
                "label": em.label or em.key.replace("_", " ").title(),
                "description": f"{capability.upper()} provider: {provider.name}",
                "link": em.link,
                "required": required and em.required,
                "default": em.default,
                "settings_path": em.settings_path,
                "has_value": has_value,
                "capability": capability,
                "provider_id": provider.id,
                "provider_name": provider.name,
            })

    # 2. Service-specific config fields
    for field in service_registry.get_service_config_schema(service.service_id):
        field_dict = field.model_dump()

        # Check if has value
        has_value = False
        if field.settings_path:
            value = await settings.get(field.settings_path)
            has_value = value is not None and str(value).strip() != ""
        elif field.default is not None:
            has_value = True

        field_dict["has_value"] = has_value
        field_dict["capability"] = None  # Service-specific, not from a capability
        schema.append(field_dict)

    return schema


async def build_service_response(
    service: ServiceConfig,
    settings,
    installed_state: Dict[str, Any],
    include_schema: bool = False
) -> Dict[str, Any]:
    """Build standard service response dict."""
    service_state = installed_state.get(service.service_id, {})

    # Effective enabled state
    enabled_override = service_state.get("enabled")
    effective_enabled = enabled_override if enabled_override is not None else service.enabled

    # Installation status
    is_explicitly_installed = service_state.get("installed", False)
    is_installed = service.is_default or is_explicitly_installed

    response = {
        "service_id": service.service_id,
        "name": service.name,
        "description": service.description,
        "mode": service.mode,
        "is_default": service.is_default,
        "installed": is_installed,
        "enabled": effective_enabled if is_installed else False,
        "docker_image": service.docker_image,
        "docker_service_name": service.docker_service_name,
        "tags": service.tags or [],
        "ui": service.ui,
    }

    # Capabilities this service uses
    response["capabilities"] = [
        {
            "capability": use.capability,
            "required": use.required,
            "purpose": use.purpose
        }
        for use in service.uses
    ]

    # Config schema (expensive - only include when needed)
    if include_schema:
        response["config_schema"] = await build_config_schema(service, settings)

    return response


# =============================================================================
# List Endpoints
# =============================================================================

@router.get("/quickstart")
async def get_quickstart_services() -> List[Dict[str, Any]]:
    """Get default services for quickstart wizard with config schemas."""
    registry = get_service_registry()
    settings = get_omegaconf_settings()
    installed = await settings.get_installed_services()

    return [
        await build_service_response(s, settings, installed, include_schema=True)
        for s in registry.get_quickstart_services()
    ]


@router.get("/catalog")
async def get_service_catalog() -> List[Dict[str, Any]]:
    """Get all services with installation status (no config schemas)."""
    registry = get_service_registry()
    settings = get_omegaconf_settings()
    installed = await settings.get_installed_services()

    return [
        await build_service_response(s, settings, installed, include_schema=False)
        for s in registry.get_services()
    ]


@router.get("/installed")
async def get_installed_services() -> List[Dict[str, Any]]:
    """Get user's installed services with config schemas."""
    registry = get_service_registry()
    settings = get_omegaconf_settings()
    installed = await settings.get_installed_services()

    result = []
    for service in registry.get_services():
        service_state = installed.get(service.service_id, {})
        is_installed = service.is_default or service_state.get("installed", False)

        if is_installed:
            result.append(
                await build_service_response(service, settings, installed, include_schema=True)
            )

    return result


@router.get("/categories/{category}")
async def get_services_by_category(category: str) -> List[Dict[str, Any]]:
    """Get services by category with config schemas."""
    registry = get_service_registry()
    settings = get_omegaconf_settings()
    installed = await settings.get_installed_services()

    return [
        await build_service_response(s, settings, installed, include_schema=True)
        for s in registry.get_services_by_category(category, enabled_only=False)
    ]


# =============================================================================
# Install/Uninstall
# =============================================================================

@router.post("/install")
async def install_service(request: InstallRequest) -> Dict[str, Any]:
    """Install a service from the catalog."""
    registry = get_service_registry()
    service = registry.get_service(request.service_id)

    if not service:
        raise HTTPException(status_code=404, detail=f"Service '{request.service_id}' not found")

    settings = get_omegaconf_settings()
    await settings.update({
        "installed_services": {
            request.service_id: {
                "installed": True,
                "enabled": True,
                "docker_image": request.docker_image or service.docker_image
            }
        }
    })

    logger.info(f"Service {request.service_id} installed")
    return {
        "service_id": request.service_id,
        "name": service.name,
        "installed": True,
        "enabled": True,
        "message": f"Service '{service.name}' installed"
    }


@router.delete("/{service_id}/uninstall")
async def uninstall_service(service_id: str) -> Dict[str, Any]:
    """Uninstall a non-default service."""
    registry = get_service_registry()
    service = registry.get_service(service_id)

    if not service:
        raise HTTPException(status_code=404, detail=f"Service '{service_id}' not found")

    if service.is_default:
        raise HTTPException(status_code=400, detail=f"Cannot uninstall default service '{service.name}'")

    settings = get_omegaconf_settings()
    await settings.update({
        "installed_services": {
            service_id: {"installed": False, "enabled": False}
        }
    })

    logger.info(f"Service {service_id} uninstalled")
    return {"service_id": service_id, "message": f"Service '{service.name}' uninstalled"}


# =============================================================================
# Enable/Disable (path params must come after static routes)
# =============================================================================

@router.get("/{service_id}/enabled")
async def get_service_enabled(service_id: str) -> Dict[str, Any]:
    """Get enabled state for a service."""
    registry = get_service_registry()
    service = registry.get_service(service_id)

    if not service:
        raise HTTPException(status_code=404, detail=f"Service '{service_id}' not found")

    settings = get_omegaconf_settings()
    override = await settings.get_service_enabled(service_id)
    effective = override if override is not None else service.enabled

    return {
        "service_id": service_id,
        "enabled": effective,
        "yaml_default": service.enabled,
        "has_override": override is not None
    }


@router.put("/{service_id}/enabled")
async def set_service_enabled(service_id: str, request: EnabledRequest) -> Dict[str, Any]:
    """Enable or disable a service."""
    registry = get_service_registry()
    service = registry.get_service(service_id)

    if not service:
        raise HTTPException(status_code=404, detail=f"Service '{service_id}' not found")

    settings = get_omegaconf_settings()
    await settings.set_service_enabled(service_id, request.enabled)

    action = "enabled" if request.enabled else "disabled"
    return {
        "service_id": service_id,
        "enabled": request.enabled,
        "message": f"Service '{service.name}' {action}"
    }
