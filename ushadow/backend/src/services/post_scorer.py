"""Post Scorer - Platform-aware scoring of posts against the user's interest graph.

Mastodon and YouTube have fundamentally different content lifecycles and quality
signals, so each gets a dedicated scoring strategy:

  Mastodon  — social posts go stale in hours; boost/favourite count signals quality
  YouTube   — videos age over days/weeks; view count + like ratio signal quality,
               and title/description is the primary text match (not hashtags)

Public API unchanged: score_posts(posts, interests) -> List[Post]

Scoring anatomy (both platforms):
  final_score = interest_match_score × platform_quality_multiplier
              + platform_recency_boost
"""

import logging
import math
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

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
        """Score Post objects against user interests, platform-aware.

        For each post:
        1. Find which interests match (hashtag overlap + content keywords)
        2. Compute relevance_score using the appropriate platform strategy
        3. Return sorted by relevance_score descending
        """
        if not interests:
            logger.info("No interests to score against")
            return posts

        tag_lookup = _build_tag_lookup(interests)
        kw_lookup = _build_keyword_lookup(interests)
        now = datetime.now(timezone.utc)

        for post in posts:
            if post.platform_type == "youtube":
                post.relevance_score, post.matched_interests = _score_youtube(
                    post, tag_lookup, kw_lookup, now
                )
            else:
                post.relevance_score, post.matched_interests = _score_mastodon(
                    post, tag_lookup, kw_lookup, now
                )

        posts.sort(key=lambda p: p.relevance_score, reverse=True)

        logger.info(
            f"Scored {len(posts)} posts, "
            f"top score: {posts[0].relevance_score if posts else 0}"
        )
        return posts


# =============================================================================
# Platform scorers
# =============================================================================


def _score_mastodon(
    post: Post,
    tag_lookup: Dict[str, List[Interest]],
    kw_lookup: Dict[str, List[Interest]],
    now: datetime,
) -> Tuple[float, List[str]]:
    """Score a Mastodon post.

    Social posts go stale quickly (hours), and community engagement
    (boosts, favourites) is the best proxy for content quality.

    interest_match × engagement_multiplier + social_recency_boost
    """
    matched: Set[str] = set()
    interest_score = 0.0

    # Hashtag matching — strong direct signal
    for tag in post.hashtags:
        for interest in tag_lookup.get(tag.lower(), []):
            if interest.name not in matched:
                matched.add(interest.name)
                interest_score += _interest_weight(interest, now)

    # Content keyword matching — weaker signal (text is often conversational)
    plain = _strip_html(post.content).lower()
    for keyword, kw_interests in kw_lookup.items():
        if keyword in plain:
            for interest in kw_interests:
                if interest.name not in matched:
                    matched.add(interest.name)
                    interest_score += _interest_weight(interest, now) * 0.4

    # Engagement multiplier: boosts signal community value more than favourites
    boosts = post.boosts_count or 0
    favs = post.favourites_count or 0
    engagement = 1.0 + math.log1p(boosts) * 0.4 + math.log1p(favs) * 0.15
    engagement = min(engagement, 3.0)

    score = interest_score * engagement + _mastodon_recency(post.published_at, now)
    return round(score, 3), sorted(matched)


def _score_youtube(
    post: Post,
    tag_lookup: Dict[str, List[Interest]],
    kw_lookup: Dict[str, List[Interest]],
    now: datetime,
) -> Tuple[float, List[str]]:
    """Score a YouTube video.

    Videos age over days/weeks. Title + description is the primary text signal
    (hashtags in YouTube content are sparse and unreliable). View count and
    like-to-view ratio are strong quality proxies.

    interest_match × quality_multiplier + video_recency_boost
    """
    matched: Set[str] = set()
    interest_score = 0.0

    # Hashtag matching — still useful when present
    for tag in post.hashtags:
        for interest in tag_lookup.get(tag.lower(), []):
            if interest.name not in matched:
                matched.add(interest.name)
                interest_score += _interest_weight(interest, now)

    # Content keyword matching — near-equal weight to hashtags for YouTube
    # (the content field contains "<b>title</b><br/>description")
    plain = _strip_html(post.content).lower()
    for keyword, kw_interests in kw_lookup.items():
        if keyword in plain:
            for interest in kw_interests:
                if interest.name not in matched:
                    matched.add(interest.name)
                    interest_score += _interest_weight(interest, now) * 0.8

    # Quality multiplier: view count (reach) + like ratio (approval)
    views = post.view_count or 0
    likes = post.like_count or 0
    view_signal = math.log1p(views / 1000) * 0.3
    like_ratio = (likes / views) if views > 200 else 0.0
    quality = 1.0 + view_signal + like_ratio * 2.0
    quality = min(quality, 4.0)

    score = interest_score * quality + _youtube_recency(post.published_at, now)
    return round(score, 3), sorted(matched)


# =============================================================================
# Recency functions
# =============================================================================


def _mastodon_recency(published_at: datetime, now: datetime) -> float:
    """Steep hours-based decay for social posts.

    Strong boost for first 2 hours, near-zero by 48 hours.
    """
    hours = max((now - published_at).total_seconds() / 3600, 0)
    if hours < 2:
        return 1.5
    if hours < 24:
        # Linear decay from 1.4 at 2h to 0.2 at 24h
        return 1.4 - (hours - 2) * (1.2 / 22)
    # Logarithmic tail after 24h (practically negligible by 48h)
    return max(0.05, 0.8 / math.log2(hours))


def _youtube_recency(published_at: datetime, now: datetime) -> float:
    """Gentle days-based decay for videos.

    Good through 7 days, usable to ~30 days.
    """
    days = max((now - published_at).total_seconds() / 86400, 0)
    if days < 3:
        return 1.2
    if days < 14:
        # Decay from 1.2 at 3d to 0.3 at 14d
        return 1.2 - (days - 3) * (0.9 / 11)
    return max(0.05, 0.4 / math.log2(days))


# =============================================================================
# Interest weight
# =============================================================================


def _interest_weight(interest: Interest, now: datetime) -> float:
    """Score contribution from a single matched interest.

    log2(relationship_count + 1) gives diminishing returns on count.
    Recency bonus: up to +2.0 for interests active in the last 7 days.
    """
    base = math.log(interest.relationship_count + 1, 2)

    recency_bonus = 0.0
    if interest.last_active:
        try:
            last = interest.last_active
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            days_since = (now - last).total_seconds() / 86400
            if days_since < 7:
                recency_bonus = 2.0 * (1.0 - days_since / 7.0)
        except (TypeError, AttributeError):
            pass

    return base + recency_bonus


# =============================================================================
# Lookup builders
# =============================================================================


def _build_tag_lookup(interests: List[Interest]) -> Dict[str, List[Interest]]:
    """Map hashtag → interests that use it."""
    lookup: Dict[str, List[Interest]] = {}
    for interest in interests:
        for tag in interest.hashtags:
            lookup.setdefault(tag.lower(), []).append(interest)
    return lookup


def _build_keyword_lookup(interests: List[Interest]) -> Dict[str, List[Interest]]:
    """Map interest name words (≥3 chars) → interests, for text matching."""
    lookup: Dict[str, List[Interest]] = {}
    for interest in interests:
        for word in interest.name.lower().split():
            if len(word) >= 3:
                lookup.setdefault(word, []).append(interest)
    return lookup


def _strip_html(html: str) -> str:
    return _HTML_TAG_RE.sub(" ", html).strip()
