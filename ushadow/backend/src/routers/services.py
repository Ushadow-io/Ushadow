"""
Unified Services API - Single entry point for all service operations.

This router consolidates:
- Service discovery (from compose files)
- Docker container lifecycle (start/stop/restart)
- Configuration management (env vars, enabled state)
- Installation management

All operations go through the ServiceOrchestrator facade.

Endpoint Groups:
- Discovery:    GET /, /catalog, /by-capability/{cap}
- Status:       GET /docker-status, /status (BEFORE /{name} to avoid shadowing)
- Single:       GET /{name}, /{name}/status, /{name}/docker
- Lifecycle:    POST /{name}/start, /stop, /restart; GET /{name}/logs
- Config:       GET/PUT /{name}/enabled, /{name}/config, /{name}/env, /{name}/resolve
- Installation: POST /{name}/install, /uninstall, /register
"""

import logging
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from src.services.service_orchestrator import get_service_orchestrator, ServiceOrchestrator
from src.services.auth import get_current_user
from src.models.user import User
from src.services.docker_manager import ServiceType, IntegrationType

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Request/Response Models
# =============================================================================

class EnabledRequest(BaseModel):
    """Request to enable/disable a service."""
    enabled: bool


class EnvVarConfigRequest(BaseModel):
    """Request to configure an environment variable."""
    name: str
    source: str  # "setting", "new_setting", "literal", "default"
    setting_path: Optional[str] = None
    new_setting_path: Optional[str] = None
    value: Optional[str] = None


class EnvConfigUpdateRequest(BaseModel):
    """Request to update all env var configs for a service."""
    env_vars: List[EnvVarConfigRequest]


class ServiceEndpointRequest(BaseModel):
    """Service endpoint information."""
    url: str
    integration_type: str = "rest"
    health_check_path: Optional[str] = None
    requires_auth: bool = False
    auth_type: Optional[str] = None


class RegisterServiceRequest(BaseModel):
    """Request to register a dynamic service."""
    service_name: str = Field(..., description="Unique service name")
    description: str = ""
    service_type: str = "application"
    endpoints: List[ServiceEndpointRequest] = []
    user_controllable: bool = True
    compose_file: Optional[str] = None
    metadata: Optional[dict] = None


class ActionResponse(BaseModel):
    """Standard action response."""
    success: bool
    message: str


class LogsResponse(BaseModel):
    """Service logs response."""
    success: bool
    logs: str


# =============================================================================
# Dependencies
# =============================================================================

def get_orchestrator() -> ServiceOrchestrator:
    """Dependency to get the service orchestrator."""
    return get_service_orchestrator()


# =============================================================================
# Discovery Endpoints
# =============================================================================

