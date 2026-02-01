"""Kanban ticket models for integrated task management with tmux.

This module provides models for kanban boards, tickets, and epics that integrate
directly with the launcher's tmux and worktree management.

Key Features:
- Tickets linked to tmux windows for context preservation
- Epic-based grouping for related tickets
- Tag-based context sharing for ad-hoc relationships
- Color teams for visual organization
- Shared branches for collaborative tickets
"""

import logging
from datetime import datetime
from enum import Enum
from typing import Optional, List

from beanie import Document, PydanticObjectId, Link
from pydantic import ConfigDict, Field, BaseModel

logger = logging.getLogger(__name__)


class TicketStatus(str, Enum):
    """Ticket workflow status."""
    BACKLOG = "backlog"
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    DONE = "done"
    ARCHIVED = "archived"


class TicketPriority(str, Enum):
    """Ticket priority levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class Epic(Document):
    """Epic for grouping related tickets with shared context.

    Epics enable:
    - Logical grouping of related tickets
    - Shared branch across all tickets in the epic
    - Unified color team for visual organization
    - Context sharing (all tickets access same worktree)
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    # Core fields
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None

    # Color team (hex color for UI)
    color: str = Field(default="#3B82F6")  # Default blue

    # Branch management
    branch_name: Optional[str] = None  # Shared branch for all tickets
    base_branch: str = Field(default="main")  # Branch to fork from

    # Project association
    project_id: Optional[str] = None  # Links to launcher project

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[PydanticObjectId] = None  # User who created epic

    class Settings:
        name = "epics"

    async def save(self, *args, **kwargs):
        """Override save to update timestamp."""
        self.updated_at = datetime.utcnow()
        return await super().save(*args, **kwargs)


class Ticket(Document):
    """Kanban ticket with tmux and worktree integration.

    Each ticket represents a unit of work that:
    - Has exactly one tmux window (1:1 mapping)
    - May belong to an epic (shared branch)
    - Has tags for ad-hoc context sharing
    - Uses color from epic or generates own color
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    # Core fields
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    status: TicketStatus = Field(default=TicketStatus.TODO)
    priority: TicketPriority = Field(default=TicketPriority.MEDIUM)

    # Epic relationship (optional)
    epic_id: Optional[PydanticObjectId] = None
    epic: Optional[Link[Epic]] = None

    # Tags for context sharing
    tags: List[str] = Field(default_factory=list)

    # Color team (inherited from epic or unique)
    color: Optional[str] = None  # If None, inherit from epic or generate

    # Tmux integration
    tmux_window_name: Optional[str] = None  # e.g., "ushadow-ticket-123"
    tmux_session_name: Optional[str] = None  # Usually project name

    # Worktree/branch integration
    branch_name: Optional[str] = None  # Own branch or epic's shared branch
    worktree_path: Optional[str] = None  # Path to worktree on filesystem

    # Environment association
    environment_name: Optional[str] = None  # Links to launcher environment
    project_id: Optional[str] = None  # Links to launcher project

    # Assignment
    assigned_to: Optional[PydanticObjectId] = None  # User assigned to ticket

    # Ordering
    order: int = Field(default=0)  # For custom ordering within status column

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[PydanticObjectId] = None

    class Settings:
        name = "tickets"
        indexes = [
            "status",
            "epic_id",
            "project_id",
            "tags",
            "assigned_to",
        ]

    async def save(self, *args, **kwargs):
        """Override save to update timestamp."""
        self.updated_at = datetime.utcnow()
        return await super().save(*args, **kwargs)

    @property
    def ticket_id_str(self) -> str:
        """Return short ticket ID for display (last 6 chars)."""
        return str(self.id)[-6:]

    async def get_effective_color(self) -> str:
        """Get the color to use for this ticket (own or epic's)."""
        if self.color:
            return self.color

        if self.epic_id and self.epic:
            epic = await self.epic.fetch()
            return epic.color if epic else self._generate_color()

        return self._generate_color()

    def _generate_color(self) -> str:
        """Generate a color based on ticket ID hash."""
        # Simple hash-based color generation
        id_hash = hash(str(self.id))
        hue = id_hash % 360
        return f"hsl({hue}, 70%, 60%)"

    async def get_effective_branch(self) -> Optional[str]:
        """Get the branch to use (own or epic's shared branch)."""
        if self.branch_name:
            return self.branch_name

        if self.epic_id and self.epic:
            epic = await self.epic.fetch()
            return epic.branch_name if epic else None

        return None


# Pydantic schemas for API requests/responses

class EpicCreate(BaseModel):
    """Schema for creating a new epic."""
    title: str
    description: Optional[str] = None
    color: Optional[str] = None
    base_branch: str = "main"
    project_id: Optional[str] = None


class EpicRead(BaseModel):
    """Schema for reading epic data."""
    id: PydanticObjectId
    title: str
    description: Optional[str]
    color: str
    branch_name: Optional[str]
    base_branch: str
    project_id: Optional[str]
    created_at: datetime
    updated_at: datetime


class EpicUpdate(BaseModel):
    """Schema for updating epic data."""
    title: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    branch_name: Optional[str] = None


class TicketCreate(BaseModel):
    """Schema for creating a new ticket."""
    title: str
    description: Optional[str] = None
    status: TicketStatus = TicketStatus.TODO
    priority: TicketPriority = TicketPriority.MEDIUM
    epic_id: Optional[str] = None
    tags: List[str] = []
    color: Optional[str] = None
    project_id: Optional[str] = None
    assigned_to: Optional[str] = None


class TicketRead(BaseModel):
    """Schema for reading ticket data."""
    id: PydanticObjectId
    title: str
    description: Optional[str]
    status: TicketStatus
    priority: TicketPriority
    epic_id: Optional[PydanticObjectId]
    tags: List[str]
    color: Optional[str]
    tmux_window_name: Optional[str]
    tmux_session_name: Optional[str]
    branch_name: Optional[str]
    worktree_path: Optional[str]
    environment_name: Optional[str]
    project_id: Optional[str]
    assigned_to: Optional[PydanticObjectId]
    order: int
    created_at: datetime
    updated_at: datetime


class TicketUpdate(BaseModel):
    """Schema for updating ticket data."""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TicketStatus] = None
    priority: Optional[TicketPriority] = None
    epic_id: Optional[str] = None
    tags: Optional[List[str]] = None
    color: Optional[str] = None
    assigned_to: Optional[str] = None
    order: Optional[int] = None
