"""Tailscale Kubernetes Operator management endpoints."""

import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from kubernetes import client
from pydantic import BaseModel

from src.config import get_settings
from src.services.kubernetes import get_kubernetes_manager
from src.services.auth import get_current_user
from src.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Request / Response models ────────────────────────────────────────────────


class TailscaleOperatorCredentials(BaseModel):
    client_id: str = ""
    client_secret: str = ""
    hostname: str = "ushadow-chakra"


class InstallOperatorRequest(BaseModel):
    client_id: str
    client_secret: str
    hostname: str = "ushadow-chakra"
    proxygroup_name: str = ""  # '' = create new 'ushadow-proxies'


class TailscaleProxyGroup(BaseModel):
    name: str
    ready: bool
    pod_count: int


class TailscaleOperatorStatus(BaseModel):
    installed: bool = False
    operator_ready: bool = False
    ingress_annotated: bool = False  # ProxyGroup provisioned
    install_error: Optional[str] = None
    ts_hostname: Optional[str] = None
    proxygroup_name: Optional[str] = None
    hostname: Optional[str] = None
    tailnet_domain: Optional[str] = None
    ingress_configured: bool = False   # Tailscale Ingress for ushadow backend
    deployment_configured: bool = False  # USHADOW_PUBLIC_URL set


# ─── Credentials (global, not per-cluster) ────────────────────────────────────


@router.get("/tailscale-operator/credentials")
async def get_tailscale_operator_credentials(
    current_user: User = Depends(get_current_user),
) -> TailscaleOperatorCredentials:
    """Return saved Tailscale OAuth credentials for the operator."""
    settings = get_settings()
    return TailscaleOperatorCredentials(
        client_id=settings.get_sync("tailscale_operator.client_id") or "",
        client_secret=settings.get_sync("tailscale_operator.client_secret") or "",
        hostname=settings.get_sync("tailscale_operator.hostname") or "ushadow-chakra",
    )


@router.post("/tailscale-operator/credentials", status_code=204)
async def save_tailscale_operator_credentials(
    body: TailscaleOperatorCredentials,
    current_user: User = Depends(get_current_user),
):
    """Persist Tailscale OAuth credentials."""
    settings = get_settings()
    await settings.update({
        "tailscale_operator": {
            "client_id": body.client_id,
            "client_secret": body.client_secret,
            "hostname": body.hostname,
        }
    })


# ─── Per-cluster status ────────────────────────────────────────────────────────


