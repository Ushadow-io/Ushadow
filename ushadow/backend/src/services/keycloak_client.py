"""
Keycloak Client Service

Standard OAuth2/OIDC implementation using python-keycloak library.
Handles token exchange, refresh, validation, and user info retrieval.
"""

import logging
from typing import Optional, Dict, Any

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
    """

    def __init__(self):
        """Initialize Keycloak OpenID client from settings configuration."""
        from src.config.keycloak_settings import get_keycloak_config

        # Load configuration from settings (config.defaults.yaml + secrets.yaml)
        # Settings system handles env var interpolation via OmegaConf
        config = get_keycloak_config()

        # Use internal URL for efficient Docker network communication
        # Token introspection is issuer-agnostic, so we don't need external URL
        self.server_url = config["url"]
        self.realm = config["realm"]
        self.client_id = config["frontend_client_id"]  # Used for token validation
        self.client_secret = config.get("backend_client_secret")

        logger.info(f"[KC-CLIENT] Using Keycloak URL: {self.server_url}")

        # Initialize KeycloakOpenID client
        self.keycloak_openid = KeycloakOpenID(
            server_url=self.server_url,
            realm_name=self.realm,
            client_id=self.client_id,
            client_secret_key=self.client_secret,
            verify=True  # Verify SSL in production
        )

        logger.info(f"[KC-CLIENT] ✅ Initialized Keycloak client for realm '{self.realm}' at {self.server_url}")

    def exchange_code_for_tokens(
        self,
        code: str,
        redirect_uri: str,
        code_verifier: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Exchange authorization code for access/refresh tokens.

        Standard OAuth2 authorization code flow with optional PKCE.

        Args:
            code: Authorization code from Keycloak
            redirect_uri: Redirect URI used in authorization request
            code_verifier: PKCE code verifier (if PKCE was used)

        Returns:
            Token response with access_token, refresh_token, id_token, etc.

        Raises:
            KeycloakError: If token exchange fails
        """
        try:
            logger.info("[KC-CLIENT] Exchanging authorization code for tokens")

            # Build token request parameters
            token_params = {
                "code": code,
                "redirect_uri": redirect_uri,
            }

            # Add PKCE code_verifier if provided
            if code_verifier:
                token_params["code_verifier"] = code_verifier
                logger.debug("[KC-CLIENT] Using PKCE code_verifier")

            # Exchange code for tokens
            tokens = self.keycloak_openid.token(
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

        Standard OAuth2 refresh token flow.

        Args:
            refresh_token: Valid refresh token

        Returns:
            New token response with fresh access_token, refresh_token, etc.

        Raises:
            KeycloakError: If token refresh fails (expired/invalid refresh token)
        """
        try:
            logger.info("[KC-CLIENT] Refreshing access token")

            tokens = self.keycloak_openid.refresh_token(refresh_token)

            logger.info("[KC-CLIENT] ✅ Token refresh successful")
            return tokens

        except KeycloakError as e:
            logger.error(f"[KC-CLIENT] Token refresh failed: {e}")
            raise

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
