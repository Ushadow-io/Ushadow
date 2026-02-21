"""
Keycloak Client Service

Standard OAuth2/OIDC implementation using python-keycloak library.
Handles token exchange, refresh, validation, and user info retrieval.

Refactored to use shared KeycloakOpenID instance from keycloak_settings.
"""

import logging
from typing import Optional, Dict, Any
from urllib.parse import urlparse

import httpx
from keycloak import KeycloakOpenID
from keycloak.exceptions import KeycloakError

logger = logging.getLogger(__name__)


class KeycloakClient:
    """
    Keycloak OpenID Connect client using python-keycloak library.

    Follows standard OAuth2/OIDC conventions for:
    - Authorization code exchange
    - Token refresh
    - Token introspection
    - User info retrieval

    Uses shared KeycloakOpenID instance from keycloak_settings for consistency.
    """

    def __init__(self):
        """Initialize Keycloak OpenID client from shared settings."""
        from src.config.keycloak_settings import get_keycloak_openid, get_keycloak_connection

        # Use shared KeycloakOpenID instance (follows DRY principle)
        self.keycloak_openid = get_keycloak_openid()

        # Get server URL from connection object for logging
        connection = get_keycloak_connection()

        logger.info(
            f"[KC-CLIENT] ✅ Initialized Keycloak client for realm "
            f"'{connection.realm_name}' at {connection.server_url}"
        )

    def exchange_code_for_tokens(
        self,
        code: str,
        redirect_uri: str,
        code_verifier: Optional[str] = None,
        client_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Exchange authorization code for access/refresh tokens.

        Standard OAuth2 authorization code flow with optional PKCE.

        Args:
            code: Authorization code from Keycloak
            redirect_uri: Redirect URI used in authorization request
            code_verifier: PKCE code verifier (if PKCE was used)
            client_id: OAuth client ID (must match the one used in authorization request)

        Returns:
            Token response with access_token, refresh_token, id_token, etc.

        Raises:
            KeycloakError: If token exchange fails
        """
        try:
            logger.info(f"[KC-CLIENT] Exchanging authorization code for tokens (client_id={client_id})")

            # Build token request parameters
            token_params = {
                "code": code,
                "redirect_uri": redirect_uri,
            }

            # Add PKCE code_verifier if provided
            if code_verifier:
                token_params["code_verifier"] = code_verifier
                logger.debug("[KC-CLIENT] Using PKCE code_verifier")

            # Use client-specific KeycloakOpenID instance if client_id provided
            if client_id:
                from src.config.keycloak_settings import get_keycloak_openid
                keycloak_openid = get_keycloak_openid(client_id=client_id)
            else:
                keycloak_openid = self.keycloak_openid

            # Exchange code for tokens
            tokens = keycloak_openid.token(
                grant_type="authorization_code",
                **token_params
            )

            logger.info("[KC-CLIENT] ✅ Token exchange successful")
            return tokens

        except KeycloakError as e:
            logger.error(f"[KC-CLIENT] Token exchange failed: {e}")
            raise

    def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        """
        Refresh access token using refresh token.

        Calls the internal Keycloak URL (http://keycloak:8080) but sets X-Forwarded-Host
        and X-Forwarded-Proto headers to match the public URL. This makes Keycloak compute
        the issuer as the public URL, matching the iss claim in the refresh token — which
        was issued when the user logged in via Tailscale (the public URL).

        Without this, Keycloak sees http://keycloak:8080 as the issuer on refresh, which
        doesn't match the token's iss (https://orange.spangled-kettle.ts.net), causing
        "Invalid token issuer" errors.
        """
        from src.config.keycloak_settings import get_keycloak_config

        config = get_keycloak_config()
        internal_url = config["url"]          # http://keycloak:8080
        public_url = config["public_url"]     # https://orange.spangled-kettle.ts.net
        realm = config["realm"]
        client_id = config["frontend_client_id"]

        parsed = urlparse(public_url)
        token_url = f"{internal_url}/realms/{realm}/protocol/openid-connect/token"

        logger.info(f"[KC-CLIENT] Refreshing token via {token_url} (forwarding as {public_url})")

        try:
            response = httpx.post(
                token_url,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": client_id,
                },
                headers={
                    "X-Forwarded-Host": parsed.netloc,
                    "X-Forwarded-Proto": parsed.scheme,
                },
                timeout=10.0,
            )
            response.raise_for_status()
            tokens = response.json()
            logger.info("[KC-CLIENT] ✅ Token refresh successful")
            return tokens

        except httpx.HTTPStatusError as e:
            logger.error(f"[KC-CLIENT] Token refresh failed: {e.response.status_code}: {e.response.text}")
            raise KeycloakError(e.response.text) from e
        except Exception as e:
            logger.error(f"[KC-CLIENT] Token refresh failed: {e}")
            raise KeycloakError(str(e)) from e

    def introspect_token(self, token: str, token_type_hint: str = "access_token") -> Dict[str, Any]:
        """
        Introspect token to check validity and get token metadata.

        Standard OAuth2 token introspection (RFC 7662).

        Args:
            token: Access or refresh token to introspect
            token_type_hint: Type of token ("access_token" or "refresh_token")

        Returns:
            Introspection result with 'active' flag and token metadata

        Raises:
            KeycloakError: If introspection fails
        """
        try:
            result = self.keycloak_openid.introspect(token, token_type_hint=token_type_hint)

            if result.get("active"):
                logger.debug(f"[KC-CLIENT] Token is active (expires in {result.get('exp', 0) - result.get('iat', 0)}s)")
            else:
                logger.warning("[KC-CLIENT] Token is inactive/expired")

            return result

        except KeycloakError as e:
            logger.error(f"[KC-CLIENT] Token introspection failed: {e}")
            raise

    def get_userinfo(self, access_token: str) -> Dict[str, Any]:
        """
        Get user information from access token.

        Standard OIDC UserInfo endpoint.

        Args:
            access_token: Valid access token

        Returns:
            User information (sub, email, name, etc.)

        Raises:
            KeycloakError: If userinfo retrieval fails
        """
        try:
            userinfo = self.keycloak_openid.userinfo(access_token)

            logger.debug(f"[KC-CLIENT] Retrieved userinfo for: {userinfo.get('email', userinfo.get('sub'))}")
            return userinfo

        except KeycloakError as e:
            logger.error(f"[KC-CLIENT] Userinfo retrieval failed: {e}")
            raise

    def decode_token(self, token: str, validate: bool = True) -> Dict[str, Any]:
        """
        Decode and optionally validate JWT token.

        Args:
            token: JWT token to decode
            validate: Whether to validate signature and expiration

        Returns:
            Decoded token payload

        Raises:
            KeycloakError: If token is invalid or expired
        """
        try:
            if validate:
                # Decode and validate token signature + expiration
                decoded = self.keycloak_openid.decode_token(
                    token,
                    validate=True
                )
                logger.debug("[KC-CLIENT] Token validated successfully")
            else:
                # Decode without validation (for debugging)
                decoded = self.keycloak_openid.decode_token(
                    token,
                    validate=False
                )
                logger.debug("[KC-CLIENT] Token decoded (no validation)")

            return decoded

        except KeycloakError as e:
            logger.error(f"[KC-CLIENT] Token decode failed: {e}")
            raise

    def logout(self, refresh_token: str) -> None:
        """
        Logout user by revoking refresh token.

        Standard OIDC logout.

        Args:
            refresh_token: Refresh token to revoke

        Raises:
            KeycloakError: If logout fails
        """
        try:
            logger.info("[KC-CLIENT] Logging out user (revoking refresh token)")

            self.keycloak_openid.logout(refresh_token)

            logger.info("[KC-CLIENT] ✅ Logout successful")

        except KeycloakError as e:
            logger.error(f"[KC-CLIENT] Logout failed: {e}")
            raise


# Singleton instance
_keycloak_client: Optional[KeycloakClient] = None


def get_keycloak_client() -> KeycloakClient:
    """
    Get singleton Keycloak client instance.

    Returns:
        Initialized KeycloakClient
    """
    global _keycloak_client

    if _keycloak_client is None:
        _keycloak_client = KeycloakClient()

    return _keycloak_client
