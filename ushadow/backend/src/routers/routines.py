"""Routines Router — CRUD for routines, sessions, feedback, and analysis.

Thin HTTP adapter: parses requests, calls services, returns responses.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from src.models.routine import (
    FeedbackCreate,
    LocationAppend,
    RoutineCreate,
    RoutineUpdate,
    SessionEnd,
    SessionStart,
)
from src.services.auth import get_current_user
from src.services.routine_analyser import get_routine_analyser
from src.services.routine_service import get_routine_service
from src.utils.auth_helpers import get_user_email

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Routines
# =============================================================================


@router.get("")
async def list_routines(
    include_archived: bool = Query(False),
    current_user=Depends(get_current_user),
):
    """List the current user's routines."""
    user_id = get_user_email(current_user)
    service = get_routine_service()
    routines = await service.list_routines(user_id, include_archived=include_archived)
    return {"routines": [r.model_dump() for r in routines]}


@router.post("", status_code=201)
async def create_routine(
    data: RoutineCreate,
    current_user=Depends(get_current_user),
):
    """Create a new routine."""
    user_id = get_user_email(current_user)
    service = get_routine_service()
    routine = await service.create_routine(user_id, data)
    return routine.model_dump()


@router.get("/{routine_id}")
async def get_routine(
    routine_id: str,
    current_user=Depends(get_current_user),
):
    """Get a single routine by ID."""
    user_id = get_user_email(current_user)
    service = get_routine_service()
    routine = await service.get_routine(routine_id, user_id)
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")
    return routine.model_dump()


@router.put("/{routine_id}")
async def update_routine(
    routine_id: str,
    data: RoutineUpdate,
    current_user=Depends(get_current_user),
):
    """Update a routine."""
    user_id = get_user_email(current_user)
    service = get_routine_service()
    routine = await service.update_routine(routine_id, user_id, data)
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")
    return routine.model_dump()


@router.delete("/{routine_id}", status_code=204)
async def archive_routine(
    routine_id: str,
    current_user=Depends(get_current_user),
):
    """Archive (soft-delete) a routine."""
    user_id = get_user_email(current_user)
    service = get_routine_service()
    if not await service.archive_routine(routine_id, user_id):
        raise HTTPException(status_code=404, detail="Routine not found")


# =============================================================================
# Sessions
# =============================================================================


@router.post("/{routine_id}/sessions", status_code=201)
async def start_session(
    routine_id: str,
    data: SessionStart,
    current_user=Depends(get_current_user),
):
    """Start a new recording session for a routine."""
    user_id = get_user_email(current_user)
    service = get_routine_service()
    session = await service.start_session(routine_id, user_id, data)
    if not session:
        raise HTTPException(status_code=404, detail="Routine not found")
    return session.model_dump()


@router.get("/{routine_id}/sessions")
async def list_sessions(
    routine_id: str,
    current_user=Depends(get_current_user),
):
    """List recording sessions for a routine."""
    user_id = get_user_email(current_user)
    service = get_routine_service()
    sessions = await service.list_sessions(routine_id, user_id)
    return {"sessions": [s.model_dump() for s in sessions]}


# =============================================================================
# Analysis
# =============================================================================


@router.get("/{routine_id}/trends")
async def get_trends(
    routine_id: str,
    current_user=Depends(get_current_user),
):
    """Get trend data (durations, activity averages, blockers) for charts."""
    user_id = get_user_email(current_user)
    analyser = get_routine_analyser()
    return await analyser.get_trends(routine_id, user_id)


@router.get("/{routine_id}/suggestions")
async def get_suggestions(
    routine_id: str,
    current_user=Depends(get_current_user),
):
    """Get LLM-powered optimisation suggestions for a routine."""
    user_id = get_user_email(current_user)
    analyser = get_routine_analyser()
    return await analyser.get_suggestions(routine_id, user_id)
