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

from src.config.secrets import is_secret_key
from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="Store")


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

        # File paths (merge order: defaults → secrets → overrides)
        self.defaults_path = self.config_dir / "config.defaults.yaml"
        self.secrets_path = self.config_dir / "SECRETS" / "secrets.yaml"
        self.overrides_path = self.config_dir / "config.overrides.yaml"

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
        3. config.overrides.yaml - User modifications (gitignored)

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

        for key, value in updates.items():
            if '.' in key and not isinstance(value, dict):
                OmegaConf.update(current, key, value)
            else:
                OmegaConf.update(current, key, value, merge=True)

        # Ensure parent directory exists
        file_path.parent.mkdir(parents=True, exist_ok=True)
        OmegaConf.save(current, file_path)
        logger.info(f"Saved to {file_path}: {list(updates.keys())}")

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

    def _is_secret_key(self, key: str) -> bool:
        """
        Check if a key path should be stored in secrets.yaml.

        This extends secrets.is_secret_key() with path-aware logic:
        - Anything under api_keys.* goes to secrets
        - security.* paths containing secret/key/password go to secrets
        - admin.* paths containing password go to secrets
        - Otherwise, falls back to is_secret_key() pattern matching

        Args:
            key: Full setting path (e.g., "api_keys.openai_api_key")

        Returns:
            True if this should be stored in secrets.yaml
        """
        key_lower = key.lower()
        # Section-based rules (take precedence)
        if key_lower.startswith('api_keys.'):
            return True
        if key_lower.startswith('security.') and any(p in key_lower for p in ['secret', 'key', 'password']):
            return True
        if key_lower.startswith('admin.') and 'password' in key_lower:
            return True
        # Fall back to pattern matching from secrets.py
        return is_secret_key(key)

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
                if self._is_secret_key(key):
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
