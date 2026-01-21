"""Kubernetes cluster management API endpoints."""

import logging
import os
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from src.models.kubernetes import (
    KubernetesCluster,
    KubernetesClusterCreate,
    KubernetesDeploymentSpec,
    KubernetesNode,
)
from src.services.kubernetes_manager import get_kubernetes_manager
from src.services.compose_registry import get_compose_registry
from src.services.auth import get_current_user
from src.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


# Request/Response models
class ScanInfraRequest(BaseModel):
    namespace: str = "default"


class DeployServiceRequest(BaseModel):
    service_id: str
    namespace: str = "default"
    config_id: Optional[str] = Field(None, description="ServiceConfig ID with env var overrides")
    node_name: Optional[str] = Field(None, description="Target K8s node name for deployment (uses nodeSelector)")
    k8s_spec: Optional[KubernetesDeploymentSpec] = None


class CreateEnvmapRequest(BaseModel):
    service_name: str
    namespace: str = "default"
    env_vars: Dict[str, str]


@router.post("", response_model=KubernetesCluster)
async def add_cluster(
    cluster_data: KubernetesClusterCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Add a new Kubernetes cluster.

    Upload a kubeconfig file (base64-encoded) to register a cluster.
    Ushadow will validate connectivity before adding it.
    """
    k8s_manager = await get_kubernetes_manager()

    success, cluster, error = await k8s_manager.add_cluster(cluster_data)

    if not success:
        raise HTTPException(status_code=400, detail=error)

    return cluster


@router.get("", response_model=List[KubernetesCluster])
async def list_clusters(
    current_user: User = Depends(get_current_user)
):
    """List all registered Kubernetes clusters."""
    k8s_manager = await get_kubernetes_manager()
    return await k8s_manager.list_clusters()


@router.get("/{cluster_id}", response_model=KubernetesCluster)
async def get_cluster(
    cluster_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get details of a specific Kubernetes cluster."""
    k8s_manager = await get_kubernetes_manager()
    cluster = await k8s_manager.get_cluster(cluster_id)

    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    return cluster


@router.get("/{cluster_id}/nodes", response_model=List[KubernetesNode])
async def list_cluster_nodes(
    cluster_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    List all nodes in a Kubernetes cluster.

    Returns node information including status, capacity, roles, and labels.
    Useful for selecting target nodes for deployments.
    """
    k8s_manager = await get_kubernetes_manager()

    try:
        nodes = await k8s_manager.list_nodes(cluster_id)
        return nodes
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error listing nodes for cluster {cluster_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list nodes")


@router.delete("/{cluster_id}")
async def remove_cluster(
    cluster_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove a Kubernetes cluster from Ushadow."""
    k8s_manager = await get_kubernetes_manager()

    success = await k8s_manager.remove_cluster(cluster_id)

    if not success:
        raise HTTPException(status_code=404, detail="Cluster not found")

    return {"success": True, "message": f"Cluster {cluster_id} removed"}


@router.get("/services/available")
async def get_available_services(
    current_user: User = Depends(get_current_user)
):
    """
    Get list of all available services from compose registry.

    Returns discovered services that can be deployed to Kubernetes.
    """
    registry = get_compose_registry()
    services = registry.get_services()

    # Convert to serializable format
    return {
        "services": [
            {
                "service_id": svc.service_id,
                "service_name": svc.service_name,
                "display_name": svc.display_name or svc.service_name,
                "description": svc.description,
                "image": svc.image,
                "requires": svc.requires,
                "namespace": svc.namespace,
            }
            for svc in services
        ]
    }


@router.get("/services/infra")
async def get_infra_services(
    current_user: User = Depends(get_current_user)
):
    """
    Get list of infrastructure services.

    Returns services identified as infrastructure (databases, caches, etc.).
    """
    registry = get_compose_registry()
    services = registry.get_services()

    # Filter for infrastructure services
    # Infrastructure typically doesn't have 'requires' (it's what others require)
    # Or it's in the infra namespace/has infra in the name
    infra_services = [
        svc for svc in services
        if (not svc.requires or  # No dependencies = infrastructure
            "infra" in svc.namespace.lower() if svc.namespace else False or
            any(name in svc.service_name.lower()
                for name in ["mongo", "redis", "postgres", "qdrant", "neo4j"]))
    ]

    return {
        "services": [
            {
                "service_id": svc.service_id,
                "service_name": svc.service_name,
                "display_name": svc.display_name or svc.service_name,
                "type": svc.service_name.split("-")[0] if "-" in svc.service_name else svc.service_name,
                "image": svc.image,
            }
            for svc in infra_services
        ]
    }


@router.post("/{cluster_id}/scan-infra")
async def scan_cluster_for_infra(
    cluster_id: str,
    request: ScanInfraRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Scan a Kubernetes cluster for existing infrastructure services.

    Checks if common infrastructure (mongo, redis, postgres, etc.)
    is already running in the cluster.
    """
    k8s_manager = await get_kubernetes_manager()

    # Verify cluster exists
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    results = await k8s_manager.scan_cluster_for_infra_services(
        cluster_id,
        request.namespace
    )

    # Store scan results in cluster document for caching
    await k8s_manager.update_cluster_infra_scan(
        cluster_id,
        request.namespace,
        results
    )

    return {
        "cluster_id": cluster_id,
        "namespace": request.namespace,
        "infra_services": results
    }


@router.post("/{cluster_id}/envmap")
async def create_or_update_envmap(
    cluster_id: str,
    request: CreateEnvmapRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Create or update ConfigMap and Secret for a service.

    Takes environment variables and automatically separates:
    - Sensitive values (keys, passwords) → Kubernetes Secret
    - Non-sensitive values → Kubernetes ConfigMap
    """
    k8s_manager = await get_kubernetes_manager()

    # Verify cluster exists
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    try:
        configmap_name, secret_name = await k8s_manager.get_or_create_envmap(
            cluster_id,
            request.namespace,
            request.service_name,
            request.env_vars
        )

        return {
            "success": True,
            "configmap": configmap_name or None,
            "secret": secret_name or None,
            "namespace": request.namespace
        }
    except Exception as e:
        logger.error(f"Failed to create envmap: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{cluster_id}/deploy")
async def deploy_service_to_cluster(
    cluster_id: str,
    request: DeployServiceRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Deploy a service to a Kubernetes cluster.

    Uses centralized resolution via deployment_manager to ensure all variables
    are resolved before generating K8s manifests.

    Supports targeting specific nodes via node_name parameter.
    """
    from src.services.deployment_manager import get_deployment_manager

    k8s_manager = await get_kubernetes_manager()
    deployment_manager = get_deployment_manager()

    # Verify cluster exists
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    # Resolve service with all variables substituted (including ServiceConfig overrides if provided)
    try:
        resolved_service = await deployment_manager.resolve_service_for_deployment(
            request.service_id,
            config_id=request.config_id
        )
    except ValueError as e:
        logger.error(f"Failed to resolve service {request.service_id}: {e}")
        raise HTTPException(status_code=400, detail=f"Service resolution failed: {e}")

    # Convert ResolvedServiceDefinition to dict format for kubernetes_manager
    service_def = {
        "service_id": resolved_service.service_id,
        "name": resolved_service.name,
        "image": resolved_service.image,
        "environment": resolved_service.environment,
        "ports": resolved_service.ports,  # Already in ["3002:3000"] format
        "volumes": resolved_service.volumes,  # Volume mounts for config files
    }

    # Update ServiceConfig status to DEPLOYING if config_id provided
    if request.config_id:
        from src.services.service_config_manager import get_service_config_manager
        from src.models.service_config import ServiceConfigStatus

        sc_manager = get_service_config_manager()
        sc_manager.update_instance_status(request.config_id, ServiceConfigStatus.DEPLOYING)
        logger.info(f"Updated ServiceConfig {request.config_id} status to DEPLOYING")

    # Add node selector if node_name specified
    k8s_spec = request.k8s_spec or KubernetesDeploymentSpec()
    if request.node_name:
        # Add node selector to ensure pod runs on specific node
        if not k8s_spec.labels:
            k8s_spec.labels = {}
        k8s_spec.labels["kubernetes.io/hostname"] = request.node_name
        logger.info(f"Targeting node: {request.node_name}")

    # Deploy
    success, message = await k8s_manager.deploy_to_kubernetes(
        cluster_id,
        service_def,
        request.namespace,
        k8s_spec
    )

    if not success:
        # Update ServiceConfig status to ERROR if deployment failed
        if request.config_id:
            from src.services.service_config_manager import get_service_config_manager
            from src.models.service_config import ServiceConfigStatus

            sc_manager = get_service_config_manager()
            sc_manager.update_instance_status(
                request.config_id,
                ServiceConfigStatus.ERROR,
                error=message
            )
            logger.error(f"Updated ServiceConfig {request.config_id} status to ERROR: {message}")

        raise HTTPException(status_code=500, detail=message)

    # Update ServiceConfig status if config_id was provided
    if request.config_id:
        from src.services.service_config_manager import get_service_config_manager
        from src.models.service_config import ServiceConfigStatus

        sc_manager = get_service_config_manager()

        # Build access URL (use service name if available)
        service_name = resolved_service.name
        access_url = f"http://{service_name}.{request.namespace}.svc.cluster.local"

        # Update status to RUNNING after successful deployment
        sc_manager.update_instance_status(
            request.config_id,
            ServiceConfigStatus.RUNNING,
            access_url=access_url
        )
        logger.info(f"Updated ServiceConfig {request.config_id} status to RUNNING")

    return {
        "success": True,
        "message": message,
        "service_id": resolved_service.service_id,
        "namespace": request.namespace,
        "node_name": request.node_name
    }


@router.get("/{cluster_id}/pods")
async def list_pods(
    cluster_id: str,
    namespace: str = "ushadow",
    current_user: User = Depends(get_current_user)
):
    """
    List all pods in a namespace.

    Returns pod name, status, restarts, age, and labels.
    """
    k8s_manager = await get_kubernetes_manager()

    # Verify cluster exists
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    try:
        pods = await k8s_manager.list_pods(cluster_id, namespace)
        return {"pods": pods, "namespace": namespace}
    except Exception as e:
        logger.error(f"Failed to list pods: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cluster_id}/pods/{pod_name}/logs")
async def get_pod_logs(
    cluster_id: str,
    pod_name: str,
    namespace: str = "ushadow",
    previous: bool = False,
    tail_lines: int = 100,
    current_user: User = Depends(get_current_user)
):
    """
    Get logs from a pod.

    Args:
        cluster_id: The cluster ID
        pod_name: Name of the pod
        namespace: Kubernetes namespace (default: ushadow)
        previous: Get logs from previous (crashed) container
        tail_lines: Number of lines to return from end of logs
    """
    k8s_manager = await get_kubernetes_manager()

    # Verify cluster exists
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    try:
        logs = await k8s_manager.get_pod_logs(
            cluster_id,
            pod_name,
            namespace,
            previous=previous,
            tail_lines=tail_lines
        )
        return {
            "pod_name": pod_name,
            "namespace": namespace,
            "previous": previous,
            "logs": logs
        }
    except Exception as e:
        logger.error(f"Failed to get pod logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cluster_id}/pods/{pod_name}/events")
async def get_pod_events(
    cluster_id: str,
    pod_name: str,
    namespace: str = "ushadow",
    current_user: User = Depends(get_current_user)
):
    """
    Get events for a pod (useful for debugging why pod won't start).
    """
    k8s_manager = await get_kubernetes_manager()

    # Verify cluster exists
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    try:
        events = await k8s_manager.get_pod_events(cluster_id, pod_name, namespace)
        return {
            "pod_name": pod_name,
            "namespace": namespace,
            "events": events
        }
    except Exception as e:
        logger.error(f"Failed to get pod events: {e}")
        raise HTTPException(status_code=500, detail=str(e))