@router.get("/")
async def list_services(
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> List[Dict[str, Any]]:
    """
    List all installed services.

    Returns services that are in default_services or user-added,
    with their current docker status.
    """
    return await orchestrator.list_installed_services()


@router.get("/catalog")
async def list_catalog(
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> List[Dict[str, Any]]:
    """
    List all available services (catalog).

    Returns all discovered services regardless of installation status.
    Each service includes an 'installed' flag.
    """
    return await orchestrator.list_catalog()


@router.get("/by-capability/{capability}")
async def get_services_by_capability(
    capability: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> List[Dict[str, Any]]:
    """
    Get all services that require a specific capability.

    Args:
        capability: Capability name (e.g., 'llm', 'transcription')
    """
    return await orchestrator.get_services_by_capability(capability)


# =============================================================================
# Status Endpoints (MUST come before /{name} to avoid route shadowing)
# =============================================================================

@router.get("/docker-status")
async def get_docker_status(
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Check if Docker daemon is available."""
    return orchestrator.get_docker_status()


@router.get("/status")
async def get_all_statuses(
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Dict[str, Any]]:
    """
    Get lightweight status for all services.

    Returns only name, status, and health - optimized for polling.
    """
    return await orchestrator.get_all_statuses()


# =============================================================================
# Single Service Endpoints
# =============================================================================

@router.get("/{name}")
async def get_service(
    name: str,
    include_env: bool = False,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Get details for a specific service.

    Args:
        name: Service name (e.g., 'chronicle')
        include_env: Include environment variable definitions
    """
    service = await orchestrator.get_service(name, include_env=include_env)
    if not service:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return service


@router.get("/{name}/status")
async def get_service_status(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get status for a single service."""
    status = await orchestrator.get_service_status(name)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return status


@router.get("/{name}/docker")
async def get_docker_details(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get Docker container details for a service.

    Returns container_id, status, image, ports, health, endpoints, etc.
    """
    details = await orchestrator.get_docker_details(name)
    if details is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return details.to_dict()


# =============================================================================
# Lifecycle Endpoints
# =============================================================================

@router.post("/{name}/start", response_model=ActionResponse)
async def start_service(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> ActionResponse:
    """Start a service container."""
    logger.info(f"POST /services/{name}/start - starting service")
    result = await orchestrator.start_service(name)

    if not result.success and result.message in ["Service not found", "Operation not permitted"]:
        raise HTTPException(status_code=403, detail=result.message)

    return ActionResponse(success=result.success, message=result.message)


@router.post("/{name}/stop", response_model=ActionResponse)
async def stop_service(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> ActionResponse:
    """Stop a service container."""
    result = orchestrator.stop_service(name)

    if not result.success and result.message in ["Service not found", "Operation not permitted"]:
        raise HTTPException(status_code=403, detail=result.message)

    return ActionResponse(success=result.success, message=result.message)


@router.post("/{name}/restart", response_model=ActionResponse)
async def restart_service(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> ActionResponse:
    """Restart a service container."""
    result = orchestrator.restart_service(name)

    if not result.success and result.message in ["Service not found", "Operation not permitted"]:
        raise HTTPException(status_code=403, detail=result.message)

    return ActionResponse(success=result.success, message=result.message)


@router.get("/{name}/logs", response_model=LogsResponse)
async def get_service_logs(
    name: str,
    tail: int = 100,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> LogsResponse:
    """
    Get logs from a service container.

    Args:
        name: Service name
        tail: Number of lines to retrieve (default 100)
    """
    result = orchestrator.get_service_logs(name, tail=tail)

    if not result.success:
        raise HTTPException(status_code=404, detail="Service not found or logs unavailable")

    return LogsResponse(success=result.success, logs=result.logs)


# =============================================================================
# Configuration Endpoints
# =============================================================================

@router.get("/{name}/enabled")
async def get_enabled_state(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Get enabled state for a service."""
    result = await orchestrator.get_enabled_state(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.put("/{name}/enabled")
async def set_enabled_state(
    name: str,
    request: EnabledRequest,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Enable or disable a service."""
    result = await orchestrator.set_enabled_state(name, request.enabled)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.get("/{name}/config")
async def get_service_config(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Get full service configuration.

    Returns enabled state, env config, and preferences.
    """
    result = await orchestrator.get_service_config(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.get("/{name}/env")
async def get_env_config(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Get environment variable configuration for a service.

    Returns the env schema with current configuration and suggested settings.
    """
    result = await orchestrator.get_env_config(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.put("/{name}/env")
async def update_env_config(
    name: str,
    request: EnvConfigUpdateRequest,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Save environment variable configuration for a service.

    Source types:
    - "setting": Use value from an existing settings path
    - "new_setting": Create a new setting and map to it
    - "literal": Use a directly entered value
    - "default": Use the compose file's default
    """
    env_vars = [ev.model_dump() for ev in request.env_vars]
    result = await orchestrator.update_env_config(name, env_vars)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.get("/{name}/resolve")
async def resolve_env_vars(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Resolve environment variables for runtime injection.

    Returns the actual values that would be passed to docker compose.
    Sensitive values are masked in the response.
    """
    result = await orchestrator.resolve_env_vars(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.get("/{name}/env-export")
async def export_env_vars(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Export environment variables for local development.

    Returns unmasked values suitable for running services locally.
    Use env_content for .env file format or env_vars for dict.

    Example usage:
        curl -H "Authorization: Bearer $TOKEN" \\
            http://localhost:8050/api/services/chronicle-backend/env-export \\
            | jq -r '.env_content' > .env.chronicle
    """
    result = await orchestrator.export_env_vars(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


# =============================================================================
# Installation Endpoints
# =============================================================================

@router.post("/{name}/install")
async def install_service(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Install a service (add to installed services list).

    This marks the service as user-added, overriding default_services.
    """
    result = await orchestrator.install_service(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.post("/{name}/uninstall")
async def uninstall_service(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Uninstall a service (remove from installed services list).

    This marks the service as removed, overriding default_services.
    """
    result = await orchestrator.uninstall_service(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.post("/register", response_model=ActionResponse)
async def register_dynamic_service(
    request: RegisterServiceRequest,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> ActionResponse:
    """
    Register a dynamic service (e.g., Pieces app, custom integration).

    This allows runtime registration of new services.
    """
    config = {
        "service_name": request.service_name,
        "description": request.description,
        "service_type": request.service_type,
        "endpoints": [ep.model_dump() for ep in request.endpoints],
        "user_controllable": request.user_controllable,
        "compose_file": request.compose_file,
        "metadata": request.metadata,
    }

    result = await orchestrator.register_dynamic_service(config)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return ActionResponse(success=result.success, message=result.message)
