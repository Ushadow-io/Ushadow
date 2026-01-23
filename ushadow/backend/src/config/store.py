"""
Settings Store - Low-level YAML storage

Handles:
- Loading/merging config files (defaults → secrets → overrides)
- OmegaConf caching and invalidation
- File persistence (secrets.yaml, config.overrides.yaml)
- Value type routing (secrets vs non-secrets)
"""

import logging
import os
import time
from pathlib import Path
from typing import Any, Optional, Dict

from omegaconf import OmegaConf, DictConfig

from src.config.secrets import should_store_in_secrets
from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="Store")


# =============================================================================
# OmegaConf Custom Resolvers
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


# Register custom resolvers (only once)
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
# Settings Store
# =============================================================================

class SettingsStore:
    """
    Low-level YAML storage for settings.

    Merge order (later overrides earlier):
    1. config.defaults.yaml - Application defaults
    2. secrets.yaml - Credentials (gitignored)
    3. config.overrides.yaml - User modifications (gitignored)
    """

    def __init__(self, config_dir: Optional[Path] = None):
        if config_dir is None:
            # In Docker container, config is mounted at /config
            if Path("/config").exists():
                config_dir = Path("/config")
            else:
                project_root = os.environ.get("PROJECT_ROOT")
                if project_root:
                    config_dir = Path(project_root) / "config"
                else:
                    # Fallback: calculate from file location
                    config_dir = Path(__file__).parent.parent.parent.parent.parent / "config"

        self.config_dir = Path(config_dir)

        # File paths (merge order: defaults → secrets → overrides → instance_overrides)
        self.defaults_path = self.config_dir / "config.defaults.yaml"
        self.secrets_path = self.config_dir / "SECRETS" / "secrets.yaml"
        self.overrides_path = self.config_dir / "config.overrides.yaml"
        self.instance_overrides_path = self.config_dir / "instance-overrides.yaml"

        self._cache: Optional[DictConfig] = None
        self._cache_timestamp: float = 0
        # Disable cache in dev mode for faster iteration
        dev_mode = os.environ.get("DEV_MODE", "").lower() in ("true", "1", "yes")
        self.cache_ttl: int = 0 if dev_mode else 5  # seconds

    def clear_cache(self) -> None:
        """Clear the configuration cache, forcing reload on next access."""
        self._cache = None
        self._cache_timestamp = 0
        logger.info("Cache cleared")

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

        Merge order (later overrides earlier):
        1. config.defaults.yaml - All default values
        2. secrets.yaml - API keys, passwords (gitignored)
        3. config.overrides.yaml - Template-level overrides (gitignored)
        4. instance-overrides.yaml - Instance-level overrides (gitignored)

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

        if cfg := self._load_yaml_if_exists(self.secrets_path):
            configs.append(cfg)
            logger.debug(f"Loaded secrets from {self.secrets_path}")

        if cfg := self._load_yaml_if_exists(self.overrides_path):
            configs.append(cfg)
            logger.debug(f"Loaded overrides from {self.overrides_path}")

        if cfg := self._load_yaml_if_exists(self.instance_overrides_path):
            configs.append(cfg)
            logger.debug(f"Loaded instance overrides from {self.instance_overrides_path}")

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
            Converts OmegaConf containers to regular Python dicts/lists
        """
        config = await self.load_config()
        value = OmegaConf.select(config, key_path, default=default)

        # Convert OmegaConf containers to regular Python types for Pydantic serialization
        if isinstance(value, (DictConfig, type(OmegaConf.create([])))):
            return OmegaConf.to_container(value, resolve=True)

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
            for path in [self.defaults_path, self.secrets_path, self.overrides_path]:
                if cfg := self._load_yaml_if_exists(path):
                    configs.append(cfg)
            self._cache = OmegaConf.merge(*configs) if configs else OmegaConf.create({})
            self._cache_timestamp = time.time()

        value = OmegaConf.select(self._cache, key_path, default=default)

        # Convert OmegaConf containers to regular Python types for Pydantic serialization
        if isinstance(value, (DictConfig, type(OmegaConf.create([])))):
            return OmegaConf.to_container(value, resolve=True)

        return value

    async def _get_config_as_dict(self) -> Dict[str, Any]:
        """Get merged config as plain Python dict."""
        config = await self.load_config()
        return OmegaConf.to_container(config, resolve=True)

    def _save_to_file(self, file_path: Path, updates: dict) -> None:
        """Internal helper to save updates to a specific file."""
        current = self._load_yaml_if_exists(file_path) or OmegaConf.create({})

        logger.info(f"[Store] _save_to_file: {file_path.name}")
        logger.info(f"[Store] Updates to save: {updates}")

        for key, value in updates.items():
            logger.info(f"[Store] Processing key='{key}', value type={type(value).__name__}")
            if '.' in key:
                # Dotted key - need to manually navigate the path for dict values
                if isinstance(value, dict):
                    # Split the path and navigate/create structure
                    parts = key.split('.')
                    logger.info(f"[Store] Path parts: {parts}")

                    # Navigate to parent, creating structure as needed
                    node = current
                    for part in parts[:-1]:
                        if part not in node:
                            node[part] = {}
                        node = node[part]

                    # Set or merge the final value
                    final_key = parts[-1]
                    if final_key in node and isinstance(node[final_key], dict) and isinstance(value, dict):
                        # Merge with existing using OmegaConf.merge (preserves keys not in value)
                        merged = OmegaConf.merge(node[final_key], value)
                        node[final_key] = merged
                        logger.info(f"[Store] Merged dict at path '{key}'")
                    else:
                        # Create new or replace non-dict
                        node[final_key] = value
                        logger.info(f"[Store] Set value at path '{key}'")
                else:
                    # For scalar values, OmegaConf.update works fine
                    logger.info(f"[Store] Setting scalar at path '{key}': {value}")
                    OmegaConf.update(current, key, value)
            else:
                # Simple key - merge if dict, replace if scalar
                logger.info(f"[Store] Updating simple key '{key}'")
                OmegaConf.update(current, key, value, merge=True)

        # Ensure parent directory exists
        file_path.parent.mkdir(parents=True, exist_ok=True)

        # Debug: show what we're about to save
        logger.info(f"[Store] Final config to save: {OmegaConf.to_yaml(current)}")

        OmegaConf.save(current, file_path)
        logger.info(f"[Store] Saved to {file_path}: {list(updates.keys())}")

    async def save_to_secrets(self, updates: dict) -> None:
        """
        Save sensitive values to secrets.yaml.

        Use for: api_keys, passwords, tokens, credentials.
        """
        self._save_to_file(self.secrets_path, updates)
        self._cache = None

    async def _save_to_overrides(self, updates: dict) -> None:
        """Save non-sensitive values to config.overrides.yaml."""
        self._save_to_file(self.overrides_path, updates)
        self._cache = None

    async def update(self, updates: dict) -> None:
        """
        Update settings, auto-routing to secrets.yaml or config.overrides.yaml.

        Secrets (api_keys, passwords, tokens) go to secrets.yaml.
        Everything else goes to config.overrides.yaml.

        Args:
            updates: Dict with updates - supports both formats:
                     - Dot notation: {"api_keys.openai": "sk-..."}
                     - Nested: {"api_keys": {"openai": "sk-..."}}
        """
        secrets_updates = {}
        overrides_updates = {}

        for key, value in updates.items():
            if isinstance(value, dict):
                # Nested dict - check the section name
                if key in ('api_keys', 'admin', 'security'):
                    secrets_updates[key] = value
                else:
                    overrides_updates[key] = value
            else:
                # Dot notation or simple key
                if should_store_in_secrets(key):
                    secrets_updates[key] = value
                else:
                    overrides_updates[key] = value

        if secrets_updates:
            await self.save_to_secrets(secrets_updates)
        if overrides_updates:
            await self._save_to_overrides(overrides_updates)

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

        if self.overrides_path.exists():
            self.overrides_path.unlink()
            logger.info(f"Reset: deleted {self.overrides_path}")
            deleted += 1

        if include_secrets and self.secrets_path.exists():
            self.secrets_path.unlink()
            logger.info(f"Reset: deleted {self.secrets_path}")
            deleted += 1

        self._cache = None
        return deleted


# Global instance
_settings_store: Optional[SettingsStore] = None


def get_settings_store(config_dir: Optional[Path] = None) -> SettingsStore:
    """Get global SettingsStore instance."""
    global _settings_store
    if _settings_store is None:
        _settings_store = SettingsStore(config_dir)
    return _settings_store
