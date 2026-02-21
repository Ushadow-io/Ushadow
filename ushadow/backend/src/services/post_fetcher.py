"""Post Fetcher - Dispatches content fetching to platform strategies.

Groups sources by platform_type and delegates to the appropriate
PlatformFetcher implementation (MastodonFetcher, YouTubeFetcher, etc.).
"""

import logging
from typing import Any, Dict, List, Type

from src.models.feed import Interest, Post, PostSource
from src.services.platforms import PlatformFetcher
from src.services.platforms.mastodon import MastodonFetcher
from src.services.platforms.youtube import YouTubeFetcher

logger = logging.getLogger(__name__)

# Registry: platform_type → fetcher class
_STRATEGIES: Dict[str, Type[PlatformFetcher]] = {
    "mastodon": MastodonFetcher,
    "youtube": YouTubeFetcher,
}


def register_platform(name: str, cls: Type[PlatformFetcher]) -> None:
    """Register a new platform fetcher (called at import time)."""
    _STRATEGIES[name] = cls


class PostFetcher:
    """Dispatches content fetching to platform-specific strategies."""

    async def fetch_for_interests(
        self,
        sources: List[PostSource],
        interests: List[Interest],
        user_id: str,
    ) -> List[Post]:
        """Fetch and transform posts from all active sources.

        Groups sources by platform_type, dispatches to the registered
        strategy, transforms raw items to Post objects via to_post().

        Returns:
            List of Post objects (not yet scored).
        """
        active = [s for s in sources if s.enabled]
        if not active:
            logger.info("No active sources configured")
            return []

        all_posts: List[Post] = []

        for source in active:
            strategy_cls = _STRATEGIES.get(source.platform_type)
            if not strategy_cls:
                logger.warning(
                    f"No strategy for platform '{source.platform_type}'"
                )
                continue

            strategy = strategy_cls()
            config = _source_to_config(source)

            raw_items = await strategy.fetch_for_interests(interests, config)
            for raw in raw_items:
                post = strategy.to_post(
                    raw, source.source_id, user_id, interests
                )
                if post:
                    all_posts.append(post)

        logger.info(
            f"Fetched {len(all_posts)} posts from {len(active)} sources"
        )
        return all_posts


def _source_to_config(source: PostSource) -> Dict[str, Any]:
    """Convert a PostSource document to a strategy config dict."""
    return {
        "source_id": source.source_id,
        "instance_url": source.instance_url or "",
        "api_key": source.api_key or "",
        "access_token": source.access_token or "",
        "platform_type": source.platform_type,
    }
