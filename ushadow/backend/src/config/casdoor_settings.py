"""Casdoor configuration settings."""

import logging
from src.config import get_settings_store as get_settings

logger = logging.getLogger(__name__)

def get_casdoor_config() -> dict:
    """Get Casdoor configuration from OmegaConf settings.

    Returns:
        dict with keys:
            - url: str (internal Docker URL, backend→Casdoor)
            - public_url: str (browser-visible URL for OAuth redirects)
            - organization: str (Casdoor organization name)
            - client_id: str
    """
    settings = get_settings()
    return {
        "url": settings.get_sync("casdoor.url", "http://casdoor:8000"),
        "public_url": settings.get_sync("casdoor.public_url", "http://localhost:8082"),
        "organization": settings.get_sync("casdoor.organization", "ushadow"),
        "client_id": settings.get_sync("casdoor.client_id", "ushadow"),
        "client_secret": settings.get_sync("casdoor.client_secret", ""),
    }
