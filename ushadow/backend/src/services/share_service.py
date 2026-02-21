"""Share service for conversation and resource sharing.

Implements business logic for creating, validating, and managing share tokens
with Keycloak Fine-Grained Authorization (FGA) integration.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Union
from uuid import uuid4

from beanie import PydanticObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.share import (
    KeycloakPolicy,
    ResourceType,
    ShareAccessLog,
    SharePermission,
    ShareToken,
    ShareTokenCreate,
    ShareTokenResponse,
)
from ..models.user import User
from ..utils.auth_helpers import get_user_id, get_user_email, is_superuser

logger = logging.getLogger(__name__)


class ShareService:
    """Service for managing share tokens and access control.

    Coordinates share token creation, validation, and Keycloak FGA integration.
    Implements business rules for expiration, view limits, and permission checking.
    """

    def __init__(self, db: AsyncIOMotorDatabase, base_url: str = "http://localhost:3000"):
        """Initialize share service.

        Args:
            db: MongoDB database instance
            base_url: Base URL for generating share links (e.g., "https://ushadow.example.com")
        """
        self.db = db
        self.base_url = base_url.rstrip("/")

    async def create_share_token(
        self,
        data: ShareTokenCreate,
        created_by: Union[User, dict],
    ) -> ShareToken:
        """Create a new share token.

        Args:
            data: Share token creation parameters
            created_by: User creating the share (User object or Keycloak dict)

        Returns:
            Created share token

        Raises:
            ValueError: If resource doesn't exist or user lacks permission
        """
        # TODO: Validate resource exists and user has permission to share it
        # This is a business logic decision point - should we verify ownership here?
        # Consider: strict ownership check vs. allowing sharing of any accessible resource
        await self._validate_resource_exists(data.resource_type, data.resource_id)
        await self._validate_user_can_share(created_by, data.resource_type, data.resource_id)

        # Calculate expiration
        expires_at = None
        if data.expires_in_days:
            expires_at = datetime.utcnow() + timedelta(days=data.expires_in_days)

        # Build Keycloak-compatible policies
        policies = self._build_keycloak_policies(
            resource_type=data.resource_type.value,
            resource_id=data.resource_id,
            permissions=[p.value for p in data.permissions],
        )

        # Create share token
        user_id = get_user_id(created_by)
        share_token = ShareToken(
            token=str(uuid4()),
            resource_type=data.resource_type.value,
            resource_id=data.resource_id,
            created_by=user_id,
            policies=policies,
            permissions=[p.value for p in data.permissions],
            require_auth=data.require_auth,
            tailscale_only=data.tailscale_only,
            allowed_emails=data.allowed_emails,
            expires_at=expires_at,
            max_views=data.max_views,
        )

        await share_token.insert()

        # TODO: Register with Keycloak FGA if enabled
        # await self._register_with_keycloak(share_token)

        logger.info(
            f"Created share token {share_token.token} for {data.resource_type}:{data.resource_id} "
            f"by user {get_user_email(created_by)}"
        )

        return share_token

    async def get_share_token(self, token: str) -> Optional[ShareToken]:
        """Get share token by token string.

        Args:
            token: Share token UUID

        Returns:
            ShareToken if found, None otherwise
        """
        return await ShareToken.find_one(ShareToken.token == token)

    async def validate_share_access(
        self,
        token: str,
        user_email: Optional[str] = None,
        request_ip: Optional[str] = None,
    ) -> tuple[bool, Optional[ShareToken], str]:
        """Validate access to a shared resource.

        Args:
            token: Share token string
            user_email: Email of user trying to access (None for anonymous)
            request_ip: IP address of request (for Tailscale validation)

        Returns:
            Tuple of (is_valid, share_token, reason)
        """
        share_token = await self.get_share_token(token)
        if not share_token:
            return False, None, "Invalid share token"

        # Check access permissions
        can_access, reason = share_token.can_access(user_email)
        if not can_access:
            return False, share_token, reason

        # TODO: Validate Tailscale network if required
        # This is a decision point - how should we verify Tailscale access?
        # Options: check IP ranges, validate via Tailscale API, trust reverse proxy headers
        if share_token.tailscale_only:
            is_tailscale = await self._validate_tailscale_access(request_ip)
            if not is_tailscale:
                return False, share_token, "Access restricted to Tailscale network"

        return True, share_token, "Access granted"

    async def record_share_access(
        self,
        share_token: ShareToken,
        user_identifier: str,
        action: str = "view",
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Record access to shared resource for audit trail.

        Args:
            share_token: Share token being accessed
            user_identifier: Email or IP of accessor
            action: Action performed (view, edit, etc.)
            metadata: Additional context (user agent, IP, etc.)
        """
        await share_token.record_access(user_identifier, action, metadata)
        logger.info(
            f"Recorded {action} access to share {share_token.token} "
            f"by {user_identifier} (view {share_token.view_count})"
        )

    async def revoke_share_token(self, token: str, user: Union[User, dict]) -> bool:
        """Revoke a share token.

        Args:
            token: Share token to revoke
            user: User attempting to revoke (User object or Keycloak dict)

        Returns:
            True if revoked, False if not found or permission denied

        Raises:
            ValueError: If user lacks permission to revoke
        """
        share_token = await self.get_share_token(token)
        if not share_token:
            return False

        # Verify user can revoke (must be creator or admin)
        user_id = get_user_id(user)
        if str(share_token.created_by) != user_id and not is_superuser(user):
            raise ValueError("Only the creator or admin can revoke share tokens")

        # TODO: Unregister from Keycloak FGA if enabled
        # await self._unregister_from_keycloak(share_token)

        await share_token.delete()
        logger.info(f"Revoked share token {token} by user {get_user_email(user)}")
        return True

    async def list_shares_for_resource(
        self,
        resource_type: str,
        resource_id: str,
        user: Union[User, dict],
    ) -> List[ShareToken]:
        """List all share tokens for a resource.

        Args:
            resource_type: Type of resource
            resource_id: ID of resource
            user: User requesting list (User object or Keycloak dict)

        Returns:
            List of share tokens
        """
        # TODO: Validate user has access to resource
        # await self._validate_user_can_access(user, resource_type, resource_id)

        return await ShareToken.find(
            ShareToken.resource_type == resource_type,
            ShareToken.resource_id == resource_id,
        ).to_list()

    async def get_share_access_logs(
        self,
        token: str,
        user: Union[User, dict],
    ) -> List[ShareAccessLog]:
        """Get access logs for a share token.

        Args:
            token: Share token
            user: User requesting logs (User object or Keycloak dict)

        Returns:
            List of access log entries

        Raises:
            ValueError: If user lacks permission
        """
        share_token = await self.get_share_token(token)
        if not share_token:
            raise ValueError("Share token not found")

        # Verify permission
        user_id = get_user_id(user)
        if str(share_token.created_by) != user_id and not is_superuser(user):
            raise ValueError("Only the creator or admin can view access logs")

        return [ShareAccessLog(**log) for log in share_token.access_log]

    def to_response(self, share_token: ShareToken) -> ShareTokenResponse:
        """Convert ShareToken to API response model.

        Args:
            share_token: Share token document

        Returns:
            ShareTokenResponse for API
        """
        return ShareTokenResponse(
            token=share_token.token,
            share_url=f"{self.base_url}/share/{share_token.token}",
            resource_type=share_token.resource_type,
            resource_id=share_token.resource_id,
            permissions=share_token.permissions,
            expires_at=share_token.expires_at,
            max_views=share_token.max_views,
            view_count=share_token.view_count,
            require_auth=share_token.require_auth,
            tailscale_only=share_token.tailscale_only,
            created_at=share_token.created_at,
        )

    # Private helper methods

    def _build_keycloak_policies(
        self,
        resource_type: str,
        resource_id: str,
        permissions: List[str],
    ) -> List[KeycloakPolicy]:
        """Build Keycloak FGA policies from permissions.

        Args:
            resource_type: Type of resource
            resource_id: ID of resource
            permissions: List of permission strings (read, write, etc.)

        Returns:
            List of Keycloak-compatible policies
        """
        # Resource identifier format: "type:id" (e.g., "conversation:123")
        resource = f"{resource_type}:{resource_id}"

        return [
            KeycloakPolicy(
                resource=resource,
                action=permission,
                effect="allow",
            )
            for permission in permissions
        ]

    async def _validate_resource_exists(
        self,
        resource_type: ResourceType,
        resource_id: str,
    ):
        """Validate that resource exists and is accessible.

        Args:
            resource_type: Type of resource
            resource_id: ID of resource

        Raises:
            ValueError: If resource doesn't exist
        """
        import httpx
        import os

        # Configuration: Enable/disable strict validation
        ENABLE_VALIDATION = os.getenv("SHARE_VALIDATE_RESOURCES", "false").lower() == "true"

        if not ENABLE_VALIDATION:
            # Lazy validation - skip check for faster share creation
            logger.debug(f"Skipping validation for {resource_type}:{resource_id} (SHARE_VALIDATE_RESOURCES=false)")
            return

        # Strict validation - verify resource exists
        logger.debug(f"Validating resource {resource_type}:{resource_id}")

        # TODO: YOUR IMPLEMENTATION (5-10 lines)
        # Implement validation logic based on your backend choice:
        #
        # For Mycelia (resource-based API):
        #   POST to /api/resource/tech.mycelia.objects with action: "get", id: resource_id
        #
        # For Chronicle (REST API):
        #   GET /api/conversations/{resource_id}
        #
        # Example structure:
        # if resource_type == ResourceType.CONVERSATION:
        #     # Your validation code here
        #     pass
        # elif resource_type == ResourceType.MEMORY:
        #     # Memory validation
        #     pass

        # Placeholder: Log that validation needs implementation
        logger.warning(
            f"Resource validation is enabled but not implemented for {resource_type}. "
            f"Add validation logic in share_service.py:_validate_resource_exists()"
        )

    async def _validate_user_can_share(
        self,
        user: Union[User, dict],
        resource_type: ResourceType,
        resource_id: str,
    ):
        """Validate user has permission to share resource.

        Business rule: If user can view the resource, they can share it.
        Access control is enforced at the view level, so authenticated users
        who can see a resource are allowed to share it.

        Args:
            user: User attempting to share (User object or Keycloak dict)
            resource_type: Type of resource
            resource_id: ID of resource
        """
        user_email = get_user_email(user)
        logger.debug(
            f"User {user_email} sharing {resource_type}:{resource_id} - "
            f"access already verified at view level"
        )

    async def _validate_tailscale_access(self, request_ip: Optional[str]) -> bool:
        """Validate request is from Tailscale network.

        Args:
            request_ip: IP address of request

        Returns:
            True if from Tailscale, False otherwise
        """
        import ipaddress
        import os

        # Configuration: Enable/disable Tailscale validation
        ENABLE_TAILSCALE_CHECK = os.getenv("SHARE_VALIDATE_TAILSCALE", "false").lower() == "true"

        if not ENABLE_TAILSCALE_CHECK:
            # Disabled - allow all IPs (useful for testing or when not using Tailscale)
            logger.debug(f"Tailscale validation disabled (SHARE_VALIDATE_TAILSCALE=false)")
            return True

        if not request_ip:
            logger.warning("No request IP provided for Tailscale validation")
            return False

        # TODO: YOUR IMPLEMENTATION (5-10 lines)
        # Choose your Tailscale validation strategy based on your setup:
        #
        # Option A - IP Range Check (if ushadow runs directly on Tailscale):
        #   try:
        #       ip = ipaddress.ip_address(request_ip)
        #       tailscale_range = ipaddress.ip_network("100.64.0.0/10")
        #       is_tailscale = ip in tailscale_range
        #       logger.debug(f"IP {request_ip} {'is' if is_tailscale else 'is NOT'} in Tailscale range")
        #       return is_tailscale
        #   except ValueError:
        #       logger.warning(f"Invalid IP address: {request_ip}")
        #       return False
        #
        # Option B - Trust Tailscale Serve Headers (if using Tailscale Serve):
        #   # This requires passing the Request object instead of just IP
        #   # tailscale_user = request.headers.get("X-Tailscale-User")
        #   # return tailscale_user is not None
        #
        # For now, log a warning and allow (fail open for testing)
        logger.warning(
            f"Tailscale validation enabled but not implemented. "
            f"Add logic in share_service.py:_validate_tailscale_access(). "
            f"IP: {request_ip}"
        )
        return True  # Fail open until implemented

    async def _register_with_keycloak(self, share_token: ShareToken):
        """Register share token with Keycloak FGA.

        Args:
            share_token: Share token to register
        """
        # TODO: Implement Keycloak FGA registration
        # This should:
        # 1. Create Keycloak resource for the shared item
        # 2. Create Keycloak authorization policies
        # 3. Store keycloak_policy_id and keycloak_resource_id on share_token
        logger.debug(f"Keycloak FGA registration for token {share_token.token}")

    async def _unregister_from_keycloak(self, share_token: ShareToken):
        """Unregister share token from Keycloak FGA.

        Args:
            share_token: Share token to unregister
        """
        # TODO: Implement Keycloak FGA cleanup
        # This should delete the Keycloak resource and policies
        if share_token.keycloak_policy_id:
            logger.debug(f"Keycloak FGA cleanup for policy {share_token.keycloak_policy_id}")
