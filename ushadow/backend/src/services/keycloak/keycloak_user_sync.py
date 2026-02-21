"""
Keycloak User Synchronization

Syncs Keycloak users to MongoDB User collection for Chronicle compatibility.
Chronicle requires MongoDB ObjectIds for user_id, but Keycloak uses UUIDs.

This module creates/updates MongoDB User records for Keycloak-authenticated users.
"""

import logging
from typing import Optional
from beanie import PydanticObjectId

from src.models.user import User

logger = logging.getLogger(__name__)


async def get_or_create_user_from_keycloak(
    keycloak_sub: str,
    email: str,
    name: Optional[str] = None
) -> User:
    """
    Get or create a MongoDB User record for a Keycloak user.

    This ensures Keycloak users have a corresponding MongoDB ObjectId that
    Chronicle can use. The Keycloak subject ID is stored in keycloak_id field.

    Args:
        keycloak_sub: Keycloak user ID (UUID format)
        email: User's email address
        name: User's full name (optional)

    Returns:
        User: MongoDB User document with ObjectId

    Example:
        >>> user = await get_or_create_user_from_keycloak(
        ...     keycloak_sub="f47ac10b-58cc-4372-a567-0e02b2c3d479",
        ...     email="alice@example.com",
        ...     name="Alice Smith"
        ... )
        >>> str(user.id)  # MongoDB ObjectId: "507f1f77bcf86cd799439011"
    """
    # Try to find existing user by Keycloak ID
    user = await User.find_one(User.keycloak_id == keycloak_sub)

    if user:
        logger.info(f"[KC-USER-SYNC] Found existing user: {email} (MongoDB ID: {user.id})")
        logger.info(f"[KC-USER-SYNC] Name from Keycloak: '{name}', Current display_name: '{user.display_name}'")

        # Update display_name if it changed
        if name and user.display_name != name:
            logger.info(f"[KC-USER-SYNC] Updating display_name: {user.display_name} → {name}")
            user.display_name = name
            await user.save()
        elif not name:
            logger.warning(f"[KC-USER-SYNC] ⚠️ No name provided from Keycloak for {email}")
        else:
            logger.debug(f"[KC-USER-SYNC] Display name already matches, no update needed")

        return user

    # Try to find by email (might be a legacy user who logged in via Keycloak)
    user = await User.find_one(User.email == email)

    if user:
        logger.info(f"[KC-USER-SYNC] Found legacy user by email: {email}")
        logger.info(f"[KC-USER-SYNC] Linking to Keycloak ID: {keycloak_sub}")

        # Link to Keycloak
        user.keycloak_id = keycloak_sub
        # Update display_name if we have a proper name from Keycloak
        # (even if display_name was previously set to email)
        if name and (not user.display_name or user.display_name == email):
            logger.info(f"[KC-USER-SYNC] Updating display_name: {user.display_name} → {name}")
            user.display_name = name
        await user.save()

        return user

    # Create new user
    logger.info(f"[KC-USER-SYNC] Creating new user for Keycloak account: {email}")

    user = User(
        email=email,
        display_name=name or email,  # Fallback to email if no name provided
        keycloak_id=keycloak_sub,
        is_active=True,
        is_verified=True,  # Keycloak users are pre-verified
        is_superuser=False,  # Keycloak users are not admins by default
        hashed_password="",  # No password - auth is via Keycloak
    )

    await user.create()

    logger.info(f"[KC-USER-SYNC] ✓ Created user: {email} (MongoDB ID: {user.id})")

    return user


async def get_mongodb_user_id_for_keycloak_user(
    keycloak_sub: str,
    email: str,
    name: Optional[str] = None
) -> str:
    """
    Get MongoDB ObjectId string for a Keycloak user.

    This is a convenience wrapper around get_or_create_user_from_keycloak
    that returns just the ObjectId as a string (for use in JWT tokens).

    Args:
        keycloak_sub: Keycloak user ID (UUID)
        email: User's email
        name: User's full name (optional)

    Returns:
        str: MongoDB ObjectId as string (24 hex chars)
    """
    user = await get_or_create_user_from_keycloak(
        keycloak_sub=keycloak_sub,
        email=email,
        name=name
    )

    return str(user.id)
