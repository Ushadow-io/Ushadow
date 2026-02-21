"""
Platform-aware service URL construction.

Single source of truth for building internal service URLs in both Docker and Kubernetes.
Two routing patterns are supported:

- Proxy routing: routes through the ushadow backend proxy endpoint
  (stable service discovery, used for inter-service config references)

- Direct routing: routes directly to a specific deployed container/pod
  (used by the proxy router when forwarding requests to a known deployment)
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

BACKEND_INTERNAL_PORT = 8000


def get_proxy_url(service_name: str) -> str:
    """
    Get URL to reach a service via the ushadow backend proxy.

    Routes requests through the ushadow backend's /api/services/{name}/proxy endpoint,
    providing stable service discovery regardless of container renames or restarts.

    Args:
        service_name: Service name (e.g., "mem0", "chronicle-backend")

    Returns:
        Full URL to the ushadow proxy for this service.
    """
    from src.utils.environment import get_environment_info, is_kubernetes
    env = get_environment_info()

    if is_kubernetes():
        return _k8s_proxy_url(service_name, env.k8s_namespace)
    return _docker_proxy_url(service_name, env.compose_project_name)


def _docker_proxy_url(service_name: str, project_name: str) -> str:
    """Build proxy URL using Docker Compose DNS naming."""
    return (
        f"http://{project_name}-backend:{BACKEND_INTERNAL_PORT}"
        f"/api/services/{service_name}/proxy"
    )


def _k8s_proxy_url(service_name: str, namespace: str) -> str:
    """Build proxy URL using Kubernetes Service DNS.

    The ushadow backend Service is named 'ushadow-backend' in K8s (backend-service.yaml).
    Namespace is resolved from KUBERNETES_NAMESPACE env var, the pod service account
    file, or falls back to the EnvironmentInfo namespace.
    """
    import os

    # Prefer explicit env var, then read from the downward-API mounted file K8s provides
    resolved_ns = os.getenv("KUBERNETES_NAMESPACE", "").strip()
    if not resolved_ns:
        try:
            with open("/var/run/secrets/kubernetes.io/serviceaccount/namespace") as f:
                resolved_ns = f.read().strip()
        except OSError:
            resolved_ns = namespace  # fall back to EnvironmentInfo.k8s_namespace

    return (
        f"http://ushadow-backend.{resolved_ns}.svc.cluster.local:{BACKEND_INTERNAL_PORT}"
        f"/api/services/{service_name}/proxy"
    )


def get_direct_service_url(
    service_name: str,
    port: int = BACKEND_INTERNAL_PORT,
    backend_type: str = "docker",
    namespace: Optional[str] = None,
) -> str:
    """
    Get a direct URL to a deployed service container or pod.

    Bypasses the ushadow proxy — routes directly to the container.
    Used by the proxy router when forwarding to a known Deployment.

    Args:
        service_name: Container name (docker) or K8s Service name
        port: Container/pod port to reach
        backend_type: "docker" or "kubernetes"
        namespace: K8s namespace (kubernetes only)

    Returns:
        Direct service URL (no proxy hop).
    """
    if backend_type == "kubernetes":
        ns = namespace or "default"
        return f"http://{service_name}.{ns}.svc.cluster.local:{port}"
    return f"http://{service_name}:{port}"


def get_deployment_url(deployment, default_port: int = BACKEND_INTERNAL_PORT) -> str:
    """
    Get the internal URL for proxying requests to a Deployment instance.

    Extracts port and namespace from the deployment's metadata and delegates
    to get_direct_service_url(). Accepts any object with Deployment-compatible
    attributes (container_name, backend_type, deployed_config, backend_metadata).

    Args:
        deployment: A Deployment model instance
        default_port: Fallback port if none found in deployed_config

    Returns:
        Direct URL to the deployed container or pod.
    """
    port = _extract_deployment_port(deployment.deployed_config, default_port)
    namespace = (
        (deployment.backend_metadata or {}).get("namespace")
        if deployment.backend_type == "kubernetes"
        else None
    )
    return get_direct_service_url(
        service_name=deployment.container_name,
        port=port,
        backend_type=deployment.backend_type,
        namespace=namespace,
    )


def _extract_deployment_port(deployed_config: Optional[dict], default: int = BACKEND_INTERNAL_PORT) -> int:
    """Parse the container port from a deployed_config ports list.

    Handles formats: "8081:8000" (returns 8000), "8000" (returns 8000).
    """
    ports = (deployed_config or {}).get("ports", [])
    if ports:
        first = str(ports[0])
        try:
            return int(first.split(":", 1)[-1]) if ":" in first else int(first)
        except ValueError:
            pass
    return default


def get_internal_proxy_url(service_name: str) -> str:
    """
    Get internal URL for reaching a service — platform-aware.

    This is the function imported by config/store.py for dynamic service URL
    resolution (service_urls.{name} config keys).

    Delegates to get_proxy_url() so callers don't need to know the platform.
    """
    return get_proxy_url(service_name)
