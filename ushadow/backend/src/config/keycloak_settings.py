"""Keycloak configuration settings.

This module provides configuration for Keycloak integration using OmegaConf.
All sensitive values (passwords, client secrets) are stored in secrets.yaml.
"""

import os
import logging

from src.config import get_settings_store as get_settings

logger = logging.getLogger(__name__)


def get_keycloak_public_url() -> str:
    """Get the Keycloak public URL.

    Queries Tailscale to find the host's IP address and constructs the URL.
    This ensures both browser and backend container can reach Keycloak.

    Returns:
        Public URL like "http://100.105.225.45:8081" or "http://localhost:8081"
    """
    host_hostname = os.environ.get("HOST_HOSTNAME")

    if host_hostname:
        try:
            from src.services.tailscale_manager import get_tailscale_manager

            manager = get_tailscale_manager()

            # Check if Tailscale is running and authenticated
            status = manager.get_container_status()
            if status.running and status.authenticated:
                # Query Tailscale peers for host's IP
                host_ip = manager.get_peer_ip_by_hostname(host_hostname)

                if host_ip:
                    url = f"http://{host_ip}:8081"
                    logger.info(f"[KC-SETTINGS] Using Tailscale IP for Keycloak: {url}")
                    return url
                else:
                    logger.warning(f"[KC-SETTINGS] Could not find host '{host_hostname}' in Tailscale peers")
            else:
                logger.debug("[KC-SETTINGS] Tailscale not running or not authenticated")
        except Exception as e:
            logger.warning(f"[KC-SETTINGS] Failed to query Tailscale: {e}")

    # Fallback to localhost
    logger.info("[KC-SETTINGS] Using localhost for Keycloak")
    return "http://localhost:8081"


def get_keycloak_config() -> dict:
    """Get Keycloak configuration from OmegaConf settings.

    Returns:
        dict with keys:
            - enabled: bool
            - url: str (internal Docker URL)
            - public_url: str (external browser URL)
            - realm: str
            - backend_client_id: str
            - backend_client_secret: str (from secrets.yaml)
            - frontend_client_id: str
            - admin_keycloak_user: str (from secrets.yaml keycloak.admin_user)
            - admin_keycloak_password: str (from secrets.yaml keycloak.admin_password)
    """
    settings = get_settings()

    # Public configuration (from config.defaults.yaml)
    config = {
        "enabled": settings.get_sync("keycloak.enabled", False),
        "url": settings.get_sync("keycloak.url", "http://keycloak:8080"),
        "public_url": get_keycloak_public_url(),
        "realm": settings.get_sync("keycloak.realm", "ushadow"),
        "backend_client_id": settings.get_sync("keycloak.backend_client_id", "ushadow-backend"),
        "frontend_client_id": settings.get_sync("keycloak.frontend_client_id", "ushadow-frontend"),
    }

    # Secrets (from config/SECRETS/secrets.yaml)
    config["backend_client_secret"] = settings.get_sync("keycloak.backend_client_secret")

    # Keycloak admin credentials (separate from Ushadow admin)
    config["admin_keycloak_user"] = settings.get_sync("keycloak.admin_user", "admin")
    config["admin_keycloak_password"] = settings.get_sync("keycloak.admin_password", "admin")

    return config


def is_keycloak_enabled() -> bool:
    """Check if Keycloak authentication is enabled.

    This allows running both auth systems in parallel during migration:
    - keycloak.enabled=false: Use existing fastapi-users auth
    - keycloak.enabled=true: Use Keycloak (or hybrid mode)
    """
    settings = get_settings()
    return settings.get_sync("keycloak.enabled", False)
