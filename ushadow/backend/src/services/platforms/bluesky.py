"""Bluesky / AT Protocol platform strategies.

BlueskyFetcher — unauthenticated interest-based search via public AppView:
  GET https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts
  ?tag={hashtag}&tag={hashtag2}&limit=100&sort=latest
  No credentials, no algorithm — pure hashtag relevance.

BlueskyTimelineFetcher — authenticated personal Following feed via atproto SDK:
  Uses app passwords and the AT Protocol client to fetch the user's home
  timeline (accounts they follow), keeping it strictly separate from the
  interest search feed.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

import httpx

from src.models.feed import Interest, Post
from src.services.platforms import PlatformFetcher

logger = logging.getLogger(__name__)

PUBLIC_APPVIEW_URL = "https://public.api.bsky.app"
SEARCH_PATH = "/xrpc/app.bsky.feed.searchPosts"
MAX_RESULTS = 100  # API maximum per request
MAX_HASHTAGS = 20


class BlueskyFetcher(PlatformFetcher):
    """Fetches posts from the Bluesky public AppView via tag search.

    Uses a single batched request with all interest hashtags (OR semantics),
    unlike Mastodon which requires one request per hashtag.
    No credentials needed — public.api.bsky.app is openly accessible.
    """

    async def fetch_for_interests(
        self, interests: List[Interest], config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Fetch posts matching interest hashtags from the Bluesky AppView.

        Args:
            interests: User interests with derived hashtags.
            config: May contain 'instance_url' (defaults to public AppView).
        """
        hashtags = _collect_hashtags(interests, MAX_HASHTAGS)
        if not hashtags:
            logger.info("No hashtags derived from interests — skipping Bluesky fetch")
            return []

        # Prefer a custom AppView URL if configured, fall back to public
        base_url = (config.get("instance_url") or PUBLIC_APPVIEW_URL).rstrip("/")

        source_id = config.get("source_id", "")
        raw_posts = await _search_by_tags(base_url, hashtags)

        # Stamp source_id for use in to_post()
        for post in raw_posts:
            post["_source_id"] = source_id

        logger.info(
            f"Fetched {len(raw_posts)} posts from Bluesky "
            f"({len(hashtags)} hashtags)"
        )
        return raw_posts

    def to_post(
        self,
        raw: Dict[str, Any],
        source_id: str,
        user_id: str,
        interests: List[Interest],
    ) -> Optional[Post]:
        """Transform a Bluesky searchPosts result item into a Post document."""
        try:
            author = raw.get("author", {})
            record = raw.get("record", {})

            handle = author.get("handle", "unknown")
            display_name = author.get("displayName", "") or handle
            avatar = author.get("avatar")

            content = record.get("text", "")
            created_at = record.get("createdAt", "")
            published_at = _parse_datetime(created_at)

            # Extract hashtags from record facets (AT Protocol structured data)
            hashtags = _extract_hashtags(record)

            # Build a web URL from the AT URI
            uri = raw.get("uri", "")
            url = _at_uri_to_web_url(uri, handle)

            return Post(
                user_id=user_id,
                source_id=source_id,
                external_id=uri or raw.get("cid", ""),
                platform_type="bluesky",
                author_handle=f"@{handle}",
                author_display_name=display_name,
                author_avatar=avatar,
                content=content,
                url=url,
                published_at=published_at,
                hashtags=hashtags,
                language=record.get("langs", [None])[0] if record.get("langs") else None,
                # Bluesky engagement metrics (shared with timeline)
                boosts_count=raw.get("repostCount", 0),
                favourites_count=raw.get("likeCount", 0),
                replies_count=raw.get("replyCount", 0),
                # CID is required to construct reply refs
                bluesky_cid=raw.get("cid"),
            )
        except Exception as e:
            logger.warning(f"Failed to parse Bluesky post: {e}")
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


async def _search_by_tags(base_url: str, hashtags: List[str]) -> List[Dict[str, Any]]:
    """Search Bluesky for posts matching any of the given hashtags.

    The `tag` parameter accepts multiple values (OR semantics), so one
    request covers all interests — far more efficient than per-tag requests.
    """
    url = f"{base_url}{SEARCH_PATH}"
    params: List[tuple[str, str]] = [("limit", str(MAX_RESULTS)), ("sort", "latest")]
    for tag in hashtags:
        params.append(("tag", tag))

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            posts = data.get("posts", [])
            logger.debug(f"Bluesky search returned {len(posts)} posts")
            return posts
    except httpx.HTTPError as e:
        logger.warning(f"Bluesky search failed: {e}")
        return []


