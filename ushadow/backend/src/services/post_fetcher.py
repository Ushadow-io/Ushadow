"""Post Fetcher - Pulls posts from Mastodon-compatible fediverse instances.

Uses the public hashtag timeline API which requires no authentication.
GET /api/v1/timelines/tag/{hashtag} returns Status objects.
"""

import asyncio
import logging
from typing import Any, Dict, List, Set

import httpx

from src.models.feed import Interest, PostSource

logger = logging.getLogger(__name__)

# Mastodon API limits
DEFAULT_LIMIT = 40  # Max per-request
MAX_CONCURRENT_REQUESTS = 5  # Rate limit guard


class PostFetcher:
    """Fetches posts from Mastodon-compatible hashtag timelines."""

    async def fetch_hashtag_timeline(
        self, instance_url: str, hashtag: str, limit: int = DEFAULT_LIMIT
    ) -> List[Dict[str, Any]]:
        """Fetch public posts for a single hashtag from a Mastodon instance.

        GET {instance_url}/api/v1/timelines/tag/{hashtag}?limit={limit}
        No authentication required for public timelines.
        """
        url = f"{instance_url.rstrip('/')}/api/v1/timelines/tag/{hashtag}"
        params = {"limit": min(limit, DEFAULT_LIMIT)}

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                statuses = resp.json()
                logger.debug(
                    f"Fetched {len(statuses)} posts for #{hashtag} from {instance_url}"
                )
                return statuses
        except httpx.HTTPError as e:
            logger.warning(
                f"Failed to fetch #{hashtag} from {instance_url}: {e}"
            )
            return []

    async def fetch_for_interests(
        self,
        sources: List[PostSource],
        interests: List[Interest],
        max_hashtags: int = 20,
    ) -> List[Dict[str, Any]]:
        """Fetch posts for all interest-derived hashtags from all sources.

        For each (source, hashtag) pair, fetches the public timeline.
        Deduplicates posts by their external ID (Mastodon status URI).
        """
        # Collect unique hashtags from interests, ordered by interest strength
        hashtags: List[str] = []
        seen_tags: Set[str] = set()
        for interest in interests:
            for tag in interest.hashtags:
                if tag not in seen_tags:
                    seen_tags.add(tag)
                    hashtags.append(tag)
                if len(hashtags) >= max_hashtags:
                    break
            if len(hashtags) >= max_hashtags:
                break

        if not hashtags:
            logger.info("No hashtags derived from interests")
            return []

        active_sources = [s for s in sources if s.enabled]
        if not active_sources:
            logger.info("No active sources configured")
            return []

        logger.info(
            f"Fetching posts for {len(hashtags)} hashtags from "
            f"{len(active_sources)} sources"
        )

        # Build all (source, hashtag) fetch tasks
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

        async def _bounded_fetch(
            source: PostSource, hashtag: str
        ) -> List[Dict[str, Any]]:
            async with semaphore:
                statuses = await self.fetch_hashtag_timeline(
                    source.instance_url, hashtag
                )
                # Tag each status with the source for tracking
                for status in statuses:
                    status["_source_id"] = source.source_id
                    status["_source_instance"] = source.instance_url
                return statuses

        tasks = [
            _bounded_fetch(source, hashtag)
            for source in active_sources
            for hashtag in hashtags
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Flatten and deduplicate
        seen_ids: Set[str] = set()
        all_posts: List[Dict[str, Any]] = []

        for result in results:
            if isinstance(result, Exception):
                logger.warning(f"Fetch task failed: {result}")
                continue
            for status in result:
                # Deduplicate by Mastodon status URI (globally unique)
                ext_id = status.get("uri") or status.get("id", "")
                if ext_id and ext_id not in seen_ids:
                    seen_ids.add(ext_id)
                    all_posts.append(status)

        logger.info(
            f"Fetched {len(all_posts)} unique posts "
            f"(from {len(tasks)} requests)"
        )
        return all_posts
