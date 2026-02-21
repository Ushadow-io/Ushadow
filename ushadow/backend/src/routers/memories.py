"""
Unified memory routing layer for ushadow.

This module provides a single API for querying memories across different sources:
- OpenMemory (shared between Chronicle and Mycelia)
- Mycelia native memory system
- Chronicle native memory system (Qdrant)

The routing is source-aware and queries the appropriate backend(s).
"""
import logging
from typing import List, Literal, Optional, Dict, Any
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Depends, Query

from src.utils.auth_helpers import get_user_email
from pydantic import BaseModel

from src.services.auth import get_current_user
from src.models.user import User

from src.config import get_localhost_proxy_url

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/memories", tags=["memories"])


class MemoryItem(BaseModel):
    """Unified memory response format"""
    id: str
    content: str
    created_at: str
    metadata: dict
    source: Literal["openmemory", "mycelia", "chronicle"]  # Which system it came from
    score: Optional[float] = None


class ConversationMemoriesResponse(BaseModel):
    """Response for conversation memories query"""
    conversation_id: str
    conversation_source: Literal["chronicle", "mycelia"]
    memories: List[MemoryItem]
    count: int
    sources_queried: List[str]  # Which memory systems were checked


class UserInterestsResponse(BaseModel):
    """Response for user interests query"""
    user_id: str
    interests: List[str]  # Top interests
    sentiment: Dict[str, str]  # Interest -> sentiment mapping
    intensity: Dict[str, str]  # Interest -> intensity mapping
    trending: List[str]  # Interests mentioned more recently
    content_types: List[str]  # Preferred content formats
    interest_counts: Dict[str, int]  # Interest -> count mapping
    days_analyzed: int  # Number of days analyzed


class MemoriesFilterRequest(BaseModel):
    """Request for filtering memories by metadata"""
    user_id: Optional[str] = None
    from_date: Optional[int] = None  # Unix timestamp
    to_date: Optional[int] = None  # Unix timestamp
    search_query: Optional[str] = None
    app_ids: Optional[List[str]] = None
    category_ids: Optional[List[str]] = None
    page: int = 1
    size: int = 100


class MemoriesFilterResponse(BaseModel):
    """Response for filtered memories query"""
    items: List[MemoryItem]
    total: int
    page: int
    size: int
    pages: int


