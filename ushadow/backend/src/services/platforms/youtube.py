"""YouTube platform strategy — fetches videos via YouTube Data API v3.

Uses two API endpoints:
  - search.list (100 quota units each) — finds video IDs matching interests
  - videos.list (1 quota unit per 50 videos) — fetches details (thumbnails, stats)

Quota budget: 5 searches × 100 = 500 + 1 details call = 501 units per refresh.
Free tier is 10,000 units/day → ~19 refreshes/day.
"""

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

import httpx

from src.models.feed import Interest, Post
from src.services.platforms import PlatformFetcher

logger = logging.getLogger(__name__)

SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"

MAX_QUERIES = 5
MAX_RESULTS_PER_QUERY = 10
MAX_CONCURRENT = 3
PUBLISHED_AFTER_DAYS = 30


class YouTubeFetcher(PlatformFetcher):
    """Fetches videos from YouTube Data API v3."""

    async def fetch_for_interests(
        self, interests: List[Interest], config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Search YouTube for videos matching user interests.

        1. Convert top interests → search query strings
        2. Run searches concurrently (bounded)
        3. Batch-fetch video details (thumbnails, stats, duration)
        4. Deduplicate by video ID
        """
        api_key = config.get("api_key", "")
        if not api_key:
            logger.warning("YouTube source has no API key")
            return []

        queries = _interests_to_queries(interests, MAX_QUERIES)
        if not queries:
            return []

        # Phase 1: Search for video IDs
        semaphore = asyncio.Semaphore(MAX_CONCURRENT)
        published_after = (
            datetime.now(timezone.utc) - timedelta(days=PUBLISHED_AFTER_DAYS)
        ).isoformat()

        async def _bounded_search(query: str) -> List[str]:
            async with semaphore:
                return await _search_videos(query, api_key, published_after)

        tasks = [_bounded_search(q) for q in queries]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Collect unique video IDs
        seen_ids: Set[str] = set()
        video_ids: List[str] = []
        for result in results:
            if isinstance(result, Exception):
                logger.warning(f"YouTube search failed: {result}")
                continue
            for vid_id in result:
                if vid_id not in seen_ids:
                    seen_ids.add(vid_id)
                    video_ids.append(vid_id)

        if not video_ids:
            return []

        # Phase 2: Batch-fetch video details
        videos = await _get_video_details(video_ids, api_key)

        logger.info(
            f"Fetched {len(videos)} YouTube videos "
            f"({len(queries)} queries, {len(video_ids)} unique IDs)"
        )

        # Tag each video with source metadata
        source_id = config.get("source_id", "")
        for video in videos:
            video["_source_id"] = source_id

        return videos

    def to_post(
        self,
        raw: Dict[str, Any],
        source_id: str,
        user_id: str,
        interests: List[Interest],
    ) -> Post | None:
        """Transform a YouTube video JSON into a Post document."""
        try:
            snippet = raw.get("snippet", {})
            stats = raw.get("statistics", {})
            content_details = raw.get("contentDetails", {})
            video_id = raw.get("id", "")

            published_at = _parse_datetime(snippet.get("publishedAt", ""))
            title = snippet.get("title", "")
            description = snippet.get("description", "")

            # Use highest-quality thumbnail available
            thumbnails = snippet.get("thumbnails", {})
            thumbnail_url = (
                thumbnails.get("high", {}).get("url")
                or thumbnails.get("medium", {}).get("url")
                or thumbnails.get("default", {}).get("url")
            )

            # Extract hashtags from title + description
            hashtags = _extract_hashtags(f"{title} {description}")

            channel_title = snippet.get("channelTitle", "")

            return Post(
                user_id=user_id,
                source_id=source_id,
                external_id=f"yt:{video_id}",
                platform_type="youtube",
                author_handle=channel_title,
                author_display_name=channel_title,
                author_avatar=None,
                content=f"<b>{title}</b><br/>{description[:500]}",
                url=f"https://www.youtube.com/watch?v={video_id}",
                published_at=published_at,
                hashtags=hashtags,
                language=snippet.get("defaultAudioLanguage"),
                # YouTube-specific fields
                thumbnail_url=thumbnail_url,
                video_id=video_id,
                channel_title=channel_title,
                view_count=_safe_int(stats.get("viewCount")),
                like_count=_safe_int(stats.get("likeCount")),
                duration=_format_duration(content_details.get("duration", "")),
            )
        except Exception as e:
            logger.warning(f"Failed to parse YouTube video: {e}")
            return None


# ======================================================================
# Module-level helpers
# ======================================================================


def _interests_to_queries(
    interests: List[Interest], max_queries: int
) -> List[str]:
    """Convert top interests into YouTube search queries.

    Joins the top 2-3 hashtags per interest into a search string.
    Example: Interest(hashtags=["kubernetes", "k8s"]) → "kubernetes k8s"
    """
    queries: List[str] = []
    for interest in interests[:max_queries]:
        keywords = " ".join(interest.hashtags[:3])
        if keywords.strip():
            queries.append(keywords)
    return queries


async def _search_videos(
    query: str, api_key: str, published_after: str
) -> List[str]:
    """Search YouTube for video IDs matching a query string."""
    params = {
        "part": "id",
        "q": query,
        "type": "video",
        "maxResults": MAX_RESULTS_PER_QUERY,
        "order": "relevance",
        "publishedAfter": published_after,
        "key": api_key,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(SEARCH_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
            return [
                item["id"]["videoId"]
                for item in data.get("items", [])
                if item.get("id", {}).get("videoId")
            ]
    except httpx.HTTPError as e:
        logger.warning(f"YouTube search failed for '{query}': {e}")
        return []


async def _get_video_details(
    video_ids: List[str], api_key: str
) -> List[Dict[str, Any]]:
    """Batch-fetch video details (snippet, stats, contentDetails).

    YouTube allows up to 50 IDs per request (1 quota unit).
    """
    all_videos: List[Dict[str, Any]] = []

    # Process in batches of 50
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i : i + 50]
        params = {
            "part": "snippet,statistics,contentDetails",
            "id": ",".join(batch),
            "key": api_key,
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(VIDEOS_URL, params=params)
                resp.raise_for_status()
                data = resp.json()
                all_videos.extend(data.get("items", []))
        except httpx.HTTPError as e:
            logger.warning(f"YouTube video details failed: {e}")

    return all_videos


def _extract_hashtags(text: str) -> List[str]:
    """Extract #hashtags from YouTube title/description."""
    tags = re.findall(r"#(\w{2,})", text.lower())
    # Deduplicate while preserving order
    seen: Set[str] = set()
    result: List[str] = []
    for tag in tags:
        if tag not in seen:
            seen.add(tag)
            result.append(tag)
    return result[:10]


def _parse_datetime(value: str) -> datetime:
    """Parse ISO datetime string, falling back to now(UTC)."""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return datetime.now(timezone.utc)


def _safe_int(value: Optional[str]) -> Optional[int]:
    """Convert string numeric value to int, or None."""
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


_ISO_DURATION_RE = re.compile(
    r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"
)


def _format_duration(iso_duration: str) -> Optional[str]:
    """Convert ISO 8601 duration (PT1H2M30S) to human-readable (1:02:30)."""
    match = _ISO_DURATION_RE.match(iso_duration)
    if not match:
        return None

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)

    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"
