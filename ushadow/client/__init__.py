"""
ushadow API Client

Simple HTTP wrapper with authentication support.

Usage:
    from ushadow.client import UshadowClient

    client = UshadowClient.from_env()
    services = client.list_services()
    client.api("POST", "/api/services/chronicle/start")
"""

from .auth import UshadowClient, get_client

__all__ = (
    "UshadowClient",
    "get_client",
)
