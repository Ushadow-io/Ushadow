"""
Keycloak Startup Registration

Automatically registers the current environment's redirect URIs with Keycloak
when the backend starts. This ensures multi-worktree setups work without
manual Keycloak configuration.
"""

import asyncio
import logging
import os
from typing import List, Optional

from .keycloak_admin import get_keycloak_admin
from .tailscale_manager import TailscaleManager

logger = logging.getLogger(__name__)

# Lock to prevent concurrent registration (avoids duplicate key errors in Keycloak)
_registration_lock = asyncio.Lock()


def get_tailscale_hostname() -> Optional[str]:
    """
    Get the full Tailscale hostname for the current environment.

    Returns:
        Full hostname like "orange.spangled-kettle.ts.net" or None
    """
    try:
        manager = TailscaleManager()
        tailnet_suffix = manager.get_tailnet_suffix()

        if not tailnet_suffix:
            return None

        # Get environment name (e.g., "orange", "purple")
        env_name = os.getenv("ENV_NAME", "ushadow")

        # Construct full hostname: {env}.{tailnet}
        return f"{env_name}.{tailnet_suffix}"
    except Exception as e:
        logger.debug(f"[KC-STARTUP] Could not get Tailscale hostname: {e}")
        return None


def get_current_redirect_uris() -> List[str]:
    """
    Generate redirect URIs for the current environment.

    Returns URIs based on:
    - PORT_OFFSET environment variable (for multi-worktree support)
    - FRONTEND_URL environment variable (for custom domains)
    - Tailscale hostname detection (for .ts.net domains)
    - Mobile app URIs (ushadow://* for React Native)

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

    # Tailscale hostname (auto-detect using TailscaleManager)
    tailscale_hostname = get_tailscale_hostname()
    if tailscale_hostname:
        # Only HTTPS for Tailscale (HTTP doesn't work with Tailscale Serve)
        ts_uri_https = f"https://{tailscale_hostname}/oauth/callback"
        redirect_uris.append(ts_uri_https)
        logger.info(f"[KC-STARTUP] 📡 Adding Tailscale URI: {tailscale_hostname}")

    # NOTE: Mobile app URIs are registered in a SEPARATE client (ushadow-mobile)
    # See register_mobile_client() - mobile apps should use their own client to avoid
    # redirect URI conflicts with web clients

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

    # Tailscale hostname (auto-detect using TailscaleManager)
    tailscale_hostname = get_tailscale_hostname()
    if tailscale_hostname:
        post_logout_uris.append(f"http://{tailscale_hostname}")
        post_logout_uris.append(f"http://{tailscale_hostname}/")
        post_logout_uris.append(f"https://{tailscale_hostname}")
        post_logout_uris.append(f"https://{tailscale_hostname}/")

    # NOTE: Mobile logout URIs are registered in separate client (ushadow-mobile)

    return post_logout_uris


def get_web_origins() -> List[str]:
    """
    Get allowed web origins (CORS) from settings.

    Uses security.cors_origins from OmegaConf settings which is already
    configured for the backend's CORS middleware.

    Returns:
        List of allowed origins for Keycloak webOrigins (CORS)
    """
    try:
        from ..config import get_settings
        settings = get_settings()
        cors_origins = settings.get_sync("security.cors_origins", "")

        if cors_origins and cors_origins.strip():
            # Split comma-separated origins and strip whitespace
            origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
            logger.info(f"[KC_STARTUP] CORS: {cors_origins}")
            logger.info(f"[KC-STARTUP] Using {len(origins)} web origins from settings")
            return origins
    except Exception as e:
        logger.warning(f"[KC-STARTUP] Could not get CORS origins from settings: {e}")

    # Fallback to defaults
    logger.warning("[KC-STARTUP] Using default web origins")
    port_offset = int(os.getenv("PORT_OFFSET", "10"))
    frontend_port = 3000 + port_offset
    return [f"http://localhost:{frontend_port}"]


async def register_mobile_client():
    """
    Register redirect URIs for the mobile client.

    Mobile client is defined in realm export with base configuration.
    This function adds any environment-specific redirect URIs at startup.

    Note: Mobile uses a SEPARATE client from web because:
    1. Different redirect URI schemes (ushadow:// vs http://localhost)
    2. PKCE is mandatory for mobile (public clients can't protect secrets)
    3. Avoids redirect URI conflicts (Keycloak may default to first URI)
    """
    try:
        admin_client = get_keycloak_admin()

        # Mobile-specific redirect URIs (already in realm export, but add any dynamic ones here)
        mobile_redirect_uris = [
            "ushadow://oauth/callback",  # Production mobile app
            # Add any environment-specific mobile URIs here if needed
        ]

        mobile_logout_uris = [
            "ushadow://logout/callback",
        ]

        logger.info("[KC-STARTUP] 📱 Registering mobile redirect URIs...")

        # Update mobile client redirect URIs (merge with existing from realm export)
        success = await admin_client.update_client_redirect_uris(
            client_id="ushadow-mobile",
            redirect_uris=mobile_redirect_uris,
            merge=True  # Add to existing URIs from realm export
        )

        if success:
            # Update post-logout URIs
            await admin_client.update_post_logout_redirect_uris(
                client_id="ushadow-mobile",
                post_logout_redirect_uris=mobile_logout_uris,
                merge=True
            )
            logger.info("[KC-STARTUP] ✅ Mobile redirect URIs registered")
            logger.info(f"[KC-STARTUP]   Client ID: ushadow-mobile")
            logger.info(f"[KC-STARTUP]   Redirect URIs: {mobile_redirect_uris}")
        else:
            logger.warning("[KC-STARTUP] ⚠️  Failed to register mobile redirect URIs")

    except Exception as e:
        logger.warning(f"[KC-STARTUP] ⚠️  Failed to register mobile client: {e}")


async def _do_register() -> bool:
    """
    Single registration attempt. Returns True on success, False otherwise.
    """
    async with _registration_lock:
        try:
            admin_client = get_keycloak_admin()

            redirect_uris = get_current_redirect_uris()
            post_logout_uris = get_current_post_logout_uris()
            web_origins = get_web_origins()

            logger.info("[KC-STARTUP] 🔐 Registering redirect URIs with Keycloak...")
            logger.info(f"[KC-STARTUP] Environment: PORT_OFFSET={os.getenv('PORT_OFFSET', '10')}")
            for uri in redirect_uris:
                logger.info(f"[KC-STARTUP]   redirect: {uri}")

            success = await admin_client.update_client_redirect_uris(
                client_id="ushadow-frontend",
                redirect_uris=redirect_uris,
                web_origins=web_origins,
                merge=True,
            )

            if not success:
                return False

            logout_success = await admin_client.update_post_logout_redirect_uris(
                client_id="ushadow-frontend",
                post_logout_redirect_uris=post_logout_uris,
                merge=True,
            )

            if not logout_success:
                logger.warning("[KC-STARTUP] ⚠️  Failed to register post-logout redirect URIs")

            try:
                headers = {
                    "contentSecurityPolicy": "frame-src 'self'; frame-ancestors 'self' http: https: tauri:; object-src 'none';",
                    "xContentTypeOptions": "nosniff",
                    "xRobotsTag": "none",
                    "xFrameOptions": "",
                    "xXSSProtection": "1; mode=block",
                    "strictTransportSecurity": "max-age=31536000; includeSubDomains",
                }
                admin_client.update_realm_browser_security_headers(headers)
            except Exception as csp_error:
                logger.warning(f"[KC-STARTUP] ⚠️  Failed to update realm CSP: {csp_error}")

            await register_mobile_client()
            return True

        except Exception as e:
            logger.warning(f"[KC-STARTUP] ⚠️  Registration attempt failed: {e}")
            return False


async def _register_with_retry():
    """
    Retry registration until Keycloak is ready.

    On fresh installs Keycloak can take 30-60s to start and import its realm.
    Because backend and Keycloak live in separate compose projects, depends_on
    cannot enforce ordering, so we handle it here instead.

    Tries every 10s for up to ~2 minutes, then logs the manual fallback URL.
    """
    max_attempts = 12
    delay_seconds = 10

    for attempt in range(1, max_attempts + 1):
        logger.info(f"[KC-STARTUP] Registration attempt {attempt}/{max_attempts}...")
        if await _do_register():
            logger.info("[KC-STARTUP] ✅ Redirect URIs registered successfully")
            return
        if attempt < max_attempts:
            logger.info(f"[KC-STARTUP] Keycloak not ready - retrying in {delay_seconds}s...")
            await asyncio.sleep(delay_seconds)

    port = 3000 + int(os.getenv("PORT_OFFSET", "10"))
    admin_url = os.getenv("KC_HOSTNAME_URL", "http://localhost:8081")
    logger.warning(
        "[KC-STARTUP] ⚠️  All registration attempts failed. "
        "Manually add http://localhost:%d/oauth/callback to the ushadow-frontend "
        "client at %s/admin",
        port,
        admin_url,
    )


async def register_current_environment():
    """
    Register the current environment's redirect URIs with Keycloak.

    Spawns a background task that retries until Keycloak is ready so the
    backend startup is never blocked by Keycloak availability.

    Skip if KEYCLOAK_AUTO_REGISTER=false.
    """
    if os.getenv("KEYCLOAK_AUTO_REGISTER", "true").lower() == "false":
        logger.info("[KC-STARTUP] Keycloak auto-registration disabled via KEYCLOAK_AUTO_REGISTER=false")
        return

    asyncio.create_task(_register_with_retry())
