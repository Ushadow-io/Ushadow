"""BlueskyService — authenticated Bluesky post and reply operations.

Uses the atproto AsyncClient with app password authentication.
Client sessions are cached at the class level (process lifetime) to avoid
re-authenticating on every post/reply request.

Only bluesky_timeline sources can post/reply, since they carry credentials.
"""

import logging
from typing import Dict, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from src.models.feed import Post, PostSource

logger = logging.getLogger(__name__)

BLUESKY_CHAR_LIMIT = 300


class BlueskyService:
    """Handles authenticated Bluesky operations: create posts and replies.

    Session cache is class-level so it persists across the FastAPI process.
    Sessions are recreated on login errors (e.g. expired app password).
    """

    _client_cache: Dict[str, object] = {}  # source_id → atproto AsyncClient

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db

    async def _get_client(self, source_id: str, user_id: str) -> object:
        """Return a cached authenticated atproto client for this source.

        Creates and logs in a new client if not cached.
        Raises ValueError if credentials are missing or login fails.
        """
        from atproto import AsyncClient as BskyClient  # noqa: PLC0415

        if source_id in BlueskyService._client_cache:
            return BlueskyService._client_cache[source_id]

        source = await PostSource.find_one(
            PostSource.source_id == source_id,
            PostSource.user_id == user_id,
        )
        if not source:
            raise ValueError(f"Source '{source_id}' not found")
        if source.platform_type != "bluesky_timeline":
            raise ValueError("Only bluesky_timeline sources can post/reply")
        if not source.handle or not source.api_key:
            raise ValueError(
                "bluesky_timeline source requires both handle and api_key (app password)"
            )

        client = BskyClient()
        try:
            await client.login(source.handle, source.api_key)
        except Exception as e:
            raise ValueError(f"Bluesky login failed for @{source.handle}: {e}") from e

        BlueskyService._client_cache[source_id] = client
        return client

    def _invalidate_session(self, source_id: str) -> None:
        """Remove a cached session (call after auth errors to force re-login)."""
        BlueskyService._client_cache.pop(source_id, None)

    async def create_post(
        self, source_id: str, user_id: str, text: str
    ) -> Dict[str, str]:
        """Publish a new post to Bluesky.

        Args:
            source_id: The bluesky_timeline source to post from.
            user_id: Must own the source.
            text: Post text (max 300 characters).

        Returns:
            {"uri": str, "cid": str} of the created post.
        """
        if len(text) > BLUESKY_CHAR_LIMIT:
            raise ValueError(
                f"Post exceeds {BLUESKY_CHAR_LIMIT} character limit ({len(text)} chars)"
            )

        client = await self._get_client(source_id, user_id)
        try:
            response = await client.send_post(text)
        except Exception as e:
            self._invalidate_session(source_id)
            raise ValueError(f"Failed to post: {e}") from e

        logger.info("Created Bluesky post %s", response.uri)
        return {"uri": response.uri, "cid": response.cid}

    async def reply_to_post(
        self,
        source_id: str,
        user_id: str,
        text: str,
        post_id: str,
    ) -> Dict[str, str]:
        """Reply to an existing Bluesky post stored in our feed.

        Looks up the post by post_id to retrieve its AT URI and CID.
        Uses the same ref for both parent and root (works for direct replies
        to root posts; for deeply-nested threads the root would differ, but
        this covers the common case).

        Args:
            source_id: The bluesky_timeline source to reply from.
            user_id: Must own the source.
            text: Reply text (max 300 characters).
            post_id: Our internal post_id (used to look up AT URI + CID).

        Returns:
            {"uri": str, "cid": str} of the created reply.
        """
        from atproto import models as bsky_models  # noqa: PLC0415

        if len(text) > BLUESKY_CHAR_LIMIT:
            raise ValueError(
                f"Reply exceeds {BLUESKY_CHAR_LIMIT} character limit ({len(text)} chars)"
            )

        post = await Post.find_one(
            Post.post_id == post_id,
            Post.user_id == user_id,
        )
        if not post:
            raise ValueError(f"Post '{post_id}' not found")
        if not post.bluesky_cid:
            raise ValueError("Post is missing CID — cannot construct reply ref")

        parent_ref = bsky_models.ComAtprotoRepoStrongRef.Main(
            uri=post.external_id,
            cid=post.bluesky_cid,
        )
        reply_ref = bsky_models.AppBskyFeedPost.ReplyRef(
            parent=parent_ref,
            root=parent_ref,  # Root = parent for top-level replies
        )

        client = await self._get_client(source_id, user_id)
        try:
            response = await client.send_post(text, reply_to=reply_ref)
        except Exception as e:
            self._invalidate_session(source_id)
            raise ValueError(f"Failed to reply: {e}") from e

        logger.info("Created Bluesky reply %s → %s", response.uri, post.external_id)
        return {"uri": response.uri, "cid": response.cid}


def get_bluesky_service(db: AsyncIOMotorDatabase) -> BlueskyService:
    """Dependency provider for BlueskyService."""
    return BlueskyService(db)
