"""
Keycloak Startup Registration

Automatically registers the current environment's redirect URIs with Keycloak
when the backend starts. This ensures multi-worktree setups work without
manual Keycloak configuration.
"""

import logging
import os
from typing import List

from .keycloak_admin import get_keycloak_admin
from ..config.keycloak_settings import is_keycloak_enabled

logger = logging.getLogger(__name__)


def get_current_redirect_uris() -> List[str]:
    """
    Generate redirect URIs for the current environment.

    Returns URIs based on:
    - PORT_OFFSET environment variable (for multi-worktree support)
    - FRONTEND_URL environment variable (for custom domains)
    - Tailscale hostname detection (for .ts.net domains)

    Returns:
        List of redirect URIs to register
    """
    redirect_uris = []

    # Get port offset (default 10 for main environment)
    port_offset = int(os.getenv("PORT_OFFSET", "10"))
    frontend_port = 3000 + port_offset

    # Localhost redirect
    localhost_uri = f"http://localhost:{frontend_port}/oauth/callback"
    redirect_uris.append(localhost_uri)

    # Custom frontend URL (e.g., for production domains)
    frontend_url = os.getenv("FRONTEND_URL")
    if frontend_url:
        custom_uri = f"{frontend_url.rstrip('/')}/oauth/callback"
        redirect_uris.append(custom_uri)

    # Tailscale hostname (if available)
    tailscale_hostname = os.getenv("TAILSCALE_HOSTNAME")
    if tailscale_hostname:
        # Support both http and https for Tailscale
        ts_uri_http = f"http://{tailscale_hostname}/oauth/callback"
        ts_uri_https = f"https://{tailscale_hostname}/oauth/callback"
        redirect_uris.append(ts_uri_http)
        redirect_uris.append(ts_uri_https)

    return redirect_uris


def get_current_post_logout_uris() -> List[str]:
    """
    Generate post-logout redirect URIs for the current environment.

    Returns:
        List of post-logout redirect URIs to register
    """
    post_logout_uris = []

    # Get port offset
    port_offset = int(os.getenv("PORT_OFFSET", "10"))
    frontend_port = 3000 + port_offset

    # Localhost
    post_logout_uris.append(f"http://localhost:{frontend_port}")
    post_logout_uris.append(f"http://localhost:{frontend_port}/")

    # Custom frontend URL
    frontend_url = os.getenv("FRONTEND_URL")
    if frontend_url:
        base_url = frontend_url.rstrip('/')
        post_logout_uris.append(base_url)
        post_logout_uris.append(base_url + "/")

    # Tailscale hostname
    tailscale_hostname = os.getenv("TAILSCALE_HOSTNAME")
    if tailscale_hostname:
        post_logout_uris.append(f"http://{tailscale_hostname}")
        post_logout_uris.append(f"http://{tailscale_hostname}/")
        post_logout_uris.append(f"https://{tailscale_hostname}")
        post_logout_uris.append(f"https://{tailscale_hostname}/")

    return post_logout_uris


async def register_current_environment():
    """
    Register the current environment's redirect URIs with Keycloak.

    This is called during backend startup to ensure the current worktree's
    frontend URLs are whitelisted in Keycloak.

    Skip if:
    - Keycloak is not enabled in config
    - KEYCLOAK_AUTO_REGISTER=false environment variable is set
    """
    # Check if Keycloak is enabled
    if not is_keycloak_enabled():
        logger.debug("[KC-STARTUP] Keycloak not enabled, skipping auto-registration")
        return

    # Check if auto-registration is disabled
    if os.getenv("KEYCLOAK_AUTO_REGISTER", "true").lower() == "false":
        logger.info("[KC-STARTUP] Keycloak auto-registration disabled via KEYCLOAK_AUTO_REGISTER=false")
        return

    try:
        # Get admin client
        admin_client = get_keycloak_admin()

        # Get URIs to register
        redirect_uris = get_current_redirect_uris()
        post_logout_uris = get_current_post_logout_uris()

        logger.info("[KC-STARTUP] 🔐 Registering redirect URIs with Keycloak...")
        logger.info(f"[KC-STARTUP] Environment: PORT_OFFSET={os.getenv('PORT_OFFSET', '10')}")

        # Register redirect URIs
        success = await admin_client.update_client_redirect_uris(
            client_id="ushadow-frontend",
            redirect_uris=redirect_uris,
            merge=True  # Merge with existing URIs
        )

        if not success:
            logger.warning("[KC-STARTUP] ⚠️  Failed to register redirect URIs (Keycloak may not be ready yet)")
            logger.warning("[KC-STARTUP] You may need to manually configure redirect URIs in Keycloak admin console")
            return

        # Register post-logout redirect URIs
        logout_success = await admin_client.update_post_logout_redirect_uris(
            client_id="ushadow-frontend",
            post_logout_redirect_uris=post_logout_uris,
            merge=True
        )

        if logout_success:
            logger.info("[KC-STARTUP] ✅ Redirect URIs registered successfully")
        else:
            logger.warning("[KC-STARTUP] ⚠️  Failed to register post-logout redirect URIs")

    except Exception as e:
        logger.warning(f"[KC-STARTUP] ⚠️  Failed to auto-register Keycloak URIs: {e}")
        logger.warning("[KC-STARTUP] This is non-critical - you can manually configure URIs in Keycloak admin console")
