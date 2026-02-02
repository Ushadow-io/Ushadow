"""
Secret detection and masking utilities.

Single source of truth for identifying sensitive values and masking them in API responses.

This module provides:
- SENSITIVE_PATTERNS: Canonical list of patterns indicating sensitive data
- is_secret_key(): Check if a key name indicates sensitive data
- mask_value(): Mask a sensitive value, showing only last 4 chars
- mask_if_secret(): Conditionally mask based on key name
- mask_dict_secrets(): Recursively mask sensitive values in a dictionary
"""

import logging

logger = logging.getLogger(__name__)

# Patterns that indicate a key contains sensitive data
# This is the single source of truth - other modules should import from here
SENSITIVE_PATTERNS = ['key', 'secret', 'password', 'token', 'credential', 'auth', 'pass']


def get_auth_secret_key() -> str:
    """
    Get AUTH_SECRET_KEY from config store, with env var bootstrap.

    Priority:
    1. secrets.yaml (security.auth_secret_key) - already persisted
    2. Environment variable AUTH_SECRET_KEY - copy to secrets.yaml on first use

    On first deploy, provide AUTH_SECRET_KEY via env var. It gets persisted
    to secrets.yaml so future restarts don't need the env var.
    """
    import os
    import asyncio
    from src.config import get_settings

    settings = get_settings()
    key = settings.get_sync("security.auth_secret_key")

    if key:
        return key

    # Not in store - check environment variable
    key = os.environ.get("AUTH_SECRET_KEY")

    if not key:
        raise ValueError(
            "AUTH_SECRET_KEY not found. Provide via environment variable on first deploy. "
            "It will be persisted to /config/secrets.yaml for future restarts."
        )

    # Persist env var to secrets.yaml for future restarts (update auto-routes secrets)
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(settings.update({
                "security": {"auth_secret_key": key}
            }))
            logger.info("AUTH_SECRET_KEY from env var will be persisted to secrets.yaml")
        else:
            loop.run_until_complete(settings.update({
                "security": {"auth_secret_key": key}
            }))
            logger.info("AUTH_SECRET_KEY from env var persisted to secrets.yaml")
    except Exception as e:
        logger.warning(f"Could not persist AUTH_SECRET_KEY to secrets.yaml: {e}")

    return key


def is_secret_key(name: str) -> bool:
    """
    Check if a key name indicates sensitive data.

    Args:
        name: Key name to check (e.g., "OPENAI_API_KEY", "admin_password")

    Returns:
        True if the key name matches sensitive patterns
    """
    name_lower = name.lower()
    return any(p in name_lower for p in SENSITIVE_PATTERNS)


def should_store_in_secrets(path: str) -> bool:
    """
    Determine if a setting path should be stored in secrets.yaml.

    This is used by SettingsStore to route saves to the correct file.

    Args:
        path: Full setting path (e.g., "api_keys.openai_api_key")

    Returns:
        True if this should be stored in secrets.yaml, False for config.overrides.yaml

    Rules:
        - Anything under api_keys.* → secrets.yaml
        - security.* containing secret/key/password → secrets.yaml
        - admin.* containing password → secrets.yaml
        - Otherwise, check if key name matches sensitive patterns
    """
    path_lower = path.lower()

    # Section-based rules (take precedence)
    if path_lower.startswith('api_keys.'):
        return True
    if path_lower.startswith('security.') and any(p in path_lower for p in ['secret', 'key', 'password']):
        return True
    if path_lower.startswith('admin.') and 'password' in path_lower:
        return True

    # Fall back to pattern matching
    return is_secret_key(path)


def mask_value(value: str) -> str:
    """
    Mask a sensitive value, showing only last 4 chars.

    Args:
        value: The sensitive value to mask

    Returns:
        Masked string like "****abcd"
    """
    if not value or len(value) <= 4:
        return "****"
    return f"****{value[-4:]}"


def mask_if_secret(name: str, value: str) -> str:
    """
    Mask value if the key name indicates it's sensitive.

    Args:
        name: Key name
        value: Value to potentially mask

    Returns:
        Masked value if sensitive, original value otherwise
    """
    if is_secret_key(name) and value:
        return mask_value(value)
    return value


def mask_secret_value(value: str, path: str) -> str:
    """
    Mask a value if the path indicates it's sensitive.

    Args:
        value: The value to potentially mask
        path: The setting path (e.g., "api_keys.openai_api_key")

    Returns:
        Masked value with bullets (••••) if sensitive, original value otherwise
    """
    if not value:
        return ""
    if is_secret_key(path):
        return mask_value(value).replace("****", "••••")  # Use bullet style
    return value


def mask_dict_secrets(data: dict) -> dict:
    """
    Recursively mask sensitive values in a dictionary.

    Args:
        data: Dictionary potentially containing sensitive values

    Returns:
        New dictionary with sensitive values masked
    """
    result = {}
    for key, value in data.items():
        if isinstance(value, dict):
            result[key] = mask_dict_secrets(value)
        elif isinstance(value, list):
            result[key] = [
                mask_dict_secrets(item) if isinstance(item, dict) else item
                for item in value
            ]
        elif isinstance(value, str) and value.strip() and is_secret_key(key):
            result[key] = mask_value(value)
        else:
            result[key] = value
    return result
