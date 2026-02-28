"""Routine and Timeline models — Beanie documents for MongoDB.

Routine: a named, repeatable sequence of activities with a goal.
RoutineSession: one recorded execution of a routine.
TimelineEvent: a single activity extracted from a session transcript.
RoutineFeedback: user feedback submitted after a recording session.
"""

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from beanie import Document
from pydantic import BaseModel, Field


# =============================================================================
# Embedded / value models (not top-level collections)
# =============================================================================


class LatLng(BaseModel):
    """Geographic coordinate."""
    lat: float
    lng: float


class LocationPoint(BaseModel):
    """GPS breadcrumb with timestamp."""
    lat: float
    lng: float
    timestamp: datetime
    accuracy_m: Optional[float] = None


# =============================================================================
# Beanie Documents
# =============================================================================


class Routine(Document):
    """A named, repeatable sequence of activities with a defined goal."""

    routine_id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str = Field(..., description="Owner (Keycloak email or sub)")
    name: str = Field(..., min_length=1, max_length=200)
    goal: str = Field(..., min_length=1, max_length=500, description="What the endpoint is")
    goal_type: str = Field(
        default="activity",
        description="time | location | activity",
    )
    goal_location: Optional[LatLng] = None
    goal_time: Optional[str] = Field(
        default=None, description="Target time in HH:MM format"
    )
    start_location: Optional[LatLng] = None
    tags: List[str] = Field(default_factory=list)
    archived: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "routines"
        indexes = [
            "user_id",
            "routine_id",
            [("user_id", 1), ("archived", 1), ("updated_at", -1)],
        ]


class RoutineSession(Document):
    """A single recorded execution of a routine."""

    session_id: str = Field(default_factory=lambda: str(uuid4()))
    routine_id: str = Field(..., description="Parent routine")
    user_id: str = Field(..., description="Owner")
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    status: str = Field(
        default="recording",
        description="recording | processing | complete | abandoned",
    )
    goal_reached: bool = False
    audio_source: str = Field(
        default="microphone", description="microphone | omi"
    )
    conversation_id: Optional[str] = Field(
        default=None, description="Chronicle/Mycelia conversation ID"
    )
    location_track: List[LocationPoint] = Field(default_factory=list)

    class Settings:
        name = "routine_sessions"
        indexes = [
            "session_id",
            "routine_id",
            "user_id",
            [("routine_id", 1), ("started_at", -1)],
            [("user_id", 1), ("status", 1)],
        ]


class TimelineEvent(Document):
    """A single activity extracted from a session transcript by the LLM."""

    event_id: str = Field(default_factory=lambda: str(uuid4()))
    session_id: str = Field(..., description="Parent session")
    activity: str = Field(..., description="Normalised activity name")
    category: str = Field(
        default="other",
        description="hygiene | food | clothing | organisation | transport | leisure | work | waiting | other",
    )
    started_at: datetime
    ended_at: datetime
    duration_seconds: float = 0
    location: Optional[LatLng] = None
    notes: Optional[str] = None
    sentiment: Optional[str] = Field(
        default=None,
        description="positive | neutral | negative | frustrated",
    )
    is_productive: bool = True
    is_transition: bool = False

    class Settings:
        name = "timeline_events"
        indexes = [
            "session_id",
            "event_id",
            [("session_id", 1), ("started_at", 1)],
        ]


class RoutineFeedback(Document):
    """User feedback submitted after a recording session."""

    feedback_id: str = Field(default_factory=lambda: str(uuid4()))
    session_id: str = Field(..., description="Parent session")
    user_id: str = Field(..., description="Owner")
    overall_rating: int = Field(..., ge=1, le=5)
    on_time: bool = False
    blockers: List[str] = Field(default_factory=list)
    blocker_details: Optional[str] = None
    mood: str = Field(
        default="ok", description="great | ok | stressed | rushed"
    )
    sleep_quality: Optional[int] = Field(default=None, ge=1, le=5)
    external_factors: List[str] = Field(default_factory=list)
    suggestions: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "routine_feedback"
        indexes = [
            "session_id",
            "user_id",
            "feedback_id",
        ]


# =============================================================================
# Request/Response Pydantic models (not persisted)
# =============================================================================


class RoutineCreate(BaseModel):
    """Request body for creating a routine."""
    name: str = Field(..., min_length=1, max_length=200)
    goal: str = Field(..., min_length=1, max_length=500)
    goal_type: str = Field(default="activity")
    goal_location: Optional[LatLng] = None
    goal_time: Optional[str] = None
    start_location: Optional[LatLng] = None
    tags: List[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class RoutineUpdate(BaseModel):
    """Request body for updating a routine."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    goal: Optional[str] = Field(default=None, min_length=1, max_length=500)
    goal_type: Optional[str] = None
    goal_location: Optional[LatLng] = None
    goal_time: Optional[str] = None
    start_location: Optional[LatLng] = None
    tags: Optional[List[str]] = None
    archived: Optional[bool] = None

    model_config = {"extra": "forbid"}


class SessionStart(BaseModel):
    """Request body for starting a recording session."""
    audio_source: str = Field(default="microphone", description="microphone | omi")
    conversation_id: Optional[str] = None

    model_config = {"extra": "forbid"}


class SessionEnd(BaseModel):
    """Request body for ending a recording session."""
    goal_reached: bool = False

    model_config = {"extra": "forbid"}


class FeedbackCreate(BaseModel):
    """Request body for submitting post-session feedback."""
    overall_rating: int = Field(..., ge=1, le=5)
    on_time: bool = False
    blockers: List[str] = Field(default_factory=list)
    blocker_details: Optional[str] = None
    mood: str = Field(default="ok")
    sleep_quality: Optional[int] = Field(default=None, ge=1, le=5)
    external_factors: List[str] = Field(default_factory=list)
    suggestions: Optional[str] = None

    model_config = {"extra": "forbid"}


class LocationAppend(BaseModel):
    """Request body for appending a GPS point to a session."""
    lat: float
    lng: float
    accuracy_m: Optional[float] = None

    model_config = {"extra": "forbid"}
