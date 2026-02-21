"""
Service URL construction utilities.

Functions for constructing service URLs in different network contexts:
- localhost: For same-host API calls (development, in-process calls)
- docker: For container-to-container communication via Docker DNS
- relative: For frontend API calls (browser-relative paths)
"""

import logging
import os

logger = logging.getLogger(__name__)


def get_localhost_proxy_url(service_name: str) -> str:
    """
    Get proxy URL using localhost (for same-host API calls).

    Uses network.host_ip and network.backend_public_port from config.
    Suitable for development or when calling from the same host.

    Args:
        service_name: Service name (e.g., "mem0", "chronicle-backend")

    Returns:
        Localhost proxy URL (e.g., "http://localhost:8000/api/services/mem0/proxy")
    """
    try:
        from src.config import get_settings
        settings = get_settings()
        host_ip = settings.get_sync("network.host_ip", "localhost")
        port = settings.get_sync("network.backend_public_port", 8000)
        return f"http://{host_ip}:{port}/api/services/{service_name}/proxy"
    except Exception as e:
        logger.warning(f"Failed to get backend URL from config: {e}, using default")
        return f"http://localhost:8000/api/services/{service_name}/proxy"


def get_docker_proxy_url(service_name: str) -> str:
    """
    Get proxy URL using Docker DNS (for container-to-container communication).

    Uses COMPOSE_PROJECT_NAME to build the backend service hostname.
    This URL goes through the ushadow backend proxy, providing:
    - Stable hostname (no hash-suffixed container names)
    - Unified routing logic
    - Works across environment changes

    Args:
        service_name: Service name (e.g., "mem0", "chronicle-backend")

    Returns:
        Docker proxy URL (e.g., "http://ushadow-orange-backend:8000/api/services/mem0/proxy")
    """
    # Backend always listens on port 8000 internally (container port)
    # BACKEND_PORT is the external/host port which varies by environment
    backend_internal_port = "8000"
    project_name = os.getenv("COMPOSE_PROJECT_NAME", "ushadow")
    return f"http://{project_name}-backend:{backend_internal_port}/api/services/{service_name}/proxy"


def get_relative_proxy_url(service_name: str) -> str:
    """
    Get relative proxy URL (for frontend API calls).

    Returns a browser-relative path that works regardless of host/port.

    Args:
        service_name: Service name (e.g., "mem0", "chronicle-backend")

    Returns:
        Relative proxy URL (e.g., "/api/services/mem0/proxy")
    """
    return f"/api/services/{service_name}/proxy"
