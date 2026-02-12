"""Feed models for personalized fediverse content curation.

PostSource: a Mastodon-compatible server to fetch posts from.
Post: a single fediverse post, scored against the user's interests.
Interest: a topic/entity derived from the user's stored memories (not persisted).
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from beanie import Document
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# =============================================================================
# Beanie Documents (MongoDB collections)
# =============================================================================


class PostSource(Document):
    """A Mastodon-compatible server to fetch posts from."""

    source_id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Unique source identifier",
    )
    user_id: str = Field(..., description="Owner email")
    name: str = Field(..., min_length=1, max_length=200, description="Display name")
    instance_url: str = Field(
        ..., description="Server URL (e.g., https://mastodon.social)"
    )
    platform_type: str = Field(
        default="mastodon", description="Platform type: mastodon (future: bluesky)"
    )
    enabled: bool = Field(default=True)

    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "feed_sources"
        indexes = [
            "user_id",
            "source_id",
            [("user_id", 1), ("source_id", 1)],
        ]


class Post(Document):
    """A single fediverse post, scored against the user's interest graph."""

    post_id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Internal post identifier",
    )
    user_id: str = Field(..., description="Owner who fetched this post")
    source_id: str = Field(..., description="PostSource this came from")
    external_id: str = Field(..., description="Mastodon status ID (for dedup)")

    # Author
    author_handle: str = Field(..., description="e.g., @user@mastodon.social")
    author_display_name: str = Field(default="")
    author_avatar: Optional[str] = Field(default=None)

    # Content
    content: str = Field(..., description="HTML content from Mastodon")
    url: str = Field(..., description="Link to original post")
    published_at: datetime = Field(..., description="When the author posted it")
    hashtags: List[str] = Field(default_factory=list)
    language: Optional[str] = Field(default=None)

    # Engagement (from Mastodon API)
    boosts_count: int = Field(default=0)
    favourites_count: int = Field(default=0)
    replies_count: int = Field(default=0)

    # Scoring
    relevance_score: float = Field(default=0.0, description="Computed by PostScorer")
    matched_interests: List[str] = Field(
        default_factory=list, description="Interest names that matched this post"
    )

    # User interaction
    seen: bool = Field(default=False)
    bookmarked: bool = Field(default=False)

    # Metadata
    fetched_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "feed_posts"
        indexes = [
            "user_id",
            "post_id",
            "external_id",
            [("user_id", 1), ("relevance_score", -1)],  # Feed query: ranked
            [("user_id", 1), ("bookmarked", 1)],  # Bookmarked posts
            [("user_id", 1), ("external_id", 1)],  # Dedup check
        ]


# =============================================================================
# Pydantic models (not persisted — derived or request/response)
# =============================================================================


class Interest(BaseModel):
    """A topic/entity derived from the user's stored memories.

    Not persisted — computed on each refresh by aggregating memory categories
    and entities, weighted by mention count and recency.
    """

    name: str = Field(..., description="Interest name (e.g., 'kubernetes', 'Mac mini')")
    node_id: str = Field(..., description="Deterministic ID (md5 hash of name)")
    labels: List[str] = Field(
        default_factory=list, description="Source type: ['category'] or ['entity']"
    )
    relationship_count: int = Field(
        default=0, description="Weighted score (mention_count × recency × source_bonus)"
    )
    last_active: Optional[datetime] = Field(
        default=None, description="Most recent memory timestamp for this interest"
    )
    hashtags: List[str] = Field(
        default_factory=list, description="Derived hashtags for fediverse search"
    )


class SourceCreate(BaseModel):
    """Request model for adding a post source."""

    name: str = Field(..., min_length=1, max_length=200)
    instance_url: str = Field(
        ..., description="Mastodon-compatible server URL"
    )
    platform_type: str = Field(default="mastodon")

    model_config = {"extra": "forbid"}


class PostUpdate(BaseModel):
    """Request model for updating a post (seen/bookmark)."""

    seen: Optional[bool] = None
    bookmarked: Optional[bool] = None

    model_config = {"extra": "forbid"}
