"""Feed Service - Orchestrates interest extraction, post fetching, scoring, and storage.

Business logic layer for the personalized multi-platform feed feature.
Router -> FeedService -> InterestExtractor / PostFetcher / PostScorer / MongoDB
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from src.models.feed import (
    Interest,
    Post,
    PostSource,
    SourceCreate,
)
from src.services.interest_extractor import InterestExtractor
from src.services.mastodon_oauth import MastodonOAuthService
from src.services.post_fetcher import PostFetcher
from src.services.post_scorer import PostScorer

logger = logging.getLogger(__name__)


class FeedService:
    """Orchestrates the personalized feed pipeline."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self._extractor = InterestExtractor()
        self._fetcher = PostFetcher()
        self._scorer = PostScorer()

    # =========================================================================
    # Sources
    # =========================================================================

    async def add_source(self, user_id: str, data: SourceCreate) -> PostSource:
        """Add a content source (Mastodon instance or YouTube API key)."""
        source = PostSource(
            user_id=user_id,
            name=data.name,
            platform_type=data.platform_type,
            instance_url=data.instance_url.rstrip("/") if data.instance_url else None,
            api_key=data.api_key,
        )
        await source.insert()
        logger.info(
            f"Added {data.platform_type} source '{data.name}' for user {user_id}"
        )
        return source

    async def list_sources(self, user_id: str) -> List[PostSource]:
        """List all configured post sources for a user."""
        return await PostSource.find(PostSource.user_id == user_id).to_list()

    async def get_mastodon_auth_url(
        self, instance_url: str, redirect_uri: str
    ) -> str:
        """Register app (or reuse cached) and return Mastodon authorization URL."""
        oauth = MastodonOAuthService()
        return await oauth.get_authorization_url(instance_url, redirect_uri)

    async def connect_mastodon(
        self,
        user_id: str,
        instance_url: str,
        code: str,
        redirect_uri: str,
        name: str,
    ) -> PostSource:
        """Exchange OAuth code for a token and create/update a Mastodon source.

        If a source already exists for this user + instance, the token is
        refreshed in-place. Otherwise a new PostSource is created.
        """
        oauth = MastodonOAuthService()
        access_token = await oauth.exchange_code(instance_url, code, redirect_uri)

        normalised_url = instance_url.rstrip("/")
        existing = await PostSource.find_one(
            PostSource.user_id == user_id,
            PostSource.platform_type == "mastodon",
            PostSource.instance_url == normalised_url,
        )
        if existing:
            existing.access_token = access_token
            existing.name = name
            await existing.save()
            logger.info(f"Updated Mastodon token for {user_id} on {normalised_url}")
            return existing

        source = PostSource(
            user_id=user_id,
            name=name,
            platform_type="mastodon",
            instance_url=normalised_url,
            access_token=access_token,
        )
        await source.insert()
        logger.info(f"Connected Mastodon account for {user_id} on {normalised_url}")
        return source

    async def remove_source(self, user_id: str, source_id: str) -> bool:
        """Remove a post source."""
        source = await PostSource.find_one(
            PostSource.user_id == user_id,
            PostSource.source_id == source_id,
        )
        if not source:
            return False
        await source.delete()
        logger.info(f"Removed source '{source.name}' for user {user_id}")
        return True

    # =========================================================================
    # Interests (read-only, derived from OpenMemory graph)
    # =========================================================================

    async def get_interests(self, user_id: str) -> List[Interest]:
        """Extract and return current interests from the user's knowledge graph."""
        return await self._extractor.extract_interests(user_id)

    # =========================================================================
    # Feed Refresh Pipeline
    # =========================================================================

    async def refresh(
        self, user_id: str, platform_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """Full pipeline: extract interests -> fetch posts -> score -> save.

        Args:
            user_id: Owner email.
            platform_type: If set, only refresh sources of this platform.

        Returns summary of what was fetched and stored.
        """
        # 1. Clear cache and extract fresh interests from memories
        self._extractor.clear_cache(user_id)
        interests = await self._extractor.extract_interests(user_id)
        if not interests:
            return {
                "status": "no_interests",
                "message": "No interests found in your knowledge graph. "
                "Add more memories to build your interest profile.",
                "interests_count": 0,
                "posts_fetched": 0,
                "posts_new": 0,
            }

        # 2. Get configured sources (optionally filtered by platform)
        sources = await self.list_sources(user_id)
        if platform_type:
            sources = [s for s in sources if s.platform_type == platform_type]
        if not sources:
            return {
                "status": "no_sources",
                "message": f"No {platform_type or 'post'} sources configured.",
                "interests_count": len(interests),
                "posts_fetched": 0,
                "posts_new": 0,
            }

        # 3. Fetch posts from all platforms (returns List[Post])
        posts = await self._fetcher.fetch_for_interests(
            sources, interests, user_id
        )

        # 4. Score posts against interests
        scored_posts = self._scorer.score_posts(posts, interests)

        # 5. Save new posts to DB (skip duplicates)
        new_count = 0
        for post in scored_posts:
            # Check for existing by external_id
            existing = await Post.find_one(
                Post.user_id == user_id,
                Post.external_id == post.external_id,
            )
            if existing:
                # Update score if post already exists (interests may have changed)
                existing.relevance_score = post.relevance_score
                existing.matched_interests = post.matched_interests
                existing.fetched_at = datetime.utcnow()
                await existing.save()
            else:
                await post.insert()
                new_count += 1

        logger.info(
            f"Feed refresh for {user_id}: {len(interests)} interests, "
            f"{len(posts)} fetched, {new_count} new posts saved"
        )

        return {
            "status": "ok",
            "interests_count": len(interests),
            "interests_used": [
                {"name": i.name, "hashtags": i.hashtags, "weight": i.relationship_count}
                for i in interests[:10]
            ],
            "posts_fetched": len(posts),
            "posts_scored": len(scored_posts),
            "posts_new": new_count,
        }

    # =========================================================================
    # Feed Read
    # =========================================================================

    async def get_feed(
        self,
        user_id: str,
        page: int = 1,
        page_size: int = 20,
        filter_interest: Optional[str] = None,
        show_seen: bool = True,
        platform_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get the ranked feed of posts for a user.

        Returns paginated posts sorted by relevance_score descending.
        Optional platform_type filter for tab-based UI (social vs videos).
        """
        filters: Dict[str, Any] = {"user_id": user_id}

        if not show_seen:
            filters["seen"] = False

        if filter_interest:
            filters["matched_interests"] = filter_interest

        if platform_type:
            filters["platform_type"] = platform_type

        query = Post.find(filters)

        total = await query.count()
        posts = (
            await query.sort(-Post.relevance_score)
            .skip((page - 1) * page_size)
            .limit(page_size)
            .to_list()
        )

        return {
            "posts": posts,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, -(-total // page_size)),  # ceil division
        }

    # =========================================================================
    # Post Actions (per-post)
    # =========================================================================

    async def mark_post_seen(self, user_id: str, post_id: str) -> bool:
        """Mark a specific post as seen."""
        post = await Post.find_one(
            Post.user_id == user_id, Post.post_id == post_id
        )
        if not post:
            return False
        post.seen = True
        await post.save()
        return True

    async def bookmark_post(self, user_id: str, post_id: str) -> bool:
        """Toggle bookmark on a specific post."""
        post = await Post.find_one(
            Post.user_id == user_id, Post.post_id == post_id
        )
        if not post:
            return False
        post.bookmarked = not post.bookmarked
        await post.save()
        return True

    # =========================================================================
    # Stats
    # =========================================================================

    async def get_stats(self, user_id: str) -> Dict[str, Any]:
        """Get feed statistics for the user."""
        total = await Post.find(Post.user_id == user_id).count()
        unseen = await Post.find(
            Post.user_id == user_id, Post.seen == False  # noqa: E712
        ).count()
        bookmarked = await Post.find(
            Post.user_id == user_id, Post.bookmarked == True  # noqa: E712
        ).count()
        sources = await PostSource.find(PostSource.user_id == user_id).count()

        return {
            "total_posts": total,
            "unseen_posts": unseen,
            "bookmarked_posts": bookmarked,
            "sources_count": sources,
        }
