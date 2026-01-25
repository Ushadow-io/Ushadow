"""
Configuration module - Settings management with entity-based resolution.
"""

from .settings import (
    get_settings,
    Settings,
    Resolution,
    Source,
    SettingSuggestion,
    Suggestion,
)
from .store import (
    get_settings_store,
    SettingsStore,
)
from .helpers import (
    infer_setting_type,
    infer_value_type,
    categorize_setting,
    env_var_matches_setting,
)
from .secrets import (
    get_auth_secret_key,
    is_secret_key,
    should_store_in_secrets,
    mask_value,
    mask_if_secret,
    mask_secret_value,
    mask_dict_secrets,
)
from .yaml_parser import (
    BaseYAMLParser,
    ComposeParser,
    ComposeEnvVar,
    ComposeService,
    ParsedCompose,
)

__all__ = [
    # Settings API
    "get_settings",
    "Settings",
    "Resolution",
    "Source",
    "Suggestion",
    "SettingSuggestion",
    # Store
    "get_settings_store",
    "SettingsStore",
    # Helpers
    "infer_setting_type",
    "infer_value_type",
    "categorize_setting",
    "env_var_matches_setting",
    # Secrets
    "get_auth_secret_key",
    "is_secret_key",
    "should_store_in_secrets",
    "mask_value",
    "mask_if_secret",
    "mask_secret_value",
    "mask_dict_secrets",
    # YAML parsing
    "BaseYAMLParser",
    "ComposeParser",
    "ComposeEnvVar",
    "ComposeService",
    "ParsedCompose",
]