@router.get("/{cluster_id}/tailscale-operator/status")
async def get_tailscale_operator_status(
    cluster_id: str,
    current_user: User = Depends(get_current_user),
) -> TailscaleOperatorStatus:
    """Return current Tailscale operator install status for a cluster."""
    k8s_manager = await get_kubernetes_manager()
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    try:
        core_api, apps_api = k8s_manager._k8s_client.get_kube_client(cluster_id)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach cluster: {e}")

    status = TailscaleOperatorStatus()

    # 1. Check if tailscale-system namespace exists
    try:
        core_api.read_namespace("tailscale-system")
        status.installed = True
    except Exception:
        return status

    # 2. Check operator deployment readiness
    try:
        dep = apps_api.read_namespaced_deployment("operator", "tailscale-system")
        ready = dep.status.ready_replicas or 0
        status.operator_ready = ready > 0
    except Exception:
        pass

    # 3. Detect ProxyGroup CRDs
    try:
        custom = client.CustomObjectsApi()
        pgs = custom.list_cluster_custom_object(
            group="tailscale.com",
            version="v1alpha1",
            plural="proxygroups",
        )
        items = pgs.get("items", [])
        if items:
            pg = items[0]
            pg_name = pg["metadata"]["name"]
            status.proxygroup_name = pg_name
            # Check readiness via pod count
            try:
                pods = core_api.list_namespaced_pod(
                    "tailscale-system",
                    label_selector=f"tailscale.com/parent-resource={pg_name}",
                )
                ready_pods = sum(
                    1 for p in pods.items
                    if p.status.phase == "Running"
                    and all(c.ready for c in (p.status.container_statuses or []))
                )
                status.ingress_annotated = ready_pods > 0
            except Exception:
                status.ingress_annotated = True  # assume ready if pods query fails
    except Exception:
        pass

    # 4. Detect ts_hostname from the operator's own Ingress or Service
    try:
        settings = get_settings()
        status.hostname = settings.get_sync("tailscale_operator.hostname") or "ushadow-chakra"
        # Try to read ts_hostname from the ushadow backend Ingress tls host
        networking = client.NetworkingV1Api()
        ingresses = networking.list_namespaced_ingress(cluster.namespace)
        for ing in ingresses.items:
            if ing.spec.ingress_class_name == "tailscale":
                tls = ing.spec.tls or []
                for t in tls:
                    hosts = t.hosts or []
                    if hosts:
                        # Reconstruct full hostname from LoadBalancer status
                        lb_status = (ing.status.load_balancer.ingress or []) if ing.status.load_balancer else []
                        if lb_status and lb_status[0].hostname:
                            status.ts_hostname = lb_status[0].hostname
                            parts = lb_status[0].hostname.split(".", 1)
                            if len(parts) == 2:
                                status.tailnet_domain = parts[1]
    except Exception:
        pass

    # 5. Check if ushadow backend Tailscale Ingress exists (configure step)
    try:
        networking = client.NetworkingV1Api()
        ingresses = networking.list_namespaced_ingress(cluster.namespace)
        ts_ingresses = [
            i for i in ingresses.items
            if i.spec.ingress_class_name == "tailscale"
            and i.metadata.name.endswith("-ts-ingress")
        ]
        status.ingress_configured = len(ts_ingresses) > 0
    except Exception:
        pass

    # 6. Check USHADOW_PUBLIC_URL on any backend deployment in the namespace
    try:
        deploys = apps_api.list_namespaced_deployment(cluster.namespace)
        for dep in deploys.items:
            if "backend" in dep.metadata.name:
                containers = dep.spec.template.spec.containers or []
                for container in containers:
                    env = container.env or []
                    for e in env:
                        if e.name == "USHADOW_PUBLIC_URL" and e.value:
                            status.deployment_configured = True
    except Exception:
        pass

    return status


# ─── ProxyGroup listing ────────────────────────────────────────────────────────


@router.get("/{cluster_id}/tailscale-operator/proxygroups")
async def list_tailscale_proxy_groups(
    cluster_id: str,
    current_user: User = Depends(get_current_user),
) -> List[TailscaleProxyGroup]:
    """List existing Tailscale ProxyGroups on the cluster."""
    k8s_manager = await get_kubernetes_manager()
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    try:
        core_api, _ = k8s_manager._k8s_client.get_kube_client(cluster_id)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach cluster: {e}")

    try:
        custom = client.CustomObjectsApi()
        pgs = custom.list_cluster_custom_object(
            group="tailscale.com",
            version="v1alpha1",
            plural="proxygroups",
        )
        result = []
        for pg in pgs.get("items", []):
            name = pg["metadata"]["name"]
            try:
                pods = core_api.list_namespaced_pod(
                    "tailscale-system",
                    label_selector=f"tailscale.com/parent-resource={name}",
                )
                ready_pods = sum(
                    1 for p in pods.items
                    if p.status.phase == "Running"
                    and all(c.ready for c in (p.status.container_statuses or []))
                )
                result.append(TailscaleProxyGroup(
                    name=name,
                    ready=ready_pods > 0,
                    pod_count=ready_pods,
                ))
            except Exception:
                result.append(TailscaleProxyGroup(name=name, ready=False, pod_count=0))
        return result
    except Exception as e:
        logger.warning(f"Could not list ProxyGroups (CRD may not be installed): {e}")
        return []


# ─── Install operator ─────────────────────────────────────────────────────────


