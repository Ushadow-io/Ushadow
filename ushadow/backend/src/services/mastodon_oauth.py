"""Mastodon OAuth2 service — app registration and token exchange.

Uses Mastodon.py for the OAuth dance (app registration, URL generation,
code exchange). The library's synchronous calls are run via asyncio.to_thread
so they don't block the event loop.

Flow:
  1. GET /api/feed/sources/mastodon/auth-url?instance_url=...&redirect_uri=...
     → registers app (or reuses cached credentials)
     → returns authorization URL to open in-browser
  2. User authorises → redirect to redirect_uri?code=xxx
  3. POST /api/feed/sources/mastodon/connect
     { instance_url, code, redirect_uri, name }
     → exchanges code for access_token
     → saves PostSource with token
"""

import asyncio
import logging

from mastodon import Mastodon

from src.models.feed import MastodonAppCredential

logger = logging.getLogger(__name__)

_SCOPES = ["read"]
_APP_NAME = "Ushadow"


class MastodonOAuthService:
    """Handles OAuth2 registration and token exchange with Mastodon instances."""

    async def get_authorization_url(
        self, instance_url: str, redirect_uri: str
    ) -> str:
        """Return the Mastodon authorization URL for the given instance.

        Registers an OAuth2 app on the instance if not already cached.
        """
        instance_url = _normalise(instance_url)
        cred = await self._get_or_register_app(instance_url, redirect_uri)

        def _build() -> str:
            m = Mastodon(
                client_id=cred.client_id,
                client_secret=cred.client_secret,
                api_base_url=instance_url,
            )
            return m.auth_request_url(
                redirect_uris=redirect_uri,
                scopes=_SCOPES,
            )

        url: str = await asyncio.to_thread(_build)
        logger.info(f"Generated Mastodon auth URL for {instance_url}")
        return url

    async def exchange_code(
        self, instance_url: str, code: str, redirect_uri: str
    ) -> str:
        """Exchange an authorization code for an access token.

        Returns:
            The access token string.

        Raises:
            ValueError: If no app is registered for this instance.
        """
        instance_url = _normalise(instance_url)
        cred = await MastodonAppCredential.find_one(
            MastodonAppCredential.instance_url == instance_url
        )
        if not cred:
            raise ValueError(
                f"No app registered for {instance_url}. "
                "Call get_authorization_url first."
            )

        def _exchange() -> str:
            m = Mastodon(
                client_id=cred.client_id,
                client_secret=cred.client_secret,
                api_base_url=instance_url,
            )
            token: str = m.log_in(
                code=code,
                redirect_uri=redirect_uri,
                scopes=_SCOPES,
            )
            return token

        token = await asyncio.to_thread(_exchange)
        logger.info(f"Exchanged OAuth code for token on {instance_url}")
        return token

    async def _get_or_register_app(
        self, instance_url: str, redirect_uri: str
    ) -> MastodonAppCredential:
        """Return cached credentials, or register a new app on the instance."""
        existing = await MastodonAppCredential.find_one(
            MastodonAppCredential.instance_url == instance_url
        )
        if existing:
            return existing

        def _register() -> tuple[str, str]:
            return Mastodon.create_app(
                _APP_NAME,
                api_base_url=instance_url,
                redirect_uris=redirect_uri,
                scopes=_SCOPES,
                to_file=None,
            )

        client_id, client_secret = await asyncio.to_thread(_register)
        cred = MastodonAppCredential(
            instance_url=instance_url,
            client_id=client_id,
            client_secret=client_secret,
        )
        await cred.insert()
        logger.info(f"Registered Mastodon OAuth2 app for {instance_url}")
        return cred


def _normalise(url: str) -> str:
    """Ensure consistent URL format (https, no trailing slash)."""
    url = url.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    return url
