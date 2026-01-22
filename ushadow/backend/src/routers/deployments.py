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
from src.services.service_orchestrator import get_service_orchestrator
from src.services.unode_manager import get_unode_manager
from src.services.kubernetes_manager import get_kubernetes_manager
from src.utils.deployment_targets import parse_deployment_target_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/deployments", tags=["deployments"])


# =============================================================================
# Deployment Preparation Models
# =============================================================================

class DeploymentPreparationResponse(BaseModel):
    """Unified response for deployment preparation.

    Contains all information needed to deploy a service:
    - Deployment target metadata (unode or k8s cluster)
    - Resolved environment variables
    - Infrastructure scan data (for k8s)
    """
    # Service information
    service_id: str
    service_name: str
    compose_file: str
    requires: List[str]

    # Deployment target information
    target_type: str  # 'unode' or 'k8s'
    target_id: str  # deployment_target_id format
    target_metadata: Dict[str, Any]  # UNode or KubernetesCluster as dict

    # Infrastructure scan (K8s only)
    infrastructure: Optional[Dict[str, Any]] = None

    # Resolved environment variables
    required_env_vars: List[Dict[str, Any]]
    optional_env_vars: List[Dict[str, Any]]


# =============================================================================
# Deployment Preparation Endpoint
# =============================================================================

@router.get("/prepare", response_model=DeploymentPreparationResponse)
async def prepare_deployment(
    service_id: str = Query(..., description="Service ID to deploy"),
    deploy_target: str = Query(..., description="Deployment target ID (format: {identifier}.{type}.{environment})"),
    config_id: Optional[str] = Query(None, description="Optional service config ID for user overrides"),
    current_user: dict = Depends(get_current_user)
):
    """
    Unified deployment preparation endpoint.

    Returns all information needed to deploy a service in a single call:
    - Deployment target metadata (unode or k8s cluster details)
    - Resolved environment variables using Settings API
    - Infrastructure scan data (for K8s deployments)

    This replaces separate calls to /api/unodes/leader/info or /api/kubernetes
    followed by /api/services/{name}/env.

    Args:
        service_id: Service to deploy
        deploy_target: Unified deployment target ID (e.g., "ushadow-purple.unode.purple" or "my-cluster.k8s.purple")
        config_id: Optional service config ID for user-specific overrides

    Returns:
        DeploymentPreparationResponse with all deployment information
    """
    try:
        # Parse deployment target ID to determine type
        target_info = parse_deployment_target_id(deploy_target)
        target_type = target_info["type"]  # 'unode' or 'k8s'
        identifier = target_info["identifier"]

        # Get orchestrator for env var resolution
        orchestrator = get_service_orchestrator()

        # Get environment variable configuration using Settings API
        env_config = await orchestrator.get_env_config(service_id, deploy_target=deploy_target)
        if not env_config:
            raise HTTPException(status_code=404, detail=f"Service not found: {service_id}")

        # Get deployment target metadata based on type
        if target_type == "unode":
            # Get UNode information
            unode_manager = get_unode_manager()
            unode = await unode_manager.get_unode(identifier)
            if not unode:
                raise HTTPException(status_code=404, detail=f"UNode not found: {identifier}")

            target_metadata = unode.model_dump()
            infrastructure = None

        elif target_type == "k8s":
            # Get Kubernetes cluster information
            k8s_manager = get_kubernetes_manager()

            # Find cluster by name (deployment_target_id uses name, not cluster_id)
            clusters = await k8s_manager.list_clusters()
            cluster = next((c for c in clusters if c.name == identifier), None)
            if not cluster:
                raise HTTPException(status_code=404, detail=f"Kubernetes cluster not found: {identifier}")

            target_metadata = cluster.model_dump()

            # Get infrastructure scan for the cluster's default namespace
            namespace = cluster.namespace
            infrastructure = cluster.infra_scans.get(namespace, {}) if cluster.infra_scans else {}

        else:
            raise HTTPException(status_code=400, detail=f"Invalid target type: {target_type}")

        # Return unified response
        return DeploymentPreparationResponse(
            service_id=env_config["service_id"],
            service_name=env_config["service_name"],
            compose_file=env_config["compose_file"],
            requires=env_config["requires"],
            target_type=target_type,
            target_id=deploy_target,
            target_metadata=target_metadata,
            infrastructure=infrastructure,
            required_env_vars=env_config["required_env_vars"],
            optional_env_vars=env_config["optional_env_vars"],
        )

    except ValueError as e:
        # Invalid deployment target ID format
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to prepare deployment: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to prepare deployment: {str(e)}")


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
