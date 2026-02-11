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

    Priority:
    1. KEYCLOAK_PUBLIC_URL environment variable (for explicit override)
    2. Query Tailscale to find the host's IP address (for development)
    3. Config setting (keycloak.public_url from config.defaults.yaml)
    4. Fallback to localhost

    Returns:
        Public URL like "http://keycloak.root.svc.cluster.local:8080" or "http://localhost:8080"
    """
    import os

    # Check environment variable first (highest priority)
    env_url = os.environ.get("KEYCLOAK_PUBLIC_URL")
    if env_url:
        logger.info(f"[KC-SETTINGS] Using KEYCLOAK_PUBLIC_URL from env: {env_url}")
        return env_url

    # Try Tailscale discovery (for development environments)
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

    # Check config setting
    settings = get_settings()
    config_url = settings.get_sync("keycloak.public_url")
    if config_url:
        logger.info(f"[KC-SETTINGS] Using keycloak.public_url from config: {config_url}")
        return config_url

    # Fallback to localhost
    logger.info("[KC-SETTINGS] Using localhost for Keycloak (fallback)")
    return "http://localhost:8080"


def get_keycloak_connection() -> KeycloakOpenIDConnection:
    """
    Get centralized Keycloak connection object.

    This connection stores all config in one place and can be shared
    across KeycloakAdmin and KeycloakOpenID instances.

    IMPORTANT: Uses internal URL (KEYCLOAK_URL) for backend-to-Keycloak communication,
    not the public URL (which is for browser-to-Keycloak).

    Follows python-keycloak best practices for configuration management.

    Returns:
        KeycloakOpenIDConnection instance
    """
    global _keycloak_connection

    if _keycloak_connection is None:
        import os
        settings = get_settings()

        # Backend uses internal URL for direct connection to Keycloak
        # Priority: KEYCLOAK_URL env var > config setting > default
        internal_url = (
            os.environ.get("KEYCLOAK_URL") or
            settings.get_sync("keycloak.url") or
            "http://keycloak:8080"
        )

        # Admin user authenticates against master realm, not application realm
        # This allows cross-realm admin operations (managing ushadow realm)
        admin_user = settings.get_sync("keycloak.admin_user", "admin")
        admin_password = settings.get_sync("keycloak.admin_password", "admin")

        logger.info(f"[KC-SETTINGS] Initializing KeycloakOpenIDConnection:")
        logger.info(f"[KC-SETTINGS]   - Server URL (internal): {internal_url}")
        logger.info(f"[KC-SETTINGS]   - Realm: master (admin authentication)")
        logger.info(f"[KC-SETTINGS]   - Admin User: {admin_user}")

        _keycloak_connection = KeycloakOpenIDConnection(
            server_url=internal_url,
            realm_name="master",  # Admin users exist in master realm
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

    Creates admin for managing the application realm (ushadow) while authenticating
    via the master realm's admin account.

    Returns:
        KeycloakAdmin instance configured for ushadow realm
    """
    global _keycloak_admin

    if _keycloak_admin is None:
        import os
        settings = get_settings()

        # Get application realm to manage
        app_realm = settings.get_sync("keycloak.realm", "ushadow")

        # Internal URL for backend-to-Keycloak communication
        internal_url = (
            os.environ.get("KEYCLOAK_URL") or
            settings.get_sync("keycloak.url") or
            "http://keycloak:8080"
        )

        # Admin credentials from master realm
        admin_user = settings.get_sync("keycloak.admin_user", "admin")
        admin_password = settings.get_sync("keycloak.admin_password", "admin")

        logger.info(f"[KC-SETTINGS] Initializing KeycloakAdmin:")
        logger.info(f"[KC-SETTINGS]   - Server URL: {internal_url}")
        logger.info(f"[KC-SETTINGS]   - Target Realm: {app_realm}")
        logger.info(f"[KC-SETTINGS]   - Admin User: {admin_user}")

        # Create admin for application realm, authenticating as master admin
        _keycloak_admin = KeycloakAdmin(
            server_url=internal_url,
            username=admin_user,
            password=admin_password,
            realm_name=app_realm,  # Realm to manage
            user_realm_name="master",  # Realm where admin user exists
            verify=True
        )

        logger.info(f"[KC-SETTINGS] ✓ KeycloakAdmin initialized for realm: {app_realm}")

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

        # OpenID operations use the application realm (ushadow), not master
        app_realm = settings.get_sync("keycloak.realm", "ushadow")

        logger.info(f"[KC-SETTINGS] Initializing KeycloakOpenID for client: {client_id}")

        _keycloak_openid = KeycloakOpenID(
            server_url=connection.server_url,
            realm_name=app_realm,  # Use application realm for token operations
            client_id=client_id,
            client_secret_key=client_secret,
        )

    return _keycloak_openid


def get_keycloak_config() -> dict:
    """Get Keycloak configuration from OmegaConf settings.

    Dynamically determines public_url based on Tailscale configuration:
    - If tailscale.hostname exists: Use http://{hostname}:8081
    - Otherwise: Use localhost fallback

    Returns:
        dict with keys:
            - enabled: bool
            - url: str (internal Docker URL)
            - public_url: str (external browser URL - dynamically determined)
            - realm: str
            - backend_client_id: str
            - backend_client_secret: str (from secrets.yaml)
            - frontend_client_id: str
            - admin_keycloak_user: str (from secrets.yaml keycloak.admin_user)
            - admin_keycloak_password: str (from secrets.yaml keycloak.admin_password)
    """
    settings = get_settings()

    # Application realm (not master realm used for admin connection)
    app_realm = settings.get_sync("keycloak.realm", "ushadow")

    return {
        "enabled": settings.get_sync("keycloak.enabled", False),
        "url": settings.get_sync("keycloak.url", "http://keycloak:8080"),
        "public_url": connection.server_url,  # From connection (dynamic)
        "realm": app_realm,  # Application realm (ushadow), not master
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
