"""Voice message endpoints with Keycloak-based sharing.

This router demonstrates how voice message sharing works with Keycloak:
1. User uploads voice message → Creates Keycloak resource
2. User shares message → Creates permission in Keycloak
3. Recipient accesses message → Validates permission via Keycloak
4. User revokes share → Deletes permission in Keycloak

Example flow:
    POST /voice-messages (upload)
    POST /voice-messages/{id}/share (share with bob@example.com)
    GET  /voice-messages/{id} (bob accesses with his token)
    DELETE /voice-messages/{id}/shares/{user_id} (revoke bob's access)
"""

import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel, EmailStr

from src.services.keycloak_auth import (
    KeycloakUser,
    get_current_user_keycloak,
    create_voice_message_resource,
    grant_voice_message_access,
    revoke_voice_message_access,
    check_voice_message_access,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice-messages", tags=["voice-messages"])


# Models

class VoiceMessageCreate(BaseModel):
    """Request to create a voice message."""
    title: Optional[str] = None
    description: Optional[str] = None


class VoiceMessageShare(BaseModel):
    """Request to share a voice message."""
    email: EmailStr
    scopes: list[str] = ["view"]  # Permissions: view, share, delete
    expires_at: Optional[datetime] = None  # Optional expiration


class VoiceMessageShareResponse(BaseModel):
    """Response after sharing."""
    share_link: str
    recipient_email: str
    scopes: list[str]
    expires_at: Optional[datetime] = None


class VoiceMessage(BaseModel):
    """Voice message metadata."""
    id: str
    owner_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    duration_seconds: float
    file_path: str
    created_at: datetime
    can_view: bool = False
    can_share: bool = False
    can_delete: bool = False


# Endpoints

@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_voice_message(
    file: UploadFile = File(...),
    metadata: VoiceMessageCreate = Depends(),
    user: KeycloakUser = Depends(get_current_user_keycloak),
):
    """Upload a new voice message.

    Steps:
    1. Save audio file to storage
    2. Create database record
    3. Register as protected resource in Keycloak
    4. Grant owner full permissions

    Returns:
        Voice message metadata
    """
    # TODO: Save file to storage (S3, local, etc.)
    message_id = "msg-" + datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    file_path = f"/storage/voice-messages/{user.sub}/{message_id}.webm"

    # TODO: Save metadata to database
    # await VoiceMessageModel.create(...)

    # Register with Keycloak authorization service
    await create_voice_message_resource(
        message_id=message_id,
        owner_user_id=user.sub,
    )

    logger.info(f"Voice message uploaded: {message_id} by {user.email}")

    return {
        "id": message_id,
        "owner_id": user.sub,
        "title": metadata.title,
        "file_path": file_path,
        "message": "Voice message uploaded successfully",
    }


@router.post("/{message_id}/share", response_model=VoiceMessageShareResponse)
async def share_voice_message(
    message_id: str,
    share_request: VoiceMessageShare,
    user: KeycloakUser = Depends(get_current_user_keycloak),
):
    """Share a voice message with another user.

    The owner (or someone with 'share' permission) can grant access to others.
    This creates a permission in Keycloak that allows the recipient to access
    the message.

    Args:
        message_id: Voice message ID
        share_request: Email and permissions to grant

    Returns:
        Share link and metadata

    Raises:
        403: If user doesn't own the message or lack 'share' permission
        404: If message doesn't exist
    """
    # TODO: Check if user has permission to share this message
    can_share = await check_voice_message_access(message_id, user, "share")
    if not can_share:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to share this message"
        )

    # TODO: Look up recipient user by email in Keycloak
    # For now, assume we have the user_id
    recipient_user_id = "keycloak-user-id-from-email-lookup"

    # Grant permission in Keycloak
    success = await grant_voice_message_access(
        message_id=message_id,
        user_id=recipient_user_id,
        scopes=share_request.scopes,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create share permission"
        )

    # Generate share link (recipient uses their own auth token)
    share_link = f"https://ushadow.app/voice-messages/{message_id}"

    logger.info(
        f"Voice message {message_id} shared by {user.email} "
        f"with {share_request.email} (scopes: {share_request.scopes})"
    )

    return VoiceMessageShareResponse(
        share_link=share_link,
        recipient_email=share_request.email,
        scopes=share_request.scopes,
        expires_at=share_request.expires_at,
    )


@router.get("/{message_id}")
async def get_voice_message(
    message_id: str,
    user: KeycloakUser = Depends(get_current_user_keycloak),
):
    """Get voice message metadata and audio file.

    Access is granted if:
    - User is the owner, OR
    - User has been granted 'view' permission via sharing

    Returns:
        Voice message metadata with access URL
    """
    # Check permission via Keycloak
    can_view = await check_voice_message_access(message_id, user, "view")

    if not can_view:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this message"
        )

    # TODO: Load from database
    message = VoiceMessage(
        id=message_id,
        owner_id="owner-keycloak-id",
        title="Example Voice Message",
        duration_seconds=45.3,
        file_path=f"/storage/voice-messages/{message_id}.webm",
        created_at=datetime.utcnow(),
        can_view=True,
        can_share=await check_voice_message_access(message_id, user, "share"),
        can_delete=await check_voice_message_access(message_id, user, "delete"),
    )

    return message


@router.delete("/{message_id}/shares/{recipient_user_id}")
async def revoke_share(
    message_id: str,
    recipient_user_id: str,
    user: KeycloakUser = Depends(get_current_user_keycloak),
):
    """Revoke a user's access to a voice message.

    Only the owner or someone with 'delete' permission can revoke shares.

    Args:
        message_id: Voice message ID
        recipient_user_id: Keycloak user ID to revoke access from
    """
    # Check if user can manage permissions
    can_delete = await check_voice_message_access(message_id, user, "delete")
    if not can_delete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to revoke access"
        )

    # Revoke permission in Keycloak
    success = await revoke_voice_message_access(
        message_id=message_id,
        user_id=recipient_user_id,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to revoke access"
        )

    logger.info(f"Access revoked for user {recipient_user_id} to message {message_id}")

    return {"message": "Access revoked successfully"}


# ─────────────────────────────────────────────────────────────────────
# LEARNING OPPORTUNITY: Implement permission check strategy
# ─────────────────────────────────────────────────────────────────────
#
# The check_voice_message_access() function in keycloak_auth.py is currently
# a stub. There are multiple ways to implement it:
#
# Option 1: Token-based (UMA pattern)
#   - Request a token with permissions from Keycloak
#   - Cache the token for subsequent requests
#   - Pros: Standard UMA pattern, secure
#   - Cons: Extra round-trip to Keycloak
#
# Option 2: Pre-loaded permissions
#   - Fetch all user permissions when they log in
#   - Store in token claims or cache
#   - Pros: Fast, no extra requests
#   - Cons: Doesn't reflect real-time permission changes
#
# Option 3: Direct API check
#   - Query Keycloak for each access check
#   - Pros: Always up-to-date, simple
#   - Cons: Can be slow for many messages
#
# Which approach fits your use case best? Consider:
# - How often do permissions change?
# - How many voice messages does a typical user access?
# - Is eventual consistency acceptable (user might see message for a few
#   seconds after revocation)?
