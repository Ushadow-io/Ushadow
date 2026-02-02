"""
Service URL utilities.

Functions for constructing service URLs in different contexts.
"""

import os


def get_internal_proxy_url(service_name: str) -> str:
    """
    Get the internal proxy URL for a service (for backend-to-service communication).

    This URL goes through the ushadow backend proxy, providing:
    - Stable hostname (no hash-suffixed container names)
    - Unified routing logic
    - Works across environment changes

    Args:
        service_name: Service name (e.g., "mem0", "chronicle-backend")

    Returns:
        Internal proxy URL (e.g., "http://ushadow-orange-backend:8360/api/services/mem0/proxy")
    """
    backend_port = os.getenv("BACKEND_PORT", "8001")
    project_name = os.getenv("COMPOSE_PROJECT_NAME", "ushadow")
    return f"http://{project_name}-backend:{backend_port}/api/services/{service_name}/proxy"


def get_relative_proxy_url(service_name: str) -> str:
    """
    Get the relative proxy URL for a service (for frontend API calls).

    Args:
        service_name: Service name (e.g., "mem0", "chronicle-backend")

    Returns:
        Relative proxy URL (e.g., "/api/services/mem0/proxy")
    """
    return f"/api/services/{service_name}/proxy"
