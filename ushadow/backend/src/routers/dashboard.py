"""
Dashboard API - Recent conversations and memories from Chronicle.

Provides unified dashboard data showing recent system activity.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from src.models.dashboard import DashboardData
from src.services.dashboard_service import DashboardService, get_dashboard_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=DashboardData)
async def get_dashboard_data(
    conversation_limit: int = Query(10, ge=1, le=50),
    memory_limit: int = Query(10, ge=1, le=50),
    service: DashboardService = Depends(get_dashboard_service),
) -> DashboardData:
    """
    Get complete dashboard data.

    Fetches recent conversations and memories from Chronicle.

    Args:
        conversation_limit: Max conversations to return (1-50)
        memory_limit: Max memories to return (1-50)

    Returns:
        Dashboard data with stats and recent activities
    """
    try:
        return await service.get_dashboard_data(
            conversation_limit=conversation_limit,
            memory_limit=memory_limit,
        )
    except Exception as e:
        logger.error(f"Failed to fetch dashboard data: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch dashboard data"
        )
