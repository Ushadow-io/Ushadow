"""Authentication endpoints using fastapi-users.

ushadow serves as the central auth provider. This router exposes:
- Standard fastapi-users routes (login, register, etc.)
- Custom setup endpoint for first-run admin creation
- Token generation endpoint for cross-service authentication
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, status, Response
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
    login_data: LoginRequest,
    response: Response,
    user_manager=Depends(get_user_manager),
):
    """Authenticate user with email/password and return JWT token.
    
    This endpoint accepts JSON (frontend-friendly) instead of form data.
    Sets both a cookie and returns the token in the response.
    """
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


@router.post("/setup", response_model=UserRead)
async def create_initial_admin(
    setup_data: SetupRequest,
    user_manager=Depends(get_user_manager),
):
    """Create the first admin user.
    
    Only works if no users exist yet. This endpoint bypasses normal
    registration to create a superuser account.
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

        return UserRead(
            id=admin_user.id,
            email=admin_user.email,
            display_name=admin_user.display_name,
            is_active=admin_user.is_active,
            is_superuser=admin_user.is_superuser,
            is_verified=admin_user.is_verified,
            created_at=admin_user.created_at,
            updated_at=admin_user.updated_at,
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
    
    logger.info(f"User logged out: {user.email}")
    return {"message": "Successfully logged out"}
