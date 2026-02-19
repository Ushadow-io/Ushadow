"""
Service URL construction utilities.

Functions for constructing service URLs in different network contexts:
- localhost: For same-host API calls (development, in-process calls)
- docker: For container-to-container communication via Docker DNS
- relative: For frontend API calls (browser-relative paths)
"""

import logging

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

    Delegates to src.utils.service_urls.get_proxy_url() which is platform-aware.
    Kept for backward compatibility — prefer get_proxy_url() for new code.

    Args:
        service_name: Service name (e.g., "mem0", "chronicle-backend")

    Returns:
        Proxy URL through the ushadow backend (e.g., "http://ushadow-orange-backend:8000/api/services/mem0/proxy")
    """
    from src.utils.service_urls import get_proxy_url
    return get_proxy_url(service_name)


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
