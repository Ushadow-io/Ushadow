"""Provider-agnostic OIDC configuration.

Returns OIDC issuer URL, client IDs, and internal URLs regardless of whether
the underlying provider is Keycloak, Authentik, or another OIDC-compliant IdP.

Resolution order:
  1. Explicit ``oidc.*`` settings (generic provider)
  2. Derived from ``keycloak.*`` settings (legacy / Keycloak deployments)
"""

import logging
from typing import Optional

from src.config import get_settings_store as get_settings

logger = logging.getLogger(__name__)


def get_oidc_config() -> dict:
    """Get OIDC provider configuration.

    Returns:
        dict with keys:
            - issuer_url: str     Public issuer URL (browser-reachable)
            - internal_url: str   Internal issuer URL (backend-reachable, may differ in Docker)
            - client_id: str      Mobile / public client ID
            - backend_audience: str  Audience claim expected in access tokens
            - provider_name: str  Human-readable provider name
    """
    settings = get_settings()

    # ── Try explicit OIDC settings first ─────────────────────────────
    issuer_url = settings.get_sync("oidc.issuer_url", None)

    if issuer_url:
        return {
            "issuer_url": issuer_url.rstrip("/"),
            "internal_url": (
                settings.get_sync("oidc.internal_url", None) or issuer_url
            ).rstrip("/"),
            "client_id": settings.get_sync("oidc.client_id", "ushadow-mobile"),
            "backend_audience": settings.get_sync(
                "oidc.backend_audience", "ushadow-backend"
            ),
            "provider_name": settings.get_sync("oidc.provider_name", "OIDC"),
        }

    # ── Derive from Keycloak settings ────────────────────────────────
    try:
        from src.config.keycloak_settings import (
            get_keycloak_config,
            get_keycloak_mobile_url,
        )

        kc = get_keycloak_config()
        realm = kc.get("realm", "ushadow")
        public_url = kc.get("public_url", "http://localhost:8081")
        internal_url = kc.get("url", "http://keycloak:8080")
        mobile_url = get_keycloak_mobile_url()

        # For mobile clients the issuer should be reachable; prefer mobile_url
        effective_public_url = mobile_url or public_url

        return {
            "issuer_url": f"{effective_public_url}/realms/{realm}",
            "internal_url": f"{internal_url}/realms/{realm}",
            "client_id": settings.get_sync(
                "keycloak.mobile_client_id", "ushadow-mobile"
            ),
            "backend_audience": kc.get("backend_client_id", "ushadow-backend"),
            "provider_name": "Keycloak",
        }
    except Exception as e:
        logger.warning(f"[OIDC] Could not derive config from Keycloak settings: {e}")

    # ── Fallback ─────────────────────────────────────────────────────
    logger.error("[OIDC] No OIDC or Keycloak settings found")
    return {
        "issuer_url": "",
        "internal_url": "",
        "client_id": "",
        "backend_audience": "ushadow-backend",
        "provider_name": "none",
    }


def get_oidc_internal_token_endpoint() -> Optional[str]:
    """Resolve the provider's token endpoint reachable from the backend.

    Uses OIDC discovery on the internal URL so we don't need to hardcode
    provider-specific URL patterns.

    For performance, this falls back to well-known patterns when discovery
    is unavailable (e.g. at startup before the provider is reachable).
    """
    import httpx

    config = get_oidc_config()
    internal_url = config["internal_url"]

    if not internal_url:
        return None

    # Try OIDC discovery on internal URL
    try:
        well_known = f"{internal_url}/.well-known/openid-configuration"
        resp = httpx.get(well_known, timeout=5.0)
        if resp.status_code == 200:
            doc = resp.json()
            token_endpoint = doc.get("token_endpoint")
            if token_endpoint:
                # The discovered endpoint may reference the public URL;
                # rewrite its host to the internal URL for backend use.
                from urllib.parse import urlparse, urlunparse

                parsed_internal = urlparse(internal_url)
                parsed_endpoint = urlparse(token_endpoint)
                rewritten = parsed_endpoint._replace(
                    scheme=parsed_internal.scheme,
                    netloc=parsed_internal.netloc,
                )
                return urlunparse(rewritten)
    except Exception as e:
        logger.debug(f"[OIDC] Discovery failed on internal URL, using fallback: {e}")

    # Fallback: Keycloak pattern (most common)
    if "/realms/" in internal_url:
        return f"{internal_url}/protocol/openid-connect/token"

    # Fallback: Authentik pattern
    # Authentik's token endpoint is at /application/o/token/ (global, not per-application)
    settings = get_settings()
    if settings.get_sync("oidc.provider_name", "").lower() == "authentik":
        from urllib.parse import urlparse, urlunparse

        parsed = urlparse(internal_url)
        return urlunparse(parsed._replace(path="/application/o/token/"))

    return None
