"""
Secret detection and masking utilities.

Single source of truth for identifying sensitive values and masking them in API responses.
"""

import logging
from pathlib import Path
from typing import Optional

from omegaconf import OmegaConf

logger = logging.getLogger(__name__)

# Patterns that indicate a key contains sensitive data
SENSITIVE_PATTERNS = ['key', 'secret', 'password', 'token', 'credential', 'auth', 'pass']

# Cache for loaded secrets
_secrets_cache: Optional[dict] = None


def _get_secrets_path() -> Optional[Path]:
    """Find secrets.yaml in common locations."""
    candidates = [
        Path("/config/secrets.yaml"),
        Path("config/secrets.yaml"),
        Path(__file__).parent.parent.parent.parent / "config" / "secrets.yaml",
    ]
    for path in candidates:
        if path.exists():
            return path
    return None


def _load_secrets() -> dict:
    """Load secrets.yaml (cached)."""
    global _secrets_cache
    if _secrets_cache is not None:
        return _secrets_cache

    path = _get_secrets_path()
    if path:
        try:
            _secrets_cache = OmegaConf.to_container(OmegaConf.load(path))
            return _secrets_cache
        except Exception as e:
            logger.warning(f"Error loading secrets from {path}: {e}")

    _secrets_cache = {}
    return _secrets_cache


def get_auth_secret_key() -> str:
    """Get AUTH_SECRET_KEY from OmegaConf (secrets.yaml -> security.auth_secret_key)."""
    from src.config.omegaconf_settings import get_settings_store
    key = get_settings_store().get_sync("security.auth_secret_key")
    if not key:
        raise ValueError(
            "AUTH_SECRET_KEY not found in config/secrets.yaml. "
            "Run ./go.sh or ensure secrets.yaml has security.auth_secret_key"
        )
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
