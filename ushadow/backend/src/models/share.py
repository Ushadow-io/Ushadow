"""Share token models for conversation and resource sharing.

This module provides models for secure sharing of conversations and resources
with fine-grained access control compatible with Keycloak FGA policies.
"""

import logging
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from beanie import Document, Indexed, PydanticObjectId
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ResourceType(str, Enum):
    """Types of resources that can be shared."""

    CONVERSATION = "conversation"
    MEMORY = "memory"
    COLLECTION = "collection"


class SharePermission(str, Enum):
    """Permission levels for shared resources."""

    READ = "read"
    WRITE = "write"
    COMMENT = "comment"
    DELETE = "delete"
    ADMIN = "admin"


class KeycloakPolicy(BaseModel):
    """Keycloak-compatible authorization policy.

    Matches Mycelia's policy structure:
    {"resource": "conversation:123", "action": "read", "effect": "allow"}
    """

    resource: str = Field(..., description="Resource identifier (e.g., 'conversation:123')")
    action: str = Field(..., description="Action/permission (read, write, delete)")
    effect: str = Field(default="allow", description="Effect of policy (allow/deny)")

    model_config = {"extra": "forbid"}


class ShareToken(Document):
    """Share token for secure resource sharing.

    Stores information about shared resources including Keycloak-compatible
    policies for fine-grained access control. Supports both authenticated
    and anonymous sharing with optional expiration and view limits.
    """

    # Token identification
    token: Indexed(str, unique=True) = Field(  # type: ignore
        default_factory=lambda: str(uuid4()),
        description="Unique share token (UUID)",
    )

    # Resource identification
    resource_type: str = Field(..., description="Type of shared resource")
    resource_id: str = Field(..., description="ID of the shared resource")

    # Ownership
    created_by: PydanticObjectId = Field(..., description="User who created the share")

    # Keycloak-compatible policies
    policies: List[KeycloakPolicy] = Field(
        default_factory=list,
        description="Keycloak FGA policies for this share",
    )

    # Permissions (simplified view for API responses)
    permissions: List[str] = Field(
        default_factory=lambda: ["read"],
        description="Simplified permission list (read, write, etc.)",
    )

    # Access control
    require_auth: bool = Field(
        default=False,
        description="If True, user must authenticate to access share",
    )
    tailscale_only: bool = Field(
        default=False,
        description="If True, only accessible from Tailscale network",
    )
    allowed_emails: List[str] = Field(
        default_factory=list,
        description="If non-empty, only these emails can access (when require_auth=True)",
    )

    # Expiration and limits
    expires_at: Optional[datetime] = Field(
        default=None,
        description="When this share expires (None = never)",
    )
    max_views: Optional[int] = Field(
        default=None,
        description="Maximum number of views (None = unlimited)",
    )
    view_count: int = Field(default=0, description="Number of times accessed")

    # Audit trail
    last_accessed_at: Optional[datetime] = Field(
        default=None,
        description="Last time this share was accessed",
    )
    last_accessed_by: Optional[str] = Field(
        default=None,
        description="Last user/IP that accessed this share",
    )
    access_log: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Access audit log (timestamp, user/IP, action)",
    )

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Keycloak integration (populated when Keycloak is active)
    keycloak_policy_id: Optional[str] = Field(
        default=None,
        description="Keycloak policy ID if registered with Keycloak FGA",
    )
    keycloak_resource_id: Optional[str] = Field(
        default=None,
        description="Keycloak resource ID if registered",
    )

    class Settings:
        """Beanie document settings."""

        name = "share_tokens"
        indexes = [
            "token",  # Fast lookup by token
            "resource_type",
            "resource_id",
            "created_by",
            "expires_at",
            [("resource_type", 1), ("resource_id", 1)],  # Compound index
        ]

    def is_expired(self) -> bool:
        """Check if share token has expired."""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at

    def is_view_limit_exceeded(self) -> bool:
        """Check if view limit has been exceeded."""
        if self.max_views is None:
            return False
        return self.view_count >= self.max_views

    def can_access(self, user_email: Optional[str] = None) -> tuple[bool, str]:
        """Check if access is allowed.

        Args:
            user_email: Email of user trying to access (None for anonymous)

        Returns:
            Tuple of (allowed: bool, reason: str)
        """
        if self.is_expired():
            return False, "Share link has expired"

        if self.is_view_limit_exceeded():
            return False, "Share link view limit exceeded"

        if self.require_auth and user_email is None:
            return False, "Authentication required"

        if self.allowed_emails and user_email not in self.allowed_emails:
            return False, f"Access restricted to specific users"

        return True, "Access granted"

    def has_permission(self, permission: str) -> bool:
        """Check if token grants specific permission."""
        return permission in self.permissions

    async def record_access(
        self,
        user_identifier: str,
        action: str = "view",
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Record access to shared resource.

        Args:
            user_identifier: Email or IP address of accessor
            action: Action performed (view, edit, etc.)
            metadata: Additional context (user agent, IP, etc.)
        """
        self.view_count += 1
        self.last_accessed_at = datetime.utcnow()
        self.last_accessed_by = user_identifier
        self.updated_at = datetime.utcnow()

        # Add to audit log
        log_entry = {
            "timestamp": datetime.utcnow(),
            "user_identifier": user_identifier,
            "action": action,
            "view_count": self.view_count,
        }
        if metadata:
            log_entry["metadata"] = metadata

        self.access_log.append(log_entry)
        await self.save()


class ShareTokenCreate(BaseModel):
    """Request model for creating a share token."""

    resource_type: ResourceType = Field(..., description="Type of resource to share")
    resource_id: str = Field(..., min_length=1, description="ID of resource to share")

    permissions: List[SharePermission] = Field(
        default=[SharePermission.READ],
        description="Permissions to grant",
    )

    # Access control
    require_auth: bool = Field(
        default=False,
        description="Require authentication to access",
    )
    tailscale_only: bool = Field(
        default=False,
        description="Only accessible from Tailscale network",
    )
    allowed_emails: List[str] = Field(
        default_factory=list,
        description="Restrict access to specific email addresses",
    )

    # Expiration
    expires_in_days: Optional[int] = Field(
        default=None,
        ge=1,
        le=365,
        description="Number of days until expiration (None = never)",
    )
    max_views: Optional[int] = Field(
        default=None,
        ge=1,
        description="Maximum number of views (None = unlimited)",
    )

    model_config = {"extra": "forbid"}


class ShareTokenResponse(BaseModel):
    """Response model for share token information."""

    token: str
    share_url: str
    resource_type: str
    resource_id: str
    permissions: List[str]
    expires_at: Optional[datetime] = None
    max_views: Optional[int] = None
    view_count: int
    require_auth: bool
    tailscale_only: bool
    created_at: datetime

    model_config = {"extra": "forbid"}


class ShareAccessLog(BaseModel):
    """Access log entry for share token."""

    timestamp: datetime
    user_identifier: str
    action: str
    view_count: int
    metadata: Optional[Dict[str, Any]] = None

    model_config = {"extra": "forbid"}
