"""Kubernetes cluster management API endpoints."""

import logging
import os
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from src.models.kubernetes import (
    KubernetesCluster,
    KubernetesClusterCreate,
    KubernetesClusterUpdate,
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


@router.patch("/{cluster_id}", response_model=KubernetesCluster)
async def update_cluster(
    cluster_id: str,
    update: KubernetesClusterUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update cluster configuration settings."""
    k8s_manager = await get_kubernetes_manager()

    # Build update dict with only provided fields
    updates = {k: v for k, v in update.model_dump().items() if v is not None}

    if not updates:
        # No fields to update
        cluster = await k8s_manager.get_cluster(cluster_id)
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster not found")
        return cluster

    updated_cluster = await k8s_manager.update_cluster(cluster_id, updates)

    if not updated_cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    return updated_cluster


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

    # Don't allow scanning the target namespace - it contains deployed services, not infrastructure
    if request.namespace == cluster.namespace:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot scan target namespace '{cluster.namespace}' for infrastructure. "
                   f"This namespace contains deployed services. Scan a different namespace where infrastructure services are located."
        )

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


@router.delete("/{cluster_id}/scan-infra/{namespace}")
async def delete_infra_scan(
    cluster_id: str,
    namespace: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete an infrastructure scan for a specific namespace.

    Useful for removing stale or incorrect scan data.
    """
    k8s_manager = await get_kubernetes_manager()

    # Verify cluster exists
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    # Check if scan exists
    if not cluster.infra_scans or namespace not in cluster.infra_scans:
        raise HTTPException(
            status_code=404,
            detail=f"No infrastructure scan found for namespace '{namespace}'"
        )

    # Remove the scan
    await k8s_manager.delete_cluster_infra_scan(cluster_id, namespace)

    return {
        "cluster_id": cluster_id,
        "namespace": namespace,
        "message": f"Infrastructure scan for namespace '{namespace}' deleted successfully"
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
            deploy_target=cluster_id,
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

    # TODO: Track deployment status in Deployment record, not ServiceConfig
    # ServiceConfig no longer tracks deployment state (removed in architecture refactor)

    # Auto-populate k8s_spec with cluster ingress defaults
    k8s_spec = request.k8s_spec or KubernetesDeploymentSpec()

    # Auto-configure ingress if cluster has ingress configured
    if cluster.ingress_domain:
        if k8s_spec.ingress is None:
            # No ingress config from frontend - apply cluster defaults
            if cluster.ingress_enabled_by_default:
                # Auto-generate hostname
                service_name = resolved_service.name.lower().replace(" ", "-").replace("_", "-")
                hostname = f"{service_name}.{cluster.ingress_domain}"

                k8s_spec.ingress = {
                    "enabled": True,
                    "host": hostname,
                    "path": "/",
                    "ingressClassName": cluster.ingress_class
                }
                logger.info(f"✓ Auto-configured ingress: {hostname}")
        elif k8s_spec.ingress.get("enabled") and not k8s_spec.ingress.get("host"):
            # Frontend enabled ingress but no hostname - auto-generate
            service_name = resolved_service.name.lower().replace(" ", "-").replace("_", "-")
            k8s_spec.ingress["host"] = f"{service_name}.{cluster.ingress_domain}"
            k8s_spec.ingress["ingressClassName"] = cluster.ingress_class
            logger.info(f"✓ Auto-generated ingress hostname: {k8s_spec.ingress['host']}")

    # Add node selector if node_name specified
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
        # TODO: Track deployment errors in Deployment record
        logger.error(f"K8s deployment failed for config {request.config_id}: {message}")
        raise HTTPException(status_code=500, detail=message)

    # TODO: Track deployment success and access URL in Deployment record
    if request.config_id:
        service_name = resolved_service.name
        access_url = f"http://{service_name}.{request.namespace}.svc.cluster.local"
        logger.info(f"K8s deployment successful for config {request.config_id}, access URL: {access_url}")

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


# ═══════════════════════════════════════════════════════════════════════════
# DNS Management Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/{cluster_id}/dns/status")
async def get_dns_status(
    cluster_id: str,
    domain: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Get DNS configuration status for a cluster.
    
    Returns CoreDNS IP, Ingress IP, cert-manager status, and current DNS mappings.
    """
    from src.models.kubernetes_dns import DNSConfig, DNSStatus
    from src.services.kubernetes_dns_manager import KubernetesDNSManager
    
    k8s_manager = await get_kubernetes_manager()
    
    # Verify cluster exists
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Create DNS manager
    dns_manager = KubernetesDNSManager(
        kubectl_runner=lambda cmd: k8s_manager.run_kubectl_command(cluster_id, cmd)
    )
    
    # Build config if domain provided
    config = None
    if domain:
        config = DNSConfig(
            cluster_id=cluster_id,
            domain=domain
        )
    
    try:
        status = await dns_manager.get_dns_status(cluster_id, config)
        return status
    except Exception as e:
        logger.error(f"Failed to get DNS status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{cluster_id}/dns/setup")
async def setup_dns(
    cluster_id: str,
    request: 'DNSSetupRequest',
    current_user: User = Depends(get_current_user)
):
    """
    Setup DNS system on a cluster.
    
    This will:
    1. Install cert-manager (optional)
    2. Create Let's Encrypt ClusterIssuer
    3. Create DNS ConfigMap
    4. Patch CoreDNS configuration
    5. Patch CoreDNS deployment
    
    After setup, you can add services with DNS names.
    """
    from src.models.kubernetes_dns import DNSConfig, DNSSetupRequest
    from src.services.kubernetes_dns_manager import KubernetesDNSManager
    
    k8s_manager = await get_kubernetes_manager()
    
    # Verify cluster exists
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Create DNS manager
    dns_manager = KubernetesDNSManager(
        kubectl_runner=lambda cmd: k8s_manager.run_kubectl_command(cluster_id, cmd)
    )
    
    # Build config
    config = DNSConfig(
        cluster_id=cluster_id,
        domain=request.domain,
        acme_email=request.acme_email
    )
    
    try:
        success, error = await dns_manager.setup_dns_system(
            cluster_id,
            config,
            install_cert_manager=request.install_cert_manager
        )
        
        if not success:
            raise HTTPException(status_code=500, detail=error)
        
        return {
            "success": True,
            "message": f"DNS system setup complete for domain: {request.domain}",
            "domain": request.domain,
            "cert_manager_installed": request.install_cert_manager
        }
    except Exception as e:
        logger.error(f"Failed to setup DNS: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{cluster_id}/dns/services")
async def add_service_dns(
    cluster_id: str,
    domain: str,
    request: 'AddServiceDNSRequest',
    current_user: User = Depends(get_current_user)
):
    """
    Add DNS entry for a service.
    
    This will:
    1. Add DNS mapping to CoreDNS
    2. Create Ingress resource
    3. Setup TLS certificate (if enabled)
    
    The service will be accessible via:
    - FQDN: servicename.domain
    - Short names: shortname1, shortname2, etc.
    """
    from src.models.kubernetes_dns import DNSConfig, DNSServiceMapping, AddServiceDNSRequest
    from src.services.kubernetes_dns_manager import KubernetesDNSManager
    
    k8s_manager = await get_kubernetes_manager()
    
    # Verify cluster exists
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Create DNS manager
    dns_manager = KubernetesDNSManager(
        kubectl_runner=lambda cmd: k8s_manager.run_kubectl_command(cluster_id, cmd)
    )
    
    # Build config
    config = DNSConfig(cluster_id=cluster_id, domain=domain)
    
    # Build mapping
    mapping = DNSServiceMapping(
        service_name=request.service_name,
        namespace=request.namespace,
        shortnames=request.shortnames,
        use_ingress=request.use_ingress,
        enable_tls=request.enable_tls,
        service_port=request.service_port
    )
    
    try:
        success, error = await dns_manager.add_service_dns(cluster_id, config, mapping)
        
        if not success:
            raise HTTPException(status_code=500, detail=error)
        
        fqdn = f"{request.shortnames[0]}.{domain}"
        return {
            "success": True,
            "message": f"DNS added for service: {request.service_name}",
            "service_name": request.service_name,
            "fqdn": fqdn,
            "shortnames": request.shortnames,
            "tls_enabled": request.enable_tls
        }
    except Exception as e:
        logger.error(f"Failed to add service DNS: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{cluster_id}/dns/services/{service_name}")
async def remove_service_dns(
    cluster_id: str,
    service_name: str,
    domain: str,
    namespace: str = "default",
    current_user: User = Depends(get_current_user)
):
    """Remove DNS entry and Ingress for a service."""
    from src.models.kubernetes_dns import DNSConfig
    from src.services.kubernetes_dns_manager import KubernetesDNSManager
    
    k8s_manager = await get_kubernetes_manager()
    
    # Verify cluster exists
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Create DNS manager
    dns_manager = KubernetesDNSManager(
        kubectl_runner=lambda cmd: k8s_manager.run_kubectl_command(cluster_id, cmd)
    )
    
    # Build config
    config = DNSConfig(cluster_id=cluster_id, domain=domain)
    
    try:
        success, error = await dns_manager.remove_service_dns(
            cluster_id, config, service_name, namespace
        )
        
        if not success:
            raise HTTPException(status_code=500, detail=error)
        
        return {
            "success": True,
            "message": f"DNS removed for service: {service_name}"
        }
    except Exception as e:
        logger.error(f"Failed to remove service DNS: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cluster_id}/dns/certificates")
async def list_certificates(
    cluster_id: str,
    namespace: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    List TLS certificates managed by cert-manager.
    
    Shows certificate status, expiration, and renewal time.
    """
    from src.services.kubernetes_dns_manager import KubernetesDNSManager
    
    k8s_manager = await get_kubernetes_manager()
    
    # Verify cluster exists
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    
    # Create DNS manager
    dns_manager = KubernetesDNSManager(
        kubectl_runner=lambda cmd: k8s_manager.run_kubectl_command(cluster_id, cmd)
    )
    
    try:
        certificates = await dns_manager.list_certificates(cluster_id, namespace)
        return {
            "certificates": certificates,
            "total": len(certificates)
        }
    except Exception as e:
        logger.error(f"Failed to list certificates: {e}")
        raise HTTPException(status_code=500, detail=str(e))
