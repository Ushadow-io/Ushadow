"""Authentication endpoints using fastapi-users.

ushadow serves as the central auth provider. This router exposes:
- Standard fastapi-users routes (login, register, etc.)
- Custom setup endpoint for first-run admin creation
- Token generation endpoint for cross-service authentication
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, status, Response, Request
from pydantic import BaseModel, EmailStr, Field

from src.models.user import User, UserCreate, UserRead, UserUpdate, get_user_by_email
from src.services.auth import (
    fastapi_users,
    cookie_backend,
    bearer_backend,
    get_current_user,
    get_current_superuser,
    generate_jwt_for_service,
    get_user_manager,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# Custom request/response models for setup flow
class SetupStatusResponse(BaseModel):
    """Setup status response."""
    requires_setup: bool
    user_count: int


class SetupRequest(BaseModel):
    """Initial setup request for creating first admin user."""
    display_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)
    confirm_password: str


class ServiceTokenRequest(BaseModel):
    """Request for generating a cross-service token."""
    audiences: list[str] = Field(
        default=["ushadow", "chronicle"],
        description="Services this token should be valid for"
    )


class ServiceTokenResponse(BaseModel):
    """Response containing a cross-service JWT token."""
    access_token: str
    token_type: str = "bearer"
    audiences: list[str]


class LoginRequest(BaseModel):
    """Login request matching frontend format."""
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Login response with token and user info."""
    access_token: str
    token_type: str = "bearer"
    user: UserRead


# Include fastapi-users auth routes
# Login route (cookie + bearer backends)
router.include_router(
    fastapi_users.get_auth_router(cookie_backend),
    prefix="/cookie",
    tags=["auth"],
)
router.include_router(
    fastapi_users.get_auth_router(bearer_backend),
    prefix="/jwt",
    tags=["auth"],
)

# Registration route
router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    tags=["auth"],
)

# Password reset routes (for future email integration)
router.include_router(
    fastapi_users.get_reset_password_router(),
    tags=["auth"],
)

# Email verification routes (for future email integration)
router.include_router(
    fastapi_users.get_verify_router(UserRead),
    tags=["auth"],
)

# User management routes
router.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["users"],
)


# Custom endpoints


