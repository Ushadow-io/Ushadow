"""Share API endpoints for conversation and resource sharing.

Provides HTTP endpoints for creating, accessing, and managing share tokens.
Thin router layer that delegates to ShareService for business logic.
"""

import logging
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..database import get_database
from .tailscale import _read_config as read_tailscale_config
from ..models.share import (
    ShareAccessLog,
    ShareToken,
    ShareTokenCreate,
    ShareTokenResponse,
)
from ..models.user import User
from ..services.auth import get_current_user, get_optional_current_user
from ..services.share_service import ShareService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/share", tags=["sharing"])


def _get_share_base_url() -> str:
    """Determine the base URL for share links.

    Strategy hierarchy:
    1. SHARE_BASE_URL environment variable (highest priority)
    2. SHARE_PUBLIC_GATEWAY environment variable (for external sharing)
    3. Tailscale hostname (for Tailnet-only sharing)
    4. Fallback to localhost (development only)

    Returns:
        Base URL string (e.g., "https://ushadow.tail12345.ts.net" or "https://share.yourdomain.com")
    """
    # Explicit override (highest priority)
    if base_url := os.getenv("SHARE_BASE_URL"):
        logger.info(f"Using explicit SHARE_BASE_URL: {base_url}")
        return base_url.rstrip("/")

    # Public gateway for external sharing
    if gateway_url := os.getenv("SHARE_PUBLIC_GATEWAY"):
        logger.info(f"Using public gateway: {gateway_url}")
        return gateway_url.rstrip("/")

    # Use Tailscale hostname (works with or without Funnel)
    try:
        config = read_tailscale_config()
        if config and config.hostname:
            tailscale_url = f"https://{config.hostname}"
            logger.info(f"Using Tailscale hostname: {tailscale_url}")
            return tailscale_url
    except Exception as e:
        logger.warning(f"Failed to read Tailscale config: {e}")

    # Fallback for development
    logger.warning("Using localhost fallback - shares will only work locally!")
    return "http://localhost:3000"


def get_share_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> ShareService:
    """Dependency injection for ShareService.

    Args:
        db: MongoDB database (injected)

    Returns:
        ShareService instance
    """
    base_url = _get_share_base_url()
    logger.info(f"Share service initialized with base_url: {base_url}")
    return ShareService(db=db, base_url=base_url)


