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
        # If config_id not provided, use service_id (template as config)
        config_id = data.config_id or data.service_id

        deployment = await manager.deploy_service(
            data.service_id,
            data.unode_hostname,
            config_id=config_id
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


# =============================================================================
# Exposed URLs Discovery (must come before /{deployment_id} route)
# =============================================================================

@router.get("/exposed-urls")
async def get_exposed_urls(
    url_type: Optional[str] = Query(None, alias="type", description="Filter by URL type (e.g., 'audio', 'http')"),
    status: Optional[str] = Query(None, description="Filter by instance status (e.g., 'running')"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get exposed URLs from running service instances.

    This enables deployment-based discovery where clients query actual running services
    instead of using static provider registries.

    Example: GET /api/deployments/exposed-urls?type=audio&status=running
    Returns: List of audio intake endpoints from Chronicle, Mycelia, etc.
    """
    from src.services.service_config_manager import get_service_config_manager

    manager = get_service_config_manager()
    instances = manager.list_service_configs()

    logger.info(f"[exposed-urls] Found {len(instances)} total instances")
    logger.info(f"[exposed-urls] Filtering by status={status}, url_type={url_type}")

    result = []
    for instance in instances:
        logger.info(f"[exposed-urls] Checking instance {instance.id}")

        # Get full instance details with exposed_urls
        full_instance = manager.get_service_config(instance.id)
        if not full_instance:
            logger.info(f"[exposed-urls] Could not load full instance for {instance.id}")
            continue

        if not hasattr(full_instance, 'exposed_urls'):
            logger.info(f"[exposed-urls] Instance {instance.id} has no exposed_urls attribute")
            continue

        exposed_urls = getattr(full_instance, 'exposed_urls', None)
        if not exposed_urls:
            logger.info(f"[exposed-urls] Instance {instance.id} exposed_urls is empty")
            continue

        logger.info(f"[exposed-urls] Instance {instance.id} has {len(exposed_urls)} exposed URLs")

        # Process each exposed URL
        for exposed in exposed_urls:
            # Handle both dict and object formats
            if isinstance(exposed, dict):
                exp_type = exposed.get('type')
                exp_name = exposed.get('name')
                exp_url = exposed.get('url')
                exp_metadata = exposed.get('metadata', {})
            else:
                exp_type = getattr(exposed, 'type', None)
                exp_name = getattr(exposed, 'name', None)
                exp_url = getattr(exposed, 'url', None)
                exp_metadata = getattr(exposed, 'metadata', {})

            # Filter by type if requested
            if url_type and exp_type != url_type:
                continue

            result.append({
                "instance_id": instance.id,
                "instance_name": instance.name,
                "url": exp_url,
                "type": exp_type,
                "name": exp_name,
                "metadata": exp_metadata,
                "status": instance.status,
            })

    # Also check running docker containers from MANAGEABLE_SERVICES
    # This handles services started via docker compose that don't have service_config entries
    from src.services.docker_manager import get_docker_manager
    from src.services.compose_registry import get_compose_registry
    import os

    docker_mgr = get_docker_manager()
    compose_registry = get_compose_registry()
    project_name = os.getenv("COMPOSE_PROJECT_NAME", "ushadow")

    logger.info(f"[exposed-urls] Checking MANAGEABLE_SERVICES for additional exposed URLs")

    for service_name in docker_mgr.MANAGEABLE_SERVICES.keys():
        # Get service info to check if it's running
        service_info = docker_mgr.get_service_info(service_name)

        # Skip if not running or if status filter doesn't match
        if status and service_info.status.value != status:
            continue

        if service_info.status.value != "running":
            continue

        # Get compose metadata for this service
        compose_service = compose_registry.get_service_by_name(service_name)
        if not compose_service or not hasattr(compose_service, 'exposes') or not compose_service.exposes:
            continue

        # Get actual container name
        try:
            container = docker_mgr._client.containers.get(service_info.container_id)
            container_name = container.name
        except:
            continue

        logger.info(f"[exposed-urls] Found MANAGEABLE_SERVICE {service_name} with {len(compose_service.exposes)} exposed URLs")

        # Build exposed URLs from compose metadata
        for expose in compose_service.exposes:
            exp_type = expose.get('type')
            exp_name = expose.get('name')
            path = expose.get('path', '')
            port = expose.get('port')
            exp_metadata = expose.get('metadata', {})

            # Filter by type if requested
            if url_type and exp_type != url_type:
                continue

            # Build URL using actual container name
            protocol = 'ws' if exp_type == 'audio' else 'http'
            exp_url = f"{protocol}://{container_name}:{port}{path}"

            result.append({
                "instance_id": service_name,
                "instance_name": compose_service.display_name or service_name,
                "url": exp_url,
                "type": exp_type,
                "name": exp_name,
                "metadata": exp_metadata,
                "status": "running",
            })

    return result


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


class UpdateDeploymentRequest(BaseModel):
    """Request to update a deployment's environment variables."""
    env_vars: Dict[str, str]


@router.put("/{deployment_id}", response_model=Deployment)
async def update_deployment(
    deployment_id: str,
    data: UpdateDeploymentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Update a deployment's environment variables and redeploy.

    This updates the deployment's own configuration (not ServiceConfig)
    and redeploys the service with the new environment variables.
    """
    env_vars = data.env_vars
    manager = get_deployment_manager()

    try:
        # Get existing deployment
        deployment = await manager.get_deployment(deployment_id)
        if not deployment:
            raise HTTPException(status_code=404, detail="Deployment not found")

        # Update the deployment's environment variables
        # This will be stored in the deployment's deployed_config
        updated_deployment = await manager.update_deployment(
            deployment_id=deployment_id,
            env_vars=env_vars
        )

        logger.info(f"Deployment {deployment_id} updated and redeployed")
        return updated_deployment

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Update deployment failed: {e}")
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
