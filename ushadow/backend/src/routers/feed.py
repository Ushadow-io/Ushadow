"""Feed Router - API endpoints for the personalized fediverse feed.

Thin HTTP adapter: parses requests, calls FeedService, returns responses.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from src.config.store import SettingsStore, get_settings_store
from src.database import get_database
from src.models.feed import SourceCreate
from pydantic import BaseModel


class MastodonConnectRequest(BaseModel):
    instance_url: str
    code: str
    redirect_uri: str
    name: str = "Mastodon"
from src.services.auth import get_current_user
from src.services.feed_service import FeedService
from src.utils.auth_helpers import get_user_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/feed", tags=["feed"])


def _get_settings() -> SettingsStore:
    return get_settings_store()


def get_feed_service(
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: SettingsStore = Depends(_get_settings),
) -> FeedService:
    return FeedService(db, settings)


# =========================================================================
# Sources
# =========================================================================


@router.get("/sources")
async def list_sources(
    service: FeedService = Depends(get_feed_service),
    current_user=Depends(get_current_user),
):
    """List configured post sources."""
    user_id = get_user_email(current_user)
    sources = await service.list_sources(user_id)
    return {"sources": sources}


@router.get("/sources/mastodon/auth-url")
async def mastodon_auth_url(
    instance_url: str = Query(..., description="Mastodon instance URL, e.g. mastodon.social"),
    redirect_uri: str = Query(..., description="App redirect URI for OAuth callback"),
    service: FeedService = Depends(get_feed_service),
    current_user=Depends(get_current_user),
):
    """Return a Mastodon OAuth2 authorization URL.

    The client should open this URL in a browser. After the user authorises,
    Mastodon redirects to redirect_uri?code=<code>. Pass that code to
    POST /api/feed/sources/mastodon/connect.
    """
    try:
        url = await service.get_mastodon_auth_url(instance_url, redirect_uri)
        return {"authorization_url": url}
    except Exception as e:
        logger.error(f"Mastodon auth URL error: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/sources/mastodon/connect", status_code=201)
async def mastodon_connect(
    data: MastodonConnectRequest,
    service: FeedService = Depends(get_feed_service),
    current_user=Depends(get_current_user),
):
    """Exchange a Mastodon OAuth2 code for an access token and save the source.

    Creates a new PostSource (or updates an existing one for the same instance)
    with the access token. Future refreshes will pull from the authenticated
    home timeline instead of public hashtag timelines.
    """
    user_id = get_user_email(current_user)
    try:
        source = await service.connect_mastodon(
            user_id=user_id,
            instance_url=data.instance_url,
            code=data.code,
            redirect_uri=data.redirect_uri,
            name=data.name,
        )
        return source
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Mastodon connect error: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/sources", status_code=201)
async def add_source(
    data: SourceCreate,
    service: FeedService = Depends(get_feed_service),
    current_user=Depends(get_current_user),
):
    """Add a content source (Mastodon instance or YouTube API key)."""
    # Validate platform-specific required fields
    if data.platform_type == "mastodon" and not data.instance_url:
        raise HTTPException(
            status_code=422, detail="instance_url is required for mastodon sources"
        )
    if data.platform_type == "youtube" and not data.api_key:
        raise HTTPException(
            status_code=422, detail="api_key is required for youtube sources"
        )
    if data.platform_type not in ("mastodon", "youtube"):
        raise HTTPException(
            status_code=422, detail=f"Unknown platform_type: {data.platform_type}"
        )

    user_id = get_user_email(current_user)
    source = await service.add_source(user_id, data)
    return source


@router.delete("/sources/{source_id}")
async def remove_source(
    source_id: str,
    service: FeedService = Depends(get_feed_service),
    current_user=Depends(get_current_user),
):
    """Remove a post source."""
    user_id = get_user_email(current_user)
    removed = await service.remove_source(user_id, source_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"status": "removed"}


# =========================================================================
# Interests (read-only, derived from stored memories)
# =========================================================================


@router.get("/interests")
async def get_interests(
    service: FeedService = Depends(get_feed_service),
    current_user=Depends(get_current_user),
):
    """View interests extracted from your stored memories."""
    user_id = get_user_email(current_user)
    interests = await service.get_interests(user_id)
    return {"interests": [i.model_dump() for i in interests]}


# =========================================================================
# Feed
# =========================================================================


@router.get("/posts")
async def get_feed(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    interest: Optional[str] = Query(default=None, description="Filter by interest name"),
    show_seen: bool = Query(default=True),
    platform_type: Optional[str] = Query(
        default=None, description="Filter: mastodon | youtube"
    ),
    service: FeedService = Depends(get_feed_service),
    current_user=Depends(get_current_user),
):
    """Get ranked feed of posts, sorted by relevance to your interests."""
    user_id = get_user_email(current_user)
    return await service.get_feed(
        user_id, page, page_size, interest, show_seen, platform_type
    )


@router.post("/refresh")
async def refresh_feed(
    platform_type: Optional[str] = Query(
        default=None, description="Refresh only this platform: mastodon | youtube"
    ),
    service: FeedService = Depends(get_feed_service),
    current_user=Depends(get_current_user),
):
    """Trigger a feed refresh, optionally scoped to one platform."""
    user_id = get_user_email(current_user)
    result = await service.refresh(user_id, platform_type)
    return result


# =========================================================================
# Post Actions
# =========================================================================


@router.post("/posts/{post_id}/seen")
async def mark_post_seen(
    post_id: str,
    service: FeedService = Depends(get_feed_service),
    current_user=Depends(get_current_user),
):
    """Mark a specific post as seen."""
    user_id = get_user_email(current_user)
    ok = await service.mark_post_seen(user_id, post_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Post not found")
    return {"status": "seen"}


@router.post("/posts/{post_id}/bookmark")
async def bookmark_post(
    post_id: str,
    service: FeedService = Depends(get_feed_service),
    current_user=Depends(get_current_user),
):
    """Toggle bookmark on a specific post."""
    user_id = get_user_email(current_user)
    ok = await service.bookmark_post(user_id, post_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Post not found")
    return {"status": "toggled"}


# =========================================================================
# Stats
# =========================================================================


@router.get("/stats")
async def get_stats(
    service: FeedService = Depends(get_feed_service),
    current_user=Depends(get_current_user),
):
    """Get feed statistics."""
    user_id = get_user_email(current_user)
    return await service.get_stats(user_id)
