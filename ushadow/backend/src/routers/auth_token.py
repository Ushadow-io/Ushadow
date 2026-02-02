"""
OAuth Token Exchange Router

Handles token exchange for Keycloak OIDC authentication.
The frontend sends the authorization code here, and we exchange it
for tokens using the backend client secret (which stays secure on the server).
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import httpx
import os
import logging
from src.config.secrets import get_keycloak_client_secret
from src.services.keycloak_auth import get_current_user_hybrid
from src.services.auth import generate_jwt_for_service, JWT_LIFETIME_SECONDS

router = APIRouter()
logger = logging.getLogger(__name__)


class TokenExchangeRequest(BaseModel):
    """Request to exchange authorization code for tokens"""
    code: str
    code_verifier: str  # PKCE verifier
    redirect_uri: str


class TokenResponse(BaseModel):
    """OAuth token response"""
    access_token: str
    token_type: str = "Bearer"
    expires_in: int | None = None
    refresh_token: str | None = None
    id_token: str | None = None


@router.post("/token", response_model=TokenResponse)
async def exchange_code_for_token(request: TokenExchangeRequest):
    """
    Exchange authorization code for access token.

    This endpoint keeps the client_secret secure on the backend.
    The frontend only sends the authorization code and PKCE verifier.
    """
    # Get Keycloak configuration from environment
    # Use internal Docker URL for backend-to-Keycloak communication
    # The frontendUrl attribute in Keycloak realm config ensures tokens have the correct issuer
    keycloak_url = os.getenv("KEYCLOAK_URL", "http://keycloak:8080")
    keycloak_realm = os.getenv("KEYCLOAK_REALM", "ushadow")
    # Use the frontend client ID - MUST match the client that requested authorization
    client_id = os.getenv("KEYCLOAK_FRONTEND_CLIENT_ID", "ushadow-frontend")

    # Build token endpoint URL
    token_url = f"{keycloak_url}/realms/{keycloak_realm}/protocol/openid-connect/token"

    # Prepare token exchange request
    # For public clients with PKCE, we don't send client_secret
    token_data = {
        "grant_type": "authorization_code",
        "code": request.code,
        "redirect_uri": request.redirect_uri,
        "client_id": client_id,
        "code_verifier": request.code_verifier,  # PKCE provides security for public clients
    }

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                token_url,
                data=token_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10.0,
            )

            if response.status_code != 200:
                error_detail = response.text
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Token exchange failed: {error_detail}"
                )

            # Return tokens to frontend
            tokens = response.json()

            # Debug logging to verify we're getting different tokens
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"[TOKEN-EXCHANGE] Received tokens from Keycloak:")
            logger.info(f"  access_token: {tokens.get('access_token', 'MISSING')[:30]}...")
            logger.info(f"  id_token: {tokens.get('id_token', 'MISSING')[:30] if tokens.get('id_token') else 'MISSING'}")
            logger.info(f"  refresh_token: {tokens.get('refresh_token', 'MISSING')[:30] if tokens.get('refresh_token') else 'MISSING'}")

            return TokenResponse(
                access_token=tokens["access_token"],
                token_type=tokens.get("token_type", "Bearer"),
                expires_in=tokens.get("expires_in"),
                refresh_token=tokens.get("refresh_token"),
                id_token=tokens.get("id_token"),
            )

        except httpx.TimeoutException:
            raise HTTPException(
                status_code=504,
                detail="Keycloak request timed out"
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to connect to Keycloak: {str(e)}"
            )


class RefreshTokenRequest(BaseModel):
    """Request to refresh access token"""
    refresh_token: str


@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(request: RefreshTokenRequest):
    """
    Refresh an expired access token using a refresh token.

    This prevents users from being logged out when their access token expires.
    """
    # Get Keycloak configuration from environment
    # Use internal Docker URL for backend-to-Keycloak communication
    # The frontendUrl attribute in Keycloak realm config ensures tokens have the correct issuer
    keycloak_url = os.getenv("KEYCLOAK_URL", "http://keycloak:8080")
    keycloak_realm = os.getenv("KEYCLOAK_REALM", "ushadow")
    client_id = os.getenv("KEYCLOAK_FRONTEND_CLIENT_ID", "ushadow-frontend")

    # Build token endpoint URL
    token_url = f"{keycloak_url}/realms/{keycloak_realm}/protocol/openid-connect/token"

    # Prepare refresh request
    token_data = {
        "grant_type": "refresh_token",
        "refresh_token": request.refresh_token,
        "client_id": client_id,
    }

    # Exchange refresh token for new tokens
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                token_url,
                data=token_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10.0,
            )

            if response.status_code != 200:
                error_detail = response.text
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"[TOKEN-REFRESH] Failed: {error_detail}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Token refresh failed: {error_detail}"
                )

            # Return new tokens to frontend
            tokens = response.json()

            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"[TOKEN-REFRESH] Successfully refreshed tokens")
            logger.info(f"  new access_token: {tokens.get('access_token', 'MISSING')[:30]}...")
            logger.info(f"  new expires_in: {tokens.get('expires_in', 'N/A')} seconds")

            return TokenResponse(
                access_token=tokens["access_token"],
                token_type=tokens.get("token_type", "Bearer"),
                expires_in=tokens.get("expires_in"),
                refresh_token=tokens.get("refresh_token"),  # Keycloak may rotate refresh tokens
                id_token=tokens.get("id_token"),
            )

        except httpx.TimeoutException:
            raise HTTPException(
                status_code=504,
                detail="Keycloak refresh request timed out"
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to connect to Keycloak: {str(e)}"
            )


class ServiceTokenRequest(BaseModel):
    """Request to generate a service-compatible JWT from a Keycloak token"""
    audiences: list[str] | None = None


class ServiceTokenResponse(BaseModel):
    """Service-compatible JWT token"""
    service_token: str
    token_type: str = "Bearer"
    expires_in: int


@router.post("/service-token", response_model=ServiceTokenResponse)
async def get_service_token(
    request: ServiceTokenRequest,
    current_user: dict = Depends(get_current_user_hybrid)
):
    """
    Exchange a Keycloak token for a service-compatible JWT token.

    This allows Keycloak-authenticated users to access services like Chronicle
    that expect ushadow-issued JWT tokens.

    The service token is signed with AUTH_SECRET_KEY and includes:
    - Issuer: "ushadow" (so Chronicle accepts it)
    - Audiences: ["ushadow", "chronicle"] by default
    - User identity: email and user ID from Keycloak token

    Usage:
        1. Frontend authenticates via Keycloak (gets OIDC token)
        2. Frontend calls this endpoint with OIDC token in Authorization header
        3. Backend validates OIDC token, extracts user info
        4. Backend generates service JWT with ushadow as issuer
        5. Frontend uses service JWT to connect to Chronicle WebSocket

    NOTE: This endpoint is now OPTIONAL! The proxy and audio relay endpoints
    automatically bridge Keycloak tokens. You only need this if you want to
    manually get a service token for custom use cases.
    """
    # User is already validated by get_current_user_hybrid dependency

    user_email = current_user.get("email")
    user_id = current_user.get("sub")  # Keycloak subject ID

    if not user_email or not user_id:
        logger.error(f"[SERVICE-TOKEN] Missing user info: email={user_email}, id={user_id}")
        raise HTTPException(
            status_code=400,
            detail="User email or ID not found in token"
        )

    # Generate service token with ushadow as issuer
    audiences = request.audiences or ["ushadow", "chronicle"]
    service_token = generate_jwt_for_service(
        user_id=user_id,
        user_email=user_email,
        audiences=audiences
    )

    logger.info(f"[SERVICE-TOKEN] Generated service token for {user_email}")
    logger.info(f"  Audiences: {audiences}")
    logger.info(f"  Token preview: {service_token[:30]}...")

    return ServiceTokenResponse(
        service_token=service_token,
        token_type="Bearer",
        expires_in=JWT_LIFETIME_SECONDS
    )


@router.get("/bridge-test")
async def test_token_bridge(
    current_user: dict = Depends(get_current_user_hybrid)
):
    """
    Test endpoint to verify token bridge is working.

    Send a Keycloak token in Authorization header and see:
    1. Your user info extracted from the token
    2. What type of auth you're using (Keycloak vs legacy)
    3. Confirm the bridge is functioning

    Usage:
        curl -H "Authorization: Bearer YOUR_KEYCLOAK_TOKEN" http://localhost:8010/api/auth/bridge-test
    """
    return {
        "success": True,
        "message": "Token bridge is working!",
        "user": {
            "id": current_user.get("sub"),
            "email": current_user.get("email"),
            "name": current_user.get("name"),
            "username": current_user.get("preferred_username"),
        },
        "auth_type": current_user.get("auth_type", "unknown"),
        "info": {
            "proxy_auto_bridge": "✓ Enabled - Keycloak tokens automatically bridged in /api/services/*/proxy/*",
            "audio_relay_auto_bridge": "✓ Enabled - Keycloak tokens automatically bridged in /ws/audio/relay",
            "manual_bridge": "Available at POST /api/auth/token/service-token (but not needed for most cases)",
        }
    }
