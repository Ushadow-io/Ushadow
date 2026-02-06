"""
Settings API - Entity-based settings resolution.

Provides a clean API for resolving settings at different entity levels:
- for_service() - Service template level settings
- for_deploy_config() - Deployment target preview
- for_deployment() - Running instance (all layers)

Resolution hierarchy (highest priority wins):
1. config_default - config.defaults.yaml
2. compose_default - Default in compose file
3. env_file - .env file (os.environ)
4. capability - Wired provider/capability
5. template_override - services.{service_id} in config.overrides.yaml
6. instance_override - instances.{deployment_id} in instance-overrides.yaml
"""

import os
from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional, List, Tuple, Dict

from omegaconf import OmegaConf

from src.config.store import SettingsStore, get_settings_store
from src.config.secrets import is_secret_key, mask_secret_value, should_store_in_secrets
from src.config.helpers import (
    infer_value_type,
    infer_setting_type,
    env_var_matches_setting,
)
from src.services.provider_registry import get_provider_registry
from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="Settings")


# =============================================================================
# Data Models
# =============================================================================

class Source(str, Enum):
    """Where a resolved value came from (lowest to highest priority)."""
    CONFIG_DEFAULT = "config_default"
    COMPOSE_DEFAULT = "compose_default"
    ENV_FILE = "env_file"
    CAPABILITY = "capability"
    TEMPLATE_OVERRIDE = "template_override"  # services.{service_id} in config.overrides.yaml
    INSTANCE_OVERRIDE = "instance_override"  # instances.{deployment_id} in instance-overrides.yaml
    NOT_FOUND = "not_found"


@dataclass
class Resolution:
    """Result of resolving an environment variable."""
    value: Optional[str]
    source: Source
    path: Optional[str] = None

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


@dataclass
class SettingSuggestion:
    """A suggested setting that could fill an environment variable."""
    path: str
    label: str
    has_value: bool
    value: Optional[str] = None
    capability: Optional[str] = None
    provider_name: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "path": self.path,
            "label": self.label,
            "has_value": self.has_value,
            "value": self.value,
            "capability": self.capability,
            "provider_name": self.provider_name,
        }


# =============================================================================
# Settings API
# =============================================================================