def _extract_hashtags(record: Dict[str, Any]) -> List[str]:
    """Extract hashtag strings from AT Protocol facets.

    Facets are structured annotations on text ranges. A tag facet has:
      {"$type": "app.bsky.richtext.facet#tag", "tag": "kubernetes"}
    """
    tags: List[str] = []
    for facet in record.get("facets", []):
        for feature in facet.get("features", []):
            if feature.get("$type") == "app.bsky.richtext.facet#tag":
                tag = feature.get("tag", "")
                if tag:
                    tags.append(tag.lower())
    return tags


def _at_uri_to_web_url(uri: str, handle: str) -> str:
    """Convert an AT URI to a bsky.app web URL.

    AT URI format: at://did:plc:xxx/app.bsky.feed.post/rkey
    Web URL format: https://bsky.app/profile/{handle}/post/{rkey}
    """
    try:
        # uri = "at://did:plc:xxx/app.bsky.feed.post/rkey"
        parts = uri.split("/")
        rkey = parts[-1]  # last segment is the record key
        return f"https://bsky.app/profile/{handle}/post/{rkey}"
    except Exception:
        return f"https://bsky.app/profile/{handle}"


def _parse_datetime(value: str) -> datetime:
    """Parse ISO datetime string, falling back to now(UTC)."""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return datetime.now(timezone.utc)


# ======================================================================
# Authenticated Following Timeline
# ======================================================================


class BlueskyTimelineFetcher(PlatformFetcher):
    """Fetches the authenticated user's personal Following timeline.

    Uses the atproto AsyncClient with Bluesky app password authentication.
    Returns posts from accounts the user follows — no interest filtering,
    no Bluesky algorithm. Posts appear in chronological order as fetched.

    Platform type: "bluesky_timeline" — always stored separately from
    the interest-based "bluesky" feed so the two never blend.
    """

    async def fetch_for_interests(
        self, interests: List[Interest], config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Fetch the Following timeline for an authenticated Bluesky account.

        Interests are intentionally ignored here — this feed reflects what
        the user has chosen to follow, not algorithmic interest inference.

        Args:
            interests: Unused (timeline is follow-based, not interest-based).
            config: Must contain 'handle' and 'api_key' (app password).
        """
        from atproto import AsyncClient as BskyClient  # noqa: PLC0415

        handle = config.get("handle", "")
        app_password = config.get("api_key", "")
        source_id = config.get("source_id", "")

        if not handle or not app_password:
            logger.warning(
                "bluesky_timeline source %s missing handle or app_password — skipping",
                source_id,
            )
            return []

        try:
            client = BskyClient()
            await client.login(handle, app_password)
            response = await client.get_timeline(limit=100)
        except Exception as e:
            logger.warning("Bluesky timeline fetch failed for %s: %s", handle, e)
            return []

        items: List[Dict[str, Any]] = []
        for feed_view in response.feed:
            post = feed_view.post
            # Skip reposts — show only original posts from followed accounts
            if feed_view.reason is not None:
                continue
            raw = _post_view_to_dict(post, source_id)
            items.append(raw)

        logger.info(
            "Fetched %d Following posts for @%s", len(items), handle
        )
        return items

    def to_post(
        self,
        raw: Dict[str, Any],
        source_id: str,
        user_id: str,
        interests: List[Interest],
    ) -> Optional[Post]:
        """Transform a timeline post dict into a Post document.

        Reuses the BlueskyFetcher transformation, then overrides platform_type
        to 'bluesky_timeline' so the two feeds stay separate in MongoDB.
        """
        post = BlueskyFetcher().to_post(raw, source_id, user_id, interests)
        if post:
            post.platform_type = "bluesky_timeline"
        return post


def _post_view_to_dict(post: Any, source_id: str) -> Dict[str, Any]:
    """Convert an atproto PostView typed object into our canonical raw dict.

    The dict shape matches what the public search API returns, so
    BlueskyFetcher.to_post() can process both without duplication.
    """
    author = post.author
    record = post.record  # AppBskyFeedPost.Main

    # Extract facet-based hashtags from the typed record
    facets_list: List[Dict[str, Any]] = []
    if hasattr(record, "facets") and record.facets:
        for facet in record.facets:
            features = []
            if hasattr(facet, "features") and facet.features:
                for feat in facet.features:
                    features.append({
                        "$type": getattr(feat, "py_type", ""),
                        "tag": getattr(feat, "tag", ""),
                    })
            facets_list.append({"features": features})

    langs = getattr(record, "langs", None) or []

    return {
        "uri": post.uri,
        "cid": post.cid,
        "author": {
            "handle": author.handle,
            "displayName": author.display_name or "",
            "avatar": author.avatar,
        },
        "record": {
            "text": getattr(record, "text", ""),
            "createdAt": getattr(record, "created_at", ""),
            "facets": facets_list,
            "langs": langs,
        },
        "replyCount": post.reply_count or 0,
        "repostCount": post.repost_count or 0,
        "likeCount": post.like_count or 0,
        "_source_id": source_id,
    }
