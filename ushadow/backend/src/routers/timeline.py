"""Timeline Router — Extract and retrieve activity timelines from sessions.

Works for both routine sessions and general conversations.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.services.auth import get_current_user
from src.services.routine_service import get_routine_service
from src.services.timeline_extractor import get_timeline_extractor
from src.utils.auth_helpers import get_user_email

logger = logging.getLogger(__name__)
router = APIRouter()


class TimelineExtractRequest(BaseModel):
    """Request to extract a timeline from a transcript."""
    session_id: str = Field(..., description="RoutineSession ID to extract from")
    transcript: str = Field(..., min_length=10, description="Raw transcript text")
    routine_name: Optional[str] = Field(
        default=None, description="If set, uses routine-aware extraction"
    )
    goal: Optional[str] = Field(
        default=None, description="Routine goal for context"
    )

    model_config = {"extra": "forbid"}


@router.post("/extract")
async def extract_timeline(
    data: TimelineExtractRequest,
    current_user=Depends(get_current_user),
):
    """Extract a structured timeline from a transcript using the LLM.

    If routine_name and goal are provided, uses routine-specific prompting.
    Otherwise uses general conversation extraction.
    """
    user_id = get_user_email(current_user)
    service = get_routine_service()
    extractor = get_timeline_extractor()

    # Verify session ownership
    session = await service.get_session(data.session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if data.routine_name and data.goal:
        events = await extractor.extract_routine_timeline(
            session_id=data.session_id,
            transcript=data.transcript,
            routine_name=data.routine_name,
            goal=data.goal,
            start_time=session.started_at,
        )
    else:
        events = await extractor.extract_general_timeline(
            session_id=data.session_id,
            transcript=data.transcript,
            start_time=session.started_at,
        )

    # Mark session as complete now that timeline is built
    await service.mark_session_complete(data.session_id)

    return {
        "session_id": data.session_id,
        "event_count": len(events),
        "events": [e.model_dump() for e in events],
    }


@router.get("/sessions/{session_id}")
async def get_session_timeline(
    session_id: str,
    current_user=Depends(get_current_user),
):
    """Get the extracted timeline for a session."""
    user_id = get_user_email(current_user)
    service = get_routine_service()

    session = await service.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    extractor = get_timeline_extractor()
    events = await extractor.get_timeline(session_id)

    return {
        "session_id": session_id,
        "event_count": len(events),
        "events": [e.model_dump() for e in events],
    }
