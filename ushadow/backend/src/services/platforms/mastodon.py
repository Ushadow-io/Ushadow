"""Mastodon platform strategy — fetches posts from hashtag timelines.

Uses the public Mastodon API:
  GET /api/v1/timelines/tag/{hashtag}?limit=40
No authentication required for public timelines.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

import httpx

from src.models.feed import Interest, Post
from src.services.platforms import PlatformFetcher

logger = logging.getLogger(__name__)

DEFAULT_LIMIT = 40
MAX_CONCURRENT = 5
MAX_HASHTAGS = 20


class MastodonFetcher(PlatformFetcher):
    """Fetches posts from Mastodon-compatible hashtag timelines."""

    async def fetch_for_interests(
        self, interests: List[Interest], config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Fetch posts for all interest hashtags from a Mastodon instance.

        Args:
            interests: User interests with derived hashtags.
            config: Must contain 'instance_url'.
        """
        instance_url = config["instance_url"]

        hashtags = _collect_hashtags(interests, MAX_HASHTAGS)
        if not hashtags:
            return []

        semaphore = asyncio.Semaphore(MAX_CONCURRENT)

        async def _bounded_fetch(hashtag: str) -> List[Dict[str, Any]]:
            async with semaphore:
                return await _fetch_hashtag_timeline(
                    instance_url, hashtag
                )

        tasks = [_bounded_fetch(tag) for tag in hashtags]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Flatten and deduplicate by Mastodon URI
        seen_ids: Set[str] = set()
        posts: List[Dict[str, Any]] = []
        source_id = config.get("source_id", "")

        for result in results:
            if isinstance(result, Exception):
                logger.warning(f"Mastodon fetch failed: {result}")
                continue
            for status in result:
                ext_id = status.get("uri") or status.get("id", "")
                if ext_id and ext_id not in seen_ids:
                    seen_ids.add(ext_id)
                    status["_source_id"] = source_id
                    status["_source_instance"] = instance_url
                    posts.append(status)

        logger.info(
            f"Fetched {len(posts)} unique posts from {instance_url} "
            f"({len(tasks)} requests)"
        )
        return posts

    def to_post(
        self,
        raw: Dict[str, Any],
        source_id: str,
        user_id: str,
        interests: List[Interest],
    ) -> Post | None:
        """Transform a Mastodon Status JSON into a Post document."""
        try:
            account = raw.get("account", {})
            tags = raw.get("tags", [])

            acct = account.get("acct", "unknown")
            if "@" not in acct:
                instance_url = raw.get("_source_instance", "")
                domain = (
                    instance_url.replace("https://", "")
                    .replace("http://", "")
                    .rstrip("/")
                )
                acct = f"{acct}@{domain}" if domain else acct

            published_at = _parse_datetime(raw.get("created_at", ""))

            return Post(
                user_id=user_id,
                source_id=source_id,
                external_id=raw.get("uri") or raw.get("id", ""),
                platform_type="mastodon",
                author_handle=f"@{acct}",
                author_display_name=account.get("display_name", ""),
                author_avatar=account.get("avatar"),
                content=raw.get("content", ""),
                url=raw.get("url") or raw.get("uri", ""),
                published_at=published_at,
                hashtags=[t.get("name", "") for t in tags if t.get("name")],
                language=raw.get("language"),
                boosts_count=raw.get("reblogs_count", 0),
                favourites_count=raw.get("favourites_count", 0),
                replies_count=raw.get("replies_count", 0),
            )
        except Exception as e:
            logger.warning(f"Failed to parse Mastodon status: {e}")
            return None


# ======================================================================
# Module-level helpers
# ======================================================================


def _collect_hashtags(interests: List[Interest], max_count: int) -> List[str]:
    """Collect unique hashtags from interests, ordered by interest weight."""
    hashtags: List[str] = []
    seen: Set[str] = set()
    for interest in interests:
        for tag in interest.hashtags:
            if tag not in seen:
                seen.add(tag)
                hashtags.append(tag)
            if len(hashtags) >= max_count:
                return hashtags
    return hashtags


async def _fetch_hashtag_timeline(
    instance_url: str, hashtag: str
) -> List[Dict[str, Any]]:
    """Fetch public posts for a hashtag from a Mastodon instance."""
    url = f"{instance_url.rstrip('/')}/api/v1/timelines/tag/{hashtag}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params={"limit": DEFAULT_LIMIT})
            resp.raise_for_status()
            statuses = resp.json()
            logger.debug(
                f"Fetched {len(statuses)} posts for #{hashtag} "
                f"from {instance_url}"
            )
            return statuses
    except httpx.HTTPError as e:
        logger.warning(
            f"Failed to fetch #{hashtag} from {instance_url}: {e}"
        )
        return []


def _parse_datetime(value: str) -> datetime:
    """Parse ISO datetime string, falling back to now(UTC)."""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return datetime.now(timezone.utc)
