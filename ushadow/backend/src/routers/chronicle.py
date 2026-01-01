"""Chronicle integration proxy endpoints"""

import logging
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, HTTPException, Header, Query

logger = logging.getLogger(__name__)
router = APIRouter()

# Service defaults (could be moved to OmegaConf config later)
CHRONICLE_URL = "http://chronicle-backend:8000"
CHRONICLE_API_TIMEOUT = 30


def _get_auth_headers(authorization: Optional[str]) -> Dict[str, str]:
    """Build headers dict with auth if provided."""
    if authorization:
        return {"Authorization": authorization}
    return {}


@router.get("/status")
async def get_chronicle_status():
    """Get Chronicle backend status."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{CHRONICLE_URL}/health")
            return response.json()
    except Exception as e:
        logger.error(f"Failed to connect to Chronicle: {e}")
        raise HTTPException(
            status_code=503,
            detail="Chronicle backend is unavailable"
        )


@router.get("/conversations")
async def get_conversations(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    authorization: Optional[str] = Header(None),
):
    """Proxy request to Chronicle conversations endpoint."""
    try:
        headers = _get_auth_headers(authorization)
        async with httpx.AsyncClient(timeout=CHRONICLE_API_TIMEOUT) as client:
            response = await client.get(
                f"{CHRONICLE_URL}/api/conversations",
                params={"page": page, "limit": limit},
                headers=headers,
            )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("detail", "Chronicle API error"),
                )
            return response.json()
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Chronicle request timed out")
    except Exception as e:
        logger.error(f"Chronicle API error: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/memories")
async def get_memories(
    limit: int = Query(100, ge=1, le=500),
    authorization: Optional[str] = Header(None),
):
    """Proxy request to Chronicle memories endpoint."""
    try:
        headers = _get_auth_headers(authorization)
        async with httpx.AsyncClient(timeout=CHRONICLE_API_TIMEOUT) as client:
            response = await client.get(
                f"{CHRONICLE_URL}/api/memories",
                params={"limit": limit},
                headers=headers,
            )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("detail", "Chronicle API error"),
                )
            return response.json()
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Chronicle request timed out")
    except Exception as e:
        logger.error(f"Chronicle API error: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/memories/search")
async def search_memories(
    query: str,
    limit: int = Query(100, ge=1, le=500),
    authorization: Optional[str] = Header(None),
):
    """Proxy request to Chronicle memory search."""
    try:
        headers = _get_auth_headers(authorization)
        async with httpx.AsyncClient(timeout=CHRONICLE_API_TIMEOUT) as client:
            response = await client.get(
                f"{CHRONICLE_URL}/api/memories/search",
                params={"query": query, "limit": limit},
                headers=headers,
            )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("detail", "Chronicle API error"),
                )
            return response.json()
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Chronicle request timed out")
    except Exception as e:
        logger.error(f"Chronicle API error: {e}")
        raise HTTPException(status_code=502, detail=str(e))
