"""Casdoor configuration settings."""

import logging
import os
from src.config import get_settings_store as get_settings

logger = logging.getLogger(__name__)

def get_casdoor_config() -> dict:
    """Get Casdoor configuration from OmegaConf settings.

    Env vars take priority over YAML settings — this allows K8s ConfigMap
    values (CASDOOR_URL, CASDOOR_EXTERNAL_URL, etc.) to override defaults
    without requiring changes to the /config YAML files.

    Returns:
        dict with keys:
            - url: str (internal URL, backend→Casdoor)
            - public_url: str (browser-visible URL for OAuth redirects)
            - mobile_url: str (URL reachable from mobile — CASDOOR_EXTERNAL_URL in K8s, "" in Docker)
            - organization: str (Casdoor organization name)
            - client_id: str
            - client_secret: str
    """
    settings = get_settings()
    external_url = os.environ.get("CASDOOR_EXTERNAL_URL") or settings.get_sync("casdoor.public_url", "http://localhost:8082")
    return {
        "url": os.environ.get("CASDOOR_URL") or settings.get_sync("casdoor.url", "http://casdoor:8000"),
        "public_url": external_url,
        # mobile_url: explicit override, else CASDOOR_EXTERNAL_URL (K8s Tailscale hostname),
        # else empty string so callers fall back to per-node Tailscale IP (Docker).
        "mobile_url": os.environ.get("CASDOOR_MOBILE_URL") or external_url if "localhost" not in external_url else "",
        "organization": os.environ.get("CASDOOR_ORG_NAME") or settings.get_sync("casdoor.organization", "ushadow"),
        "client_id": os.environ.get("CASDOOR_CLIENT_ID") or settings.get_sync("casdoor.client_id", "ushadow"),
        "client_secret": os.environ.get("CASDOOR_CLIENT_SECRET") or settings.get_sync("casdoor.client_secret", ""),
    }
