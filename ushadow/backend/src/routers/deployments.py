"""API routes for service deployments."""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends

from src.models.deployment import (
    ServiceDefinition,
    ServiceDefinitionCreate,
    ServiceDefinitionUpdate,
    Deployment,
    DeployRequest,
)
from src.services.deployment_manager import get_deployment_manager
from src.services.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/deployments", tags=["deployments"])


# =============================================================================
# Service Definition Endpoints
# =============================================================================

@router.post("/services", response_model=ServiceDefinition)
async def create_service_definition(
    data: ServiceDefinitionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new service definition."""
    manager = get_deployment_manager()
    try:
        service = await manager.create_service(
            data,
            created_by=current_user.get("email")
        )
        return service
    except Exception as e:
        logger.error(f"Failed to create service: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/services", response_model=List[ServiceDefinition])
async def list_service_definitions(
    current_user: dict = Depends(get_current_user)
):
    """List all service definitions."""
    manager = get_deployment_manager()
    return await manager.list_services()


@router.get("/services/{service_id}", response_model=ServiceDefinition)
async def get_service_definition(
    service_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a service definition by ID."""
    manager = get_deployment_manager()
    service = await manager.get_service(service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return service


@router.put("/services/{service_id}", response_model=ServiceDefinition)
async def update_service_definition(
    service_id: str,
    data: ServiceDefinitionUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a service definition."""
    manager = get_deployment_manager()
    service = await manager.update_service(service_id, data)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return service


@router.delete("/services/{service_id}")
async def delete_service_definition(
    service_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a service definition."""
    manager = get_deployment_manager()
    try:
        deleted = await manager.delete_service(service_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Service not found")
        return {"success": True, "message": f"Service {service_id} deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# Deployment Endpoints
# =============================================================================

@router.post("/deploy", response_model=Deployment)
async def deploy_service(
    data: DeployRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Deploy a service to a target.

    Supports three target types:
    - docker_unode: Deploy to a remote u-node via manager API (default)
    - kubernetes: Deploy to a Kubernetes cluster
    - local_docker: Deploy to local Docker on the same node

    Examples:
        # Deploy to a u-node (default behavior)
        POST /api/deployments/deploy
        {"service_id": "chronicle", "unode_hostname": "worker-1"}

        # Deploy to Kubernetes
        POST /api/deployments/deploy
        {
            "service_id": "chronicle",
            "target_type": "kubernetes",
            "cluster_id": "abc123",
            "namespace": "prod",
            "replicas": 2
        }
    """
    manager = get_deployment_manager()
    try:
        deployment = await manager.deploy_to_target(data)
        return deployment
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Deployment failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[Deployment])
async def list_deployments(
    service_id: Optional[str] = None,
    unode_hostname: Optional[str] = None,
    cluster_id: Optional[str] = None,
    target_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    List all deployments with optional filters.

    Query parameters:
        - service_id: Filter by service ID
        - unode_hostname: Filter by u-node hostname (for docker deployments)
        - cluster_id: Filter by Kubernetes cluster ID
        - target_type: Filter by target type (docker_unode, kubernetes, local_docker)
    """
    manager = get_deployment_manager()
    return await manager.list_deployments(
        service_id=service_id,
        unode_hostname=unode_hostname,
        cluster_id=cluster_id,
        target_type=target_type
    )


@router.get("/{deployment_id}", response_model=Deployment)
async def get_deployment(
    deployment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a deployment by ID."""
    manager = get_deployment_manager()
    deployment = await manager.get_deployment(deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return deployment


@router.post("/{deployment_id}/stop", response_model=Deployment)
async def stop_deployment(
    deployment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Stop a deployment."""
    manager = get_deployment_manager()
    try:
        deployment = await manager.stop_deployment(deployment_id)
        return deployment
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Stop failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{deployment_id}/restart", response_model=Deployment)
async def restart_deployment(
    deployment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Restart a deployment."""
    manager = get_deployment_manager()
    try:
        deployment = await manager.restart_deployment(deployment_id)
        return deployment
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Restart failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{deployment_id}")
async def remove_deployment(
    deployment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove a deployment (stop and delete)."""
    manager = get_deployment_manager()
    try:
        removed = await manager.remove_deployment(deployment_id)
        if not removed:
            raise HTTPException(status_code=404, detail="Deployment not found")
        return {"success": True, "message": f"Deployment {deployment_id} removed"}
    except Exception as e:
        logger.error(f"Remove failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{deployment_id}/logs")
async def get_deployment_logs(
    deployment_id: str,
    tail: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get logs for a deployment."""
    manager = get_deployment_manager()
    logs = await manager.get_deployment_logs(deployment_id, tail=tail)
    if logs is None:
        raise HTTPException(status_code=404, detail="Deployment not found or logs unavailable")
    return {"logs": logs}
