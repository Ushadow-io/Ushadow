"""API routes for service deployments."""

import logging
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from src.models.deployment import (
    ServiceDefinition,
    ServiceDefinitionCreate,
    ServiceDefinitionUpdate,
    Deployment,
    DeployRequest,
)
from src.services.deployment_manager import get_deployment_manager
from src.services.auth import get_current_user
from src.services.unode_manager import get_unode_manager
from src.services.kubernetes_manager import get_kubernetes_manager
from src.models.deploy_target import DeployTarget
from src.models.unode import UNodeType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/deployments", tags=["deployments"])


# =============================================================================
# Deployment Targets Endpoint
# =============================================================================

@router.get("/targets", response_model=List[Dict[str, Any]])
async def list_deployment_targets(
    current_user: dict = Depends(get_current_user)
):
    """
    List all available deployment targets (UNodes + Kubernetes clusters).

    Returns unified DeployTarget format for both local/remote unodes and K8s clusters.
    Frontend can use this single endpoint instead of separate kubernetes/unodes calls.
    """
    from src.utils.deployment_targets import parse_deployment_target_id

    targets = []

    # Get all UNodes (local leader + remote unodes)
    unode_manager = await get_unode_manager()
    unodes = await unode_manager.list_unodes()

    for unode in unodes:
        from src.models.unode import UNodeRole
        parsed = parse_deployment_target_id(unode.deployment_target_id)
        is_leader = unode.role == UNodeRole.LEADER

        target = DeployTarget(
            id=unode.deployment_target_id,
            type="docker",
            name=f"{unode.hostname} ({'Leader' if is_leader else 'Remote'})",
            identifier=unode.hostname,
            environment=parsed["environment"],
            status=unode.status.value if unode.status else "unknown",
            provider="local" if is_leader else "remote",
            region=None,
            is_leader=is_leader,
            namespace=None,
            infrastructure=None,
            raw_metadata=unode.model_dump()
        )
        targets.append(target.model_dump())

    # Get all Kubernetes clusters
    k8s_manager = await get_kubernetes_manager()
    clusters = await k8s_manager.list_clusters()

    for cluster in clusters:
        parsed = parse_deployment_target_id(cluster.deployment_target_id)
        # Get infrastructure from default namespace if available
        infra = cluster.infra_scans.get(cluster.namespace, {}) if cluster.infra_scans else {}

        # Try to infer provider from labels or use default
        provider = cluster.labels.get("provider", "kubernetes")
        region = cluster.labels.get("region")

        target = DeployTarget(
            id=cluster.deployment_target_id,
            type="k8s",
            name=cluster.name,
            identifier=cluster.cluster_id,
            environment=parsed["environment"],
            status=cluster.status.value if cluster.status else "unknown",
            provider=provider,
            region=region,
            is_leader=None,
            namespace=cluster.namespace,
            infrastructure=infra,
            raw_metadata=cluster.model_dump()
        )
        targets.append(target.model_dump())

    return targets


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
    """Deploy a service to a u-node."""
    manager = get_deployment_manager()
    try:
        deployment = await manager.deploy_service(
            data.service_id,
            data.unode_hostname,
            config_id=data.config_id
        )
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
    current_user: dict = Depends(get_current_user)
):
    """List all deployments with optional filters."""
    manager = get_deployment_manager()
    return await manager.list_deployments(
        service_id=service_id,
        unode_hostname=unode_hostname
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
