"""
OmegaConf-based Settings Manager

Manages application settings using OmegaConf for:
- Automatic config merging (defaults → secrets → overrides)
- Variable interpolation (${api_keys.openai_api_key})
- Native dot-notation updates
- YAML file persistence (no database needed)
- Environment variable mapping and suggestions
"""

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional, List, Tuple, Dict

from omegaconf import OmegaConf, DictConfig

from src.services.provider_registry import get_provider_registry

logger = logging.getLogger(__name__)


# =============================================================================
# Custom OmegaConf Resolvers
# =============================================================================

def _env_resolver(env_var_name: str, _root_: DictConfig) -> Optional[str]:
    """
    Search config tree for a key matching an env var name.

    Converts ENV_VAR_NAME -> env_var_name and searches all sections.
    Example: MEMORY_SERVER_URL finds infrastructure.memory_server_url

    Usage in YAML: ${env:MEMORY_SERVER_URL}
    Usage in code: settings.get_by_env_var("MEMORY_SERVER_URL")
    """
    key = env_var_name.lower()

    # Search all top-level sections
    for section_name in _root_:
        section = _root_.get(section_name)
        if isinstance(section, (dict, DictConfig)) and key in section:
            value = section.get(key)
            if value is not None:
                return str(value)

    return None


# Register the resolver (only once)
if not OmegaConf.has_resolver("env"):
    OmegaConf.register_new_resolver("env", _env_resolver)


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
# Constants
# =============================================================================

# Patterns that indicate a secret value
SECRET_PATTERNS = ['key', 'secret', 'password', 'token', 'credential', 'auth']

# Patterns that indicate a URL value
URL_PATTERNS = ['url', 'endpoint', 'host', 'uri']

# Sections to search for different setting types
SETTING_SECTIONS = {
    'secret': ['api_keys', 'security', 'admin'],
    'url': ['services'],
    'string': ['llm', 'transcription', 'memory', 'auth', 'security', 'admin'],
}

# =============================================================================
# Helper Functions
# =============================================================================

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
    """Mask a secret value, showing only last 4 chars."""
    if not value:
        return ""
    is_secret = any(s in path.lower() for s in SECRET_PATTERNS)
    if is_secret and len(value) > 4:
        return "••••" + value[-4:]
    return value


def env_var_matches_setting(env_name: str, setting_key: str) -> bool:
    """Check if an env var name matches a setting key."""
    env_lower = env_name.lower().replace('_', '')
    key_lower = setting_key.lower().replace('_', '')
    return key_lower in env_lower or env_lower in key_lower