@router.post("/{cluster_id}/tailscale-operator/install", status_code=204)
async def install_tailscale_operator(
    cluster_id: str,
    body: InstallOperatorRequest,
    current_user: User = Depends(get_current_user),
):
    """Install or update the Tailscale Kubernetes Operator via Helm."""
    k8s_manager = await get_kubernetes_manager()
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    pg_name = body.proxygroup_name or "ushadow-proxies"

    helm_values = (
        f"oauth.clientId={body.client_id},"
        f"oauth.clientSecret={body.client_secret},"
        f"operatorConfig.hostname={body.hostname},"
        f"proxyConfig.defaultProxyGroupName={pg_name}"
    )
    cmd = (
        "helm upgrade --install tailscale-operator "
        "oci://ghcr.io/tailscale/helm-charts/tailscale-operator "
        "--namespace tailscale-system --create-namespace "
        f"--set-string {helm_values} "
        "--wait --timeout 3m"
    )
    try:
        # Run in background so the HTTP response returns immediately
        # (status polling will reflect progress)
        asyncio.create_task(_run_helm(k8s_manager, cluster_id, cmd))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _run_helm(k8s_manager, cluster_id: str, cmd: str) -> None:
    """Run a helm command via subprocess with the correct kubeconfig."""
    import subprocess
    try:
        kubeconfig_file, temp_path = k8s_manager._k8s_client.get_kubeconfig_file_for_subprocess(cluster_id)
        full_cmd = f"KUBECONFIG={kubeconfig_file} {cmd}"
        result = await asyncio.to_thread(
            subprocess.run,
            full_cmd,
            shell=True, capture_output=True, text=True, timeout=240,
        )
        if result.returncode != 0:
            logger.error(f"[TailscaleOperator] Helm failed: {result.stderr}")
        else:
            logger.info(f"[TailscaleOperator] Helm succeeded: {result.stdout[:200]}")
    except Exception as e:
        logger.error(f"[TailscaleOperator] Helm install failed for {cluster_id}: {e}")
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)


# ─── Configure ushadow for Tailscale ─────────────────────────────────────────


class ConfigureRequest(BaseModel):
    hostname: str  # Full ts hostname, e.g. "ushadow-chakra.spangled-kettle.ts.net"


@router.post("/{cluster_id}/tailscale-operator/configure", status_code=204)
async def configure_tailscale_ingress(
    cluster_id: str,
    body: ConfigureRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Configure ushadow backend for Tailscale:
    1. Create a Tailscale Ingress for the ushadow-backend service.
    2. Patch USHADOW_PUBLIC_URL on the backend deployment.
    """
    k8s_manager = await get_kubernetes_manager()
    cluster = await k8s_manager.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    try:
        core_api, apps_api = k8s_manager._k8s_client.get_kube_client(cluster_id)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach cluster: {e}")

    namespace = cluster.namespace
    proxy_group = cluster.tailscale_proxy_group or "ushadow-proxies"
    public_url = f"https://{body.hostname}"

    # 1. Create Tailscale Ingress for ushadow backend
    networking = client.NetworkingV1Api()
    ingress_name = "ushadow-backend-ts-ingress"
    ingress_body = {
        "apiVersion": "networking.k8s.io/v1",
        "kind": "Ingress",
        "metadata": {
            "name": ingress_name,
            "namespace": namespace,
            "annotations": {"tailscale.com/proxy-group": proxy_group},
        },
        "spec": {
            "ingressClassName": "tailscale",
            "rules": [{"http": {"paths": [
                {"path": "/", "pathType": "Prefix",
                 "backend": {"service": {"name": "ushadow-backend", "port": {"number": 8000}}}},
            ]}}],
            "tls": [{"hosts": [body.hostname.split(".")[0]]}],
        },
    }
    try:
        networking.create_namespaced_ingress(namespace=namespace, body=ingress_body)
    except Exception as e:
        if "409" in str(e) or "already exists" in str(e).lower():
            try:
                networking.patch_namespaced_ingress(
                    name=ingress_name, namespace=namespace, body=ingress_body
                )
            except Exception as pe:
                raise HTTPException(status_code=500, detail=f"Failed to patch Ingress: {pe}")
        else:
            raise HTTPException(status_code=500, detail=f"Failed to create Ingress: {e}")

    # 2. Patch USHADOW_PUBLIC_URL on the backend deployment
    try:
        deploys = apps_api.list_namespaced_deployment(namespace)
        for dep in deploys.items:
            if "ushadow" in dep.metadata.name and "backend" in dep.metadata.name:
                patch = {"spec": {"template": {"spec": {"containers": [
                    {"name": dep.spec.template.spec.containers[0].name,
                     "env": [{"name": "USHADOW_PUBLIC_URL", "value": public_url}]}
                ]}}}}
                apps_api.patch_namespaced_deployment(
                    name=dep.metadata.name, namespace=namespace, body=patch
                )
                break
    except Exception as e:
        logger.warning(f"Could not patch USHADOW_PUBLIC_URL: {e}")
        # Non-fatal — Ingress was already created
