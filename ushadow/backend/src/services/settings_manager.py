"""
YAML-based Settings Manager

Manages hierarchical configuration using YAML files:
- config/config.defaults.yaml (git-tracked defaults)
- config/config.local.yaml (local overrides, gitignored)
- Environment variables (highest priority)
"""

import os
import yaml
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from copy import deepcopy

logger = logging.getLogger(__name__)


class SettingsManager:
    """Manages YAML-based hierarchical configuration."""
    
    def __init__(self, config_dir: Optional[Path] = None):
        """
        Initialize settings manager.
        
        Args:
            config_dir: Path to config directory. Defaults to project_root/config
        """
        if config_dir is None:
            # Default to project_root/config
            project_root = Path(__file__).parent.parent.parent.parent
            config_dir = project_root / "config"
        
        self.config_dir = Path(config_dir)
        self.defaults_path = self.config_dir / "config.defaults.yaml"
        self.local_path = self.config_dir / "config.local.yaml"
        
        self._settings_cache: Optional[Dict[str, Any]] = None
    
    def load_defaults(self) -> Dict[str, Any]:
        """Load default settings from config.defaults.yaml."""
        try:
            with open(self.defaults_path, 'r') as f:
                return yaml.safe_load(f) or {}
        except FileNotFoundError:
            logger.warning(f"Defaults file not found: {self.defaults_path}")
            return {}
        except yaml.YAMLError as e:
            logger.error(f"Error parsing defaults YAML: {e}")
            raise
    
    def load_local_settings(self) -> Optional[Dict[str, Any]]:
        """Load local settings overrides from config.local.yaml."""
        if not self.local_path.exists():
            return None
        
        try:
            with open(self.local_path, 'r') as f:
                return yaml.safe_load(f) or {}
        except yaml.YAMLError as e:
            logger.error(f"Error parsing local settings YAML: {e}")
            raise
    
    def load_settings(self, use_cache: bool = True) -> Dict[str, Any]:
        """
        Load merged settings with priority resolution.
        
        Priority (highest to lowest):
        1. Environment variables
        2. config.local.yaml
        3. config.defaults.yaml
        
        Args:
            use_cache: Use cached settings if available
            
        Returns:
            Merged settings dictionary
        """
        if use_cache and self._settings_cache is not None:
            return self._settings_cache
        
        # 1. Load defaults (required)
        settings = self.load_defaults()
        
        # 2. Merge local overrides (optional)
        local_settings = self.load_local_settings()
        if local_settings:
            settings = self._deep_merge(settings, local_settings)
        
        # 3. Apply environment variable overrides
        settings = self._apply_env_overrides(settings)
        
        self._settings_cache = settings
        return settings
    
    def _deep_merge(self, base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deep merge two dictionaries.
        
        Override values take precedence. Nested dicts are merged recursively.
        """
        result = deepcopy(base)
        
        for key, value in override.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = deepcopy(value)
        
        return result
    
    def _apply_env_overrides(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """
        Apply environment variable overrides.
        
        Env vars with USHADOW_ prefix override settings.
        Example: USHADOW_SERVICES_PIECES_URL overrides services.pieces.url
        """
        result = deepcopy(settings)
        
        prefix = "USHADOW_"
        for env_key, env_value in os.environ.items():
            if not env_key.startswith(prefix):
                continue
            
            # Convert env key to settings path
            # USHADOW_SERVICES_PIECES_URL -> services.pieces.url
            key_path = env_key[len(prefix):].lower().replace("_", ".")
            
            # Set the value
            self._set_nested_value(result, key_path, env_value)
        
        return result
    
    def _set_nested_value(self, data: Dict[str, Any], key_path: str, value: Any):
        """Set a nested value using dot notation path."""
        keys = key_path.split(".")
        current = data
        
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]
        
        current[keys[-1]] = value
    
    def get(self, key_path: str, default: Any = None) -> Any:
        """
        Get a setting value by dot notation path.
        
        Example: get('services.pieces.url')
        """
        settings = self.load_settings()
        
        keys = key_path.split(".")
        current = settings
        
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return default
        
        return current
    
    def set(self, key_path: str, value: Any):
        """
        Set a value in local settings.
        
        This updates config.local.yaml and invalidates the cache.
        """
        # Load current local settings
        local_settings = self.load_local_settings() or {}
        
        # Set the value
        self._set_nested_value(local_settings, key_path, value)
        
        # Save to file
        self.save_local_settings(local_settings)
        
        # Invalidate cache
        self._settings_cache = None
    
    def save_local_settings(self, settings: Dict[str, Any]):
        """Save local settings to config.local.yaml (atomic write)."""
        # Ensure config directory exists
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        # Atomic write using temp file + rename
        temp_path = self.local_path.with_suffix('.yaml.tmp')
        
        try:
            with open(temp_path, 'w') as f:
                yaml.safe_dump(settings, f, default_flow_style=False, sort_keys=False)
            
            # Atomic rename
            temp_path.replace(self.local_path)
            
            logger.info(f"Saved local settings to {self.local_path}")
            
            # Invalidate cache
            self._settings_cache = None
            
        except Exception as e:
            # Clean up temp file on error
            if temp_path.exists():
                temp_path.unlink()
            raise
    
    def reset_local_settings(self):
        """Delete config.local.yaml to reset to defaults."""
        if self.local_path.exists():
            self.local_path.unlink()
            logger.warning("Deleted local settings file")
            self._settings_cache = None
