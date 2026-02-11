"""Keycloak configuration settings.

This module provides configuration for Keycloak integration using python-keycloak library.
All sensitive values (passwords, client secrets) are stored in secrets.yaml.

Architecture:
- Uses KeycloakOpenIDConnection for centralized configuration
- Public URL is dynamically constructed from Tailscale hostname or config
- Provides singleton instances for KeycloakAdmin and KeycloakOpenID
"""

from typing import Optional
import logging

from keycloak import KeycloakOpenIDConnection, KeycloakAdmin, KeycloakOpenID
from keycloak.exceptions import KeycloakError

from src.config import get_settings_store as get_settings

logger = logging.getLogger(__name__)

# Singleton instances
_keycloak_connection: Optional[KeycloakOpenIDConnection] = None
_keycloak_admin: Optional[KeycloakAdmin] = None
_keycloak_openid: Optional[KeycloakOpenID] = None


def get_keycloak_public_url() -> str:
    """Get the Keycloak public URL.

    Queries Tailscale to find the host's IP address and constructs the URL.
    This ensures both browser and backend container can reach Keycloak.

    Returns:
        Public URL like "http://100.105.225.45:8081" or "http://localhost:8081"
    """
    import os

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


def get_keycloak_connection() -> KeycloakOpenIDConnection:
    """
    Get centralized Keycloak connection object.

    This connection stores all config in one place and can be shared
    across KeycloakAdmin and KeycloakOpenID instances.

    Follows python-keycloak best practices for configuration management.

    Returns:
        KeycloakOpenIDConnection instance
    """
    global _keycloak_connection

    if _keycloak_connection is None:
        settings = get_settings()

        public_url = get_keycloak_public_url()
        realm = settings.get_sync("keycloak.realm", "ushadow")
        admin_user = settings.get_sync("keycloak.admin_user", "admin")
        admin_password = settings.get_sync("keycloak.admin_password", "admin")

        logger.info(f"[KC-SETTINGS] Initializing KeycloakOpenIDConnection:")
        logger.info(f"[KC-SETTINGS]   - Server URL: {public_url}")
        logger.info(f"[KC-SETTINGS]   - Realm: {realm}")
        logger.info(f"[KC-SETTINGS]   - Admin User: {admin_user}")

        _keycloak_connection = KeycloakOpenIDConnection(
            server_url=public_url,
            realm_name=realm,
            username=admin_user,
            password=admin_password,
            client_id="admin-cli",
            verify=True,  # SSL verification (set to False for self-signed certs if needed)
        )

    return _keycloak_connection


def get_keycloak_admin() -> KeycloakAdmin:
    """
    Get KeycloakAdmin instance using official python-keycloak library.

    This replaces the custom KeycloakAdminClient with the official implementation,
    which provides better error handling, automatic token refresh, and connection pooling.

    Returns:
        KeycloakAdmin instance
    """
    global _keycloak_admin

    if _keycloak_admin is None:
        connection = get_keycloak_connection()
        _keycloak_admin = KeycloakAdmin(connection=connection)
        logger.debug("[KC-SETTINGS] Initialized KeycloakAdmin")

    return _keycloak_admin


def get_keycloak_openid(client_id: Optional[str] = None) -> KeycloakOpenID:
    """
    Get KeycloakOpenID instance for token operations.

    Args:
        client_id: Client ID to use (defaults to frontend_client_id from config)

    Returns:
        KeycloakOpenID instance
    """
    global _keycloak_openid

    if _keycloak_openid is None:
        settings = get_settings()
        connection = get_keycloak_connection()

        # Use provided client_id or default to frontend
        if client_id is None:
            client_id = settings.get_sync("keycloak.frontend_client_id", "ushadow-frontend")

        client_secret = settings.get_sync("keycloak.backend_client_secret")

        logger.info(f"[KC-SETTINGS] Initializing KeycloakOpenID for client: {client_id}")

        _keycloak_openid = KeycloakOpenID(
            server_url=connection.server_url,
            realm_name=connection.realm_name,
            client_id=client_id,
            client_secret_key=client_secret,
        )

    return _keycloak_openid


def get_keycloak_config() -> dict:
    """Get Keycloak configuration from OmegaConf settings.

    Legacy compatibility function - provides dict interface for code
    that hasn't been migrated to use connection objects directly.

    Returns:
        dict with keys:
            - enabled: bool
            - url: str (internal Docker URL)
            - public_url: str (external browser URL, dynamically constructed)
            - realm: str
            - backend_client_id: str
            - backend_client_secret: str (from secrets.yaml)
            - frontend_client_id: str
            - admin_keycloak_user: str
            - admin_keycloak_password: str
    """
    settings = get_settings()
    connection = get_keycloak_connection()

    return {
        "enabled": settings.get_sync("keycloak.enabled", False),
        "url": settings.get_sync("keycloak.url", "http://keycloak:8080"),
        "public_url": connection.server_url,  # From connection (dynamic)
        "realm": connection.realm_name,
        "backend_client_id": settings.get_sync("keycloak.backend_client_id", "ushadow-backend"),
        "frontend_client_id": settings.get_sync("keycloak.frontend_client_id", "ushadow-frontend"),
        "backend_client_secret": settings.get_sync("keycloak.backend_client_secret"),
        "admin_keycloak_user": connection.username,
        "admin_keycloak_password": connection.password,
    }


def is_keycloak_enabled() -> bool:
    """Check if Keycloak authentication is enabled.

    This allows running both auth systems in parallel during migration:
    - keycloak.enabled=false: Use existing fastapi-users auth
    - keycloak.enabled=true: Use Keycloak (or hybrid mode)
    """
    settings = get_settings()
    return settings.get_sync("keycloak.enabled", False)
