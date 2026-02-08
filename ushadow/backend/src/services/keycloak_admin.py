"""
Keycloak Admin API Service

Manages Keycloak configuration programmatically via Admin REST API.
Primary use case: Dynamic redirect URI registration for multi-environment worktrees.

Each Ushadow environment (worktree) runs on a different port:
- ushadow: 3010 (PORT_OFFSET=10)
- ushadow-orange: 3020 (PORT_OFFSET=20)
- ushadow-yellow: 3030 (PORT_OFFSET=30)

This service ensures Keycloak accepts redirects from all active environments.
"""

import os
import logging
import httpx
from typing import Optional, List

logger = logging.getLogger(__name__)


class KeycloakAdminClient:
    """Keycloak Admin API client for managing realm configuration."""

    def __init__(
        self,
        keycloak_url: str,
        realm: str,
        admin_user: str,
        admin_password: str,
    ):
        self.keycloak_url = keycloak_url
        self.realm = realm
        self.admin_user = admin_user
        self.admin_password = admin_password
        self._access_token: Optional[str] = None

    async def _get_admin_token(self) -> str:
        """
        Get admin access token for Keycloak Admin API.

        Uses master realm admin credentials to authenticate.
        Token is cached and reused until it expires.
        """
        if self._access_token:
            # TODO: Check token expiration and refresh if needed
            return self._access_token

        token_url = f"{self.keycloak_url}/realms/master/protocol/openid-connect/token"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    token_url,
                    data={
                        "grant_type": "password",
                        "client_id": "admin-cli",
                        "username": self.admin_user,
                        "password": self.admin_password,
                    },
                    timeout=10.0,
                )

                if response.status_code != 200:
                    logger.error(f"[KC-ADMIN] Failed to get admin token: {response.text}")
                    raise Exception(f"Failed to authenticate as Keycloak admin: {response.status_code}")

                tokens = response.json()
                self._access_token = tokens["access_token"]
                logger.info("[KC-ADMIN] ✓ Authenticated as Keycloak admin")
                return self._access_token

            except httpx.RequestError as e:
                logger.error(f"[KC-ADMIN] Failed to connect to Keycloak: {e}")
                raise Exception(f"Failed to connect to Keycloak Admin API: {e}")

    async def get_client_by_client_id(self, client_id: str) -> Optional[dict]:
        """
        Get Keycloak client configuration by client_id.

        Args:
            client_id: The client_id (e.g., "ushadow-frontend")

        Returns:
            Client configuration dict if found, None otherwise
        """
        token = await self._get_admin_token()
        url = f"{self.keycloak_url}/admin/realms/{self.realm}/clients"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    url,
                    headers={"Authorization": f"Bearer {token}"},
                    params={"clientId": client_id},
                    timeout=10.0,
                )

                if response.status_code != 200:
                    logger.error(f"[KC-ADMIN] Failed to get client: {response.text}")
                    return None

                clients = response.json()
                if not clients or len(clients) == 0:
                    logger.warning(f"[KC-ADMIN] Client '{client_id}' not found")
                    return None

                return clients[0]  # Returns first match

            except httpx.RequestError as e:
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
            for origin in sorted(final_origins):
                logger.info(f"[KC-ADMIN]   - {origin}")
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

        # Update client configuration
        token = await self._get_admin_token()
        url = f"{self.keycloak_url}/admin/realms/{self.realm}/clients/{client_uuid}"

        async with httpx.AsyncClient() as client_http:
            try:
                # Prepare update payload (redirect URIs + webOrigins)
                update_payload = {
                    "id": client_uuid,
                    "clientId": client_id,
                    "redirectUris": final_uris,
                    "webOrigins": final_origins,
                }

                response = await client_http.put(
                    url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json=update_payload,
                    timeout=10.0,
                )

                if response.status_code != 204:  # Keycloak returns 204 No Content on success
                    logger.error(f"[KC-ADMIN] Failed to update client: {response.status_code} - {response.text}")
                    return False

                logger.info(f"[KC-ADMIN] ✓ Updated redirect URIs for client '{client_id}'")
                for uri in final_uris:
                    logger.info(f"[KC-ADMIN]   - {uri}")
                return True

            except httpx.RequestError as e:
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

        # Update client configuration
        token = await self._get_admin_token()
        url = f"{self.keycloak_url}/admin/realms/{self.realm}/clients/{client_uuid}"

        async with httpx.AsyncClient() as client_http:
            try:
                # Prepare update payload
                # Post-logout redirect URIs are stored as a ## delimited string in attributes
                attributes = client.get("attributes", {})
                attributes["post.logout.redirect.uris"] = "##".join(final_uris)

                update_payload = {
                    "id": client_uuid,
                    "clientId": client_id,
                    "attributes": attributes,
                }

                response = await client_http.put(
                    url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json=update_payload,
                    timeout=10.0,
                )

                if response.status_code != 204:  # Keycloak returns 204 No Content on success
                    logger.error(f"[KC-ADMIN] Failed to update post-logout redirect URIs: {response.status_code} - {response.text}")
                    return False

                logger.info(f"[KC-ADMIN] ✓ Updated post-logout redirect URIs for client '{client_id}'")
                for uri in final_uris:
                    logger.info(f"[KC-ADMIN]   - {uri}")
                return True

            except httpx.RequestError as e:
                logger.error(f"[KC-ADMIN] Failed to update post-logout redirect URIs: {e}")
                return False


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
    from src.config.keycloak_settings import get_keycloak_config

    # Get configuration from settings (config.defaults.yaml + secrets.yaml)
    # Settings system handles env var interpolation via OmegaConf
    config = get_keycloak_config()
    keycloak_url = config["url"]
    keycloak_realm = config["realm"]
    keycloak_client_id = config["frontend_client_id"]

    # Admin credentials
    admin_keycloak_user = config["admin_keycloak_user"]
    admin_keycloak_password = config["admin_keycloak_password"]

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
        from src.utils.tailscale_serve import get_tailscale_status
        ts_status = get_tailscale_status()
        if ts_status.hostname and ts_status.authenticated:
            # Add Tailscale URIs (HTTPS through Tailscale serve)
            tailscale_redirect_uri = f"https://{ts_status.hostname}/oauth/callback"
            tailscale_logout_uri = f"https://{ts_status.hostname}/"

            redirect_uris.append(tailscale_redirect_uri)
            post_logout_redirect_uris.append(tailscale_logout_uri)

            logger.info(f"[KC-ADMIN] Detected Tailscale hostname: {ts_status.hostname}")
    except Exception as e:
        logger.debug(f"[KC-ADMIN] Could not detect Tailscale hostname: {e}")

    logger.info(f"[KC-ADMIN] Registering redirect URIs for environment:")
    for uri in redirect_uris:
        logger.info(f"[KC-ADMIN]   - {uri}")
    logger.info(f"[KC-ADMIN] Registering post-logout redirect URIs:")
    for uri in post_logout_redirect_uris:
        logger.info(f"[KC-ADMIN]   - {uri}")

    # Create admin client and register URIs
    admin_client = KeycloakAdminClient(
        keycloak_url=keycloak_url,
        realm=keycloak_realm,
        admin_user=admin_keycloak_user,
        admin_password=admin_keycloak_password,
    )

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
    Get the Keycloak admin client singleton.

    Configuration is loaded from settings (config.defaults.yaml + secrets.yaml).
    """
    from src.config.keycloak_settings import get_keycloak_config

    global _keycloak_admin_client

    if _keycloak_admin_client is None:
        config = get_keycloak_config()
        keycloak_url = config["url"]
        keycloak_realm = config["realm"]
        admin_keycloak_user = config["admin_keycloak_user"]
        admin_keycloak_password = config["admin_keycloak_password"]

        _keycloak_admin_client = KeycloakAdminClient(
            keycloak_url=keycloak_url,
            realm=keycloak_realm,
            admin_user=admin_keycloak_user,
            admin_password=admin_keycloak_password,
        )

    return _keycloak_admin_client
