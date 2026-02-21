"""MongoDB URI construction utilities."""

import os
from typing import Optional
from urllib.parse import quote_plus


def build_mongodb_uri_from_env() -> Optional[str]:
    """
    Construct MongoDB URI from component environment variables.

    Reads individual MongoDB configuration from environment:
    - MONGODB_HOST (default: mongo)
    - MONGODB_PORT (default: 27017)
    - MONGODB_USER (optional)
    - MONGODB_PASSWORD (optional)
    - MONGODB_DATABASE (optional, for default database in URI)
    - MONGODB_AUTH_SOURCE (default: admin, only used with authentication)

    Returns:
        Constructed MongoDB URI string, or None if MONGODB_HOST not set

    Examples:
        Without authentication:
        mongodb://mongo:27017
        mongodb://mongo:27017/ushadow

        With authentication:
        mongodb://user:pass@mongo:27017/ushadow?authSource=admin
    """
    host = os.environ.get("MONGODB_HOST")
    if not host:
        return None

    port = os.environ.get("MONGODB_PORT", "27017")
    user = os.environ.get("MONGODB_USER", "")
    password = os.environ.get("MONGODB_PASSWORD", "")
    database = os.environ.get("MONGODB_DATABASE", "")
    auth_source = os.environ.get("MONGODB_AUTH_SOURCE", "admin")

    # URL-encode credentials to handle special characters
    if user:
        user = quote_plus(user)
    if password:
        password = quote_plus(password)

    # Build URI components
    if user and password:
        # Authenticated connection
        credentials = f"{user}:{password}@"
        query_params = f"?authSource={auth_source}"
    else:
        # No authentication
        credentials = ""
        query_params = ""

    # Build base URI
    uri = f"mongodb://{credentials}{host}:{port}"

    # Add database if specified
    if database:
        uri += f"/{database}"

    # Add query parameters (only for authenticated connections)
    uri += query_params

    return uri


def get_mongodb_uri(fallback: str = "mongodb://mongo:27017") -> str:
    """
    Get MongoDB URI from environment.

    Priority:
    1. MONGODB_URI environment variable (complete URI)
    2. Construct from MONGODB_HOST, MONGODB_PORT, etc. (component variables)
    3. Fallback value

    Args:
        fallback: Default URI if neither MONGODB_URI nor components are set

    Returns:
        MongoDB connection URI string
    """
    # Check for complete URI first
    uri = os.environ.get("MONGODB_URI")
    if uri:
        return uri

    # Try to build from components
    uri = build_mongodb_uri_from_env()
    if uri:
        return uri

    # Use fallback
    return fallback
