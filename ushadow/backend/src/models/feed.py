"""Feed models for multi-platform content curation.

PostSource: a content platform to fetch posts from (Mastodon, YouTube, etc.).
Post: a single content item, scored against the user's interests.
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
    """A content platform to fetch posts from (Mastodon, YouTube, etc.)."""

    source_id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Unique source identifier",
    )
    user_id: str = Field(..., description="Owner email")
    name: str = Field(..., min_length=1, max_length=200, description="Display name")
    platform_type: str = Field(
        default="mastodon", description="mastodon | youtube"
    )
    instance_url: Optional[str] = Field(
        default=None, description="Server URL (required for mastodon)"
    )
    api_key: Optional[str] = Field(
        default=None, description="API key (required for youtube)"
    )
    # Mastodon OAuth2 — when set, fetches from the user's authenticated home timeline
    # instead of public hashtag timelines.
    access_token: Optional[str] = Field(
        default=None, description="Mastodon OAuth2 access token"
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


class MastodonAppCredential(Document):
    """Cached OAuth2 app credentials per Mastodon instance.

    Mastodon requires registering an application before starting OAuth.
    We register once per instance URL and cache the client_id / client_secret.
    """

    instance_url: str = Field(..., description="Normalised instance base URL")
    client_id: str
    client_secret: str

    class Settings:
        name = "mastodon_app_credentials"
        indexes = ["instance_url"]


class Post(Document):
    """A content item from any platform, scored against the user's interests."""

    post_id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Internal post identifier",
    )
    user_id: str = Field(..., description="Owner who fetched this post")
    source_id: str = Field(..., description="PostSource this came from")
    external_id: str = Field(..., description="Platform-specific ID (for dedup)")
    platform_type: str = Field(
        default="mastodon", description="mastodon | youtube"
    )

    # Author
    author_handle: str = Field(..., description="e.g., @user@mastodon.social")
    author_display_name: str = Field(default="")
    author_avatar: Optional[str] = Field(default=None)

    # Content (shared across platforms)
    content: str = Field(..., description="HTML content or description text")
    url: str = Field(..., description="Link to original post/video")
    published_at: datetime = Field(..., description="When the author posted it")
    hashtags: List[str] = Field(default_factory=list)
    language: Optional[str] = Field(default=None)

    # Mastodon engagement (optional — only set for mastodon)
    boosts_count: Optional[int] = Field(default=None)
    favourites_count: Optional[int] = Field(default=None)
    replies_count: Optional[int] = Field(default=None)

    # YouTube-specific (optional — only set for youtube)
    thumbnail_url: Optional[str] = Field(default=None)
    video_id: Optional[str] = Field(default=None)
    channel_title: Optional[str] = Field(default=None)
    view_count: Optional[int] = Field(default=None)
    like_count: Optional[int] = Field(default=None)
    duration: Optional[str] = Field(default=None, description="ISO 8601 or HH:MM:SS")

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
            [("user_id", 1), ("platform_type", 1), ("relevance_score", -1)],
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
    platform_type: str = Field(default="mastodon", description="mastodon | youtube")
    instance_url: Optional[str] = Field(
        default=None, description="Server URL (required for mastodon)"
    )
    api_key: Optional[str] = Field(
        default=None, description="API key (required for youtube)"
    )

    model_config = {"extra": "forbid"}


class PostUpdate(BaseModel):
    """Request model for updating a post (seen/bookmark)."""

    seen: Optional[bool] = None
    bookmarked: Optional[bool] = None

    model_config = {"extra": "forbid"}