@router.post("/create", response_model=ShareTokenResponse, status_code=201)
async def create_share_token(
    data: ShareTokenCreate,
    current_user: User = Depends(get_current_user),
    service: ShareService = Depends(get_share_service),
) -> ShareTokenResponse:
    """Create a new share token for a resource.

    Requires authentication. User must have permission to share the resource.

    Args:
        data: Share token creation parameters
        current_user: Authenticated user
        service: Share service instance

    Returns:
        Created share token with share URL

    Raises:
        400: If resource doesn't exist or user lacks permission
        401: If not authenticated
    """
    try:
        share_token = await service.create_share_token(data, current_user)
        return service.to_response(share_token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{token}", response_model=dict)
async def access_shared_resource(
    token: str,
    request: Request,
    current_user: Optional[User] = Depends(get_optional_current_user),
    service: ShareService = Depends(get_share_service),
) -> dict:
    """Access a shared resource via share token.

    Public endpoint - does not require authentication unless share requires it.
    Records access in audit log.

    Args:
        token: Share token UUID
        request: HTTP request (for IP address)
        current_user: Optional authenticated user
        service: Share service instance

    Returns:
        Shared resource data with permissions

    Raises:
        403: If access denied (expired, limit exceeded, etc.)
        404: If share token not found
    """
    # Get user email if authenticated
    from src.utils.auth_helpers import get_user_email
    user_email = get_user_email(current_user) if current_user else None

    # Get request IP for Tailscale validation
    request_ip = request.client.host if request.client else None

    # Validate access
    is_valid, share_token, reason = await service.validate_share_access(
        token=token,
        user_email=user_email,
        request_ip=request_ip,
    )

    if not is_valid:
        if share_token is None:
            raise HTTPException(status_code=404, detail="Share token not found")
        raise HTTPException(status_code=403, detail=reason)

    # Record access
    user_identifier = user_email or request_ip or "anonymous"
    metadata = {
        "ip": request_ip,
        "user_agent": request.headers.get("user-agent"),
    }
    await service.record_share_access(
        share_token=share_token,
        user_identifier=user_identifier,
        action="view",
        metadata=metadata,
    )

    # TODO: Fetch actual resource data from Chronicle/Mycelia
    # For now, return share token info and placeholder resource
    return {
        "share_token": service.to_response(share_token).dict(),
        "resource": {
            "type": share_token.resource_type,
            "id": share_token.resource_id,
            # TODO: Add actual resource data here
            "data": f"Placeholder for {share_token.resource_type}:{share_token.resource_id}",
        },
        "permissions": share_token.permissions,
    }


@router.delete("/{token}", status_code=204)
async def revoke_share_token(
    token: str,
    current_user: User = Depends(get_current_user),
    service: ShareService = Depends(get_share_service),
):
    """Revoke a share token.

    Requires authentication. User must be the creator or admin.

    Args:
        token: Share token to revoke
        current_user: Authenticated user
        service: Share service instance

    Raises:
        403: If user lacks permission
        404: If share token not found
    """
    try:
        revoked = await service.revoke_share_token(token, current_user)
        if not revoked:
            raise HTTPException(status_code=404, detail="Share token not found")
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.get("/resource/{resource_type}/{resource_id}", response_model=List[ShareTokenResponse])
async def list_shares_for_resource(
    resource_type: str,
    resource_id: str,
    current_user: User = Depends(get_current_user),
    service: ShareService = Depends(get_share_service),
) -> List[ShareTokenResponse]:
    """List all share tokens for a resource.

    Requires authentication. User must have access to the resource.

    Args:
        resource_type: Type of resource (conversation, memory, etc.)
        resource_id: ID of resource
        current_user: Authenticated user
        service: Share service instance

    Returns:
        List of share tokens for the resource
    """
    share_tokens = await service.list_shares_for_resource(
        resource_type=resource_type,
        resource_id=resource_id,
        user=current_user,
    )
    return [service.to_response(token) for token in share_tokens]


@router.get("/{token}/logs", response_model=List[ShareAccessLog])
async def get_share_access_logs(
    token: str,
    current_user: User = Depends(get_current_user),
    service: ShareService = Depends(get_share_service),
) -> List[ShareAccessLog]:
    """Get access logs for a share token.

    Requires authentication. User must be creator or admin.

    Args:
        token: Share token
        current_user: Authenticated user
        service: Share service instance

    Returns:
        List of access log entries

    Raises:
        403: If user lacks permission
        404: If share token not found
    """
    try:
        return await service.get_share_access_logs(token, current_user)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=403, detail=str(e))


# Convenience endpoints for specific resource types

@router.post("/conversations/{conversation_id}", response_model=ShareTokenResponse, status_code=201)
async def share_conversation(
    conversation_id: str,
    data: ShareTokenCreate,
    current_user: User = Depends(get_current_user),
    service: ShareService = Depends(get_share_service),
) -> ShareTokenResponse:
    """Convenience endpoint for sharing a conversation.

    Automatically sets resource_type to 'conversation' and uses path parameter
    for resource_id. Otherwise identical to POST /api/share/create.

    Args:
        conversation_id: ID of conversation to share
        data: Share token parameters (resource_type/resource_id will be overridden)
        current_user: Authenticated user
        service: Share service instance

    Returns:
        Created share token with share URL
    """
    # Override resource type and ID from path
    data.resource_type = "conversation"
    data.resource_id = conversation_id

    try:
        share_token = await service.create_share_token(data, current_user)
        return service.to_response(share_token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/conversations/{conversation_id}/shares", response_model=List[ShareTokenResponse])
async def list_conversation_shares(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    service: ShareService = Depends(get_share_service),
) -> List[ShareTokenResponse]:
    """Convenience endpoint for listing shares of a conversation.

    Args:
        conversation_id: ID of conversation
        current_user: Authenticated user
        service: Share service instance

    Returns:
        List of share tokens for the conversation
    """
    share_tokens = await service.list_shares_for_resource(
        resource_type="conversation",
        resource_id=conversation_id,
        user=current_user,
    )
    return [service.to_response(token) for token in share_tokens]
