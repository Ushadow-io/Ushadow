"""
Minimal models for share gateway.

These are lightweight versions of the full ShareToken model,
containing only what's needed for validation.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class ShareToken(BaseModel):
    """Share token model (read-only)."""

    token: str
    resource_type: str
    resource_id: str
    permissions: List[str]
    require_auth: bool
    tailscale_only: bool
    expires_at: Optional[datetime] = None
    max_views: Optional[int] = None
    view_count: int = 0

    def is_expired(self) -> bool:
        """Check if token has expired."""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at

    def is_view_limit_exceeded(self) -> bool:
        """Check if view limit exceeded."""
        if self.max_views is None:
            return False
        return self.view_count >= self.max_views


class ShareTokenResponse(BaseModel):
    """API response model."""

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
