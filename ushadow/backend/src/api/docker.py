"""Docker container management API endpoints."""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from src.services.docker_manager import (
    get_docker_manager,
    DockerManager,
    ServiceInfo,
    ServiceType,
    ServiceStatus,
    ServiceEndpoint,
    IntegrationType
)
from src.services.auth_dependencies import get_current_user
from src.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


# Pydantic models for API
class ServiceEndpointResponse(BaseModel):
    """Service endpoint information."""
    url: str
    integration_type: IntegrationType
    health_check_path: Optional[str] = None
    requires_auth: bool = False
    auth_type: Optional[str] = None


class ServiceInfoResponse(BaseModel):
    """Service information response."""
    name: str
    container_id: Optional[str]
    status: ServiceStatus
    service_type: ServiceType
    image: Optional[str]
    created: Optional[str]  # ISO format datetime string
    ports: dict
    health: Optional[str]
    endpoints: List[ServiceEndpointResponse]
    description: Optional[str] = None
    error: Optional[str] = None
    metadata: Optional[dict] = None


class ServiceActionRequest(BaseModel):
    """Request to perform an action on a service."""
    service_name: str = Field(..., description="Name of the service")


class ServiceActionResponse(BaseModel):
    """Response from a service action."""
    success: bool
    message: str


class ServiceLogsResponse(BaseModel):
    """Service logs response."""
    success: bool
    logs: str


class AddServiceRequest(BaseModel):
    """Request to add a dynamic service."""
    service_name: str = Field(..., description="Unique service name")
    description: str
    service_type: ServiceType
    endpoints: List[ServiceEndpointResponse]
    user_controllable: bool = True
    compose_file: Optional[str] = None
    metadata: Optional[dict] = None


@router.get("/status", response_model=dict)
async def get_docker_status(
    current_user: User = Depends(get_current_user)
):
    """
    Check if Docker is available.

    Returns:
        Docker availability status
    """
    docker_manager = get_docker_manager()
    return {
        "available": docker_manager.is_available(),
        "message": "Docker is available" if docker_manager.is_available() else "Docker is not available"
    }


@router.get("/services", response_model=List[ServiceInfoResponse])
async def list_services(
    user_controllable_only: bool = True,
    service_type: Optional[ServiceType] = None,
    current_user: User = Depends(get_current_user)
):
    """
    List all manageable Docker services.

    Args:
        user_controllable_only: Only return services users can control
        service_type: Optional filter by service type

    Returns:
        List of service information
    """
    docker_manager = get_docker_manager()
    services = docker_manager.list_services(
        user_controllable_only=user_controllable_only,
        service_type=service_type
    )

    # Convert ServiceInfo to response model
    return [
        ServiceInfoResponse(
            name=service.name,
            container_id=service.container_id,
            status=service.status,
            service_type=service.service_type,
            image=service.image,
            created=service.created.isoformat() if service.created else None,
            ports=service.ports,
            health=service.health,
            endpoints=[
                ServiceEndpointResponse(
                    url=endpoint.url,
                    integration_type=endpoint.integration_type,
                    health_check_path=endpoint.health_check_path,
                    requires_auth=endpoint.requires_auth,
                    auth_type=endpoint.auth_type
                )
                for endpoint in service.endpoints
            ],
            description=service.description,
            error=service.error,
            metadata=service.metadata
        )
        for service in services
    ]


@router.get("/services/{service_name}", response_model=ServiceInfoResponse)
async def get_service(
    service_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get information about a specific service.

    Args:
        service_name: Name of the service

    Returns:
        Service information
    """
    docker_manager = get_docker_manager()
    service = docker_manager.get_service_info(service_name)

    if service.error and service.error == "Service not found":
        raise HTTPException(status_code=404, detail="Service not found")

    return ServiceInfoResponse(
        name=service.name,
        container_id=service.container_id,
        status=service.status,
        service_type=service.service_type,
        image=service.image,
        created=service.created.isoformat() if service.created else None,
        ports=service.ports,
        health=service.health,
        endpoints=[
            ServiceEndpointResponse(
                url=endpoint.url,
                integration_type=endpoint.integration_type,
                health_check_path=endpoint.health_check_path,
                requires_auth=endpoint.requires_auth,
                auth_type=endpoint.auth_type
            )
            for endpoint in service.endpoints
        ],
        description=service.description,
        error=service.error,
        metadata=service.metadata
    )


@router.post("/services/{service_name}/start", response_model=ServiceActionResponse)
async def start_service(
    service_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Start a Docker service.

    Args:
        service_name: Name of the service to start

    Returns:
        Action result
    """
    docker_manager = get_docker_manager()
    success, message = docker_manager.start_service(service_name)

    if not success and message in ["Service not found", "Operation not permitted"]:
        raise HTTPException(status_code=403, detail=message)

    return ServiceActionResponse(success=success, message=message)


@router.post("/services/{service_name}/stop", response_model=ServiceActionResponse)
async def stop_service(
    service_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Stop a Docker service.

    Args:
        service_name: Name of the service to stop

    Returns:
        Action result
    """
    docker_manager = get_docker_manager()
    success, message = docker_manager.stop_service(service_name)

    if not success and message in ["Service not found", "Operation not permitted"]:
        raise HTTPException(status_code=403, detail=message)

    return ServiceActionResponse(success=success, message=message)


@router.post("/services/{service_name}/restart", response_model=ServiceActionResponse)
async def restart_service(
    service_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Restart a Docker service.

    Args:
        service_name: Name of the service to restart

    Returns:
        Action result
    """
    docker_manager = get_docker_manager()
    success, message = docker_manager.restart_service(service_name)

    if not success and message in ["Service not found", "Operation not permitted"]:
        raise HTTPException(status_code=403, detail=message)

    return ServiceActionResponse(success=success, message=message)


@router.get("/services/{service_name}/logs", response_model=ServiceLogsResponse)
async def get_service_logs(
    service_name: str,
    tail: int = 100,
    current_user: User = Depends(get_current_user)
):
    """
    Get logs from a Docker service.

    Args:
        service_name: Name of the service
        tail: Number of lines to retrieve (default 100)

    Returns:
        Service logs
    """
    docker_manager = get_docker_manager()
    success, logs = docker_manager.get_service_logs(service_name, tail=tail)

    if not success:
        raise HTTPException(status_code=404, detail="Service not found or logs unavailable")

    return ServiceLogsResponse(success=success, logs=logs)


@router.post("/services/register", response_model=ServiceActionResponse)
async def register_dynamic_service(
    request: AddServiceRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Register a dynamic service (e.g., Pieces app, custom integration).

    This allows runtime registration of new services.

    Args:
        request: Service registration request

    Returns:
        Registration result
    """
    docker_manager = get_docker_manager()

    # Convert endpoint responses to ServiceEndpoint objects
    endpoints = [
        ServiceEndpoint(
            url=endpoint.url,
            integration_type=endpoint.integration_type,
            health_check_path=endpoint.health_check_path,
            requires_auth=endpoint.requires_auth,
            auth_type=endpoint.auth_type
        )
        for endpoint in request.endpoints
    ]

    service_config = {
        "description": request.description,
        "service_type": request.service_type,
        "endpoints": endpoints,
        "user_controllable": request.user_controllable,
        "compose_file": request.compose_file,
        "metadata": request.metadata or {}
    }

    success, message = docker_manager.add_dynamic_service(
        request.service_name,
        service_config
    )

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return ServiceActionResponse(success=success, message=message)
