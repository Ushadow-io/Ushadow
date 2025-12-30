"""
Services API Endpoints

Provides service discovery and management for the UI.
Services are loaded from config/services/*.yaml via ServiceRegistry.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging

from src.services.service_registry import get_service_registry, ServiceRegistry
from src.services.omegaconf_settings import get_omegaconf_settings
from src.services.docker_manager import get_docker_manager
from src.models.service import Service, ServiceType

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# Request/Response Models
# =============================================================================

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


class InstallServiceResponse(BaseModel):
    """Response for service installation."""
    service_id: str
    name: str
    installed: bool
    enabled: bool
    message: str


class ServiceOptionResponse(BaseModel):
    """User-configurable option for a service."""
    type: str
    label: str
    description: Optional[str] = None
    default: Optional[Any] = None
    choices: Optional[List[Dict[str, Any]]] = None
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None


class ServiceResponse(BaseModel):
    """Standard service response."""
    service_id: str
    name: str
    description: str
    type: str  # memory, llm, transcription, etc.
    mode: Optional[str] = None  # cloud or None for local
    is_default: bool
    installed: bool = True
    enabled: bool
    configured: bool = False  # Whether all required config is present
    missing_config: List[str] = []  # List of missing required env vars
    # Container status for local services
    container_status: Optional[str] = None  # running, stopped, not_found
    options: Dict[str, ServiceOptionResponse] = {}
    required_env: List[str] = []
    tags: List[str] = []
    # For local services
    containers: Optional[List[str]] = None  # Container names
    # For cloud services
    api_base: Optional[str] = None


# =============================================================================
# Dependencies
# =============================================================================

def get_registry() -> ServiceRegistry:
    """Get ServiceRegistry instance."""
    return get_service_registry()


# =============================================================================
# Helper Functions
# =============================================================================

async def check_service_configured(
    service: Service,
    registry: ServiceRegistry,
    settings
) -> tuple[bool, List[str]]:
    """
    Check if a service has all required configuration.

    Returns (configured: bool, missing_env_vars: list)
    """
    required_env = service.get_required_env_vars()

    if not required_env:
        # No required env vars = always configured
        return True, []

    missing = []
    for env_var in required_env:
        # Get the settings path for this env var
        mapping = registry.get_env_mapping_for_service(service, env_var)
        if not mapping:
            # No mapping = can't check, assume missing
            logger.warning(f"No env mapping found for {env_var}")
            missing.append(env_var)
            continue

        # Strip the source prefix (secrets. or settings.) from the path
        # e.g., "secrets.api_keys.openai" -> "api_keys.openai"
        config_path = mapping
        if config_path.startswith("secrets."):
            config_path = config_path[8:]  # Remove "secrets."
        elif config_path.startswith("settings."):
            config_path = config_path[9:]  # Remove "settings."

        try:
            value = await settings.get(config_path)
            is_set = bool(value and (not isinstance(value, str) or value.strip()))
            if not is_set:
                missing.append(env_var)
        except Exception as e:
            logger.error(f"Error checking {config_path}: {e}")
            missing.append(env_var)

    return len(missing) == 0, missing


def service_to_response(
    service: Service,
    installed: bool = True,
    enabled: bool = False,
    configured: bool = False,
    missing_config: List[str] = None,
    container_status: Optional[str] = None
) -> Dict[str, Any]:
    """Convert a Service model to API response dict."""
    # Build options response
    options = {}
    for name, opt in service.options.items():
        opt_dict: Dict[str, Any] = {
            "type": opt.type.value,
            "label": opt.label,
            "description": opt.description,
            "default": opt.default,
        }
        if opt.choices:
            opt_dict["choices"] = [
                {"value": c.value, "label": c.label, "requires_env": c.requires_env}
                for c in opt.choices
            ]
        if opt.min is not None:
            opt_dict["min"] = opt.min
        if opt.max is not None:
            opt_dict["max"] = opt.max
        if opt.step is not None:
            opt_dict["step"] = opt.step
        options[name] = opt_dict

    response = {
        "service_id": service.id,
        "name": service.name,
        "description": service.description,
        "type": service.type.value,
        "mode": service.mode,
        "is_default": service.is_default,
        "installed": installed,
        "enabled": enabled,
        "configured": configured,
        "missing_config": missing_config or [],
        "container_status": container_status,
        "options": options,
        "required_env": service.get_required_env_vars(),
        "tags": service.tags,
    }

    # Add container names for local services
    if service.containers:
        response["containers"] = [c.name for c in service.containers]

    # Add API base for cloud services
    if service.api_base:
        response["api_base"] = service.api_base

    return response


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/quickstart", response_model=List[Dict[str, Any]])
async def get_quickstart_services(
    registry: ServiceRegistry = Depends(get_registry)
) -> List[Dict[str, Any]]:
    """
    Get services for quickstart wizard.

    Returns services where is_default=true, with their options and required env vars.
    """
    try:
        quickstart = registry.get_quickstart_services()

        # Get settings manager for enabled state overrides
        settings = get_omegaconf_settings()
        installed_state = await settings.get_installed_services()

        result = []
        for service in quickstart:
            # Skip infrastructure services
            if service.type == ServiceType.INFRASTRUCTURE:
                continue

            # Get effective enabled state
            service_state = installed_state.get(service.id, {})
            enabled_override = service_state.get("enabled")
            effective_enabled = enabled_override if enabled_override is not None else True

            result.append(service_to_response(
                service,
                installed=True,
                enabled=effective_enabled
            ))

        return result

    except Exception as e:
        logger.error(f"Failed to get quickstart services: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/types/{service_type}", response_model=List[Dict[str, Any]])
async def get_services_by_type(
    service_type: str,
    registry: ServiceRegistry = Depends(get_registry)
) -> List[Dict[str, Any]]:
    """
    Get all services of a specific type.

    Used to show all available providers for a service type (e.g., all LLMs).
    """
    try:
        # Convert string to ServiceType enum
        try:
            svc_type = ServiceType(service_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid service type: {service_type}"
            )

        services = registry.get_services_by_type(svc_type)

        # Get settings manager for enabled state
        settings = get_omegaconf_settings()
        installed_state = await settings.get_installed_services()

        result = []
        for service in services:
            service_state = installed_state.get(service.id, {})
            is_installed = service.is_default or service_state.get("installed", False)
            enabled_override = service_state.get("enabled")
            effective_enabled = enabled_override if enabled_override is not None else service.is_default

            result.append(service_to_response(
                service,
                installed=is_installed,
                enabled=effective_enabled
            ))

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get services for type {service_type}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/catalog", response_model=List[Dict[str, Any]])
async def get_service_catalog(
    registry: ServiceRegistry = Depends(get_registry)
) -> List[Dict[str, Any]]:
    """
    Get catalog of all available user-facing services.

    Returns all non-infrastructure services with their installation status.
    """
    try:
        all_services = registry.get_user_facing_services()

        # Get installed services state
        settings = get_omegaconf_settings()
        installed_state = await settings.get_installed_services()

        result = []
        for service in all_services:
            service_state = installed_state.get(service.id, {})
            is_installed = service.is_default or service_state.get("installed", False)
            enabled_override = service_state.get("enabled")
            effective_enabled = enabled_override if enabled_override is not None else False

            result.append(service_to_response(
                service,
                installed=is_installed,
                enabled=effective_enabled if is_installed else False
            ))

        return result

    except Exception as e:
        logger.error(f"Failed to get service catalog: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/installed", response_model=List[Dict[str, Any]])
async def get_installed_services(
    registry: ServiceRegistry = Depends(get_registry)
) -> List[Dict[str, Any]]:
    """
    Get user's installed services with all status info.

    Returns only services that are installed (default + explicitly installed).
    This is the primary endpoint for the Services page - includes everything needed.

    Each service includes:
    - installed: bool (always True for this endpoint)
    - enabled: bool (user toggle state)
    - configured: bool (all required config present)
    - missing_config: list (env vars that need to be set)
    - container_status: str (running/stopped/not_found for local services)
    """
    try:
        all_services = registry.get_user_facing_services()

        # Get installed services state
        settings = get_omegaconf_settings()
        installed_state = await settings.get_installed_services()

        # Get docker manager for container status
        docker_mgr = get_docker_manager()

        result = []
        for service in all_services:
            service_state = installed_state.get(service.id, {})
            is_installed = service.is_default or service_state.get("installed", False)

            if not is_installed:
                continue

            enabled_override = service_state.get("enabled")
            effective_enabled = enabled_override if enabled_override is not None else True

            # Check if service is configured (all required env vars present)
            configured, missing = await check_service_configured(service, registry, settings)

            # Get container status for local services
            container_status = None
            if service.mode != "cloud" and service.containers:
                try:
                    # Use get_service_info which returns ServiceInfo object
                    service_info = docker_mgr.get_service_info(service.id)
                    container_status = service_info.status.value if service_info.status else "not_found"
                except Exception as e:
                    logger.debug(f"Could not get container status for {service.id}: {e}")
                    container_status = "not_found"

            result.append(service_to_response(
                service,
                installed=True,
                enabled=effective_enabled,
                configured=configured,
                missing_config=missing,
                container_status=container_status
            ))

        return result

    except Exception as e:
        logger.error(f"Failed to get installed services: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=Dict[str, str])
async def get_services_status(
    registry: ServiceRegistry = Depends(get_registry)
) -> Dict[str, str]:
    """
    Get container status for all local services.

    Lightweight endpoint for polling - returns only service_id -> container_status.
    Much faster than /installed for status updates.
    """
    try:
        all_services = registry.get_user_facing_services()
        settings = get_omegaconf_settings()
        installed_state = await settings.get_installed_services()
        docker_mgr = get_docker_manager()

        result = {}
        for service in all_services:
            # Only check installed local services
            service_state = installed_state.get(service.id, {})
            is_installed = service.is_default or service_state.get("installed", False)

            if not is_installed:
                continue

            # Skip cloud services - they don't have container status
            if service.mode == "cloud" or not service.containers:
                continue

            # Get container status
            try:
                service_info = docker_mgr.get_service_info(service.id)
                result[service.id] = service_info.status.value if service_info.status else "not_found"
            except Exception as e:
                logger.debug(f"Could not get status for {service.id}: {e}")
                result[service.id] = "not_found"

        return result

    except Exception as e:
        logger.error(f"Failed to get services status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/infrastructure", response_model=List[Dict[str, Any]])
async def get_infrastructure_services(
    registry: ServiceRegistry = Depends(get_registry)
) -> List[Dict[str, Any]]:
    """
    Get all infrastructure services.

    Returns system-managed infrastructure services (mongodb, redis, etc.).
    """
    try:
        infra_services = registry.get_infrastructure_services()

        result = []
        for service in infra_services:
            result.append({
                "service_id": service.id,
                "name": service.name,
                "description": service.description,
                "managed": service.managed,
                "optional": service.optional,
                "required_env": service.get_required_env_vars(),
                "containers": [c.name for c in service.containers] if service.containers else [],
            })

        return result

    except Exception as e:
        logger.error(f"Failed to get infrastructure services: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/defaults", response_model=Dict[str, str])
async def get_default_services(
    registry: ServiceRegistry = Depends(get_registry)
) -> Dict[str, str]:
    """
    Get default service for each type.

    Returns mapping of service_type -> service_id.
    """
    try:
        defaults = registry.get_default_services()
        return {type_name: svc.id for type_name, svc in defaults.items()}

    except Exception as e:
        logger.error(f"Failed to get default services: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/env-mappings", response_model=Dict[str, str])
async def get_env_mappings(
    registry: ServiceRegistry = Depends(get_registry)
) -> Dict[str, str]:
    """
    Get global environment variable mappings.

    Returns mapping of ENV_VAR -> settings.path.
    """
    try:
        return registry.get_env_mappings()

    except Exception as e:
        logger.error(f"Failed to get env mappings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/install", response_model=InstallServiceResponse)
async def install_service(
    request: InstallServiceRequest,
    registry: ServiceRegistry = Depends(get_registry)
) -> InstallServiceResponse:
    """
    Install a service from the catalog.

    Marks the service as installed, making it appear on the Services page.
    """
    try:
        service = registry.get_service(request.service_id)
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{request.service_id}' not found in catalog"
            )

        settings = get_omegaconf_settings()

        # Mark as installed and enabled
        await settings.update({
            "installed_services": {
                request.service_id: {
                    "installed": True,
                    "enabled": True
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


@router.get("/{service_id}", response_model=Dict[str, Any])
async def get_service(
    service_id: str,
    registry: ServiceRegistry = Depends(get_registry)
) -> Dict[str, Any]:
    """
    Get details for a specific service.
    """
    try:
        service = registry.get_service(service_id)
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )

        settings = get_omegaconf_settings()
        installed_state = await settings.get_installed_services()
        service_state = installed_state.get(service_id, {})

        is_installed = service.is_default or service_state.get("installed", False)
        enabled_override = service_state.get("enabled")
        effective_enabled = enabled_override if enabled_override is not None else service.is_default

        return service_to_response(
            service,
            installed=is_installed,
            enabled=effective_enabled
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get service {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{service_id}/enabled", response_model=ServiceEnabledResponse)
async def set_service_enabled(
    service_id: str,
    request: EnabledRequest,
    registry: ServiceRegistry = Depends(get_registry)
) -> ServiceEnabledResponse:
    """
    Enable or disable a service.

    Persists the enabled state without affecting the service's running state.
    """
    try:
        service = registry.get_service(service_id)
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )

        settings = get_omegaconf_settings()
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
    registry: ServiceRegistry = Depends(get_registry)
) -> Dict[str, Any]:
    """
    Get the enabled state for a service.
    """
    try:
        service = registry.get_service(service_id)
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )

        settings = get_omegaconf_settings()
        override = await settings.get_service_enabled(service_id)

        effective = override if override is not None else service.is_default

        return {
            "service_id": service_id,
            "enabled": effective,
            "default": service.is_default,
            "has_override": override is not None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get enabled state for {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{service_id}/validate")
async def validate_service_config(
    service_id: str,
    registry: ServiceRegistry = Depends(get_registry)
) -> Dict[str, Any]:
    """
    Validate that a service has all required configuration.

    Checks if required environment variables are available.
    """
    try:
        service = registry.get_service(service_id)
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )

        # Get current env values from settings
        settings = get_omegaconf_settings()
        env_values = {}

        # Load values for each required env var
        for env_var in service.get_required_env_vars():
            mapping = registry.get_env_mapping_for_service(service, env_var)
            if mapping:
                try:
                    value = await settings.get(mapping)
                    if value:
                        env_values[env_var] = value
                except Exception:
                    pass

        missing = registry.validate_service_config(service_id, env_values)

        return {
            "service_id": service_id,
            "valid": len(missing) == 0,
            "missing_env_vars": missing,
            "required_env_vars": service.get_required_env_vars()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to validate service {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{service_id}/uninstall")
async def uninstall_service(
    service_id: str,
    registry: ServiceRegistry = Depends(get_registry)
) -> Dict[str, Any]:
    """
    Uninstall a service.

    Removes the service from user's installed services.
    Default services cannot be uninstalled.
    """
    try:
        service = registry.get_service(service_id)
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

        settings = get_omegaconf_settings()

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


# =============================================================================
# Backwards Compatibility - Deprecated Endpoints
# =============================================================================

@router.get("/categories/{category}", response_model=List[Dict[str, Any]])
async def get_services_by_category(
    category: str,
    registry: ServiceRegistry = Depends(get_registry)
) -> List[Dict[str, Any]]:
    """
    DEPRECATED: Use /types/{service_type} instead.

    Get all services for a category (maps to service type).
    """
    logger.warning(f"Deprecated endpoint /categories/{category} called - use /types/{category}")
    return await get_services_by_type(category, registry)



@router.post("/{service_id}/regenerate-compose")
async def regenerate_compose_file(
    service_id: str,
    registry: ServiceRegistry = Depends(get_registry)
):
    """
    Regenerate the Docker Compose file for a service.

    This should be called when service settings change (e.g., API keys updated)
    to ensure the .env file is updated with the new values.

    Returns:
        Dict with success status and compose file path
    """
    from src.services.docker_compose_generator import get_compose_generator

    service = registry.get_service(service_id)
    if not service:
        raise HTTPException(status_code=404, detail=f"Service not found: {service_id}")

    if service.is_cloud:
        return {
            "success": True,
            "message": "Cloud services don't need compose files",
            "compose_path": None
        }

    if not service.containers:
        return {
            "success": True,
            "message": "Service has no containers",
            "compose_path": None
        }

    try:
        settings = get_omegaconf_settings()
        generator = get_compose_generator()
        generated = await generator.generate_for_service(service_id, settings)

        if not generated:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate compose file"
            )

        compose_path = await generator.write_compose_file(generated, write_env=True)

        return {
            "success": True,
            "message": f"Compose file regenerated for {service_id}",
            "compose_path": str(compose_path)
        }
    except Exception as e:
        logger.error(f"Error regenerating compose for {service_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to regenerate compose file: {str(e)}"
        )
