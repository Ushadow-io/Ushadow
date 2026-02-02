"""
Docker API - Minimal Docker daemon status endpoint.

Service-related operations are now in /api/services.
This router only provides Docker daemon availability check.
"""

import logging

from fastapi import APIRouter, Depends

from src.services.docker_manager import get_docker_manager
from src.services.auth import get_current_user
from src.services.keycloak_auth import get_current_user_hybrid
from src.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/status")
async def get_docker_status(
    current_user: User = Depends(get_current_user_hybrid)
):
    """
    Check if Docker daemon is available.

    Note: Service-related operations have moved to /api/services.
    Use:
    - GET /api/services/status - all services status
    - GET /api/services/{name}/docker - container details
    - POST /api/services/{name}/start - start service
    """
    docker_manager = get_docker_manager()
    return {
        "available": docker_manager.is_available(),
        "message": "Docker is available" if docker_manager.is_available() else "Docker is not available"
    }
