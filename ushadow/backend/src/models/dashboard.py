"""Dashboard models for activity monitoring and statistics."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ActivityType(str, Enum):
    """Types of system activities."""

    CONVERSATION = "conversation"
    MEMORY = "memory"


class ActivityEvent(BaseModel):
    """A single activity event in the system."""

    id: str = Field(..., description="Unique identifier for the activity")
    type: ActivityType = Field(..., description="Type of activity")
    title: str = Field(..., description="Human-readable title")
    description: Optional[str] = Field(None, description="Detailed description")
    timestamp: datetime = Field(..., description="When the activity occurred")
    metadata: dict[str, Any] = Field(
        default_factory=dict, description="Additional metadata"
    )
    source: Optional[str] = Field(
        None, description="Source service that generated this activity"
    )


class DashboardStats(BaseModel):
    """Aggregated statistics for the dashboard."""

    conversation_count: int = Field(0, description="Total number of conversations")
    memory_count: int = Field(0, description="Total number of memories")


class DashboardData(BaseModel):
    """Complete dashboard data including stats and recent activities."""

    stats: DashboardStats = Field(..., description="Dashboard statistics")
    recent_conversations: list[ActivityEvent] = Field(
        default_factory=list, description="Recent conversation activities"
    )
    recent_memories: list[ActivityEvent] = Field(
        default_factory=list, description="Recent memory activities"
    )
    last_updated: datetime = Field(
        default_factory=datetime.utcnow, description="When this data was generated"
    )
