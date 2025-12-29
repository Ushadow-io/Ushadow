"""
Services API Endpoints

Provides service discovery for the wizard UI.
Schema definitions come from ServiceRegistry + ProviderRegistry.
Services declare capabilities they USE, and the schema includes both:
- Service-specific config (from service YAML)
- Provider credentials (from selected provider for each capability)
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging

from src.services.service_registry import get_service_registry, ServiceConfig
from src.services.provider_registry import get_provider_registry
from src.services.omegaconf_settings import get_omegaconf_settings

logger = logging.getLogger(__name__)

router = APIRouter()


class EnabledRequest(BaseModel):
    """Request body for enabling/disabling a service."""
    enabled: bool


class ServiceEnabledResponse(BaseModel):
    """Response for service enabled state."""
    service_id: str
    enabled: bool
    message: str


class InstallServiceRequest(BaseModel):
    """Request body for installing a service."""
    service_id: str
    docker_image: Optional[str] = None  # Override default image


class InstallServiceResponse(BaseModel):
    """Response for service installation."""
    service_id: str
    name: str
    installed: bool
    enabled: bool
    message: str


def get_service_registry_dep():
    """Get ServiceRegistry instance."""
    return get_service_registry()


def infer_field_type(key: str, explicit_type: Optional[str] = None) -> str:
    """Infer field type from key name if not explicitly set."""
    if explicit_type and explicit_type != "string":
        return explicit_type

    key_lower = key.lower()
    if any(x in key_lower for x in ['api_key', 'apikey', 'password', 'secret', 'token']):
        return "secret"
    if any(x in key_lower for x in ['url', 'uri', 'endpoint']):
        return "url"
    if any(x in key_lower for x in ['port', 'timeout', 'interval', 'count', 'max', 'min']):
        return "number"
    if any(x in key_lower for x in ['enable', 'enabled', 'disable', 'disabled', 'use_', 'is_']):
        return "boolean"

    return explicit_type or "string"


async def build_service_config_schema(
    service: ServiceConfig,
    settings: Any
) -> List[Dict[str, Any]]:
    """
    Build complete config schema for a service.

    Combines:
    1. Service-specific config fields (from service YAML)
    2. Provider credentials for each capability the service uses

    This gives the UI everything needed to configure a service.
    """
    registry = get_service_registry()
    provider_registry = get_provider_registry()

    schema = []

    # 1. Add provider credentials for each capability this service uses
    for use in service.uses:
        capability = use.capability
        required = use.required

        # Get selected provider for this capability
        selected_provider_id = await settings.get(f"selected_providers.{capability}")

        if not selected_provider_id:
            # Use default provider
            cap = provider_registry.get_capability(capability)
            if cap:
                selected_provider_id = cap.default_provider.get('cloud')

        if not selected_provider_id:
            continue

        provider = provider_registry.get_provider(selected_provider_id)
        if not provider:
            continue

        # Add provider's credentials to schema
        for key, cred in provider.credentials.items():
            # Skip if credential has a hardcoded value (not user-configurable)
            if cred.value is not None:
                continue

            # Check if this credential has a value
            has_value = False
            if cred.settings_path:
                value = await settings.get(cred.settings_path)
                has_value = value is not None and str(value).strip() != ""

            # Infer type from field name if not explicitly set
            field_type = infer_field_type(cred.key, cred.type)

            schema.append({
                "key": cred.key,
                "type": field_type,
                "label": cred.label or cred.key.replace("_", " ").title(),
                "description": f"{capability.upper()} provider: {provider.name}",
                "link": cred.link,
                "required": required and cred.required,
                "default": cred.default,
                "settings_path": cred.settings_path,
                "has_value": has_value,
                # Grouping metadata
                "capability": capability,
                "provider_id": provider.id,
                "provider_name": provider.name,
            })

    # 2. Add service-specific config fields
    service_schema = registry.get_effective_schema(service.service_id)
    for field in service_schema:
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


@router.get("/quickstart", response_model=List[Dict[str, Any]])
async def get_quickstart_services(
    registry: Any = Depends(get_service_registry_dep)
) -> List[Dict[str, Any]]:
    """
    Get services for quickstart wizard with their effective config schemas.

    Returns services where is_default=true with full config schemas including
    provider credentials for each capability the service uses.
    """
    try:
        quickstart = registry.get_quickstart_services()

        # Get settings manager for enabled state overrides
        settings = get_omegaconf_settings()
        installed = await settings.get_installed_services()

        # Build response with effective schemas
        result = []
        for service in quickstart:
            # Build combined schema (provider credentials + service config)
            config_schema = await build_service_config_schema(service, settings)

            # Get effective enabled state (MongoDB override or YAML default)
            service_state = installed.get(service.service_id, {})
            enabled_override = service_state.get("enabled")
            effective_enabled = enabled_override if enabled_override is not None else service.enabled

            # Get capabilities this service uses (for UI display)
            capabilities_used = [
                {
                    "capability": use.capability,
                    "required": use.required,
                    "purpose": use.purpose
                }
                for use in service.uses
            ]

            result.append({
                "service_id": service.service_id,
                "name": service.name,
                "description": service.description,
                "template": service.template,  # Legacy - may be null
                "mode": service.mode,
                "config_schema": config_schema,
                "capabilities": capabilities_used,
                "docker_image": service.docker_image,
                "enabled": effective_enabled,
                "tags": service.tags,
                "ui": service.ui,
            })

        return result

    except Exception as e:
        logger.error(f"Failed to get quickstart services: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories/{category}", response_model=List[Dict[str, Any]])
async def get_services_by_category(
    category: str,
    registry: Any = Depends(get_service_registry_dep)
) -> List[Dict[str, Any]]:
    """
    Get all service instances for a category with their effective schemas.

    Used in customize wizard to show all available providers for a category.
    """
    try:
        services = registry.get_services_by_category(category, enabled_only=False)

        # Get settings manager for enabled state overrides
        settings = get_omegaconf_settings()
        installed = await settings.get_installed_services()

        result = []
        for service in services:
            # Build combined schema (provider credentials + service config)
            config_schema = await build_service_config_schema(service, settings)

            # Check if dependencies are met
            available = True  # TODO: Check dependencies

            # Get effective enabled state (MongoDB override or YAML default)
            service_state = installed.get(service.service_id, {})
            enabled_override = service_state.get("enabled")
            effective_enabled = enabled_override if enabled_override is not None else service.enabled

            # Get capabilities this service uses (for UI display)
            capabilities_used = [
                {
                    "capability": use.capability,
                    "required": use.required,
                    "purpose": use.purpose
                }
                for use in service.uses
            ]

            result.append({
                "service_id": service.service_id,
                "name": service.name,
                "description": service.description,
                "template": service.template,  # Legacy - may be null
                "mode": service.mode,
                "is_default": service.is_default,
                "available": available,
                "config_schema": config_schema,
                "capabilities": capabilities_used,
                "docker_image": service.docker_image,
                "enabled": effective_enabled,
                "tags": service.tags,
                "ui": service.ui,
            })

        return result

    except Exception as e:
        logger.error(f"Failed to get services for category {category}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/catalog", response_model=List[Dict[str, Any]])
async def get_service_catalog(
    registry: Any = Depends(get_service_registry_dep)
) -> List[Dict[str, Any]]:
    """
    Get catalog of all available services.

    Returns all services from the registry with their installation status.
    - is_default=true services are auto-installed
    - Other services can be installed via POST /install
    """
    try:
        all_services = registry.get_instances()

        # Get installed services state from MongoDB
        settings = get_omegaconf_settings()
        installed_state = await settings.get_installed_services()

        result = []
        for service in all_services:
            # A service is "installed" if:
            # 1. It's a default service (is_default=true), OR
            # 2. User explicitly installed it (in installed_services)
            service_state = installed_state.get(service.service_id, {})
            is_explicitly_installed = service_state.get("installed", False)
            is_installed = service.is_default or is_explicitly_installed

            # Get effective enabled state
            enabled_override = service_state.get("enabled")
            effective_enabled = enabled_override if enabled_override is not None else service.enabled

            result.append({
                "service_id": service.service_id,
                "name": service.name,
                "description": service.description,
                "template": service.template,  # Legacy - may be null
                "mode": service.mode,
                "is_default": service.is_default,
                "installed": is_installed,
                "enabled": effective_enabled if is_installed else False,
                "docker_image": service.docker_image,
                "tags": service.tags or [],
                "ui": service.ui,  # New: includes category, icon, etc.
            })

        return result

    except Exception as e:
        logger.error(f"Failed to get service catalog: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/installed", response_model=List[Dict[str, Any]])
async def get_installed_services(
    registry: Any = Depends(get_service_registry_dep)
) -> List[Dict[str, Any]]:
    """
    Get user's installed services with full config schemas.

    Returns only services that are installed (default + explicitly installed).
    Config schema includes BOTH:
    - Provider credentials (for capabilities the service uses)
    - Service-specific config fields
    """
    try:
        all_services = registry.get_instances()

        # Get installed services state
        settings = get_omegaconf_settings()
        installed_state = await settings.get_installed_services()

        result = []
        for service in all_services:
            service_state = installed_state.get(service.service_id, {})
            is_explicitly_installed = service_state.get("installed", False)
            is_installed = service.is_default or is_explicitly_installed

            if not is_installed:
                continue

            # Build combined schema (provider credentials + service config)
            config_schema = await build_service_config_schema(service, settings)

            # Get effective enabled state
            enabled_override = service_state.get("enabled")
            effective_enabled = enabled_override if enabled_override is not None else service.enabled

            # Get capabilities this service uses (for UI display)
            capabilities_used = [
                {
                    "capability": use.capability,
                    "required": use.required,
                    "purpose": use.purpose
                }
                for use in service.uses
            ]

            result.append({
                "service_id": service.service_id,
                "name": service.name,
                "description": service.description,
                "template": service.template,  # Legacy - may be null
                "mode": service.mode,
                "is_default": service.is_default,
                "config_schema": config_schema,
                "capabilities": capabilities_used,  # New: what capabilities this service uses
                "docker_image": service.docker_image,
                "docker_service_name": service.docker_service_name,  # For docker API queries
                "enabled": effective_enabled,
                "tags": service.tags or [],
                "ui": service.ui,
            })

        return result

    except Exception as e:
        logger.error(f"Failed to get installed services: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/install", response_model=InstallServiceResponse)
async def install_service(
    request: InstallServiceRequest,
    registry: Any = Depends(get_service_registry_dep)
) -> InstallServiceResponse:
    """
    Install a service from the catalog.

    Marks the service as installed in MongoDB, making it appear
    on the Services page.
    """
    try:
        # Verify service exists in registry
        service = registry.get_instance(request.service_id)
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{request.service_id}' not found in catalog"
            )

        # Get settings manager
        settings = get_omegaconf_settings()

        # Mark as installed and enabled
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

        return InstallServiceResponse(
            service_id=request.service_id,
            name=service.name,
            installed=True,
            enabled=True,
            message=f"Service '{service.name}' installed successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to install service {request.service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Dynamic routes with path parameters must come AFTER static routes
@router.put("/{service_id}/enabled", response_model=ServiceEnabledResponse)
async def set_service_enabled(
    service_id: str,
    request: EnabledRequest,
    registry: Any = Depends(get_service_registry_dep)
) -> ServiceEnabledResponse:
    """
    Enable or disable a service.

    This persists the enabled state to MongoDB without affecting the
    service's running state. Use docker endpoints to start/stop services.
    """
    try:
        # Verify service exists in registry
        service = registry.get_instance(service_id)
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )

        # Get settings manager
        settings = get_omegaconf_settings()

        # Update enabled state
        await settings.set_service_enabled(service_id, request.enabled)

        action = "enabled" if request.enabled else "disabled"
        return ServiceEnabledResponse(
            service_id=service_id,
            enabled=request.enabled,
            message=f"Service '{service.name}' {action}"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to set enabled state for {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{service_id}/enabled")
async def get_service_enabled_state(
    service_id: str,
    registry: Any = Depends(get_service_registry_dep)
) -> Dict[str, Any]:
    """
    Get the enabled state for a service.

    Returns both the effective enabled state and whether it was
    explicitly set (vs using the YAML default).
    """
    try:
        # Verify service exists
        service = registry.get_instance(service_id)
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )

        # Get settings manager
        settings = get_omegaconf_settings()

        # Get explicit override (if any)
        override = await settings.get_service_enabled(service_id)

        # Effective value: override if set, else YAML default
        effective = override if override is not None else service.enabled

        return {
            "service_id": service_id,
            "enabled": effective,
            "yaml_default": service.enabled,
            "has_override": override is not None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get enabled state for {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{service_id}/uninstall")
async def uninstall_service(
    service_id: str,
    registry: Any = Depends(get_service_registry_dep)
) -> Dict[str, Any]:
    """
    Uninstall a service.

    Removes the service from user's installed services.
    Default services cannot be uninstalled.
    """
    try:
        service = registry.get_instance(service_id)
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )

        if service.is_default:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot uninstall default service '{service.name}'"
            )

        # Get settings manager
        settings = get_omegaconf_settings()

        # Remove from installed services
        await settings.update({
            "installed_services": {
                service_id: {
                    "installed": False,
                    "enabled": False
                }
            }
        })

        logger.info(f"Service {service_id} uninstalled")

        return {
            "service_id": service_id,
            "message": f"Service '{service.name}' uninstalled"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to uninstall service {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
