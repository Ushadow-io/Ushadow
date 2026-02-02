"""
Token exchange endpoint for OIDC authorization code flow.

This endpoint exchanges the authorization code for tokens server-side,
keeping the client_secret secure (never exposed to frontend).
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
import httpx
from src.config.keycloak_settings import get_keycloak_config

router = APIRouter(prefix="/api/auth", tags=["auth"])


class TokenExchangeRequest(BaseModel):
    code: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    id_token: str
    expires_in: int
    token_type: str = "Bearer"


@router.post("/token", response_model=TokenResponse)
async def exchange_code_for_token(request: TokenExchangeRequest):
    """
    Exchange authorization code for tokens.

    This endpoint is called by the frontend after Keycloak redirects back
    with an authorization code. We exchange the code for tokens server-side
    to keep the client_secret secure.

    Flow:
    1. Frontend redirects to Keycloak for login
    2. Keycloak redirects back with authorization code
    3. Frontend calls this endpoint with the code
    4. Backend exchanges code for tokens with Keycloak
    5. Backend returns tokens to frontend
    """
    config = get_keycloak_config()

    # Prepare token request
    token_url = f"{config['url']}/realms/{config['realm']}/protocol/openid-connect/token"

    # TODO: The redirect_uri must match exactly what was used in the initial auth request
    # You may need to make this configurable or extract from request headers
    redirect_uri = "http://localhost:3000/auth/callback"

    data = {
        "grant_type": "authorization_code",
        "code": request.code,
        "client_id": config["frontend_client_id"],
        "redirect_uri": redirect_uri,
    }

    # Add client_secret if using confidential client
    # For public clients (PKCE), this is not needed
    if "frontend_client_secret" in config:
        data["client_secret"] = config["frontend_client_secret"]

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                token_url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

            if response.status_code != 200:
                error_detail = response.json() if response.text else {}
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Token exchange failed: {error_detail.get('error_description', 'Unknown error')}"
                )

            token_data = response.json()

            return TokenResponse(
                access_token=token_data["access_token"],
                refresh_token=token_data["refresh_token"],
                id_token=token_data["id_token"],
                expires_in=token_data["expires_in"],
                token_type=token_data.get("token_type", "Bearer"),
            )

    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to connect to Keycloak: {str(e)}"
        )
