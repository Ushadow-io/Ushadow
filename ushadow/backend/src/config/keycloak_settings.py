"""Keycloak configuration settings.

This module provides configuration for Keycloak integration using OmegaConf.
All sensitive values (passwords, client secrets) are stored in secrets.yaml.
"""

import logging
from typing import Optional

from keycloak import KeycloakAdmin, KeycloakOpenID, KeycloakOpenIDConnection

from src.config import get_settings_store as get_settings

logger = logging.getLogger(__name__)

# Global instances (initialized on first use)
_keycloak_connection: Optional[KeycloakOpenIDConnection] = None
_keycloak_admin: Optional[KeycloakAdmin] = None
_keycloak_openid: Optional[KeycloakOpenID] = None


def get_keycloak_public_url() -> str:
    """Get the Keycloak public URL.

    Returns the URL that browsers/web frontends use to access Keycloak.

    Resolution is handled by OmegaConf in config.defaults.yaml:
    - keycloak.public_url: ${oc.env:KC_HOSTNAME_URL,http://localhost:8081}

    Set KC_HOSTNAME_URL in .env to your public-facing URL (e.g., Tailscale hostname).

    Returns:
        Public URL like "https://orange.spangled-kettle.ts.net" or "http://localhost:8081"
    """
    settings = get_settings()
    return settings.get_sync("keycloak.public_url", "http://localhost:8081")


def get_keycloak_connection() -> KeycloakOpenIDConnection:
    """
    Get centralized Keycloak connection object.

    This connection stores all config in one place and can be shared
    across KeycloakAdmin and KeycloakOpenID instances.

    IMPORTANT: Uses internal URL (KC_URL) for backend-to-Keycloak communication,
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
        # Resolved by OmegaConf: ${oc.env:KC_URL,http://keycloak:8080}
        internal_url = settings.get_sync("keycloak.url", "http://keycloak:8080")

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
        # Resolved by OmegaConf: ${oc.env:KC_URL,http://keycloak:8080}
        internal_url = settings.get_sync("keycloak.url", "http://keycloak:8080")

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
                   If provided, creates a NEW instance (no caching for specific clients)

    Returns:
        KeycloakOpenID instance
    """
    global _keycloak_openid

    settings = get_settings()

    # Internal URL for backend-to-Keycloak communication
    internal_url = settings.get_sync("keycloak.url", "http://keycloak:8080")
    app_realm = settings.get_sync("keycloak.realm", "ushadow")

    # Determine if this is a public or confidential client
    # Public clients (frontend, mobile) = no secret (browser/app can't protect secrets)
    # Confidential clients (backend) = with secret (server-side can protect secrets)
    def is_public_client(cid: str) -> bool:
        frontend_client_id = settings.get_sync("keycloak.frontend_client_id", "ushadow-frontend")
        mobile_client_id = settings.get_sync("keycloak.mobile_client_id", "ushadow-mobile")
        return cid in [frontend_client_id, mobile_client_id]

    # If client_id provided, create NEW instance (don't use cache)
    if client_id is not None:
        if is_public_client(client_id):
            client_secret = None  # Public client - no secret
            logger.info(f"[KC-SETTINGS] Creating public client instance (no secret): {client_id}")
        else:
            # Confidential client (backend)
            client_secret = settings.get_sync("keycloak.backend_client_secret")
            logger.info(f"[KC-SETTINGS] Creating confidential client instance (with secret): {client_id}")

        return KeycloakOpenID(
            server_url=internal_url,
            realm_name=app_realm,
            client_id=client_id,
            client_secret_key=client_secret,
        )

    # No client_id provided - use cached default frontend instance (public client)
    if _keycloak_openid is None:
        default_client_id = settings.get_sync("keycloak.frontend_client_id", "ushadow-frontend")

        logger.info(f"[KC-SETTINGS] Initializing default KeycloakOpenID (public): {default_client_id}")

        _keycloak_openid = KeycloakOpenID(
            server_url=internal_url,
            realm_name=app_realm,
            client_id=default_client_id,
            client_secret_key=None,  # Frontend is public - no secret
        )

    return _keycloak_openid


def get_keycloak_mobile_url() -> Optional[str]:
    """Get the explicit Keycloak URL override for mobile clients.

    Returns KC_MOBILE_URL if set, otherwise None. When None, callers should
    auto-derive the mobile URL from the unode's Tailscale IP and KC_PORT.

    Returns:
        KC_MOBILE_URL value (e.g., "https://orange.spangled-kettle.ts.net"), or None
    """
    settings = get_settings()
    url = settings.get_sync("keycloak.mobile_url", None)
    return url if url else None


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
            - mobile_url: str | None (Tailscale URL for mobile apps)
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

    # Build config dict
    config = {
        "url": settings.get_sync("keycloak.url", "http://keycloak:8080"),
        "public_url": get_keycloak_public_url(),  # Dynamic public URL (localhost for web)
        "mobile_url": get_keycloak_mobile_url(),  # Tailscale URL for mobile apps
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