class Settings:
    """
    Settings API for entity-based resolution.

    Public Methods:
        for_service() - Get settings for a service template
        for_deploy_config() - Get settings for a deployment target
        for_deployment() - Get settings for a running instance
        get_suggestions() - Get setting suggestions for an env var
        get() / get_sync() / get_all() - Direct path access
        set() - Update a single setting
        delete() - Remove a setting override
        update() - Update multiple settings
        reset() - Clear all overrides
        clear_cache() - Invalidate cache
    """

    def __init__(self, store: Optional[SettingsStore] = None):
        self._store = store or get_settings_store()

    # -------------------------------------------------------------------------
    # Entity-Level Resolution (Public API)
    # -------------------------------------------------------------------------

    async def for_service(self, service_id: str) -> Dict[str, Resolution]:
        """
        Get settings for a service template.

        Args:
            service_id: Service identifier (e.g., "chronicle-compose:chronicle-backend")

        Returns:
            Dict mapping env var names to Resolution objects

        Resolution layers applied:
            config_default → compose_default → env_file → capability → template_override
        """
        env_vars, compose_defaults, capability_values, template_overrides = \
            await self._load_service_context(service_id)

        return await self._resolve_all(
            env_vars=env_vars,
            compose_defaults=compose_defaults,
            capability_values=capability_values,
            template_overrides=template_overrides,
            instance_overrides={},
        )

    async def for_deploy_config(
        self,
        deploy_target: str,
        service_id: str
    ) -> Dict[str, Resolution]:
        """
        Get settings preview for a deployment target.

        Args:
            deploy_target: Target environment (e.g., "production", "staging")
            service_id: Service identifier

        Returns:
            Dict mapping env var names to Resolution objects

        Resolution layers applied:
            config_default → compose_default → env_file → capability → template_override → deploy_env
        """
        env_vars, compose_defaults, capability_values, template_overrides = \
            await self._load_service_context(service_id)

        # Note: deploy_target is not used in current implementation
        # Could add deploy_environments.{target} overrides layer in future

        return await self._resolve_all(
            env_vars=env_vars,
            compose_defaults=compose_defaults,
            capability_values=capability_values,
            template_overrides=template_overrides,
            instance_overrides={},
        )

    async def for_deployment(self, deployment_id: str) -> Dict[str, Resolution]:
        """
        Get settings for a running deployment instance.

        Args:
            deployment_id: Deployment/instance identifier

        Returns:
            Dict mapping env var names to Resolution objects

        Resolution layers applied:
            ALL layers (config_default → ... → instance_override)
        """
        env_vars, compose_defaults, capability_values, template_overrides, instance_overrides = \
            await self._load_deployment_context(deployment_id)

        results = await self._resolve_all(
            env_vars=env_vars,
            compose_defaults=compose_defaults,
            capability_values=capability_values,
            template_overrides=template_overrides,
            instance_overrides=instance_overrides,
        )

        self._log_resolution_summary(env_vars, results)
        return results

    # -------------------------------------------------------------------------
    # Suggestions (Public API)
    # -------------------------------------------------------------------------

    async def get_suggestions(self, env_var: str) -> List[SettingSuggestion]:
        """
        Get setting suggestions that could fill an environment variable.

        Used for dropdown menus in the UI.

        Args:
            env_var: Environment variable name

        Returns:
            List of SettingSuggestion objects
        """
        return await self._build_suggestions(env_var)

    # -------------------------------------------------------------------------
    # Direct Access (Public API)
    # -------------------------------------------------------------------------

    async def get(self, path: str, default: Any = None) -> Any:
        """Get a value by settings path (e.g., "api_keys.openai_api_key")."""
        return await self._store.get(path, default)

    def get_sync(self, path: str, default: Any = None) -> Any:
        """Sync version of get() for module initialization."""
        return self._store.get_sync(path, default)

    async def get_all(self) -> Dict[str, Any]:
        """Get all settings as a plain Python dict."""
        return await self._store._get_config_as_dict()

    # -------------------------------------------------------------------------
    # Mutations (Public API)
    # -------------------------------------------------------------------------

    async def set(self, path: str, value: Any) -> None:
        """Set a setting value (auto-routes to secrets.yaml or config.overrides.yaml)."""
        await self._store.update({path: value})

    async def delete(self, path: str) -> bool:
        """Delete a setting override. Returns True if it existed."""
        current = await self._store.get(path)
        if current is None:
            return False

        file_path = (
            self._store.secrets_path if should_store_in_secrets(path)
            else self._store.overrides_path
        )

        if not file_path.exists():
            return False

        config = self._store._load_yaml_if_exists(file_path)
        if config is None:
            return False

        parts = path.split('.')
        if len(parts) == 1:
            if parts[0] in config:
                del config[parts[0]]
                OmegaConf.save(config, file_path)
                self._store.clear_cache()
                return True
            return False

        parent = config
        for part in parts[:-1]:
            if part not in parent:
                return False
            parent = parent[part]

        key = parts[-1]
        if key in parent:
            del parent[key]
            OmegaConf.save(config, file_path)
            self._store.clear_cache()
            return True

        return False

    async def update(self, updates: dict) -> None:
        """Update multiple settings at once."""
        await self._store.update(updates)

    async def reset(self, include_secrets: bool = True) -> int:
        """Reset all settings by deleting config files. Returns count of files deleted."""
        return await self._store.reset(include_secrets)

    def clear_cache(self) -> None:
        """Clear the configuration cache."""
        self._store.clear_cache()

    # =========================================================================
    # Internal Implementation (Private)
    # =========================================================================

    async def _resolve_mapping(self, value: str) -> Optional[str]:
        """
        Resolve @settings.path mapping syntax.

        Args:
            value: String that may contain @settings.path reference

        Returns:
            Resolved value or None if mapping not found

        Examples:
            "@settings.api_keys.openai" -> "sk-123..."
            "literal_value" -> "literal_value"
        """
        if not isinstance(value, str) or not value.startswith('@settings.'):
            return value

        # Extract the path after @settings.
        path = value[10:]  # Remove '@settings.' prefix
        resolved = await self._store.get(path)

        if resolved:
            logger.debug(f"Resolved mapping {value} -> {path}")
            return str(resolved)
        else:
            logger.warning(f"Mapping {value} not found at path: {path}")
            return None

    async def _load_service_context(
        self, service_id: str
    ) -> Tuple[List[str], Dict[str, str], Dict[str, str], Dict[str, str]]:
        """Load service schema, resolve capabilities, and load template overrides."""
        from src.services.compose_registry import get_compose_registry
        from src.services.capability_resolver import CapabilityResolver

        registry = get_compose_registry()
        service = registry.get_service(service_id)
        if not service:
            return [], {}, {}, {}

        env_vars = [ev.name for ev in service.required_env_vars + service.optional_env_vars]

        compose_defaults = {
            ev.name: ev.default_value
            for ev in service.required_env_vars + service.optional_env_vars
            if ev.has_default and ev.default_value
        }

        capability_values = {}
        if service.requires:
            try:
                resolver = CapabilityResolver()
                capability_values = await resolver.resolve_for_service(service_id)
            except Exception as e:
                logger.debug(f"Could not resolve capabilities for {service_id}: {e}")

        # Load template-level overrides from config.overrides.yaml (services.{service_id})
        # Don't resolve mappings yet - store raw values so we can track the mapping path
        template_overrides = {}
        template_config = await self._store.get(f"services.{service_id}") or {}
        if template_config:
            for env_var, value in template_config.items():
                if value:
                    # Store raw value (including @settings.path if it's a mapping)
                    template_overrides[env_var] = str(value)
                    logger.info(f"[Load] [Template Override] {env_var} = {value}")

        return env_vars, compose_defaults, capability_values, template_overrides

    async def _load_deployment_context(
        self, deployment_id: str
    ) -> Tuple[List[str], Dict[str, str], Dict[str, str], Dict[str, str], Dict[str, str]]:
        """
        Load deployment context including template and instance overrides.

        Handles three ID formats:
        1. deployment_id (future: from Deployment storage)
        2. config_id (current: ServiceConfig ID) - loads ServiceConfig to get template_id + overrides
        3. service_id/template_id (legacy: direct template reference)
        """
        from src.services.compose_registry import get_compose_registry
        from src.services.capability_resolver import CapabilityResolver
        from src.services.service_config_manager import get_service_config_manager

        config_mgr = get_service_config_manager()
        registry = get_compose_registry()

        # Try to load as ServiceConfig first (handles config_id format)
        service_config = config_mgr.get_service_config(deployment_id)

        if service_config:
            # This is a config_id - use ServiceConfig
            logger.info(f"[Settings] for_deployment({deployment_id}): Found ServiceConfig, template={service_config.template_id}")

            # Extract service_id from template_id
            # Template IDs are like "chronicle-backend" (compose services) or "openai" (providers)
            service_id = service_config.template_id

            # Get instance overrides from ServiceConfig.config
            # These are raw mappings like "@settings.api_keys.openai_api_key"
            instance_overrides_from_config = {}
            if service_config.config and service_config.config.values:
                for env_var, value in service_config.config.values.items():
                    if value:
                        instance_overrides_from_config[env_var] = str(value)
                        logger.info(f"[Load] [ServiceConfig Override] {env_var} = {value}")
        else:
            # Not a ServiceConfig - try as direct service_id/template_id
            logger.info(f"[Settings] for_deployment({deployment_id}): Not a ServiceConfig, using as service_id")

            # Parse deployment_id to get service_id (legacy behavior)
            parts = deployment_id.rsplit(':', 1) if ':' in deployment_id else [deployment_id]
            service_id = parts[0] if len(parts) == 1 else ':'.join(parts[:-1])

            instance_overrides_from_config = {}

        logger.info(f"[Settings] Resolved service_id={service_id}")

        # Get service schema from ComposeRegistry
        service = registry.get_service(service_id)

        if not service:
            logger.error(f"[Settings] Service '{service_id}' not found in registry")
            return [], {}, {}, {}, {}

        env_vars = [ev.name for ev in service.required_env_vars + service.optional_env_vars]
        logger.info(f"[Settings] Collected {len(env_vars)} env vars from service schema")

        compose_defaults = {
            ev.name: ev.default_value
            for ev in service.required_env_vars + service.optional_env_vars
            if ev.has_default and ev.default_value
        }

        # Resolve capabilities
        capability_values = {}
        if service.requires:
            try:
                resolver = CapabilityResolver()
                capability_values = await resolver.resolve_for_instance(deployment_id)
            except Exception:
                try:
                    capability_values = await resolver.resolve_for_service(service_id)
                except Exception:
                    pass

        logger.info(f"[Settings] Capability values ({len(capability_values)}): {list(capability_values.keys())}")

        # Load template-level overrides from config.overrides.yaml (services.{service_id})
        # Don't resolve mappings yet - store raw values so we can track the mapping path
        template_overrides = {}
        template_config = await self._store.get(f"services.{service_id}") or {}
        if template_config:
            for env_var, value in template_config.items():
                if value:
                    # Store raw value (including @settings.path if it's a mapping)
                    template_overrides[env_var] = str(value)
                    logger.info(f"[Load] [Template Override] {env_var} = {value}")

        # Merge instance overrides: ServiceConfig.config takes precedence over instances.{deployment_id}
        # Priority: ServiceConfig.config > instances.{deployment_id} (legacy)
        instance_overrides = {}

        # First load from legacy instance-overrides.yaml (instances.{deployment_id})
        legacy_instance_config = await self._store.get(f"instances.{deployment_id}") or {}
        if legacy_instance_config:
            for env_var, value in legacy_instance_config.items():
                if value:
                    instance_overrides[env_var] = str(value)
                    logger.info(f"[Load] [Legacy Instance Override] {env_var} = {value}")

        # Then apply ServiceConfig.config (higher priority)
        for env_var, value in instance_overrides_from_config.items():
            instance_overrides[env_var] = value

        return env_vars, compose_defaults, capability_values, template_overrides, instance_overrides

    async def _resolve_all(
        self,
        env_vars: List[str],
        compose_defaults: Dict[str, str],
        capability_values: Dict[str, str],
        template_overrides: Dict[str, str],
        instance_overrides: Dict[str, str],
    ) -> Dict[str, Resolution]:
        """Resolve all env vars through the priority hierarchy."""
        results: Dict[str, Resolution] = {}

        for env_var in env_vars:
            # Check from highest to lowest priority

            # 6. Instance override (highest)
            if env_var in instance_overrides:
                value = instance_overrides[env_var]
                if value and str(value).strip():
                    # Check if it's a mapping (@settings.path)
                    if str(value).startswith('@settings.'):
                        mapping_path = str(value)[10:]  # Remove '@settings.' prefix
                        resolved_value = await self._resolve_mapping(value)
                        if resolved_value:
                            results[env_var] = Resolution(
                                value=resolved_value,
                                source=Source.INSTANCE_OVERRIDE,
                                path=mapping_path  # Track the mapping path
                            )
                            continue
                    else:
                        # Direct literal value
                        results[env_var] = Resolution(
                            value=str(value),
                            source=Source.INSTANCE_OVERRIDE,
                            path=None
                        )
                        continue

            # 5. Template override
            if env_var in template_overrides:
                value = template_overrides[env_var]
                if value and str(value).strip():
                    # Check if it's a mapping (@settings.path)
                    if str(value).startswith('@settings.'):
                        mapping_path = str(value)[10:]  # Remove '@settings.' prefix
                        resolved_value = await self._resolve_mapping(value)
                        if resolved_value:
                            results[env_var] = Resolution(
                                value=resolved_value,
                                source=Source.TEMPLATE_OVERRIDE,
                                path=mapping_path  # Track the mapping path
                            )
                            continue
                    else:
                        # Direct literal value
                        results[env_var] = Resolution(
                            value=str(value),
                            source=Source.TEMPLATE_OVERRIDE,
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

            # 1. Config default (config.defaults.yaml)
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

    async def _find_config_default(self, env_var: str) -> Optional[Tuple[str, Any]]:
        """Find a config default value for an env var."""
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

    async def _build_suggestions(
        self,
        env_var_name: str,
        provider_registry=None,
        capabilities: Optional[List[str]] = None,
    ) -> List[SettingSuggestion]:
        """Build setting suggestions for an env var."""
        suggestions = []
        seen_paths = set()
        config = await self._store._get_config_as_dict()

        expected_type = infer_setting_type(env_var_name)

        # Search all config sections, filter by value type
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

                value_type = infer_value_type(str_value) if has_value else 'empty'

                # Type compatibility rules
                is_compatible = False
                if expected_type == 'secret':
                    is_compatible = (value_type == 'secret' or
                                    (value_type == 'empty' and section in ('api_keys', 'security')) or
                                    is_secret_key(path))
                elif expected_type == 'url':
                    is_compatible = (value_type == 'url' or
                                    (value_type == 'empty' and 'url' in key.lower()))
                else:
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

        # Add service URLs if env var is URL type
        if expected_type == 'url':
            try:
                from src.services.docker_manager import get_docker_manager
                from src.config.urls import get_docker_proxy_url

                docker_mgr = get_docker_manager()

                # Get all manageable services
                for service_name, service_config in docker_mgr.MANAGEABLE_SERVICES.items():
                    # Create a dynamic suggestion path for this service URL
                    suggestion_path = f"service_urls.{service_name}"

                    if suggestion_path in seen_paths:
                        continue

                    seen_paths.add(suggestion_path)

                    # Get service display name
                    display_name = service_config.get('description', service_name.replace('-', ' ').title())

                    # Get Docker proxy URL using shared utility
                    internal_url = get_docker_proxy_url(service_name)

                    suggestions.append(SettingSuggestion(
                        path=suggestion_path,
                        label=f"Service: {display_name}",
                        has_value=True,
                        value=internal_url,
                    ))
            except Exception as e:
                # Don't fail the entire suggestion building if service discovery fails
                from src.utils.logging import get_logger
                logger = get_logger(__name__)
                logger.warning(f"Failed to add service URL suggestions: {e}")

        # Add provider-specific mappings if provided
        if provider_registry and capabilities:
            for capability in capabilities:
                selected_id = await self._store.get(f"selected_providers.{capability}")
                if not selected_id:
                    selected_id = provider_registry.get_default_provider_id(capability, 'cloud')
                if not selected_id:
                    continue

                provider = provider_registry.get_provider(selected_id)
                if not provider:
                    continue

                for env_map in provider.env_maps:
                    if env_map.key == env_var_name and env_map.settings_path:
                        if env_map.settings_path in seen_paths:
                            continue
                        seen_paths.add(env_map.settings_path)

                        value = await self._store.get(env_map.settings_path)
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

    def _log_resolution_summary(
        self, env_vars: List[str], results: Dict[str, Resolution]
    ) -> None:
        """Log final resolution results."""
        logger.info("[Settings] ========== Final Resolution Summary ==========")
        for env_var in env_vars:
            if env_var in results:
                resolution = results[env_var]
                display_value = resolution.value
                if any(secret in env_var.lower() for secret in ['key', 'secret', 'token', 'password']):
                    display_value = f"****{resolution.value[-4:]}" if resolution.value and len(str(resolution.value)) > 4 else "****"
                logger.info(f"[Resolve] {env_var} -> {display_value} (source: {resolution.source.value})")
            else:
                logger.warning(f"[Resolve] {env_var} -> NOT RESOLVED")

        missing = set(env_vars) - set(results.keys())
        if missing:
            logger.warning(f"[Settings] Failed to resolve {len(missing)} env vars: {missing}")
        logger.info("[Settings] ========================================")


# =============================================================================
# Global Instance
# =============================================================================

_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get global Settings instance."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


# Alias for cleaner external use
Suggestion = SettingSuggestion
