"""Sessions Router — Endpoints scoped to a session ID (not nested under routine).

Handles ending sessions, appending location data, and managing feedback.
These routes use /api/sessions/{id}/... so callers don't need the routine ID.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from src.models.routine import FeedbackCreate, LocationAppend, SessionEnd
from src.services.auth import get_current_user
from src.services.routine_service import get_routine_service
from src.utils.auth_helpers import get_user_email

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    current_user=Depends(get_current_user),
):
    """Get a session by ID."""
    user_id = get_user_email(current_user)
    service = get_routine_service()
    session = await service.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.model_dump()


@router.put("/{session_id}/end")
async def end_session(
    session_id: str,
    data: SessionEnd,
    current_user=Depends(get_current_user),
):
    """End a recording session."""
    user_id = get_user_email(current_user)
    service = get_routine_service()
    session = await service.end_session(session_id, user_id, data)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.model_dump()


@router.post("/{session_id}/location", status_code=204)
async def append_location(
    session_id: str,
    data: LocationAppend,
    current_user=Depends(get_current_user),
):
    """Append a GPS point to a recording session."""
    user_id = get_user_email(current_user)
    service = get_routine_service()
    if not await service.append_location(
        session_id, user_id, data.lat, data.lng, data.accuracy_m
    ):
        raise HTTPException(
            status_code=404,
            detail="Session not found or not recording",
        )


@router.post("/{session_id}/feedback", status_code=201)
async def submit_feedback(
    session_id: str,
    data: FeedbackCreate,
    current_user=Depends(get_current_user),
):
    """Submit post-session feedback."""
    user_id = get_user_email(current_user)
    service = get_routine_service()
    feedback = await service.submit_feedback(session_id, user_id, data)
    if not feedback:
        raise HTTPException(status_code=404, detail="Session not found")
    return feedback.model_dump()


@router.get("/{session_id}/feedback")
async def get_feedback(
    session_id: str,
    current_user=Depends(get_current_user),
):
    """Get feedback for a session."""
    user_id = get_user_email(current_user)
    service = get_routine_service()
    feedback = await service.get_feedback(session_id, user_id)
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return feedback.model_dump()
