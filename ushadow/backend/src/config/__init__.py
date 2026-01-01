"""Configuration module

All settings are managed through OmegaConf (get_settings_store).
Environment variables are read from YAML config files, not from a separate InfraSettings class.
"""

from .omegaconf_settings import (
    # Main API
    get_settings_store,
    SettingsStore,
    # Backward compatibility aliases
    get_omegaconf_settings,
    OmegaConfSettingsManager,
    # Helpers
    SettingSuggestion,
    infer_setting_type,
    categorize_setting,
    mask_secret_value,
    env_var_matches_setting,
)
from .yaml_parser import BaseYAMLParser, ComposeParser, ComposeEnvVar, ComposeService, ParsedCompose
from .secrets import (
    get_auth_secret_key,
    is_secret_key,
    mask_value,
    mask_if_secret,
    mask_dict_secrets,
)

__all__ = [
    # Settings store (YAML files)
    "get_settings_store",
    "SettingsStore",
    # Backward compatibility aliases
    "get_omegaconf_settings",
    "OmegaConfSettingsManager",
    # Helpers
    "SettingSuggestion",
    # Setting helpers
    "infer_setting_type",
    "categorize_setting",
    "mask_secret_value",
    "env_var_matches_setting",
    # YAML parsing
    "BaseYAMLParser",
    "ComposeParser",
    "ComposeEnvVar",
    "ComposeService",
    "ParsedCompose",
    # Secret utilities
    "get_auth_secret_key",
    "is_secret_key",
    "mask_value",
    "mask_if_secret",
    "mask_dict_secrets",
]
