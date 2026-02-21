"""User models for fastapi-users integration with Beanie and MongoDB.

This module provides the User model and related schemas for authentication.
ushadow serves as the central auth provider - tokens issued here are accepted
by other services (chronicle, etc.) that share the same AUTH_SECRET_KEY.
"""

import logging
from datetime import datetime
from typing import Optional

from beanie import Document, PydanticObjectId
from fastapi_users.db import BeanieBaseUser, BeanieUserDatabase
from fastapi_users.schemas import BaseUser, BaseUserCreate, BaseUserUpdate
from pydantic import ConfigDict, EmailStr, Field

logger = logging.getLogger(__name__)


class UserCreate(BaseUserCreate):
    """Schema for creating new users."""

    display_name: str = Field(..., min_length=1, max_length=100)
    is_superuser: Optional[bool] = False


class UserRead(BaseUser[PydanticObjectId]):
    """Schema for reading user data (API responses)."""

    display_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserUpdate(BaseUserUpdate):
    """Schema for updating user data."""

    display_name: Optional[str] = None

    def create_update_dict(self):
        """Create update dictionary for regular user operations."""
        update_dict = super().create_update_dict()
        if self.display_name is not None:
            update_dict["display_name"] = self.display_name
        return update_dict

    def create_update_dict_superuser(self):
        """Create update dictionary for superuser operations."""
        update_dict = super().create_update_dict_superuser()
        if self.display_name is not None:
            update_dict["display_name"] = self.display_name
        return update_dict


class User(BeanieBaseUser, Document):
    """User model extending fastapi-users BeanieBaseUser.
    
    Inherits from BeanieBaseUser:
        - id: PydanticObjectId (MongoDB ObjectId)
        - email: EmailStr
        - hashed_password: str
        - is_active: bool = True
        - is_superuser: bool = False
        - is_verified: bool = False
    """

    # Pydantic v2 configuration
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    # Custom fields
    display_name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Keycloak integration field
    keycloak_id: Optional[str] = Field(
        default=None,
        description="Keycloak user UUID (sub claim) for federated users"
    )

    class Settings:
        name = "users"  # MongoDB collection name
        email_collation = {"locale": "en", "strength": 2}  # Case-insensitive email

    @property
    def user_id(self) -> str:
        """Return string representation of MongoDB ObjectId."""
        return str(self.id)

    async def save(self, *args, **kwargs):
        """Override save to update the updated_at timestamp."""
        self.updated_at = datetime.utcnow()
        return await super().save(*args, **kwargs)


# Rebuild Pydantic model to ensure inherited fields are properly accessible
User.model_rebuild()


async def get_user_db():
    """Get the user database instance for dependency injection."""
    yield BeanieUserDatabase(User)


async def get_user_by_id(user_id: str) -> Optional[User]:
    """Get user by MongoDB ObjectId string."""
    try:
        return await User.get(PydanticObjectId(user_id))
    except Exception as e:
        logger.error(f"Failed to get user by ID {user_id}: {e}")
        return None


async def get_user_by_email(email: str) -> Optional[User]:
    """Get user by email address."""
    return await User.find_one(User.email == email)
