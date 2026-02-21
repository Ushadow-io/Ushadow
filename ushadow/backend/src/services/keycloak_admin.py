"""
Keycloak Admin API Service

Refactored to use official python-keycloak KeycloakAdmin.
Provides backward-compatible wrapper for existing code.

Primary use case: Dynamic redirect URI registration for multi-environment worktrees.

Each Ushadow environment (worktree) runs on a different port:
- ushadow: 3010 (PORT_OFFSET=10)
- ushadow-orange: 3020 (PORT_OFFSET=20)
- ushadow-yellow: 3030 (PORT_OFFSET=30)

This service ensures Keycloak accepts redirects from all active environments.
"""

import os
import logging
from typing import Optional, List, Dict, Any

from keycloak import KeycloakAdmin
from keycloak.exceptions import KeycloakError

logger = logging.getLogger(__name__)


class KeycloakAdminClient:
    """
    Keycloak Admin API client wrapper.

    Provides backward-compatible interface using official python-keycloak library.
    This wrapper maintains the existing API while using the official KeycloakAdmin underneath.
    """

    def __init__(self, admin: KeycloakAdmin):
        """
        Initialize wrapper with official KeycloakAdmin instance.

        Args:
            admin: KeycloakAdmin instance from keycloak_settings
        """
        self.admin = admin
        logger.debug("[KC-ADMIN] Initialized KeycloakAdminClient wrapper")

    async def get_client_by_client_id(self, client_id: str) -> Optional[dict]:
        """
        Get Keycloak client configuration by client_id.

        Args:
            client_id: The client_id (e.g., "ushadow-frontend")

        Returns:
            Client configuration dict if found, None otherwise
        """
        try:
            # get_clients() returns all clients - we filter manually
            all_clients = self.admin.get_clients()

            # Filter by clientId
            for client in all_clients:
                if client.get("clientId") == client_id:
                    return client

            logger.warning(f"[KC-ADMIN] Client '{client_id}' not found")
            return None

        except KeycloakError as e:
            logger.error(f"[KC-ADMIN] Failed to get client: {e}")
            return None

    async def update_client_redirect_uris(
        self,
        client_id: str,
        redirect_uris: List[str],
        web_origins: Optional[List[str]] = None,
        merge: bool = True
    ) -> bool:
        """
        Update redirect URIs and webOrigins (CORS) for a Keycloak client.

        Args:
            client_id: The client_id (e.g., "ushadow-frontend")
            redirect_uris: List of redirect URIs to set
            web_origins: Optional list of web origins (CORS). If not provided, extracted from redirect URIs.
            merge: If True, merge with existing URIs. If False, replace entirely.

        Returns:
            True if successful, False otherwise
        """
        try:
            # Get current client configuration
            client = await self.get_client_by_client_id(client_id)
            if not client:
                logger.error(f"[KC-ADMIN] Cannot update redirect URIs - client '{client_id}' not found")
                return False

            client_uuid = client["id"]  # Internal UUID, not the client_id

            # Merge or replace redirect URIs
            if merge:
                existing_uris = set(client.get("redirectUris", []))
                new_uris = existing_uris.union(set(redirect_uris))
                final_uris = list(new_uris)
                logger.info(f"[KC-ADMIN] Merging redirect URIs: {len(existing_uris)} existing + {len(redirect_uris)} new = {len(final_uris)} total")
            else:
                final_uris = redirect_uris
                logger.info(f"[KC-ADMIN] Replacing redirect URIs with {len(final_uris)} URIs")

            # Get webOrigins (CORS)
            if web_origins is not None:
                # Use provided web origins
                final_origins_set = set(web_origins)
                if merge:
                    existing_origins = set(client.get("webOrigins", []))
                    final_origins_set = final_origins_set.union(existing_origins)
                final_origins = list(final_origins_set)
                logger.info(f"[KC-ADMIN] Using {len(final_origins)} provided webOrigins")
            else:
                # Extract origins from redirect URIs for CORS
                origins_set = set()
                for uri in final_uris:
                    # Extract origin from redirect URI (e.g., http://localhost:3020/oauth/callback -> http://localhost:3020)
                    if uri.startswith("http"):
                        from urllib.parse import urlparse
                        parsed = urlparse(uri)
                        origin = f"{parsed.scheme}://{parsed.netloc}"
                        origins_set.add(origin)

                # Merge with existing webOrigins if merge=True
                if merge:
                    existing_origins = set(client.get("webOrigins", []))
                    origins_set = origins_set.union(existing_origins)

                final_origins = list(origins_set)
                logger.info(f"[KC-ADMIN] Extracted {len(final_origins)} webOrigins from redirect URIs")

            # Update client using official library method
            # IMPORTANT: Must update the full client object, not partial update
            # Partial updates cause Hibernate to try INSERT instead of REPLACE,
            # leading to duplicate key violations on redirectUris
            client["redirectUris"] = final_uris
            client["webOrigins"] = final_origins

            self.admin.update_client(client_uuid, client)

            logger.info(f"[KC-ADMIN] ✓ Updated redirect URIs for client '{client_id}'")
            for uri in final_uris:
                logger.info(f"[KC-ADMIN]   - {uri}")
            return True

        except KeycloakError as e:
            logger.error(f"[KC-ADMIN] Failed to update client: {e}")
            return False

    async def register_redirect_uri(self, client_id: str, redirect_uri: str) -> bool:
        """
        Register a single redirect URI for a client (merges with existing).

        Args:
            client_id: The client_id (e.g., "ushadow-frontend")
            redirect_uri: The redirect URI to add (e.g., "http://localhost:3010/auth/callback")

        Returns:
            True if successful, False otherwise
        """
        return await self.update_client_redirect_uris(
            client_id=client_id,
            redirect_uris=[redirect_uri],
            merge=True
        )

    async def update_post_logout_redirect_uris(
        self,
        client_id: str,
        post_logout_redirect_uris: List[str],
        merge: bool = True
    ) -> bool:
        """
        Update post-logout redirect URIs for a Keycloak client.

        Args:
            client_id: The client_id (e.g., "ushadow-frontend")
            post_logout_redirect_uris: List of post-logout redirect URIs to set
            merge: If True, merge with existing URIs. If False, replace entirely.

        Returns:
            True if successful, False otherwise
        """
        try:
            # Get client UUID
            client = await self.get_client_by_client_id(client_id)
            if not client:
                logger.error(f"[KC-ADMIN] Client '{client_id}' not found")
                return False

            client_uuid = client["id"]

            # Merge or replace post-logout redirect URIs
            if merge:
                existing_uris = set(client.get("attributes", {}).get("post.logout.redirect.uris", "").split("##"))
                # Remove empty strings from the set
                existing_uris = {uri for uri in existing_uris if uri}
                new_uris = existing_uris.union(set(post_logout_redirect_uris))
                final_uris = list(new_uris)
                logger.info(f"[KC-ADMIN] Merging post-logout redirect URIs: {len(existing_uris)} existing + {len(post_logout_redirect_uris)} new = {len(final_uris)} total")
            else:
                final_uris = post_logout_redirect_uris
                logger.info(f"[KC-ADMIN] Replacing post-logout redirect URIs with {len(final_uris)} URIs")

            # Post-logout redirect URIs are stored as a ## delimited string in attributes
            # Update full client object to avoid Hibernate collection merge issues
            if "attributes" not in client:
                client["attributes"] = {}
            client["attributes"]["post.logout.redirect.uris"] = "##".join(final_uris)

            # Update using official library with full client object
            self.admin.update_client(client_uuid, client)

            logger.info(f"[KC-ADMIN] ✓ Updated post-logout redirect URIs for client '{client_id}'")
            for uri in final_uris:
                logger.info(f"[KC-ADMIN]   - {uri}")
            return True

        except KeycloakError as e:
            logger.error(f"[KC-ADMIN] Failed to update post-logout redirect URIs: {e}")
            return False

    def update_realm_browser_security_headers(self, headers: dict) -> None:
        """
        Update realm's browser security headers (CSP, X-Frame-Options, etc.).

        Args:
            headers: Dictionary of browser security headers to update
        """
        from ..config.keycloak_settings import get_keycloak_config

        try:
            # Get realm from config
            config = get_keycloak_config()
            realm = config["realm"]

            # Get current realm configuration
            realm_config = self.admin.get_realm(realm)

            # Update browserSecurityHeaders
            realm_config["browserSecurityHeaders"] = headers

            # Update realm
            self.admin.update_realm(realm, realm_config)

            logger.info(f"[KC-ADMIN] ✓ Updated realm browser security headers for realm: {realm}")
            for key, value in headers.items():
                logger.info(f"[KC-ADMIN]   {key}: {value[:50]}...")  # Truncate long values

        except KeycloakError as e:
            logger.error(f"[KC-ADMIN] Failed to update realm: {e}")
            raise


