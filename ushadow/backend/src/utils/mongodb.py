"""MongoDB URI construction utilities."""

import os
from typing import Optional
from urllib.parse import quote_plus


def build_mongodb_uri_from_env(env: Optional[dict] = None) -> Optional[str]:
    """
    Construct MongoDB URI from component environment variables.

    Reads individual MongoDB configuration from the provided dict or os.environ:
    - MONGODB_HOST (required — returns None if absent)
    - MONGODB_PORT (default: 27017)
    - MONGODB_USER (optional)
    - MONGODB_PASSWORD (optional — omitted from URI if not set)
    - MONGODB_DATABASE (optional)
    - MONGODB_AUTH_SOURCE (default: admin, only included when user is set)
    - MONGODB_REPLICA_SET (optional — adds ?replicaSet=<name> to the URI)

    Args:
        env: Optional dict of env vars. Defaults to os.environ if not provided.

    Returns:
        Constructed MongoDB URI string, or None if MONGODB_HOST not set.

    Examples:
        No auth:          mongodb://mongo:27017/mydb
        User only:        mongodb://user@mongo:27017/mydb?authSource=admin
        User + password:  mongodb://user:pass@mongo:27017/mydb?authSource=admin
        With replica set: mongodb://mongo:27017/mydb?replicaSet=rs0
        Full:             mongodb://user:pass@mongo:27017/mydb?authSource=admin&replicaSet=rs0
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
    replica_set = source.get("MONGODB_REPLICA_SET", "")

    # Build credentials — user is enough on its own (password is optional)
    if user:
        encoded_user = quote_plus(user)
        credentials = (
            f"{encoded_user}:{quote_plus(password)}@" if password
            else f"{encoded_user}@"
        )
    else:
        credentials = ""

    # Build base URI
    uri = f"mongodb://{credentials}{host}:{port}"
    if database:
        uri += f"/{database}"

    # Build query string
    params: list[str] = []
    if user:
        params.append(f"authSource={auth_source}")
    if replica_set:
        params.append(f"replicaSet={replica_set}")
    if params:
        uri += "?" + "&".join(params)

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
