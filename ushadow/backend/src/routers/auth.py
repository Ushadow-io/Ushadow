"""
Authentication endpoints
Handles login, registration, and setup
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr, Field

from src.models.user import User, UserCreate
from src.services.auth_service import AuthService
from src.services.auth_dependencies import get_current_user, get_current_superuser

logger = logging.getLogger(__name__)
router = APIRouter()

# Auth service instance
auth_service = AuthService()


# Models

class LoginRequest(BaseModel):
    """Login request model."""
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Login response model."""
    access_token: str
    token_type: str = "bearer"
    user: User


class SetupStatusResponse(BaseModel):
    """Setup status response."""
    requires_setup: bool
    user_count: int


class SetupRequest(BaseModel):
    """Initial setup request."""
    display_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)
    confirm_password: str


# Endpoints

@router.get("/setup/status", response_model=SetupStatusResponse)
async def get_setup_status():
    """
    Check if initial setup is required.
    Returns true if no users exist in the system.
    """
    try:
        requires_setup = await auth_service.requires_setup()
        user_count = await auth_service.get_user_count()

        return SetupStatusResponse(
            requires_setup=requires_setup,
            user_count=user_count
        )
    except Exception as e:
        logger.error(f"Error checking setup status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check setup status"
        )


@router.post("/setup", response_model=LoginResponse)
async def create_admin_user(setup_data: SetupRequest):
    """
    Create the first admin user.
    Only works if no users exist yet.
    """
    try:
        # Check if setup is required
        if not await auth_service.requires_setup():
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

        # Create admin user
        user = await auth_service.create_user(
            email=setup_data.email,
            display_name=setup_data.display_name,
            password=setup_data.password,
            is_superuser=True  # First user is always admin
        )

        # Create access token
        access_token = auth_service.create_access_token(
            data={"sub": user.id}
        )

        logger.info(f"Admin user created: {user.email}")

        # Return token and user info
        return LoginResponse(
            access_token=access_token,
            user=User(
                id=user.id,
                email=user.email,
                display_name=user.display_name,
                is_active=user.is_active,
                is_superuser=user.is_superuser,
                created_at=user.created_at,
                updated_at=user.updated_at
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during setup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Setup failed"
        )


@router.post("/login", response_model=LoginResponse)
async def login(login_data: LoginRequest):
    """
    Authenticate user and return access token.
    """
    try:
        # Authenticate user
        user = await auth_service.authenticate_user(
            email=login_data.email,
            password=login_data.password
        )

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Create access token
        access_token = auth_service.create_access_token(
            data={"sub": user.id}
        )

        logger.info(f"User logged in: {user.email}")

        # Return token and user info
        return LoginResponse(
            access_token=access_token,
            user=User(
                id=user.id,
                email=user.email,
                display_name=user.display_name,
                is_active=user.is_active,
                is_superuser=user.is_superuser,
                created_at=user.created_at,
                updated_at=user.updated_at
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during login: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )


@router.get("/me", response_model=User)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    Get current authenticated user information.
    """
    return current_user


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """
    Logout current user.
    Note: With JWT, logout is handled client-side by discarding the token.
    This endpoint is here for API completeness.
    """
    logger.info(f"User logged out: {current_user.email}")
    return {"message": "Successfully logged out"}