@router.get("/{memory_id}")
async def get_memory_by_id(
    memory_id: str,
    current_user: User = Depends(get_current_user)
) -> MemoryItem:
    """
    Get a single memory by ID from any memory source.

    Searches across all available memory backends (OpenMemory, Chronicle, Mycelia)
    and returns the first match found.

    Args:
        memory_id: The memory ID to retrieve
        current_user: Authenticated user (from JWT)

    Returns:
        Memory item with full details

    Access Control:
        - Regular users: Only their own memories
        - Admins: All memories

    Raises:
        HTTPException: 404 if memory not found
    """
    # Try each memory source in priority order
    sources_tried = []

    # 1. Try OpenMemory first (most common source)
    try:
        openmemory_url = get_localhost_proxy_url("mem0")
        logger.info(f"[MEMORIES] Querying OpenMemory for memory {memory_id}")
        sources_tried.append("openmemory")

        async with httpx.AsyncClient() as client:
            # Get specific memory by ID
            response = await client.get(
                f"{openmemory_url}/api/v1/memories/{memory_id}",
                params={"user_id": get_user_email(current_user), "output_format": "v1.1"}
            )

            if response.status_code == 200:
                data = response.json()
                # Validate access
                metadata = data.get("metadata_", {})
                memory_user_email = metadata.get("chronicle_user_email") or metadata.get("user_email")

                if memory_user_email == get_user_email(current_user) or not memory_user_email:
                    logger.info(f"[MEMORIES] Found memory in OpenMemory")
                    # OpenMemory uses 'text' field for content
                    content = data.get("text") or data.get("content", "")
                    # Include categories in metadata if they exist
                    if "categories" in data and data["categories"]:
                        metadata["categories"] = data["categories"]
                    return MemoryItem(
                        id=str(data.get("id")),
                        content=content,
                        created_at=str(data.get("created_at", "")),
                        metadata=metadata,
                        source="openmemory",
                        score=None
                    )
    except Exception as e:
        logger.error(f"[MEMORIES] OpenMemory query failed: {e}", exc_info=True)

    # 2. Try Chronicle native memory system
    try:
        chronicle_url = get_localhost_proxy_url("chronicle-backend")
        logger.info(f"[MEMORIES] Querying Chronicle for memory {memory_id}")
        sources_tried.append("chronicle")

        async with httpx.AsyncClient() as client:
            # Try Chronicle's memory endpoint if it exists
            response = await client.get(f"{chronicle_url}/api/memories/{memory_id}")

            if response.status_code == 200:
                data = response.json()
                logger.info(f"[MEMORIES] Found memory in Chronicle")
                return MemoryItem(
                    id=data.get("id"),
                    content=data.get("content"),
                    created_at=data.get("created_at"),
                    metadata=data.get("metadata", {}),
                    source="chronicle",
                    score=data.get("score")
                )
    except Exception as e:
        logger.error(f"[MEMORIES] Chronicle query failed: {e}", exc_info=True)

    # 3. Try Mycelia native memory system
    try:
        mycelia_url = get_localhost_proxy_url("mycelia-backend")
        logger.info(f"[MEMORIES] Querying Mycelia for memory {memory_id}")
        sources_tried.append("mycelia")

        async with httpx.AsyncClient() as client:
            response = await client.get(f"{mycelia_url}/api/memories/{memory_id}")

            if response.status_code == 200:
                data = response.json()
                logger.info(f"[MEMORIES] Found memory in Mycelia")
                return MemoryItem(
                    id=data.get("id"),
                    content=data.get("content"),
                    created_at=data.get("created_at"),
                    metadata=data.get("metadata", {}),
                    source="mycelia",
                    score=data.get("score")
                )
    except Exception as e:
        logger.error(f"[MEMORIES] Mycelia query failed: {e}", exc_info=True)

    # Memory not found in any source
    logger.warning(f"[MEMORIES] Memory {memory_id} not found in any source (tried: {sources_tried})")
    raise HTTPException(
        status_code=404,
        detail=f"Memory {memory_id} not found (searched: {', '.join(sources_tried)})"
    )


@router.get("/by-conversation/{conversation_id}")
async def get_memories_by_conversation(
    conversation_id: str,
    conversation_source: Literal["chronicle", "mycelia"] = Query(..., description="Which backend has the conversation"),
    current_user: User = Depends(get_current_user)
) -> ConversationMemoriesResponse:
    """
    Get all memories associated with a conversation across all memory sources.

    This endpoint queries multiple memory backends and aggregates results:
    1. OpenMemory (if available) - checks source_id metadata
    2. Source-specific backend (Chronicle/Mycelia native)

    Args:
        conversation_id: The conversation ID to query
        conversation_source: Which backend has this conversation ("chronicle" or "mycelia")
        current_user: Authenticated user (from JWT)

    Returns:
        Aggregated memories from all sources with source attribution

    Access Control:
        - Regular users: Only their own conversation memories
        - Admins: All conversation memories
    """
    all_memories = []
    sources_queried = []

    # Strategy: Query all available memory sources and aggregate

    # 1. Try OpenMemory (shared memory system)
    try:
        # Use proxy URL - same method as frontend memoriesApi.getServerUrl()
        openmemory_url = get_localhost_proxy_url("mem0")
        logger.info(f"[MEMORIES] Querying OpenMemory via proxy at: {openmemory_url}")
        sources_queried.append("openmemory")
        openmemory_memories = await _query_openmemory_by_source_id(
            openmemory_url,
            conversation_id,
            get_user_email(current_user)  # OpenMemory uses email as user_id
        )
        logger.info(f"[MEMORIES] OpenMemory returned {len(openmemory_memories)} memories")
        all_memories.extend(openmemory_memories)
    except Exception as e:
        # OpenMemory not available or query failed - continue with other sources
        logger.error(f"[MEMORIES] OpenMemory query failed: {e}", exc_info=True)

    # 2. Query conversation-source-specific backend
    if conversation_source == "chronicle":
        sources_queried.append("chronicle")
        try:
            # Use proxy URL - same method as frontend
            chronicle_url = get_localhost_proxy_url("chronicle-backend")
            logger.info(f"[MEMORIES] Querying Chronicle via proxy at: {chronicle_url}")
            chronicle_memories = await _query_chronicle_memories(
                chronicle_url,
                conversation_id,
                current_user
            )
            all_memories.extend(chronicle_memories)
        except Exception as e:
            # Chronicle query failed
            logger.error(f"[MEMORIES] Chronicle query failed: {e}", exc_info=True)

    elif conversation_source == "mycelia":
        sources_queried.append("mycelia")
        try:
            # Use proxy URL - same method as frontend
            mycelia_url = get_localhost_proxy_url("mycelia-backend")
            logger.info(f"[MEMORIES] Querying Mycelia via proxy at: {mycelia_url}")
            mycelia_memories = await _query_mycelia_memories(
                mycelia_url,
                conversation_id,
                current_user
            )
            all_memories.extend(mycelia_memories)
        except Exception as e:
            # Mycelia query failed
            logger.error(f"[MEMORIES] Mycelia query failed: {e}", exc_info=True)

    return ConversationMemoriesResponse(
        conversation_id=conversation_id,
        conversation_source=conversation_source,
        memories=all_memories,
        count=len(all_memories),
        sources_queried=sources_queried
    )


