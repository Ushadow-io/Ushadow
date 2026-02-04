"""Dashboard service for aggregating Chronicle data.

This service fetches recent conversations and memories from Chronicle
and provides a unified dashboard view.
"""

import logging
from datetime import datetime
from typing import List, Optional

import httpx

from src.models.dashboard import (
    ActivityEvent,
    ActivityType,
    DashboardData,
    DashboardStats,
)

logger = logging.getLogger(__name__)

# Chronicle service configuration
CHRONICLE_URL = "http://chronicle-backend:8000"
CHRONICLE_TIMEOUT = 5.0


class DashboardService:
    """
    Aggregates Chronicle data for the dashboard.

    Fetches recent conversations and memories, providing
    statistics and activity feeds.
    """

    async def get_dashboard_data(
        self,
        conversation_limit: int = 10,
        memory_limit: int = 10,
    ) -> DashboardData:
        """
        Get complete dashboard data.

        Args:
            conversation_limit: Max number of recent conversations
            memory_limit: Max number of recent memories

        Returns:
            Complete dashboard data with stats and activities
        """
        # Fetch data from Chronicle
        conversations = await self._fetch_conversations(limit=conversation_limit)
        memories = await self._fetch_memories(limit=memory_limit)

        # Convert to activity events
        conversation_activities = self._conversations_to_activities(conversations)
        memory_activities = self._memories_to_activities(memories)

        # Calculate stats
        stats = DashboardStats(
            conversation_count=len(conversation_activities),
            memory_count=len(memory_activities),
        )

        return DashboardData(
            stats=stats,
            recent_conversations=conversation_activities,
            recent_memories=memory_activities,
            last_updated=datetime.utcnow(),
        )

    # =========================================================================
    # Chronicle data fetching
    # =========================================================================

    async def _fetch_conversations(self, limit: int = 10) -> List[dict]:
        """
        Fetch recent conversations from Chronicle.

        Args:
            limit: Maximum number of conversations to fetch

        Returns:
            List of conversation dicts from Chronicle API
        """
        try:
            async with httpx.AsyncClient(timeout=CHRONICLE_TIMEOUT) as client:
                response = await client.get(
                    f"{CHRONICLE_URL}/api/conversations",
                    params={"page": 1, "limit": limit},
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("items", [])
        except Exception as e:
            logger.warning(f"Failed to fetch conversations: {e}")

        return []

    async def _fetch_memories(self, limit: int = 10) -> List[dict]:
        """
        Fetch recent memories from Chronicle.

        Args:
            limit: Maximum number of memories to fetch

        Returns:
            List of memory dicts from Chronicle API
        """
        try:
            async with httpx.AsyncClient(timeout=CHRONICLE_TIMEOUT) as client:
                response = await client.get(
                    f"{CHRONICLE_URL}/api/memories",
                    params={"limit": limit},
                )
                if response.status_code == 200:
                    data = response.json()
                    # Chronicle returns either a list or a dict with items
                    if isinstance(data, list):
                        return data
                    return data.get("items", [])
        except Exception as e:
            logger.warning(f"Failed to fetch memories: {e}")

        return []

    # =========================================================================
    # Data transformation
    # =========================================================================

    def _conversations_to_activities(
        self, conversations: List[dict]
    ) -> List[ActivityEvent]:
        """
        Convert Chronicle conversations to activity events.

        Args:
            conversations: Raw conversation data from Chronicle

        Returns:
            List of ActivityEvent objects
        """
        activities = []

        for conv in conversations:
            # Parse timestamp
            timestamp = self._parse_timestamp(
                conv.get("created_at") or conv.get("timestamp")
            )

            # Create activity event
            activities.append(
                ActivityEvent(
                    id=f"conv-{conv.get('id', 'unknown')}",
                    type=ActivityType.CONVERSATION,
                    title=conv.get("title") or "Untitled Conversation",
                    description=conv.get("summary"),
                    timestamp=timestamp,
                    metadata={
                        "duration": conv.get("duration"),
                        "message_count": conv.get("message_count", 0),
                    },
                    source="chronicle",
                )
            )

        return activities

    def _memories_to_activities(self, memories: List[dict]) -> List[ActivityEvent]:
        """
        Convert Chronicle memories to activity events.

        Args:
            memories: Raw memory data from Chronicle

        Returns:
            List of ActivityEvent objects
        """
        activities = []

        for mem in memories:
            timestamp = self._parse_timestamp(mem.get("timestamp"))

            # Truncate long content for title
            content = mem.get("content", "")
            title = content[:60] + "..." if len(content) > 60 else content

            activities.append(
                ActivityEvent(
                    id=f"mem-{mem.get('id', 'unknown')}",
                    type=ActivityType.MEMORY,
                    title=title,
                    description=content if len(content) > 60 else None,
                    timestamp=timestamp,
                    metadata={
                        "type": mem.get("type"),
                        "tags": mem.get("tags", []),
                    },
                    source="chronicle",
                )
            )

        return activities

    # =========================================================================
    # Utilities
    # =========================================================================

    def _parse_timestamp(self, timestamp_str: Optional[str]) -> datetime:
        """
        Parse timestamp string to datetime.

        Args:
            timestamp_str: ISO format timestamp string

        Returns:
            Parsed datetime, or current time if parsing fails
        """
        if not timestamp_str:
            return datetime.utcnow()

        try:
            # Try ISO format with timezone
            return datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        except Exception:
            try:
                # Try without timezone
                return datetime.fromisoformat(timestamp_str)
            except Exception:
                logger.warning(f"Failed to parse timestamp: {timestamp_str}")
                return datetime.utcnow()


# Dependency injection
async def get_dashboard_service() -> DashboardService:
    """
    Provide DashboardService instance.

    Returns:
        Configured DashboardService instance
    """
    return DashboardService()
