"""MongoDB URI construction utilities."""

import os
from typing import Optional
from urllib.parse import quote_plus


def build_mongodb_uri_from_env(env: Optional[dict] = None) -> Optional[str]:
    """
    Construct MongoDB URI from component environment variables.

    Reads individual MongoDB configuration from the provided dict or os.environ:
    - MONGODB_HOST (default: mongo)
    - MONGODB_PORT (default: 27017)
    - MONGODB_USER (optional)
    - MONGODB_PASSWORD (optional)
    - MONGODB_DATABASE (optional, for default database in URI)
    - MONGODB_AUTH_SOURCE (default: admin, only used with authentication)

    Args:
        env: Optional dict of env vars. Defaults to os.environ if not provided.

    Returns:
        Constructed MongoDB URI string, or None if MONGODB_HOST not set

    Examples:
        Without authentication:
        mongodb://mongo:27017
        mongodb://mongo:27017/ushadow

        With authentication:
        mongodb://user:pass@mongo:27017/ushadow?authSource=admin
    """
    source = env if env is not None else os.environ
    host = source.get("MONGODB_HOST")
    if not host:
        return None

    port = source.get("MONGODB_PORT", "27017")
    user = source.get("MONGODB_USER", "")
    password = source.get("MONGODB_PASSWORD", "")
    database = source.get("MONGODB_DATABASE", "")
    auth_source = source.get("MONGODB_AUTH_SOURCE", "admin")

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