@router.post("/filter")
async def filter_memories(
    filter_request: MemoriesFilterRequest,
    current_user: User = Depends(get_current_user)
) -> MemoriesFilterResponse:
    """
    Filter memories by metadata with advanced search capabilities.

    Supports filtering by:
    - Date range (from_date, to_date as Unix timestamps)
    - Search query (semantic search)
    - App IDs (app_ids filter)
    - Category IDs (category_ids filter)
    - Pagination (page, size)

    This endpoint leverages OpenMemory's v1.1 output format for enhanced metadata.

    Args:
        filter_request: Filter criteria
        current_user: Authenticated user

    Returns:
        Paginated list of memories matching filter criteria

    Access Control:
        - Regular users: Only their own memories
        - Admins: Can query all users if user_id specified
    """
    try:
        openmemory_url = get_localhost_proxy_url("mem0")
        user_email = filter_request.user_id or get_user_email(current_user)

        logger.info(f"[MEMORIES] Filtering memories for user: {user_email}")

        async with httpx.AsyncClient() as client:
            # Build filter request for OpenMemory
            payload = {
                "user_id": user_email,
                "page": filter_request.page,
                "size": filter_request.size,
                "output_format": "v1.1"
            }

            # Add optional filters
            if filter_request.from_date:
                payload["from_date"] = filter_request.from_date
            if filter_request.to_date:
                payload["to_date"] = filter_request.to_date
            if filter_request.search_query:
                payload["search_query"] = filter_request.search_query
            if filter_request.app_ids:
                payload["app_ids"] = filter_request.app_ids
            if filter_request.category_ids:
                payload["category_ids"] = filter_request.category_ids

            response = await client.post(
                f"{openmemory_url}/api/v1/memories/filter",
                json=payload
            )
            response.raise_for_status()
            data = response.json()

            # Convert to unified format
            memories = []
            for item in data.get("items", []):
                metadata = item.get("metadata_", {})
                content = item.get("text") or item.get("content", "")

                # Include categories in metadata if they exist
                if "categories" in item and item["categories"]:
                    metadata["categories"] = item["categories"]

                memories.append(MemoryItem(
                    id=str(item.get("id")),
                    content=content,
                    created_at=str(item.get("created_at", "")),
                    metadata=metadata,
                    source="openmemory",
                    score=None
                ))

            return MemoriesFilterResponse(
                items=memories,
                total=data.get("total", len(memories)),
                page=filter_request.page,
                size=filter_request.size,
                pages=data.get("pages", 1)
            )

    except Exception as e:
        logger.error(f"[MEMORIES] Filter query failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to filter memories: {str(e)}"
        )


