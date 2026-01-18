"""
ushadow API Client (Auto-Generated)

Usage:
    from ushadow.client import Client, AuthenticatedClient
    from ushadow.client.api.default import list_services, start_service
    from ushadow.client.models import Service

Regenerate with:
    ./scripts/regenerate_client.sh
"""

from .client import AuthenticatedClient, Client
from .errors import UnexpectedStatus

__all__ = (
    "AuthenticatedClient",
    "Client",
    "UnexpectedStatus",
)