async def register_current_environment_redirect_uri() -> bool:
    """
    Register this environment's redirect URIs with Keycloak.

    Registers both local (localhost/127.0.0.1) and Tailscale URIs if available.
    Uses PORT_OFFSET to determine the correct frontend port.
    Called during backend startup to ensure Keycloak accepts redirects from this environment.

    Example:
        - ushadow (PORT_OFFSET=10): Registers http://localhost:3010/auth/callback
        - ushadow-orange (PORT_OFFSET=20): Registers http://localhost:3020/auth/callback
        - With Tailscale: Also registers https://ushadow.spangled-kettle.ts.net/auth/callback
    """
    from src.config.keycloak_settings import get_keycloak_config, get_keycloak_admin

    # Get configuration from settings
    config = get_keycloak_config()
    keycloak_client_id = config["frontend_client_id"]

    # Calculate frontend port from PORT_OFFSET
    port_offset = int(os.getenv("PORT_OFFSET", "0"))
    frontend_port = 3000 + port_offset

    # Build redirect URIs - start with local URIs
    redirect_uris = [
        f"http://localhost:{frontend_port}/oauth/callback",
        f"http://127.0.0.1:{frontend_port}/oauth/callback",
    ]

    post_logout_redirect_uris = [
        f"http://localhost:{frontend_port}/",
        f"http://127.0.0.1:{frontend_port}/",
    ]

    # Check if Tailscale is configured and add Tailscale URIs
    try:
        from src.config import get_settings_store
        settings = get_settings_store()
        ts_hostname = settings.get_sync("tailscale.hostname")

        if ts_hostname:
            # Add Tailscale URIs (HTTPS through Tailscale serve)
            tailscale_redirect_uri = f"https://{ts_hostname}/oauth/callback"
            tailscale_logout_uri = f"https://{ts_hostname}/"

            redirect_uris.append(tailscale_redirect_uri)
            post_logout_redirect_uris.append(tailscale_logout_uri)

            logger.info(f"[KC-ADMIN] Detected Tailscale hostname: {ts_hostname}")
    except Exception as e:
        logger.debug(f"[KC-ADMIN] Could not detect Tailscale hostname: {e}")

    logger.info(f"[KC-ADMIN] Registering redirect URIs for environment:")
    for uri in redirect_uris:
        logger.info(f"[KC-ADMIN]   - {uri}")
    logger.info(f"[KC-ADMIN] Registering post-logout redirect URIs:")
    for uri in post_logout_redirect_uris:
        logger.info(f"[KC-ADMIN]   - {uri}")

    # Get official KeycloakAdmin and wrap it
    admin = get_keycloak_admin()
    admin_client = KeycloakAdminClient(admin)

    # Register login redirect URIs
    success = await admin_client.update_client_redirect_uris(
        client_id=keycloak_client_id,
        redirect_uris=redirect_uris,
        merge=True  # Merge with existing URIs (don't break other environments)
    )

    if not success:
        logger.error(f"[KC-ADMIN] ❌ Failed to register redirect URIs for port {frontend_port}")
        return False

    # Register post-logout redirect URIs
    success = await admin_client.update_post_logout_redirect_uris(
        client_id=keycloak_client_id,
        post_logout_redirect_uris=post_logout_redirect_uris,
        merge=True  # Merge with existing URIs (don't break other environments)
    )

    if success:
        logger.info(f"[KC-ADMIN] ✓ Successfully registered all redirect URIs for port {frontend_port}")
    else:
        logger.warning(f"[KC-ADMIN] ⚠️  Failed to register redirect URIs - Keycloak login may not work on port {frontend_port}")

    return success


# Singleton getter for dependency injection
_keycloak_admin_client: Optional[KeycloakAdminClient] = None


def get_keycloak_admin() -> KeycloakAdminClient:
    """
    Get the Keycloak admin client singleton (backward-compatible wrapper).

    Returns wrapped official KeycloakAdmin for existing code compatibility.
    """
    from src.config.keycloak_settings import get_keycloak_admin as get_official_admin

    global _keycloak_admin_client

    if _keycloak_admin_client is None:
        # Get official KeycloakAdmin and wrap it
        official_admin = get_official_admin()
        _keycloak_admin_client = KeycloakAdminClient(official_admin)

    return _keycloak_admin_client
