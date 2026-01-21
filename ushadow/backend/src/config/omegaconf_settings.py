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
import os
import time
from dataclasses import dataclass, field
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
    Usage in code: settings.get_by_env_var("MEMORY_SERVER_URL")
    """
    key = env_var_name.lower()

    # Strategy 1: Treat underscores as path separators (e.g., TRANSCRIPTION_PROVIDER -> transcription.provider)
    parts = key.split('_')
    if len(parts) >= 2:
        # Try section.key pattern (e.g., transcription.provider)
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
# Constants
# =============================================================================

# Use SENSITIVE_PATTERNS from secrets.py as the single source of truth
# Alias for backward compatibility within this module
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


class SettingsStore:
    """
    Manages settings with OmegaConf for automatic merging and interpolation.

    Load order (later overrides earlier):
    1. config.defaults.yaml (general app settings)
    2. secrets.yaml (credentials - gitignored, for api_keys/passwords)
    3. config.overrides.yaml (user modifications - gitignored)
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

    # =========================================================================
    # Environment Variable Mapping
    # =========================================================================

    async def _get_config_as_dict(self) -> Dict[str, Any]:
        """Get merged config as plain Python dict."""
        config = await self.load_config()
        return OmegaConf.to_container(config, resolve=True)

    async def _get_suggestions_for_env_var(
        self,
        env_var_name: str,
        provider_registry=None,
        capabilities: Optional[List[str]] = None,
    ) -> List[SettingSuggestion]:
        """
        Get setting suggestions that could fill an environment variable.

        Searches ALL config sections and filters by value type compatibility.
        For example, a URL env var will show all settings that contain URL values.

        Args:
            env_var_name: Environment variable name
            provider_registry: Optional provider registry for capability-based suggestions
            capabilities: Optional list of required capabilities to filter providers

        Returns:
            List of SettingSuggestion objects
        """
        suggestions = []
        seen_paths = set()
        config = await self._get_config_as_dict()

        # Determine the expected type based on env var name
        expected_type = infer_setting_type(env_var_name)

        # Search ALL config sections, filter by value type
        for section, section_data in config.items():
            if not isinstance(section_data, dict):
                continue

            for key, value in section_data.items():
                if value is None or isinstance(value, dict):
                    continue

                path = f"{section}.{key}"
                if path in seen_paths:
                    continue

                str_value = str(value) if value is not None else ""
                has_value = bool(str_value.strip())

                # Filter by value type compatibility
                value_type = infer_value_type(str_value) if has_value else 'empty'

                # Type compatibility rules:
                # - secret env vars: show secrets and empty slots in api_keys/security
                # - url env vars: show urls and empty slots
                # - string env vars: show strings, empty slots (but not urls/secrets)
                is_compatible = False
                if expected_type == 'secret':
                    is_compatible = (value_type == 'secret' or
                                    (value_type == 'empty' and section in ('api_keys', 'security')) or
                                    is_secret_key(path))
                elif expected_type == 'url':
                    is_compatible = (value_type == 'url' or
                                    (value_type == 'empty' and 'url' in key.lower()))
                else:  # string type
                    is_compatible = value_type in ('string', 'empty', 'bool', 'number')

                if not is_compatible:
                    continue

                seen_paths.add(path)
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


# Global instance
_settings_store: Optional[SettingsStore] = None


def get_settings_store(config_dir: Optional[Path] = None) -> SettingsStore:
    """Get global SettingsStore instance."""
    global _settings_store
    if _settings_store is None:
        _settings_store = SettingsStore(config_dir)
    return _settings_store


# =============================================================================
# New Simplified Settings API (v2)
# =============================================================================

class Source(str, Enum):
    """Where a resolved value came from (lowest to highest priority)."""
    CONFIG_DEFAULT = "config_default"    # 1. config.defaults.yaml
    COMPOSE_DEFAULT = "compose_default"  # 2. Default in compose file
    ENV_FILE = "env_file"                # 3. .env file (os.environ)
    CAPABILITY = "capability"            # 4. Wired provider/capability
    DEPLOY_ENV = "deploy_env"            # 5. Environment-specific override
    USER_OVERRIDE = "user_override"      # 6. Explicit user configuration
    NOT_FOUND = "not_found"


