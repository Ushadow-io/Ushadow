"""Platform strategies for multi-source content fetching.

Each platform (Mastodon, YouTube, etc.) implements PlatformFetcher to handle
its own API calls and data transformation. The generic PostScorer then ranks
all posts uniformly regardless of source platform.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List

from src.models.feed import Interest, Post


class PlatformFetcher(ABC):
    """Abstract base for platform-specific content fetchers.

    Implementors handle:
    - Fetching raw content from the platform API
    - Transforming platform-specific JSON into Post objects
    """

    @abstractmethod
    async def fetch_for_interests(
        self, interests: List[Interest], config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Fetch raw content items matching user interests.

        Args:
            interests: User interests with hashtags/keywords.
            config: Platform-specific config (instance_url, api_key, etc.)

        Returns:
            List of raw platform-specific dicts (to be transformed by to_post).
        """

    @abstractmethod
    def to_post(
        self,
        raw: Dict[str, Any],
        source_id: str,
        user_id: str,
        interests: List[Interest],
    ) -> Post | None:
        """Transform a raw platform item into a Post document.

        Args:
            raw: Raw API response item.
            source_id: The PostSource.source_id this came from.
            user_id: The user who owns this feed.
            interests: Used for initial relevance scoring.

        Returns:
            Post object, or None if the item can't be parsed.
        """
