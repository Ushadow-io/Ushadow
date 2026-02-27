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

    logger.info(f"📍 Found {len(clusters)} K8s clusters for deployment targets")

    for cluster in clusters:
        logger.info(f"  → Adding K8s cluster: {cluster.name} (status: {cluster.status})")
        parsed = parse_deployment_target_id(cluster.deployment_target_id)

        # Get infrastructure - skip target namespace as it contains deployed services, not infra
        infra = {}
        if cluster.infra_scans:
            # Filter out scans of the target namespace
            infra_scans_filtered = {
                ns: scan for ns, scan in cluster.infra_scans.items()
                if ns != cluster.namespace
            }

            if not infra_scans_filtered:
                logger.info(f"    ⚠️ No infrastructure scans available (target namespace '{cluster.namespace}' excluded)")
            else:
                # Use the first available infrastructure scan
                infra_ns = next(iter(infra_scans_filtered.keys()))
                infra = infra_scans_filtered[infra_ns]
                logger.info(f"    ✓ Using infrastructure from namespace '{infra_ns}'")

            if infra:
                logger.info(f"    Infrastructure services: {list(infra.keys())}")
            else:
                logger.info(f"    ⚠️ No infrastructure found in any namespace")
        else:
            logger.info(f"    ⚠️ No infra_scans available for cluster")

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

    logger.info(f"✅ Returning {len(targets)} total deployment targets ({len(unodes)} Docker, {len(clusters)} K8s)")
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
            config_id=config_id,
            force_rebuild=data.force_rebuild
        )
        return deployment
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Deployment failed ({type(e).__name__}): {e}")
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
    url_name: Optional[str] = Query(None, alias="name", description="Filter by URL name (e.g., 'audio_intake')"),
    format: Optional[str] = Query(None, description="Filter by audio format (e.g., 'opus', 'pcm')"),
    status: Optional[str] = Query(None, description="Filter by instance status (e.g., 'running')"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get exposed URLs from running service instances.

    This enables deployment-based discovery where clients query actual running services
    instead of using static provider registries.

    Example: GET /api/deployments/exposed-urls?type=audio&name=audio_intake&format=opus&status=running
    Returns: List of audio intake endpoints that support Opus format from Chronicle, Mycelia, etc.
    """
    from src.services.service_config_manager import get_service_config_manager

    logger.info(f"[exposed-urls] Filtering by status={status}, url_type={url_type}, url_name={url_name}, format={format}")

    result = []
    seen_containers = set()  # Track container names to avoid duplicates

    # Note: ServiceConfig objects don't have exposed_urls - that's only in compose metadata
    # So we skip the service_configs loop and go straight to runtime discovery

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

        # Get container name from service_info
        container_name = service_info.container_name
        if not container_name:
            logger.warning(f"[exposed-urls] Service {service_name} is running but has no container_name")
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

            # Filter by name if requested
            if url_name and exp_name != url_name:
                continue

            # Filter by format if requested (check metadata.formats array)
            if format:
                supported_formats = exp_metadata.get('formats', [])
                if format not in supported_formats:
                    continue

            # Build internal URL (for relay to connect to)
            # Audio endpoints use WebSocket protocol
            protocol = 'ws' if exp_type == 'audio' else 'http'
            exp_url = f"{protocol}://{container_name}:{port}{path}"

            # Skip if this container was already added (avoid duplicates with deployments)
            if container_name in seen_containers:
                logger.info(f"[exposed-urls] Skipping already-added container {container_name}")
                continue

            entry = {
                "instance_id": service_name,
                "instance_name": compose_service.display_name or service_name,
                "url": exp_url,
                "type": exp_type,
                "name": exp_name,
                "metadata": exp_metadata,
                "status": "running",
            }
            result.append(entry)
            seen_containers.add(container_name)
            logger.info(f"[exposed-urls] Added MANAGEABLE_SERVICE URL: {exp_name} -> {exp_url} (service {service_name}, container {container_name})")

    # Also check running deployments on the local leader
    # This handles services started via deployment manager (not docker compose)
    logger.info(f"[exposed-urls] Checking deployments for additional exposed URLs")

    # Get local hostname to filter for only local deployments
    # Use COMPOSE_PROJECT_NAME first as that's what unodes are registered with
    current_hostname = (
        os.getenv("COMPOSE_PROJECT_NAME") or
        os.getenv("UNODE_HOSTNAME") or
        os.getenv("ENV_NAME") or
        "local"
    )

    deployment_manager = get_deployment_manager()
    logger.info(f"[exposed-urls] Querying deployments for hostname: {current_hostname}")
    deployments = await deployment_manager.list_deployments(unode_hostname=current_hostname)
    logger.info(f"[exposed-urls] Found {len(deployments)} deployments")

    for deployment in deployments:
        logger.info(f"[exposed-urls] Checking deployment {deployment.id}: service_id={deployment.service_id}, status={deployment.status}")

        # Filter by status if requested
        if status and deployment.status != status:
            logger.info(f"[exposed-urls] Skipping deployment {deployment.id} - status filter mismatch")
            continue

        if deployment.status != "running":
            logger.info(f"[exposed-urls] Skipping deployment {deployment.id} - not running")
            continue

        # Get compose metadata for the service definition
        compose_service = compose_registry.get_service_by_name(deployment.service_id)

        if not compose_service:
            logger.info(f"[exposed-urls] No compose service found for {deployment.service_id}")
            continue

        if not hasattr(compose_service, 'exposes'):
            logger.info(f"[exposed-urls] Compose service {deployment.service_id} has no 'exposes' attribute")
            continue

        if not compose_service.exposes:
            logger.info(f"[exposed-urls] Compose service {deployment.service_id} has empty exposes")
            continue

        logger.info(f"[exposed-urls] Found deployment {deployment.id} for service {deployment.service_id} with {len(compose_service.exposes)} exposed URLs")

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

            # Filter by name if requested
            if url_name and exp_name != url_name:
                continue

            # Filter by format if requested (check metadata.formats array)
            if format:
                supported_formats = exp_metadata.get('formats', [])
                if format not in supported_formats:
                    continue

            # Build internal URL (for relay to connect to)
            # Audio endpoints use WebSocket protocol
            protocol = 'ws' if exp_type == 'audio' else 'http'
            exp_url = f"{protocol}://{deployment.container_name}:{port}{path}"

            # Skip if this container was already added (avoid duplicates with MANAGEABLE_SERVICES)
            if deployment.container_name in seen_containers:
                logger.info(f"[exposed-urls] Skipping already-added container {deployment.container_name}")
                continue

            entry = {
                "instance_id": deployment.id,
                "instance_name": compose_service.display_name or deployment.service_id,
                "url": exp_url,
                "type": exp_type,
                "name": exp_name,
                "metadata": exp_metadata,
                "status": deployment.status,
            }
            result.append(entry)
            seen_containers.add(deployment.container_name)
            logger.info(f"[exposed-urls] Added deployment URL: {exp_name} -> {exp_url} (deployment {deployment.id}, container {deployment.container_name})")

    logger.info("=" * 80)
    logger.info(f"[exposed-urls] RETURNING {len(result)} TOTAL EXPOSED URLs")
    logger.info(f"[exposed-urls] PARAMS: status={status}, url_type={url_type}, url_name={url_name}, format={format}")
    logger.info(f"[exposed-urls] Unique containers collected: {len(seen_containers)}")
    logger.info("=" * 80)

    for i, entry in enumerate(result):
        logger.info(
            f"[exposed-urls] [{i}] {entry['type']}/{entry['name']}: {entry['url']}\n"
            f"              instance_id={entry['instance_id']}, "
            f"instance_name={entry['instance_name']}, "
            f"status={entry['status']}"
        )

    logger.info("=" * 80)

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
        await manager.remove_deployment(deployment_id)
        return {"success": True, "message": f"Deployment {deployment_id} removed"}
    except HTTPException:
        raise
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


# =============================================================================
# Funnel Configuration (Public Access)
# =============================================================================

@router.get("/{deployment_id}/funnel")
async def get_funnel_configuration(
    deployment_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get funnel configuration for a deployment.

    Returns funnel status, route, and public URL if configured.
    """
    from src.services.tailscale_manager import get_tailscale_manager

    manager = get_deployment_manager()
    unode_manager = await get_unode_manager()

    # Get deployment
    deployments = await manager.list_deployments()
    deployment = next((d for d in deployments if d.id == deployment_id), None)

    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    # Check if unode has funnel enabled
    unodes = await unode_manager.list_unodes()
    unode = next((u for u in unodes if u.hostname == deployment.unode_hostname), None)

    funnel_enabled = bool(unode and unode.labels.get("funnel") == "enabled")

    # Get funnel configuration from deployment metadata
    funnel_route = deployment.metadata.get("funnel_route")

    # Build public URL if funnel is enabled and route is configured
    public_url = None
    if funnel_enabled and funnel_route:
        ts_manager = get_tailscale_manager()
        funnel_status = ts_manager.get_funnel_status()
        base_url = funnel_status.get("public_url")
        if base_url:
            # Extract hostname from base URL and append route
            public_url = base_url.rstrip("/") + funnel_route

    return {
        "deployment_id": deployment_id,
        "service": deployment.service_id,
        "unode": deployment.unode_hostname,
        "funnel_enabled": funnel_enabled,
        "route": funnel_route,
        "public_url": public_url
    }


@router.patch("/{deployment_id}/funnel")
async def configure_funnel_route(
    deployment_id: str,
    request: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Configure funnel route for a deployment.

    Enables public internet access via Tailscale Funnel.
    """
    from src.services.tailscale_manager import get_tailscale_manager
    from src.services.service_config_manager import get_service_config_manager

    route = request.get("route")
    save_to_config = request.get("save_to_config", False)

    if not route or not route.startswith("/"):
        raise HTTPException(
            status_code=400,
            detail="Route must start with / (e.g., /my-service)"
        )

    manager = get_deployment_manager()
    unode_manager = await get_unode_manager()

    # Get deployment
    deployments = await manager.list_deployments()
    deployment = next((d for d in deployments if d.id == deployment_id), None)

    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    # Check if unode has funnel enabled
    unodes = await unode_manager.list_unodes()
    unode = next((u for u in unodes if u.hostname == deployment.unode_hostname), None)

    if not unode or unode.labels.get("funnel") != "enabled":
        raise HTTPException(
            status_code=403,
            detail=f"Funnel not enabled for unode {deployment.unode_hostname}"
        )

    # Get container target URL
    container_name = deployment.container_name
    exposed_port = deployment.exposed_port

    if not container_name or not exposed_port:
        raise HTTPException(
            status_code=400,
            detail="Deployment missing container_name or exposed_port"
        )

    target_url = f"http://{container_name}:{exposed_port}"

    # Configure funnel route via Tailscale
    ts_manager = get_tailscale_manager()
    exit_code, stdout, stderr = ts_manager.exec_command(
        f"tailscale funnel --bg --set-path {route} {target_url}",
        timeout=10
    )

    if exit_code != 0:
        error_msg = stderr or stdout or "Unknown error"
        logger.error(f"Failed to configure funnel route {route}: {error_msg}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to configure funnel: {error_msg}"
        )

    # Store route in deployment metadata (in-memory for now)
    deployment.metadata["funnel_route"] = route
    previous_route = deployment.metadata.get("previous_funnel_route")

    # Get public URL
    funnel_status = ts_manager.get_funnel_status()
    base_url = funnel_status.get("public_url")
    public_url = base_url.rstrip("/") + route if base_url else None

    # Optionally save to service config
    if save_to_config and deployment.config_id:
        try:
            config_manager = await get_service_config_manager()
            config = await config_manager.get_config(deployment.config_id)
            if config:
                config.funnel_route = route
                await config_manager.update_config(deployment.config_id, config.dict(exclude_unset=True))
        except Exception as e:
            logger.warning(f"Failed to save funnel route to config: {e}")

    logger.info(f"Configured funnel route {route} for deployment {deployment_id}")

    return {
        "success": True,
        "deployment_id": deployment_id,
        "route": route,
        "previous_route": previous_route,
        "public_url": public_url,
        "saved_to_config": save_to_config,
        "note": "Funnel route configured successfully"
    }


@router.delete("/{deployment_id}/funnel")
async def remove_funnel_route(
    deployment_id: str,
    save_to_config: bool = Query(False),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Remove funnel route for a deployment.

    Disables public internet access for this deployment.
    """
    from src.services.tailscale_manager import get_tailscale_manager
    from src.services.service_config_manager import get_service_config_manager

    manager = get_deployment_manager()

    # Get deployment
    deployments = await manager.list_deployments()
    deployment = next((d for d in deployments if d.id == deployment_id), None)

    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    # Get current route from metadata
    route = deployment.metadata.get("funnel_route")

    if not route:
        return {
            "success": True,
            "deployment_id": deployment_id,
            "note": "No funnel route configured"
        }

    # Remove funnel route via Tailscale
    ts_manager = get_tailscale_manager()
    exit_code, stdout, stderr = ts_manager.exec_command(
        f"tailscale funnel --bg --remove-path {route}",
        timeout=10
    )

    if exit_code != 0:
        error_msg = stderr or stdout or "Unknown error"
        logger.warning(f"Failed to remove funnel route {route}: {error_msg}")
        # Continue anyway to clear metadata

    # Clear route from deployment metadata
    deployment.metadata["previous_funnel_route"] = route
    deployment.metadata.pop("funnel_route", None)

    # Optionally remove from service config
    if save_to_config and deployment.config_id:
        try:
            config_manager = await get_service_config_manager()
            config = await config_manager.get_config(deployment.config_id)
            if config:
                config.funnel_route = None
                await config_manager.update_config(deployment.config_id, config.dict(exclude_unset=True))
        except Exception as e:
            logger.warning(f"Failed to remove funnel route from config: {e}")

    logger.info(f"Removed funnel route {route} for deployment {deployment_id}")

    return {
        "success": True,
        "deployment_id": deployment_id,
        "route_removed": route,
        "saved_to_config": save_to_config,
        "note": "Funnel route removed successfully"
    }
