"""
Feature flags service for ushadow.

Provides a simple YAML-based feature flag system that allows
toggling features without restarting the application.
"""

import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from ruamel.yaml import YAML

logger = logging.getLogger(__name__)

yaml = YAML()
yaml.preserve_quotes = True
yaml.default_flow_style = False


class YAMLFeatureFlagService:
    """
    YAML-based feature flag service.

    Loads feature flags from a YAML file on startup and when flags are updated via API.
    """

    def __init__(self, config_path: str = "config/feature_flags.yaml"):
        """
        Initialize the YAML feature flag service.

        Args:
            config_path: Path to the YAML config file (relative or absolute)
        """
        import os

        # If relative path and CONFIG_DIR is set, use it as base
        if not Path(config_path).is_absolute():
            config_dir = os.environ.get("CONFIG_DIR")
            if config_dir:
                self.config_path = Path(config_dir) / "feature_flags.yaml"
            else:
                self.config_path = Path(config_path)
        else:
            self.config_path = Path(config_path)
        self._flags: Dict[str, Any] = {}

    async def startup(self):
        """Start the service and load initial flags."""
        logger.info(f"Starting YAML feature flag service from {self.config_path}")
        await self._load_flags()

    async def shutdown(self):
        """Stop the service."""
        logger.info("Shutting down feature flag service")

    async def _load_flags(self):
        """Load flags from YAML file."""
        try:
            if not self.config_path.exists():
                logger.warning(f"Feature flags file not found: {self.config_path}")
                self._flags = {}
                return

            with open(self.config_path, "r") as f:
                data = yaml.load(f) or {}

            self._flags = data.get("flags", {})
            logger.info(f"Loaded {len(self._flags)} feature flags")

        except Exception as e:
            logger.error(f"Error loading feature flags: {e}")
            self._flags = {}

    def is_enabled(self, flag_name: str, context: Optional[Dict] = None) -> bool:
        """
        Check if a feature flag is enabled.

        Args:
            flag_name: Name of the flag to check
            context: Optional context (unused in basic YAML implementation)

        Returns:
            True if flag is enabled, False otherwise
        """
        flag = self._flags.get(flag_name, {})
        return flag.get("enabled", False)

    def get_flag_details(self, flag_name: str) -> Optional[Dict]:
        """Get full details of a flag."""
        return self._flags.get(flag_name)

    def list_flags(self) -> Dict[str, Any]:
        """Get all flags."""
        return self._flags.copy()

    async def update_flag(self, flag_name: str, enabled: bool) -> bool:
        """
        Update a feature flag's enabled state.

        Args:
            flag_name: Name of the flag to update
            enabled: New enabled state

        Returns:
            True if successful, False otherwise
        """
        try:
            if not self.config_path.exists():
                logger.error(f"Feature flags file not found: {self.config_path}")
                return False

            # Load current YAML file (preserving comments and formatting)
            with open(self.config_path, "r") as f:
                data = yaml.load(f) or {}

            # Ensure flags section exists
            if "flags" not in data:
                data["flags"] = {}

            # Update the flag
            if flag_name not in data["flags"]:
                logger.warning(f"Flag '{flag_name}' not found in config")
                return False

            data["flags"][flag_name]["enabled"] = enabled

            # Write back to file
            with open(self.config_path, "w") as f:
                yaml.dump(data, f)

            # Reload flags immediately
            await self._load_flags()

            logger.info(f"Updated flag '{flag_name}' to enabled={enabled}")
            return True

        except Exception as e:
            logger.error(f"Error updating flag '{flag_name}': {e}")
            return False


# Global service instance
_feature_flag_service: Optional[YAMLFeatureFlagService] = None


def create_feature_flag_service(
    backend: str = "yaml",
    yaml_config_path: str = "config/feature_flags.yaml",
) -> YAMLFeatureFlagService:
    """
    Create a feature flag service.

    Args:
        backend: Backend type (currently only 'yaml' supported)
        yaml_config_path: Path to YAML config file

    Returns:
        Feature flag service instance
    """
    if backend == "yaml":
        return YAMLFeatureFlagService(config_path=yaml_config_path)
    else:
        raise ValueError(f"Unsupported backend: {backend}")


def get_feature_flag_service() -> Optional[YAMLFeatureFlagService]:
    """Get the global feature flag service instance."""
    return _feature_flag_service


def set_feature_flag_service(service: YAMLFeatureFlagService):
    """Set the global feature flag service instance."""
    global _feature_flag_service
    _feature_flag_service = service
