"""Post Scorer - Ranks posts by relevance to the user's interest graph.

Platform-agnostic scoring: works on Post objects regardless of whether
they came from Mastodon, YouTube, or any future platform.

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
from typing import Dict, List, Set

from src.models.feed import Interest, Post

logger = logging.getLogger(__name__)

_HTML_TAG_RE = re.compile(r"<[^>]+>")


class PostScorer:
    """Scores posts against the user's interest graph."""

    def score_posts(
        self,
        posts: List[Post],
        interests: List[Interest],
    ) -> List[Post]:
        """Score pre-transformed Post objects against user interests.

        For each post:
        1. Find which interests match (hashtag overlap + content keywords)
        2. Compute relevance_score from matched interest weights
        3. Add recency boost
        4. Return sorted by relevance_score descending
        """
        if not interests:
            logger.info("No interests to score against")
            return posts

        # Build lookups
        tag_to_interests = _build_tag_lookup(interests)
        kw_to_interests = _build_keyword_lookup(interests)

        now = datetime.now(timezone.utc)

        for post in posts:
            matched: Set[str] = set()
            score = 0.0

            # 1. Hashtag matching
            for tag in post.hashtags:
                for interest in tag_to_interests.get(tag.lower(), []):
                    if interest.name not in matched:
                        matched.add(interest.name)
                        score += _interest_score(interest, now)

            # 2. Content keyword matching (weaker signal)
            plain = _strip_html(post.content).lower()
            for keyword, kw_interests in kw_to_interests.items():
                if keyword in plain:
                    for interest in kw_interests:
                        if interest.name not in matched:
                            matched.add(interest.name)
                            score += _interest_score(interest, now) * 0.5

            # 3. Post recency boost
            score += _recency_boost(post.published_at, now)

            post.relevance_score = round(score, 3)
            post.matched_interests = sorted(matched)

        posts.sort(key=lambda p: p.relevance_score, reverse=True)

        logger.info(
            f"Scored {len(posts)} posts, "
            f"top score: {posts[0].relevance_score if posts else 0}"
        )
        return posts


# ======================================================================
# Helpers
# ======================================================================


def _build_tag_lookup(
    interests: List[Interest],
) -> Dict[str, List[Interest]]:
    """Map hashtag → list of interests that use it."""
    lookup: Dict[str, List[Interest]] = {}
    for interest in interests:
        for tag in interest.hashtags:
            lookup.setdefault(tag.lower(), []).append(interest)
    return lookup


def _build_keyword_lookup(
    interests: List[Interest],
) -> Dict[str, List[Interest]]:
    """Map interest name words → list of interests (for text matching)."""
    lookup: Dict[str, List[Interest]] = {}
    for interest in interests:
        for word in interest.name.lower().split():
            if len(word) >= 3:
                lookup.setdefault(word, []).append(interest)
    return lookup


def _interest_score(interest: Interest, now: datetime) -> float:
    """Score contribution from a single matched interest.

    log2(relationship_count + 1) + recency bonus if active recently.
    """
    base = math.log(interest.relationship_count + 1, 2)

    recency_bonus = 0.0
    if interest.last_active:
        days_since = (now - interest.last_active).total_seconds() / 86400
        if days_since < 7:
            recency_bonus = 2.0 * (1.0 - days_since / 7.0)

    return base + recency_bonus


def _recency_boost(published_at: datetime, now: datetime) -> float:
    """Boost for recent posts — decays logarithmically over hours."""
    hours_old = max((now - published_at).total_seconds() / 3600, 0)
    if hours_old < 1:
        return 1.5
    return 1.0 / math.log2(hours_old + 1)


def _strip_html(html: str) -> str:
    """Remove HTML tags for plain text matching."""
    return _HTML_TAG_RE.sub(" ", html).strip()
