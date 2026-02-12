"""Post Scorer - Ranks fediverse posts by relevance to the user's interest graph.

Scoring signals:
- Hashtag overlap with interest keywords (direct match)
- Interest weight (more connected interests rank higher)
- Interest recency (recently-active interests boost more)
- Post recency (newer posts get a time decay boost)
- Content keyword matching (post text contains interest terms)
"""

import logging
import math
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from src.models.feed import Interest, Post

logger = logging.getLogger(__name__)

# Strip HTML tags for text matching
_HTML_TAG_RE = re.compile(r"<[^>]+>")


class PostScorer:
    """Scores fediverse posts against the user's interest graph."""

    def score_posts(
        self,
        raw_posts: List[Dict[str, Any]],
        interests: List[Interest],
        user_id: str,
    ) -> List[Post]:
        """Score each raw Mastodon status against user interests.

        For each post:
        1. Extract hashtags and plain text from the Mastodon status
        2. Find which interests match (hashtag overlap + content keywords)
        3. Compute relevance_score from matched interest weights
        4. Create Post objects sorted by relevance_score descending
        """
        if not interests:
            logger.info("No interests to score against")
            return []

        # Build lookup: hashtag -> Interest
        tag_to_interests: Dict[str, List[Interest]] = {}
        for interest in interests:
            for tag in interest.hashtags:
                tag_to_interests.setdefault(tag.lower(), []).append(interest)

        # Build keyword set for content matching
        keyword_to_interests: Dict[str, List[Interest]] = {}
        for interest in interests:
            # Use the interest name words as keywords
            words = interest.name.lower().split()
            for word in words:
                if len(word) >= 3:
                    keyword_to_interests.setdefault(word, []).append(interest)

        now = datetime.now(timezone.utc)
        scored_posts: List[Post] = []

        for status in raw_posts:
            post = _status_to_post(status, user_id)
            if not post:
                continue

            matched: Set[str] = set()
            score = 0.0

            # 1. Hashtag matching
            for post_tag in post.hashtags:
                tag_lower = post_tag.lower()
                if tag_lower in tag_to_interests:
                    for interest in tag_to_interests[tag_lower]:
                        if interest.name not in matched:
                            matched.add(interest.name)
                            score += _interest_score(interest, now)

            # 2. Content keyword matching (weaker signal)
            plain_text = _strip_html(post.content).lower()
            for keyword, kw_interests in keyword_to_interests.items():
                if keyword in plain_text:
                    for interest in kw_interests:
                        if interest.name not in matched:
                            matched.add(interest.name)
                            score += _interest_score(interest, now) * 0.5

            # 3. Post recency boost
            score += _recency_boost(post.published_at, now)

            post.relevance_score = round(score, 3)
            post.matched_interests = sorted(matched)
            scored_posts.append(post)

        # Sort by relevance descending
        scored_posts.sort(key=lambda p: p.relevance_score, reverse=True)

        logger.info(
            f"Scored {len(scored_posts)} posts, "
            f"top score: {scored_posts[0].relevance_score if scored_posts else 0}"
        )
        return scored_posts


def _interest_score(interest: Interest, now: datetime) -> float:
    """Score contribution from a single matched interest.

    Uses log of relationship_count (diminishing returns for very connected nodes)
    plus a recency bonus if the interest was recently active.
    """
    # Base: log(relationship_count + 1) so a node with 10 rels ≈ 2.4, 100 rels ≈ 4.6
    base = math.log(interest.relationship_count + 1, 2)

    # Recency bonus: interests active in the last 7 days get up to +2.0
    recency_bonus = 0.0
    if interest.last_active:
        days_since = (now - interest.last_active).total_seconds() / 86400
        if days_since < 7:
            recency_bonus = 2.0 * (1.0 - days_since / 7.0)

    return base + recency_bonus


def _recency_boost(published_at: datetime, now: datetime) -> float:
    """Boost for recent posts. Posts lose relevance over days.

    24h old -> +1.0, 48h -> +0.5, 7 days -> ~0.14, older -> ~0
    """
    hours_old = max((now - published_at).total_seconds() / 3600, 0)
    if hours_old < 1:
        return 1.5
    return 1.0 / math.log2(hours_old + 1)


def _strip_html(html: str) -> str:
    """Remove HTML tags for plain text matching."""
    return _HTML_TAG_RE.sub(" ", html).strip()


def _status_to_post(
    status: Dict[str, Any], user_id: str
) -> Optional[Post]:
    """Convert a Mastodon Status JSON object to a Post model."""
    try:
        account = status.get("account", {})
        tags = status.get("tags", [])

        # Build full handle: @user@instance
        acct = account.get("acct", "unknown")
        if "@" not in acct:
            # Local account — append instance from URL
            instance_url = status.get("_source_instance", "")
            domain = instance_url.replace("https://", "").replace("http://", "").rstrip("/")
            acct = f"{acct}@{domain}" if domain else acct

        published_at_str = status.get("created_at", "")
        try:
            published_at = datetime.fromisoformat(
                published_at_str.replace("Z", "+00:00")
            )
        except (ValueError, AttributeError):
            published_at = datetime.now(timezone.utc)

        return Post(
            user_id=user_id,
            source_id=status.get("_source_id", ""),
            external_id=status.get("uri") or status.get("id", ""),
            author_handle=f"@{acct}",
            author_display_name=account.get("display_name", ""),
            author_avatar=account.get("avatar", None),
            content=status.get("content", ""),
            url=status.get("url") or status.get("uri", ""),
            published_at=published_at,
            hashtags=[t.get("name", "") for t in tags if t.get("name")],
            language=status.get("language"),
            boosts_count=status.get("reblogs_count", 0),
            favourites_count=status.get("favourites_count", 0),
            replies_count=status.get("replies_count", 0),
        )
    except Exception as e:
        logger.warning(f"Failed to parse status: {e}")
        return None