@dataclass
class Resolution:
    """Result of resolving an env var."""
    value: Optional[str]
    source: Source
    path: Optional[str] = None  # settings path if source=SETTINGS

    @property
    def found(self) -> bool:
        return self.source != Source.NOT_FOUND

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for API responses."""
        return {
            "value": self.value,
            "source": self.source.value,
            "path": self.path,
        }


class Settings:
    """
    Simplified settings interface (v2).

    5 functions:
    - resolve(env_vars, defaults) -> Dict[str, Resolution]
    - get_suggestions(env_var) -> List[Suggestion]
    - get(path) / get_sync(path) -> Any
    - set(path, value) -> None
    - delete(path) -> bool
    """

    def __init__(self, store: Optional[SettingsStore] = None):
        self._store = store or get_settings_store()

    # -------------------------------------------------------------------------
    # Entity-Level Resolution
    # -------------------------------------------------------------------------

    async def for_service(self, service_id: str) -> Dict[str, Resolution]:
        """
        Get settings for a service template.

        Layers applied: config_default → compose_default → env_file → capability

        Args:
            service_id: Service identifier (e.g., "chronicle-compose:chronicle-backend")

        Returns:
            Dict mapping env var names to their resolved values and sources
        """
        from src.services.compose_registry import get_compose_registry
        from src.services.capability_resolver import CapabilityResolver

        # Get service and its env var schema
        registry = get_compose_registry()
        service = registry.get_service(service_id)
        if not service:
            return {}

        # Collect all env var names
        env_vars = [ev.name for ev in service.required_env_vars] + \
                   [ev.name for ev in service.optional_env_vars]

        # Build compose_defaults from service schema
        compose_defaults = {
            ev.name: ev.default_value
            for ev in service.required_env_vars + service.optional_env_vars
            if ev.has_default and ev.default_value
        }

        # Get capability values from wired providers
        capability_values = {}
        if service.requires:
            try:
                resolver = CapabilityResolver()
                # resolve_for_service returns env vars from wired capabilities
                capability_values = await resolver.resolve_for_service(service_id)
            except Exception as e:
                logger.debug(f"Could not resolve capabilities for {service_id}: {e}")

        return await self._resolve_internal(
            env_vars=env_vars,
            compose_defaults=compose_defaults,
            capability_values=capability_values,
            deploy_env_overrides={},
            user_overrides={},
        )

    async def for_deploy_config(
        self,
        deploy_target: str,
        service_id: str
    ) -> Dict[str, Resolution]:
        """
        Get settings preview for a deployment target.

        Layers applied: config_default → compose_default → env_file → capability → deploy_env

        Args:
            deploy_target: Deployment target (e.g., "production", "staging")
            service_id: Service identifier

        Returns:
            Dict mapping env var names to their resolved values and sources
        """
        from src.services.compose_registry import get_compose_registry
        from src.services.capability_resolver import CapabilityResolver

        # Get service and its env var schema
        registry = get_compose_registry()
        service = registry.get_service(service_id)
        if not service:
            return {}

        # Collect all env var names
        env_vars = [ev.name for ev in service.required_env_vars] + \
                   [ev.name for ev in service.optional_env_vars]

        # Build compose_defaults from service schema
        compose_defaults = {
            ev.name: ev.default_value
            for ev in service.required_env_vars + service.optional_env_vars
            if ev.has_default and ev.default_value
        }

        # Get capability values from wired providers
        capability_values = {}
        if service.requires:
            try:
                resolver = CapabilityResolver()
                capability_values = await resolver.resolve_for_service(service_id)
            except Exception as e:
                logger.debug(f"Could not resolve capabilities for {service_id}: {e}")

        # Load deploy environment overrides
        deploy_env_overrides = await self._store.get(
            f"deploy_environments.{deploy_target}"
        ) or {}

        return await self._resolve_internal(
            env_vars=env_vars,
            compose_defaults=compose_defaults,
            capability_values=capability_values,
            deploy_env_overrides=deploy_env_overrides,
            user_overrides={},
        )

    async def for_deployment(self, deployment_id: str) -> Dict[str, Resolution]:
        """
        Get settings for a running deployment instance.

        Layers applied: ALL (config_default → compose_default → env_file → capability → deploy_env → user_override)

        Args:
            deployment_id: Deployment/instance identifier

        Returns:
            Dict mapping env var names to their resolved values and sources
        """
        from src.services.compose_registry import get_compose_registry
        from src.services.capability_resolver import CapabilityResolver
        from src.services.service_config_manager import get_service_config_manager

        # Parse deployment_id to get service_id
        # Format might be "service_id" or "service_id:instance_name"
        parts = deployment_id.rsplit(':', 1) if ':' in deployment_id else [deployment_id]
        service_id = parts[0] if len(parts) == 1 else ':'.join(parts[:-1])

        # Get service and its env var schema
        registry = get_compose_registry()
        service = registry.get_service(service_id)
        if not service:
            # Try as a service config
            config_manager = get_service_config_manager()
            service_config = config_manager.get_config(deployment_id)
            if service_config:
                service_id = service_config.service_id
                service = registry.get_service(service_id)

        if not service:
            return {}

        # Collect all env var names
        env_vars = [ev.name for ev in service.required_env_vars] + \
                   [ev.name for ev in service.optional_env_vars]

        # Build compose_defaults from service schema
        compose_defaults = {
            ev.name: ev.default_value
            for ev in service.required_env_vars + service.optional_env_vars
            if ev.has_default and ev.default_value
        }

        # Get capability values - use deployment-specific wiring if available
        capability_values = {}
        if service.requires:
            try:
                resolver = CapabilityResolver()
                capability_values = await resolver.resolve_for_instance(deployment_id)
            except Exception as e:
                logger.debug(f"Could not resolve capabilities for {deployment_id}: {e}")
                # Fall back to service-level resolution
                try:
                    capability_values = await resolver.resolve_for_service(service_id)
                except Exception:
                    pass

        # Load deploy environment overrides (if deployment has a target)
        deploy_env_overrides = {}
        # TODO: Get deploy target from deployment config if available

        # Load user overrides from saved config
        config_key = f"service_env_config.{deployment_id.replace(':', '_')}"
        saved_config = await self._store.get(config_key) or {}
        user_overrides = {
            name: cfg.get('value')
            for name, cfg in saved_config.items()
            if cfg.get('source') in ('literal', 'new_setting') and cfg.get('value')
        }

        return await self._resolve_internal(
            env_vars=env_vars,
            compose_defaults=compose_defaults,
            capability_values=capability_values,
            deploy_env_overrides=deploy_env_overrides,
            user_overrides=user_overrides,
        )

    async def _find_config_default(self, env_var: str) -> Optional[Tuple[str, Any]]:
        """
        Find a config default value for an env var.

        Checks provider registry mapping first, then fuzzy matches config.

        Returns:
            Tuple of (setting_path, value) if found, None otherwise
        """
        # Try direct path mapping from provider registry
        env_mapping = get_provider_registry().get_env_to_settings_mapping()
        if env_var in env_mapping:
            settings_path = env_mapping[env_var]
            value = await self._store.get(settings_path)
            if value:
                return (settings_path, value)

        # Fuzzy match across all config sections
        config = await self._store._get_config_as_dict()
        for section, section_data in config.items():
            if not isinstance(section_data, dict):
                continue
            for key, value in section_data.items():
                if value is None or isinstance(value, dict):
                    continue
                path = f"{section}.{key}"
                if env_var_matches_setting(env_var, path):
                    str_value = str(value) if value is not None else ""
                    if str_value.strip():
                        return (path, value)

        return None

    async def _resolve_internal(
        self,
        env_vars: List[str],
        compose_defaults: Dict[str, str],
        capability_values: Dict[str, str],
        deploy_env_overrides: Dict[str, str],
        user_overrides: Dict[str, str],
    ) -> Dict[str, Resolution]:
        """
        Internal resolution logic.

        Resolution order (highest priority wins):
        6. user_override - Explicit user configuration
        5. deploy_env - Environment-specific override
        4. capability - Wired provider/capability value
        3. env_file - .env file (os.environ)
        2. compose_default - Default in compose file
        1. config_default - config.defaults.yaml
        """
        results: Dict[str, Resolution] = {}

        for env_var in env_vars:
            # Check from highest to lowest priority, return first found

            # 6. User override (highest)
            if env_var in user_overrides:
                value = user_overrides[env_var]
                if value and str(value).strip():
                    results[env_var] = Resolution(
                        value=str(value),
                        source=Source.USER_OVERRIDE,
                        path=None
                    )
                    continue

            # 5. Deploy environment override
            if env_var in deploy_env_overrides:
                value = deploy_env_overrides[env_var]
                if value and str(value).strip():
                    results[env_var] = Resolution(
                        value=str(value),
                        source=Source.DEPLOY_ENV,
                        path=None
                    )
                    continue

            # 4. Capability/provider wiring
            if env_var in capability_values:
                value = capability_values[env_var]
                if value and str(value).strip():
                    results[env_var] = Resolution(
                        value=str(value),
                        source=Source.CAPABILITY,
                        path=None
                    )
                    continue

            # 3. .env file (os.environ)
            env_value = os.environ.get(env_var)
            if env_value and env_value.strip():
                results[env_var] = Resolution(
                    value=env_value,
                    source=Source.ENV_FILE,
                    path=None
                )
                continue

            # 2. Compose file default
            if env_var in compose_defaults:
                value = compose_defaults[env_var]
                if value and str(value).strip():
                    results[env_var] = Resolution(
                        value=str(value),
                        source=Source.COMPOSE_DEFAULT,
                        path=None
                    )
                    continue

            # 1. Config default (config.defaults.yaml via env var mapping)
            setting_result = await self._find_config_default(env_var)
            if setting_result:
                path, value = setting_result
                if value and str(value).strip():
                    results[env_var] = Resolution(
                        value=str(value),
                        source=Source.CONFIG_DEFAULT,
                        path=path
                    )
                    continue

            # Not found
            results[env_var] = Resolution(
                value=None,
                source=Source.NOT_FOUND,
                path=None
            )

        return results

    # -------------------------------------------------------------------------
    # Suggestions
    # -------------------------------------------------------------------------

    async def get_suggestions(self, env_var: str) -> List[SettingSuggestion]:
        """
        Get possible settings that could fill this env var.
        Used for dropdown menus in the UI.
        """
        return await self._store._get_suggestions_for_env_var(env_var)

    # -------------------------------------------------------------------------
    # Direct path access
    # -------------------------------------------------------------------------

    async def get(self, path: str, default: Any = None) -> Any:
        """Get a value by settings path."""
        return await self._store.get(path, default)

    def get_sync(self, path: str, default: Any = None) -> Any:
        """Sync version of get() for module-level initialization."""
        return self._store.get_sync(path, default)

    async def get_all(self) -> Dict[str, Any]:
        """Get all settings as a plain Python dict."""
        return await self._store._get_config_as_dict()

    # -------------------------------------------------------------------------
    # Mutations
    # -------------------------------------------------------------------------

    async def set(self, path: str, value: Any) -> None:
        """
        Set a setting value.
        Auto-routes to secrets.yaml or config.overrides.yaml based on path.
        """
        await self._store.update({path: value})

    async def delete(self, path: str) -> bool:
        """
        Delete a setting override.
        Returns True if it existed, False otherwise.
        """
        # Check if value exists first
        current = await self._store.get(path)
        if current is None:
            return False

        # Determine which file to modify
        if self._store._is_secret_key(path):
            file_path = self._store.secrets_path
        else:
            file_path = self._store.overrides_path

        if not file_path.exists():
            return False

        # Load, remove key, save
        config = self._store._load_yaml_if_exists(file_path)
        if config is None:
            return False

        # Navigate to parent and delete key
        parts = path.split('.')
        if len(parts) == 1:
            if parts[0] in config:
                del config[parts[0]]
                OmegaConf.save(config, file_path)
                self._store.clear_cache()
                return True
            return False

        # Navigate to parent dict
        parent = config
        for part in parts[:-1]:
            if part not in parent:
                return False
            parent = parent[part]

        # Delete the key
        key = parts[-1]
        if key in parent:
            del parent[key]
            OmegaConf.save(config, file_path)
            self._store.clear_cache()
            return True

        return False

    # -------------------------------------------------------------------------
    # Batch operations
    # -------------------------------------------------------------------------

    async def update(self, updates: dict) -> None:
        """
        Update multiple settings at once.
        Auto-routes secrets to secrets.yaml, others to config.overrides.yaml.
        """
        await self._store.update(updates)

    async def reset(self, include_secrets: bool = True) -> int:
        """
        Reset all settings by deleting config files.
        Returns number of files deleted.
        """
        return await self._store.reset(include_secrets)

    def clear_cache(self) -> None:
        """Clear the configuration cache, forcing reload on next access."""
        self._store.clear_cache()

    def filter_masked_values(self, updates: dict) -> dict:
        """
        Filter out masked values (****) from updates.
        Use before saving to prevent accidentally overwriting secrets with masks.
        """
        return self._store._filter_masked_values(updates)


# Global Settings instance
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get global Settings instance (new v2 API)."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


# Alias for cleaner external use
Suggestion = SettingSuggestion
