"""Chronicle integration proxy endpoints"""

import logging
from typing import Any, Dict

import httpx
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter()

# Service defaults (could be moved to OmegaConf config later)
CHRONICLE_URL = "http://chronicle-backend:8000"
CHRONICLE_API_TIMEOUT = 30


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
async def get_conversations():
    """Proxy request to Chronicle conversations endpoint."""
    try:
        async with httpx.AsyncClient(timeout=CHRONICLE_API_TIMEOUT) as client:
            response = await client.get(f"{CHRONICLE_URL}/api/conversations")
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Chronicle request timed out")
    except Exception as e:
        logger.error(f"Chronicle API error: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/memories/search")
async def search_memories(query: str):
    """Proxy request to Chronicle memory search."""
    try:
        async with httpx.AsyncClient(timeout=CHRONICLE_API_TIMEOUT) as client:
            response = await client.get(
                f"{CHRONICLE_URL}/api/memories/search",
                params={"query": query}
            )
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Chronicle request timed out")
    except Exception as e:
        logger.error(f"Chronicle API error: {e}")
        raise HTTPException(status_code=502, detail=str(e))
