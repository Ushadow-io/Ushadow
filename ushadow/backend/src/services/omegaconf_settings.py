"""
OmegaConf-based Settings Manager

Manages application settings using OmegaConf for:
- Automatic config merging (defaults → secrets → user overrides)
- Variable interpolation (${api_keys.openai_api_key})
- Type safety (dataclass validation)
- Single source of truth
"""

import logging
from pathlib import Path
from typing import Any, Optional
from omegaconf import OmegaConf, DictConfig, MISSING
from motor.motor_asyncio import AsyncIOMotorDatabase

from src.models.settings_schemas import AllSettings

logger = logging.getLogger(__name__)


class OmegaConfSettingsManager:
    """
    Manages settings with OmegaConf for automatic merging and interpolation.

    Load order (later overrides earlier):
    1. config.defaults.yaml (shipped defaults)
    2. secrets.yaml (credentials - gitignored)
    3. config.local.yaml (user overrides - gitignored)
    4. MongoDB (runtime changes)
    """

    def __init__(self, config_dir: Optional[Path] = None, db: Optional[AsyncIOMotorDatabase] = None):
        if config_dir is None:
            project_root = Path(__file__).parent.parent.parent.parent
            config_dir = project_root / "config"

        self.config_dir = Path(config_dir)
        self.db = db
        self.collection_name = "configuration"

        # File paths
        self.defaults_path = self.config_dir / "config.defaults.yaml"
        self.secrets_path = self.config_dir / "secrets.yaml"
        self.local_path = self.config_dir / "config.local.yaml"
        # Note: Services are loaded from ServiceRegistry (config/services/*.yaml)

        self._cache: Optional[DictConfig] = None
        self._cache_timestamp: float = 0
        self.cache_ttl: int = 5  # seconds

    async def load_config(self, use_cache: bool = True) -> DictConfig:
        """
        Load merged configuration from all sources.

        Returns:
            OmegaConf DictConfig with all values merged and interpolations resolved
        """
        import time

        # Check cache
        if use_cache and self._cache is not None:
            if time.time() - self._cache_timestamp < self.cache_ttl:
                return self._cache

        logger.info("Loading configuration from all sources...")

        # Load YAML files without strict validation initially
        configs_to_merge = []

        if self.defaults_path.exists():
            defaults = OmegaConf.load(self.defaults_path)
            configs_to_merge.append(defaults)
            logger.debug(f"Loaded defaults from {self.defaults_path}")

        if self.secrets_path.exists():
            secrets = OmegaConf.load(self.secrets_path)
            configs_to_merge.append(secrets)
            logger.debug(f"Loaded secrets from {self.secrets_path}")

        if self.local_path.exists():
            local = OmegaConf.load(self.local_path)
            configs_to_merge.append(local)
            logger.debug(f"Loaded local overrides from {self.local_path}")

        # Load from MongoDB (runtime overrides)
        if self.db is not None:
            mongo_config = await self._load_from_mongo()
            if mongo_config:
                configs_to_merge.append(OmegaConf.create(mongo_config))
                logger.debug("Loaded overrides from MongoDB")

        # Merge all configs (later overrides earlier)
        # Using struct=False to allow extra fields during migration
        merged = OmegaConf.merge(*configs_to_merge)

        # Update cache
        self._cache = merged
        self._cache_timestamp = time.time()

        logger.info("Configuration loaded and merged successfully")
        return merged

    async def _load_from_mongo(self) -> Optional[dict]:
        """Load configuration overrides from MongoDB."""
        if self.db is None:
            return None

        try:
            doc = await self.db[self.collection_name].find_one({"_id": "ushadow_config"})
            if doc:
                doc.pop("_id", None)
                return doc
            return None
        except Exception as e:
            logger.error(f"Error loading from MongoDB: {e}")
            return None

    async def get(self, key_path: str, default: Any = None) -> Any:
        """
        Get a value by dot-notation path.

        Args:
            key_path: Dot notation path (e.g., "api_keys.openai_api_key")
            default: Default value if not found

        Returns:
            Resolved value (interpolations are automatically resolved!)
        """
        config = await self.load_config()

        try:
            value = OmegaConf.select(config, key_path)
            return value if value is not None else default
        except Exception as e:
            logger.warning(f"Error getting {key_path}: {e}")
            return default

    async def update(self, updates: dict) -> None:
        """
        Update settings (saves to MongoDB).

        Args:
            updates: Dict with updates in dot notation or nested structure
                     e.g., {"api_keys.openai_api_key": "sk-..."}
                     or   {"api_keys": {"openai_api_key": "sk-..."}}
        """
        if self.db is None:
            raise ValueError("MongoDB not configured - cannot save settings")

        # Load current config
        current = await self._load_from_mongo() or {}

        # Merge updates (OmegaConf handles nested dot notation)
        current_cfg = OmegaConf.create(current)
        updates_cfg = OmegaConf.create(updates)
        merged = OmegaConf.merge(current_cfg, updates_cfg)

        # Save to MongoDB
        await self.db[self.collection_name].update_one(
            {"_id": "ushadow_config"},
            {"$set": OmegaConf.to_container(merged)},
            upsert=True
        )

        # Invalidate cache
        self._cache = None

        logger.info(f"Settings updated: {list(updates.keys())}")

    # DEPRECATED: Services are now loaded from ServiceRegistry (config/services/*.yaml)
    # These methods are kept for backward compatibility but return empty results

    async def get_installed_services(self) -> dict:
        """
        Get installed services state from MongoDB.

        Returns:
            Dict mapping service_id -> {enabled: bool, ...}
        """
        config = await self.load_config()
        try:
            installed = OmegaConf.select(config, "installed_services")
            if installed is not None:
                return OmegaConf.to_container(installed)
            return {}
        except Exception as e:
            logger.warning(f"Error getting installed_services: {e}")
            return {}

    async def get_service_enabled(self, service_id: str) -> Optional[bool]:
        """
        Get enabled state for a service.

        Args:
            service_id: Service identifier

        Returns:
            True/False if explicitly set, None if using default
        """
        installed = await self.get_installed_services()
        service_state = installed.get(service_id, {})
        return service_state.get("enabled")

    async def set_service_enabled(self, service_id: str, enabled: bool) -> None:
        """
        Set enabled state for a service.

        Args:
            service_id: Service identifier
            enabled: Whether service is enabled
        """
        # Use nested dict structure (OmegaConf.create doesn't handle dot-notation keys)
        await self.update({
            "installed_services": {
                service_id: {
                    "enabled": enabled
                }
            }
        })
        logger.info(f"Service {service_id} enabled={enabled}")


# Global instance
_settings_manager: Optional[OmegaConfSettingsManager] = None


def get_omegaconf_settings(
    config_dir: Optional[Path] = None,
    db: Optional[AsyncIOMotorDatabase] = None
) -> OmegaConfSettingsManager:
    """Get global OmegaConf settings manager instance."""
    global _settings_manager
    if _settings_manager is None:
        _settings_manager = OmegaConfSettingsManager(config_dir, db)
    return _settings_manager