class SettingsStore:
    """
    Manages settings with OmegaConf for automatic merging and interpolation.

    Load order (later overrides earlier):
    1. config.defaults.yaml (general app settings)
    2. default-services.yaml (provider selection, default services)
    3. secrets.yaml (credentials - gitignored, for api_keys/passwords)
    4. config_settings.yaml (runtime settings - gitignored, for preferences)
    """

    def __init__(self, config_dir: Optional[Path] = None):
        if config_dir is None:
            # In Docker container, config is mounted at /config
            if Path("/config").exists():
                config_dir = Path("/config")
            else:
                import os
                project_root = os.environ.get("PROJECT_ROOT")
                if project_root:
                    config_dir = Path(project_root) / "config"
                else:
                    # Fallback: calculate from file location
                    config_dir = Path(__file__).parent.parent.parent.parent.parent / "config"

        self.config_dir = Path(config_dir)

        # File paths
        self.defaults_path = self.config_dir / "config.defaults.yaml"
        self.service_defaults_path = self.config_dir / "default-services.yaml"
        self.secrets_path = self.config_dir / "secrets.yaml"
        self.settings_path = self.config_dir / "config_settings.yaml"

        self._cache: Optional[DictConfig] = None
        self._cache_timestamp: float = 0
        self.cache_ttl: int = 5  # seconds

    def clear_cache(self) -> None:
        """Clear the configuration cache, forcing reload on next access."""
        self._cache = None
        self._cache_timestamp = 0
        logger.info("OmegaConfSettings cache cleared")

    def _load_yaml_if_exists(self, path: Path) -> Optional[DictConfig]:
        """Load a YAML file if it exists, return None otherwise."""
        if path.exists():
            try:
                return OmegaConf.load(path)
            except Exception as e:
                logger.error(f"Error loading {path}: {e}")
        return None

    async def load_config(self, use_cache: bool = True) -> DictConfig:
        """
        Load merged configuration from all sources.

        Returns:
            OmegaConf DictConfig with all values merged
        """
        # Check cache
        if use_cache and self._cache is not None:
            if time.time() - self._cache_timestamp < self.cache_ttl:
                return self._cache

        logger.debug("Loading configuration from all sources...")

        # Load and merge in order (later overrides earlier)
        configs = []

        if cfg := self._load_yaml_if_exists(self.defaults_path):
            configs.append(cfg)
            logger.debug(f"Loaded defaults from {self.defaults_path}")

        if cfg := self._load_yaml_if_exists(self.service_defaults_path):
            configs.append(cfg)
            logger.debug(f"Loaded service defaults from {self.service_defaults_path}")

        if cfg := self._load_yaml_if_exists(self.secrets_path):
            configs.append(cfg)
            logger.debug(f"Loaded secrets from {self.secrets_path}")

        if cfg := self._load_yaml_if_exists(self.settings_path):
            configs.append(cfg)
            logger.debug(f"Loaded settings from {self.settings_path}")

        # Merge all configs
        merged = OmegaConf.merge(*configs) if configs else OmegaConf.create({})

        # Update cache
        self._cache = merged
        self._cache_timestamp = time.time()

        return merged

    async def get(self, key_path: str, default: Any = None) -> Any:
        """
        Get a value by dot-notation path.

        Args:
            key_path: Dot notation path (e.g., "api_keys.openai_api_key")
            default: Default value if not found

        Returns:
            Resolved value (interpolations are automatically resolved)
        """
        config = await self.load_config()
        value = OmegaConf.select(config, key_path, default=default)
        return value

    def get_sync(self, key_path: str, default: Any = None) -> Any:
        """
        Sync version of get() for module-level initialization.

        Use this when you need config values at import time (e.g., SECRET_KEY).
        For async contexts, prefer the async get() method.
        """
        if self._cache is None:
            # Force sync load - _load_yaml_if_exists is already sync
            configs = []
            for path in [self.defaults_path, self.service_defaults_path,
                         self.secrets_path, self.settings_path]:
                if cfg := self._load_yaml_if_exists(path):
                    configs.append(cfg)
            self._cache = OmegaConf.merge(*configs) if configs else OmegaConf.create({})
            self._cache_timestamp = time.time()
        return OmegaConf.select(self._cache, key_path, default=default)

    async def get_by_env_var(self, env_var_name: str, default: Any = None) -> Any:
        """
        Get a value by env var name, searching the config tree.

        Converts ENV_VAR_NAME -> env_var_name and searches all sections.
        Example: get_by_env_var("MEMORY_SERVER_URL") finds infrastructure.memory_server_url

        Args:
            env_var_name: Environment variable name (e.g., "MEMORY_SERVER_URL")
            default: Default value if not found

        Returns:
            Resolved value or default
        """
        config = await self.load_config()
        value = _env_resolver(env_var_name, config)
        return value if value is not None else default

    def get_by_env_var_sync(self, env_var_name: str, default: Any = None) -> Any:
        """Sync version of get_by_env_var for module-level initialization."""
        if self._cache is None:
            configs = []
            for path in [self.defaults_path, self.service_defaults_path,
                         self.secrets_path, self.settings_path]:
                if cfg := self._load_yaml_if_exists(path):
                    configs.append(cfg)
            self._cache = OmegaConf.merge(*configs) if configs else OmegaConf.create({})
            self._cache_timestamp = time.time()
        value = _env_resolver(env_var_name, self._cache)
        return value if value is not None else default

    def _save_to_file(self, file_path: Path, updates: dict) -> None:
        """Internal helper to save updates to a specific file."""
        current = self._load_yaml_if_exists(file_path) or OmegaConf.create({})

        for key, value in updates.items():
            if '.' in key and not isinstance(value, dict):
                OmegaConf.update(current, key, value)
            else:
                OmegaConf.update(current, key, value, merge=True)

        OmegaConf.save(current, file_path)
        logger.info(f"Saved to {file_path}: {list(updates.keys())}")

    async def save_to_secrets(self, updates: dict) -> None:
        """
        Save sensitive values to secrets.yaml.

        Use for: api_keys, passwords, tokens, credentials.
        """
        self._save_to_file(self.secrets_path, updates)
        self._cache = None

    async def save_to_settings(self, updates: dict) -> None:
        """
        Save non-sensitive values to config_settings.yaml.

        Use for: preferences, selected_providers, feature flags.
        """
        self._save_to_file(self.settings_path, updates)
        self._cache = None

    def _is_secret_key(self, key: str) -> bool:
        """Check if a key path should be stored in secrets."""
        key_lower = key.lower()
        # Check if it's in api_keys section or contains secret patterns
        if key_lower.startswith('api_keys.'):
            return True
        if key_lower.startswith('security.') and any(p in key_lower for p in ['secret', 'key', 'password']):
            return True
        if key_lower.startswith('admin.') and 'password' in key_lower:
            return True
        return any(p in key_lower for p in SECRET_PATTERNS)

    async def update(self, updates: dict) -> None:
        """
        Update settings, auto-routing to secrets.yaml or config_settings.yaml.

        Secrets (api_keys, passwords, tokens) go to secrets.yaml.
        Everything else goes to config_settings.yaml.

        Args:
            updates: Dict with updates - supports both formats:
                     - Dot notation: {"api_keys.openai": "sk-..."}
                     - Nested: {"api_keys": {"openai": "sk-..."}}
        """
        secrets_updates = {}
        settings_updates = {}

        for key, value in updates.items():
            if isinstance(value, dict):
                # Nested dict - check the section name
                if key in ('api_keys', 'admin', 'security'):
                    secrets_updates[key] = value
                else:
                    settings_updates[key] = value
            else:
                # Dot notation or simple key
                if self._is_secret_key(key):
                    secrets_updates[key] = value
                else:
                    settings_updates[key] = value

        if secrets_updates:
            await self.save_to_secrets(secrets_updates)
        if settings_updates:
            await self.save_to_settings(settings_updates)

        self._cache = None

    def _filter_masked_values(self, updates: dict) -> dict:
        """
        Filter out masked values (****) to prevent accidental overwrites.
        
        Returns a new dict with masked values removed.
        """
        filtered = {}
        for key, value in updates.items():
            if isinstance(value, dict):
                # Recursively filter nested dicts
                filtered_nested = self._filter_masked_values(value)
                if filtered_nested:  # Only include if not empty
                    filtered[key] = filtered_nested
            elif value is None or not str(value).startswith("***"):
                filtered[key] = value
            else:
                logger.debug(f"Filtering masked value for key: {key}")
        return filtered

    async def reset(self, include_secrets: bool = True) -> int:
        """
        Reset settings by deleting config files.
        
        Args:
            include_secrets: If True (default), also deletes secrets.yaml
        
        Returns:
            Number of files deleted
        """
        deleted = 0
        
        if self.settings_path.exists():
            self.settings_path.unlink()
            logger.info(f"Reset: deleted {self.settings_path}")
            deleted += 1
        
        if include_secrets and self.secrets_path.exists():
            self.secrets_path.unlink()
            logger.info(f"Reset: deleted {self.secrets_path}")
            deleted += 1
        
        self._cache = None
        return deleted

    # =========================================================================
    # Environment Variable Mapping
    # =========================================================================

    async def get_config_as_dict(self) -> Dict[str, Any]:
        """Get merged config as plain Python dict."""
        config = await self.load_config()
        return OmegaConf.to_container(config, resolve=True)

    async def find_setting_for_env_var(self, env_var_name: str) -> Optional[Tuple[str, Any]]:
        """
        Find a setting path and value that matches an environment variable name.

        Uses provider-derived mapping first for consistency,
        then falls back to fuzzy matching for unmapped env vars.

        Args:
            env_var_name: Environment variable name (e.g., "OPENAI_API_KEY")

        Returns:
            Tuple of (setting_path, value) if found, None otherwise
        """
        # First, try direct path mapping (derived from provider YAML configs)
        env_mapping = get_provider_registry().get_env_to_settings_mapping()
        if env_var_name in env_mapping:
            settings_path = env_mapping[env_var_name]
            value = await self.get(settings_path)
            return (settings_path, value)

        # Fall back to fuzzy matching for unmapped env vars
        config = await self.get_config_as_dict()
        setting_type = infer_setting_type(env_var_name)
        sections = SETTING_SECTIONS.get(setting_type, ['api_keys', 'security'])

        # Collect all matches, prefer ones with values
        matches_with_value = []
        matches_empty = []

        for section in sections:
            section_data = config.get(section, {})
            if not isinstance(section_data, dict):
                continue

            for key, value in section_data.items():
                if value is None or isinstance(value, dict):
                    continue

                if env_var_matches_setting(env_var_name, key):
                    path = f"{section}.{key}"
                    str_value = str(value) if value is not None else ""
                    if str_value.strip():
                        matches_with_value.append((path, value))
                    else:
                        matches_empty.append((path, value))

        # Return first match with value, or first empty match
        if matches_with_value:
            return matches_with_value[0]
        if matches_empty:
            return matches_empty[0]
        return None

    async def has_value_for_env_var(self, env_var_name: str) -> bool:
        """
        Check if there's an existing setting value that matches an env var.

        Uses OmegaConf tree search (resolver) first, then provider mapping,
        then falls back to fuzzy matching.

        Args:
            env_var_name: Environment variable name

        Returns:
            True if a matching setting with a non-empty value exists
        """
        # First, try OmegaConf tree search (e.g., MEMORY_SERVER_URL -> infrastructure.memory_server_url)
        value = await self.get_by_env_var(env_var_name)
        if value and str(value).strip():
            return True

        # Try provider-derived mapping
        env_mapping = get_provider_registry().get_env_to_settings_mapping()
        if env_var_name in env_mapping:
            settings_path = env_mapping[env_var_name]
            value = await self.get(settings_path)
            if value and str(value).strip():
                return True

        # Fall back to fuzzy matching for unmapped env vars
        result = await self.find_setting_for_env_var(env_var_name)
        if result is None:
            return False
        _, value = result
        return bool(str(value).strip()) if value else False

    async def get_suggestions_for_env_var(
        self,
        env_var_name: str,
        provider_registry=None,
        capabilities: Optional[List[str]] = None,
    ) -> List[SettingSuggestion]:
        """
        Get setting suggestions that could fill an environment variable.

        Searches config sections for compatible settings and optionally
        includes provider-specific mappings.

        Args:
            env_var_name: Environment variable name
            provider_registry: Optional provider registry for capability-based suggestions
            capabilities: Optional list of required capabilities to filter providers

        Returns:
            List of SettingSuggestion objects
        """
        suggestions = []
        seen_paths = set()
        config = await self.get_config_as_dict()

        # Determine which sections to search based on env var type
        setting_type = infer_setting_type(env_var_name)
        sections = SETTING_SECTIONS.get(setting_type, ['api_keys', 'security'])

        # Search config sections
        for section in sections:
            section_data = config.get(section, {})
            if not isinstance(section_data, dict):
                continue

            for key, value in section_data.items():
                if value is None or isinstance(value, dict):
                    continue

                path = f"{section}.{key}"
                if path in seen_paths:
                    continue
                seen_paths.add(path)

                str_value = str(value) if value is not None else ""
                has_value = bool(str_value.strip())

                suggestions.append(SettingSuggestion(
                    path=path,
                    label=key.replace("_", " ").title(),
                    has_value=has_value,
                    value=mask_secret_value(str_value, path) if has_value else None,
                ))

        # Add provider-specific mappings if registry provided
        if provider_registry and capabilities:
            for capability in capabilities:
                selected_id = await self.get(f"selected_providers.{capability}")

                if not selected_id:
                    selected_id = provider_registry.get_default_provider_id(capability, 'cloud')

                if not selected_id:
                    continue

                provider = provider_registry.get_provider(selected_id)
                if not provider:
                    continue

                # Check provider's env_maps for matching env var
                for env_map in provider.env_maps:
                    if env_map.key == env_var_name and env_map.settings_path:
                        if env_map.settings_path in seen_paths:
                            continue
                        seen_paths.add(env_map.settings_path)

                        value = await self.get(env_map.settings_path)
                        str_value = str(value) if value is not None else ""
                        has_value = bool(str_value.strip())

                        suggestions.append(SettingSuggestion(
                            path=env_map.settings_path,
                            label=f"{provider.name}: {env_map.label or env_map.key}",
                            has_value=has_value,
                            value=mask_secret_value(str_value, env_map.settings_path) if has_value else None,
                            capability=capability,
                            provider_name=provider.name,
                        ))

        return suggestions

    async def save_env_var_values(self, env_values: Dict[str, str]) -> Dict[str, int]:
        """
        Save environment variable values to appropriate config sections.

        Automatically categorizes values into api_keys, security, or admin
        sections based on the env var name.

        Args:
            env_values: Dict of env_var_name -> value

        Returns:
            Dict with counts: {"api_keys": n, "security": n, "admin": n}
        """
        api_keys_updates = {}
        security_updates = {}
        admin_updates = {}

        for name, value in env_values.items():
            if not value or value.startswith('***'):
                continue  # Skip empty or masked values

            category = categorize_setting(name)
            key = name.lower()

            if category == 'admin':
                admin_updates[key] = value
            elif category == 'api_keys':
                api_keys_updates[key] = value
            else:
                security_updates[key] = value

        # Build and apply updates
        updates = {}
        if api_keys_updates:
            updates['api_keys'] = api_keys_updates
        if security_updates:
            updates['security'] = security_updates
        if admin_updates:
            updates['admin'] = admin_updates

        if updates:
            await self.update(updates)

        return {
            "api_keys": len(api_keys_updates),
            "security": len(security_updates),
            "admin": len(admin_updates),
        }


# Global instance
_settings_store: Optional[SettingsStore] = None


def get_settings_store(config_dir: Optional[Path] = None) -> SettingsStore:
    """Get global SettingsStore instance."""
    global _settings_store
    if _settings_store is None:
        _settings_store = SettingsStore(config_dir)
    return _settings_store


# Backward compatibility aliases
OmegaConfSettingsManager = SettingsStore
get_omegaconf_settings = get_settings_store