@router.post("/login", response_model=LoginResponse)
async def login(
    request: Request,
    response: Response,
    user_manager=Depends(get_user_manager),
):
    """Authenticate user with email/password and return JWT token.

    This endpoint accepts JSON (frontend-friendly) instead of form data.
    Sets both a cookie and returns the token in the response.
    """
    # Log raw request for debugging
    try:
        body = await request.body()
        logger.info(f"[AUTH] Raw login request body: {body.decode('utf-8')}")

        # Parse the login data from the body we just read
        login_data = LoginRequest.model_validate_json(body)
    except Exception as e:
        logger.error(f"[AUTH] Login request validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid request format: {str(e)}"
        )

    logger.info(f"[AUTH] Login attempt for email: {login_data.email}")
    try:
        # Get user by email
        try:
            user = await user_manager.get_by_email(login_data.email)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        
        # Verify password
        verified, updated_password_hash = user_manager.password_helper.verify_and_update(
            login_data.password, user.hashed_password
        )
        
        if not verified:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        
        # Update password hash if needed (e.g., algorithm upgrade)
        if updated_password_hash is not None:
            await user_manager.user_db.update(user, {"hashed_password": updated_password_hash})
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is inactive",
            )
        
        # Generate token with cross-service support
        token = generate_jwt_for_service(
            user_id=str(user.id),
            user_email=user.email,
        )
        
        # Set cookie for SSE/WebSocket support
        response.set_cookie(
            key="ushadow_auth",
            value=token,
            httponly=True,
            samesite="lax",
            secure=False,  # Set True in production
            max_age=86400,  # 24 hours
        )
        
        logger.info(f"User logged in: {user.email}")
        
        return LoginResponse(
            access_token=token,
            user=UserRead(
                id=user.id,
                email=user.email,
                display_name=user.display_name,
                is_active=user.is_active,
                is_superuser=user.is_superuser,
                is_verified=user.is_verified,
                created_at=user.created_at,
                updated_at=user.updated_at,
            ),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

@router.get("/setup/status", response_model=SetupStatusResponse)
async def get_setup_status(user_manager=Depends(get_user_manager)):
    """Check if initial setup is required.
    
    Returns true if no users exist in the system.
    """
    try:
        # Count users in the database
        user_count = await User.count()
        
        return SetupStatusResponse(
            requires_setup=user_count == 0,
            user_count=user_count
        )
    except Exception as e:
        logger.error(f"Error checking setup status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check setup status"
        )


@router.post("/setup", response_model=LoginResponse)
async def create_initial_admin(
    setup_data: SetupRequest,
    response: Response,
    user_manager=Depends(get_user_manager),
):
    """Create the first admin user and auto-login.

    Only works if no users exist yet. This endpoint bypasses normal
    registration to create a superuser account, then returns a token
    for immediate login.
    """
    try:
        # Check if setup is required
        user_count = await User.count()
        if user_count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Setup has already been completed"
            )

        # Validate password confirmation
        if setup_data.password != setup_data.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwords do not match"
            )

        # Create admin user using user_manager
        admin_create = UserCreate(
            email=setup_data.email,
            password=setup_data.password,
            display_name=setup_data.display_name,
            is_superuser=True,
            is_verified=True,
        )

        admin_user = await user_manager.create(admin_create)
        logger.info(f"Admin user created via setup: {admin_user.email}")

        # Generate token for auto-login
        token = generate_jwt_for_service(
            user_id=str(admin_user.id),
            user_email=admin_user.email,
        )

        # Set cookie for SSE/WebSocket support
        response.set_cookie(
            key="ushadow_auth",
            value=token,
            httponly=True,
            samesite="lax",
            secure=False,  # Set True in production
            max_age=86400,  # 24 hours
        )

        return LoginResponse(
            access_token=token,
            user=UserRead(
                id=admin_user.id,
                email=admin_user.email,
                display_name=admin_user.display_name,
                is_active=admin_user.is_active,
                is_superuser=admin_user.is_superuser,
                is_verified=admin_user.is_verified,
                created_at=admin_user.created_at,
                updated_at=admin_user.updated_at,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during setup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Setup failed"
        )


@router.get("/me", response_model=UserRead)
async def get_current_user_info(user: User = Depends(get_current_user)):
    """Get current authenticated user information."""
    from src.utils.auth_helpers import get_user_id, get_user_email, get_user_name

    # If user is a Keycloak dict, look up the MongoDB User record
    if isinstance(user, dict):
        from src.services.keycloak_user_sync import get_mongodb_user_id_for_keycloak_user
        from src.models.user import User as UserModel

        # Get or create MongoDB User record
        mongodb_user_id = await get_mongodb_user_id_for_keycloak_user(
            keycloak_sub=user.get("sub"),
            email=user.get("email"),
            name=user.get("name")
        )

        # Fetch the User record
        user_record = await UserModel.get(mongodb_user_id)
        if not user_record:
            raise HTTPException(status_code=404, detail="User record not found")

        return UserRead(
            id=user_record.id,
            email=user_record.email,
            display_name=user_record.display_name,
            is_active=user_record.is_active,
            is_superuser=user_record.is_superuser,
            is_verified=user_record.is_verified,
            created_at=user_record.created_at,
            updated_at=user_record.updated_at,
        )

    # Legacy User object
    return UserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        is_verified=user.is_verified,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.post("/service-token", response_model=ServiceTokenResponse)
async def get_service_token(
    request: ServiceTokenRequest,
    user: User = Depends(get_current_user),
):
    """Generate a JWT token for cross-service authentication.
    
    This token can be used to authenticate with other services
    (like chronicle) that share the same AUTH_SECRET_KEY.
    
    The token includes issuer ("ushadow") and audience claims
    so receiving services can validate the token's intended use.
    """
    token = generate_jwt_for_service(
        user_id=str(user.id),
        user_email=user.email,
        audiences=request.audiences,
    )
    
    return ServiceTokenResponse(
        access_token=token,
        audiences=request.audiences,
    )


@router.post("/logout")
async def logout(
    response: Response,
    user: User = Depends(get_current_user),
):
    """Logout current user by clearing the auth cookie.

    Note: For bearer tokens, logout is handled client-side by
    discarding the token. This endpoint clears the HTTP-only cookie.
    """
    response.delete_cookie(
        key="ushadow_auth",
        httponly=True,
        samesite="lax",
    )


# Keycloak OAuth Token Exchange
class TokenExchangeRequest(BaseModel):
    """Request for exchanging OAuth authorization code for tokens."""
    code: str = Field(..., description="Authorization code from Keycloak")
    code_verifier: str = Field(..., description="PKCE code verifier")
    redirect_uri: str = Field(..., description="Redirect URI used in authorization request")


class TokenExchangeResponse(BaseModel):
    """Response containing OAuth tokens."""
    access_token: str
    refresh_token: Optional[str] = None
    id_token: Optional[str] = None
    expires_in: Optional[int] = None
    refresh_expires_in: Optional[int] = None
    token_type: str = "Bearer"


@router.post("/token", response_model=TokenExchangeResponse)
async def exchange_code_for_tokens(request: TokenExchangeRequest):
    """Exchange OAuth authorization code for access/refresh tokens.

    Standard OAuth 2.0 Authorization Code Flow with PKCE using python-keycloak.

    Args:
        request: Contains authorization code, PKCE verifier, and redirect URI

    Returns:
        Access token, refresh token, and ID token from Keycloak

    Raises:
        400: If code exchange fails (invalid code, expired, etc.)
        503: If Keycloak is unreachable
    """
    from src.services.keycloak_client import get_keycloak_client
    from keycloak.exceptions import KeycloakError

    try:
        kc_client = get_keycloak_client()

        # Exchange authorization code for tokens
        tokens = kc_client.exchange_code_for_tokens(
            code=request.code,
            redirect_uri=request.redirect_uri,
            code_verifier=request.code_verifier
        )

        logger.info("[TOKEN-EXCHANGE] ✓ Successfully exchanged code for tokens")

        return TokenExchangeResponse(
            access_token=tokens["access_token"],
            refresh_token=tokens.get("refresh_token"),
            id_token=tokens.get("id_token"),
            expires_in=tokens.get("expires_in"),
            refresh_expires_in=tokens.get("refresh_expires_in"),
            token_type=tokens.get("token_type", "Bearer")
        )

    except KeycloakError as e:
        logger.error(f"[TOKEN-EXCHANGE] Keycloak error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Token exchange failed: {str(e)}"
        )
    except Exception as e:
        logger.error(f"[TOKEN-EXCHANGE] Unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# Token Refresh
class TokenRefreshRequest(BaseModel):
    """Request for refreshing access token."""
    refresh_token: str = Field(..., description="Valid refresh token")


@router.post("/refresh", response_model=TokenExchangeResponse)
async def refresh_access_token(request: TokenRefreshRequest):
    """Refresh access token using refresh token.

    Standard OAuth 2.0 refresh token flow using python-keycloak.

    Args:
        request: Contains refresh token

    Returns:
        New access token, refresh token, and ID token

    Raises:
        401: If refresh token is invalid or expired
        503: If Keycloak is unreachable
    """
    from src.services.keycloak_client import get_keycloak_client
    from keycloak.exceptions import KeycloakError

    try:
        kc_client = get_keycloak_client()

        # Refresh token
        tokens = kc_client.refresh_token(request.refresh_token)

        logger.info("[TOKEN-REFRESH] ✓ Successfully refreshed access token")

        return TokenExchangeResponse(
            access_token=tokens["access_token"],
            refresh_token=tokens.get("refresh_token"),
            id_token=tokens.get("id_token"),
            expires_in=tokens.get("expires_in"),
            refresh_expires_in=tokens.get("refresh_expires_in"),
            token_type=tokens.get("token_type", "Bearer")
        )

    except KeycloakError as e:
        logger.error(f"[TOKEN-REFRESH] Keycloak error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token refresh failed: {str(e)}"
        )
    except Exception as e:
        logger.error(f"[TOKEN-REFRESH] Unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# Dynamic Redirect URI Registration
class RedirectUriRequest(BaseModel):
    """Request for registering a redirect URI with Keycloak."""
    redirect_uri: str = Field(..., description="OAuth redirect URI to register (e.g., http://localhost:3500/oauth/callback)")
    post_logout_redirect_uri: Optional[str] = Field(None, description="Optional post-logout redirect URI")


class RedirectUriResponse(BaseModel):
    """Response after registering redirect URI."""
    success: bool
    redirect_uri: str
    message: str


@router.post("/register-redirect-uri", response_model=RedirectUriResponse)
async def register_redirect_uri_endpoint(request: RedirectUriRequest):
    """Register this environment's redirect URI with Keycloak.

    Called by frontend on startup to dynamically register its OAuth callback URL.
    This allows multiple environments to run on different ports without pre-configuring
    all possible redirect URIs in Keycloak.

    Uses the existing KeycloakAdminClient.register_redirect_uri() service method.

    Args:
        request: Contains redirect URI to register

    Returns:
        Success status and registered URI

    Raises:
        400: If redirect URI is invalid
        500: If Keycloak registration fails
    """
    from src.services.keycloak_admin import get_keycloak_admin

    # Validate redirect URI format
    if not request.redirect_uri.startswith(('http://', 'https://')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="redirect_uri must start with http:// or https://"
        )

    try:
        kc_admin = get_keycloak_admin()

        # Use existing service method to register redirect URI
        success = await kc_admin.register_redirect_uri(
            client_id="ushadow-frontend",
            redirect_uri=request.redirect_uri
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to register redirect URI with Keycloak"
            )

        # Optionally register post-logout redirect URI
        if request.post_logout_redirect_uri:
            await kc_admin.update_post_logout_redirect_uris(
                client_id="ushadow-frontend",
                post_logout_redirect_uris=[request.post_logout_redirect_uri],
                merge=True
            )

        logger.info(f"[REDIRECT-URI] ✓ Registered redirect URI: {request.redirect_uri}")

        return RedirectUriResponse(
            success=True,
            redirect_uri=request.redirect_uri,
            message=f"Redirect URI registered successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[REDIRECT-URI] Failed to register: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to register redirect URI: {str(e)}"
        )
