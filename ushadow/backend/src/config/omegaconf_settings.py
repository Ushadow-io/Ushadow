"""
OmegaConf-based Settings Manager

DEPRECATED: This file now re-exports from store.py and settings.py.
For new code, import directly from:
- src.config.settings (Settings v2 API)
- src.config.store (SettingsStore infrastructure)

This file is kept for backward compatibility.
"""

import logging
import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Optional, List, Tuple, Dict

from omegaconf import OmegaConf, DictConfig

from src.config.secrets import SENSITIVE_PATTERNS, is_secret_key, mask_value, mask_if_secret
from src.services.provider_registry import get_provider_registry
from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="Settings")


# =============================================================================
# Custom OmegaConf Resolvers
# =============================================================================

def _env_resolver(env_var_name: str, _root_: DictConfig) -> Optional[str]:
    """
    Search config tree for a key matching an env var name.

    Strategies (in order):
    1. Path-based: TRANSCRIPTION_PROVIDER -> transcription.provider
    2. Key search: OPENAI_API_KEY -> api_keys.openai_api_key

    Usage in YAML: ${env:MEMORY_SERVER_URL}
    """
    key = env_var_name.lower()

    # Strategy 1: Treat underscores as path separators
    parts = key.split('_')
    if len(parts) >= 2:
        section_name = parts[0]
        key_name = '_'.join(parts[1:])
        section = _root_.get(section_name)
        if isinstance(section, (dict, DictConfig)) and key_name in section:
            value = section.get(key_name)
            if value is not None:
                return str(value)

    # Strategy 2: Search all top-level sections for exact key match
    for section_name in _root_:
        section = _root_.get(section_name)
        if isinstance(section, (dict, DictConfig)) and key in section:
            value = section.get(key)
            if value is not None:
                return str(value)

    return None


# Register resolvers (only once)
if not OmegaConf.has_resolver("env"):
    OmegaConf.register_new_resolver("env", _env_resolver)

if not OmegaConf.has_resolver("merge_csv"):
    # Merge comma-separated values from multiple sources, deduplicating
    # Usage: ${merge_csv:${oc.env:CORS_ORIGINS,},http://localhost:3000}
    OmegaConf.register_new_resolver(
        "merge_csv",
        lambda *args: ",".join(sorted(set(
            o.strip() for a in args if a for o in str(a).split(",") if o.strip()
        )))
    )


# =============================================================================
# Setting Suggestion Model
# =============================================================================

@dataclass
class SettingSuggestion:
    """A suggested setting that could fill an environment variable."""
    path: str                           # e.g., "api_keys.openai_api_key"
    label: str                          # Human-readable label
    has_value: bool                     # Whether this setting has a value
    value: Optional[str] = None         # Masked value for display
    capability: Optional[str] = None    # Related capability (e.g., "llm")
    provider_name: Optional[str] = None # Provider name if from provider mapping

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for API responses."""
        return {
            "path": self.path,
            "label": self.label,
            "has_value": self.has_value,
            "value": self.value,
            "capability": self.capability,
            "provider_name": self.provider_name,
        }


# =============================================================================
# Constants and Helper Functions
# =============================================================================

# Use SENSITIVE_PATTERNS from secrets.py as the single source of truth
SECRET_PATTERNS = SENSITIVE_PATTERNS

# Patterns that indicate a URL value
URL_PATTERNS = ['url', 'endpoint', 'host', 'uri', 'server']

# Patterns for value type inference (checking actual values, not names)
URL_VALUE_PATTERNS = ['http://', 'https://', 'redis://', 'mongodb://', 'postgres://', 'mysql://']


def infer_value_type(value: str) -> str:
    """Infer the type of a setting value."""
    if not value:
        return 'empty'
    value_lower = value.lower().strip()
    # Check if it looks like a URL
    if any(value_lower.startswith(p) for p in URL_VALUE_PATTERNS):
        return 'url'
    # Check if it looks like a secret (masked or has key-like format)
    if value_lower.startswith('sk-') or value_lower.startswith('pk-') or '•' in value:
        return 'secret'
    # Check if boolean
    if value_lower in ('true', 'false', 'yes', 'no', '1', '0'):
        return 'bool'
    # Check if numeric
    try:
        float(value)
        return 'number'
    except ValueError:
        pass
    return 'string'


def infer_setting_type(name: str) -> str:
    """Infer the type of a setting from its name."""
    name_lower = name.lower()
    if any(p in name_lower for p in SECRET_PATTERNS):
        return 'secret'
    if any(p in name_lower for p in URL_PATTERNS):
        return 'url'
    return 'string'


def categorize_setting(name: str) -> str:
    """Determine which config section a setting belongs to."""
    name_lower = name.lower()
    if 'password' in name_lower or 'admin' in name_lower:
        return 'admin'
    if any(p in name_lower for p in ['key', 'token', 'secret']):
        return 'api_keys'
    return 'security'


def mask_secret_value(value: str, path: str) -> str:
    """
    Mask a secret value if the path indicates sensitive data.

    Uses is_secret_key() from secrets.py to determine if masking is needed,
    then mask_value() to perform the masking.

    Args:
        value: The value to potentially mask
        path: The setting path (e.g., "api_keys.openai_api_key")

    Returns:
        Masked value if path indicates sensitive data, original value otherwise
    """
    if not value:
        return ""
    if is_secret_key(path):
        return mask_value(value).replace("****", "••••")  # Use bullet style
    return value


def env_var_matches_setting(env_name: str, setting_path: str) -> bool:
    """Check if an env var name matches a setting path.

    Treats underscores in env var as equivalent to dots in setting path.
    TRANSCRIPTION_PROVIDER matches transcription.provider (not llm.provider).
    OPENAI_API_KEY matches api_keys.openai_api_key.
    """
    # Normalize: convert underscores to dots, lowercase
    env_normalized = env_name.lower().replace('_', '.')
    path_normalized = setting_path.lower().replace('_', '.')

    # Exact match or suffix match (for nested paths like api_keys.openai_api_key)
    return path_normalized == env_normalized or path_normalized.endswith('.' + env_normalized)


# =============================================================================
# Re-exports from new modules (backward compatibility)
# =============================================================================

from src.config.store import SettingsStore, get_settings_store
from src.config.settings import Settings, get_settings, Source, Resolution, Suggestion

# Backward compatibility aliases
OmegaConfSettingsManager = SettingsStore
get_omegaconf_settings = get_settings_store