@router.get("/interests")
async def get_user_interests(
    days_recent: int = Query(30, description="Number of recent days to analyze"),
    current_user: User = Depends(get_current_user)
) -> UserInterestsResponse:
    """
    Extract and aggregate user interests from recent memories.

    This endpoint analyzes recent memories to build a user interest profile for:
    - Personalized feed ranking
    - Content recommendations
    - Trending topic detection

    Based on the interest extraction pattern from docs/INTEREST_EXTRACTION.md,
    this aggregates interests stored in memory metadata during write-time.

    Args:
        days_recent: Number of days to look back (default: 30)
        current_user: Authenticated user

    Returns:
        Aggregated user interests with intensity, sentiment, and trending indicators

    Access Control:
        - Regular users: Only their own interests
        - Admins: Can query specific user if user_id provided
    """
    try:
        openmemory_url = get_localhost_proxy_url("mem0")
        user_email = get_user_email(current_user)

        logger.info(f"[MEMORIES] Extracting interests for user: {user_email} (last {days_recent} days)")

        # Calculate date range
        cutoff_date = int((datetime.now() - timedelta(days=days_recent)).timestamp())
        mid_point_date = int((datetime.now() - timedelta(days=days_recent // 2)).timestamp())

        async with httpx.AsyncClient() as client:
            # Query recent memories
            response = await client.post(
                f"{openmemory_url}/api/v1/memories/filter",
                json={
                    "user_id": user_email,
                    "from_date": cutoff_date,
                    "page": 1,
                    "size": 100,
                    "output_format": "v1.1"
                }
            )
            response.raise_for_status()
            data = response.json()
            memories = data.get("items", [])

            logger.info(f"[MEMORIES] Analyzing {len(memories)} memories for interests")

            # Aggregate interests from metadata
            from collections import Counter

            all_interests = []
            interest_sentiments = {}
            interest_intensities = {}
            content_types = set()
            interest_timestamps: Dict[str, List[int]] = {}

            for memory in memories:
                metadata = memory.get("metadata_", {})
                interests = metadata.get("interests", {})
                timestamp = memory.get("created_at", cutoff_date)

                # Convert timestamp to int if it's a string
                if isinstance(timestamp, str):
                    try:
                        timestamp = int(datetime.fromisoformat(timestamp.replace('Z', '+00:00')).timestamp())
                    except:
                        timestamp = cutoff_date

                # Collect specific interests
                for interest in interests.get("specific", []):
                    all_interests.append(interest)

                    # Track when interest was mentioned
                    if interest not in interest_timestamps:
                        interest_timestamps[interest] = []
                    interest_timestamps[interest].append(timestamp)

                # Collect sentiment
                for topic, sentiment in interests.get("sentiment", {}).items():
                    interest_sentiments[topic] = sentiment

                # Collect intensity
                for topic, intensity in interests.get("intensity", {}).items():
                    interest_intensities[topic] = intensity

                # Collect content types
                content_types.update(interests.get("content_types", []))

            # Count frequency
            interest_counts = Counter(all_interests)
            top_interests = [interest for interest, _ in interest_counts.most_common(10)]

            # Calculate trending (mentioned more in recent half vs older half)
            trending = []
            for interest, timestamps in interest_timestamps.items():
                recent_mentions = sum(1 for ts in timestamps if ts > mid_point_date)
                older_mentions = sum(1 for ts in timestamps if ts <= mid_point_date)

                # 50% more mentions recently indicates trending
                if recent_mentions > older_mentions * 1.5 and older_mentions > 0:
                    trending.append(interest)

            logger.info(f"[MEMORIES] Extracted {len(top_interests)} top interests, {len(trending)} trending")

            return UserInterestsResponse(
                user_id=user_email,
                interests=top_interests,
                sentiment=interest_sentiments,
                intensity=interest_intensities,
                trending=trending,
                content_types=list(content_types),
                interest_counts=dict(interest_counts),
                days_analyzed=days_recent
            )

    except Exception as e:
        logger.error(f"[MEMORIES] Interest extraction failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract user interests: {str(e)}"
        )


async def _query_openmemory_by_source_id(
    openmemory_url: str,
    source_id: str,
    user_email: str
) -> List[MemoryItem]:
    """
    Query OpenMemory for memories with specific source_id in metadata.

    Access control: Validates chronicle_user_email in metadata matches current user.
    """
    memories = []

    logger.info(f"[MEMORIES] _query_openmemory: url={openmemory_url}, source_id={source_id}, user={user_email}")

    async with httpx.AsyncClient() as client:
        # Query all memories for user
        query_url = f"{openmemory_url}/api/v1/memories/"
        params = {"user_id": user_email, "limit": 100, "output_format": "v1.1"}
        logger.info(f"[MEMORIES] Querying: {query_url} with params: {params}")

        response = await client.get(query_url, params=params)
        logger.info(f"[MEMORIES] OpenMemory response status: {response.status_code}")
        response.raise_for_status()
        data = response.json()
        logger.info(f"[MEMORIES] OpenMemory returned {len(data.get('items', []))} total memories")

        # Filter by source_id in metadata
        if "items" in data:
            for item in data["items"]:
                metadata = item.get("metadata_", {})

                # Check if this memory belongs to the conversation
                if metadata.get("source_id") == source_id:
                    # Validate access (check chronicle_user_email or user_id)
                    memory_user_email = metadata.get("chronicle_user_email") or metadata.get("user_email")
                    if memory_user_email == user_email or not memory_user_email:
                        # OpenMemory uses 'text' field for content
                        content = item.get("text") or item.get("content", "")
                        # Include categories in metadata if they exist
                        if "categories" in item and item["categories"]:
                            metadata["categories"] = item["categories"]
                        memories.append(MemoryItem(
                            id=str(item.get("id")),
                            content=content,
                            created_at=str(item.get("created_at", "")),
                            metadata=metadata,
                            source="openmemory",
                            score=None
                        ))

    return memories


async def _query_chronicle_memories(
    chronicle_url: str,
    conversation_id: str,
    current_user: User
) -> List[MemoryItem]:
    """
    Query Chronicle native memory system (via conversation endpoint).

    Chronicle may use:
    - Qdrant (native)
    - OpenMemory (already queried above - will deduplicate)

    Auth is handled by the service proxy.
    """
    memories = []

    async with httpx.AsyncClient() as client:
        # Chronicle has /api/conversations/{id}/memories endpoint
        # Proxy handles authentication forwarding
        response = await client.get(
            f"{chronicle_url}/api/conversations/{conversation_id}/memories"
        )

        if response.status_code == 200:
            data = response.json()
            for mem in data.get("memories", []):
                memories.append(MemoryItem(
                    id=mem.get("id"),
                    content=mem.get("content"),
                    created_at=mem.get("created_at"),
                    metadata=mem.get("metadata", {}),
                    source="chronicle",
                    score=mem.get("score")
                ))

    return memories


async def _query_mycelia_memories(
    mycelia_url: str,
    conversation_id: str,
    current_user: User
) -> List[MemoryItem]:
    """
    Query Mycelia native memory system.

    Mycelia may have its own memory endpoints or use OpenMemory.

    Auth is handled by the service proxy.
    """
    memories = []

    async with httpx.AsyncClient() as client:
        # Try Mycelia's conversation memories endpoint if it exists
        try:
            response = await client.get(
                f"{mycelia_url}/api/conversations/{conversation_id}/memories"
            )

            if response.status_code == 200:
                data = response.json()
                for mem in data.get("memories", []):
                    memories.append(MemoryItem(
                        id=mem.get("id"),
                        content=mem.get("content"),
                        created_at=mem.get("created_at"),
                        metadata=mem.get("metadata", {}),
                        source="mycelia",
                        score=mem.get("score")
                    ))
        except:
            # Mycelia might not have this endpoint yet
            pass

    return memories
