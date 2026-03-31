"""
ServiceConfig Manager - Manages service/provider instances and wiring.

Handles:
- Loading instances and wiring from config files
- CRUD operations for instances
- Wiring connections between instances
- Resolving env vars from wiring
"""

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from omegaconf import OmegaConf, DictConfig

from src.models.service_config import (
    ServiceConfig,
    ConfigValues,
    ServiceConfigCreate,
    ServiceConfigSummary,
    ServiceConfigUpdate,
    Template,
    TemplateSource,
    Wiring,
    WiringCreate,
)
from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="Config")


def _get_config_dir() -> Path:
    """Get the config directory path."""
    # Try environment variable first
    import os
    config_dir = os.environ.get("CONFIG_DIR")
    if config_dir:
        return Path(config_dir)

    # In Docker container, config is mounted at /config (mirrors SettingsStore logic)
    if Path("/config").exists():
        return Path("/config")

    # Local dev: walk up from this file looking for a config/ dir that contains service_configs.yaml
    current = Path(__file__).resolve()
    for parent in current.parents:
        candidate = parent / "config"
        if candidate.exists() and (candidate / "service_configs.yaml").exists():
            return candidate

    # Fallback for local dev (valid path: project_root/config)
    return Path(__file__).resolve().parents[4] / "config"


class ServiceConfigManager:
    """
    Manages instances and wiring.

    ServiceConfigs are stored in config/service_configs.yaml.
    Wiring is stored inline on each consumer instance as wiring[capability] = source_config_id.
    """

    def __init__(self, config_dir: Optional[Path] = None):
        self.config_dir = config_dir or _get_config_dir()
        self.instances_path = self.config_dir / "service_configs.yaml"

        # Dual storage: ServiceConfig objects for runtime, DictConfig for persistence
        self._service_configs: Dict[str, ServiceConfig] = {}  # Resolved configs (for runtime use)
        self._omegaconf_configs: Dict[str, DictConfig] = {}  # Raw configs with interpolations (for saving)
        self._loaded = False

    def _ensure_loaded(self) -> None:
        """Ensure config is loaded."""
        if not self._loaded:
            self._load()

    def _load(self) -> None:
        """Load instances (with inline wiring) from config file."""
        self._load_service_configs()
        self._loaded = True

    def _load_service_configs(self) -> None:
        """Load instances from service_configs.yaml using OmegaConf to preserve interpolations."""
        self._service_configs = {}
        self._omegaconf_configs = {}

        if not self.instances_path.exists():
            logger.debug(f"No instances file at {self.instances_path}")
            return

        try:
            # Load with OmegaConf to preserve interpolations in raw format
            raw_cfg = OmegaConf.load(self.instances_path)
            instances_data = raw_cfg.get('instances', {}) or {}

            for config_id, instance_data in instances_data.items():
                if instance_data is None:
                    continue

                # Get config data - store both raw (with interpolations) and resolved
                config_data = instance_data.get('config', {})

                # Store raw OmegaConf config (preserves interpolations like ${api_keys.openai})
                if config_data:
                    self._omegaconf_configs[config_id] = OmegaConf.create(config_data)

                # Resolve values for the ServiceConfig object (for runtime use)
                resolved_config = OmegaConf.to_container(config_data, resolve=True) if config_data else {}

                instance = ServiceConfig(
                    id=config_id,
                    template_id=instance_data.get('template_id', ''),
                    name=instance_data.get('name', config_id),
                    description=instance_data.get('description'),
                    config=ConfigValues(values=resolved_config),
                    wiring=dict(instance_data.get('wiring', {}) or {}),
                    created_at=instance_data.get('created_at'),
                    updated_at=instance_data.get('updated_at'),
                    # Integration-specific fields (null for non-integrations)
                    integration_type=instance_data.get('integration_type'),
                    sync_enabled=instance_data.get('sync_enabled'),
                    sync_interval=instance_data.get('sync_interval'),
                )
                self._service_configs[config_id] = instance

            logger.info(f"Loaded {len(self._service_configs)} instances")

        except Exception as e:
            logger.error(f"Failed to load instances: {e}")


    def _save_service_configs(self) -> None:
        """Save instances to service_configs.yaml."""
        data = {'instances': {}}

        for config_id, instance in self._service_configs.items():
            instance_data = {
                'template_id': instance.template_id,
                'name': instance.name,
            }
            if instance.description:
                instance_data['description'] = instance.description

            # Save config with interpolations preserved (if available)
            if instance.config.values:
                # Use raw OmegaConf config to preserve interpolations like ${api_keys.openai}
                if config_id in self._omegaconf_configs:
                    # Get unresolved config (preserves ${...} interpolations)
                    instance_data['config'] = OmegaConf.to_container(
                        self._omegaconf_configs[config_id],
                        resolve=False
                    )
                else:
                    # Fallback: no raw config available, save resolved values
                    instance_data['config'] = instance.config.values

            if instance.wiring:
                instance_data['wiring'] = dict(instance.wiring)

            # Timestamps
            if instance.created_at:
                instance_data['created_at'] = instance.created_at.isoformat() if isinstance(instance.created_at, datetime) else instance.created_at
            if instance.updated_at:
                instance_data['updated_at'] = instance.updated_at.isoformat() if isinstance(instance.updated_at, datetime) else instance.updated_at

            # Integration-specific fields (null for non-integrations)
            if instance.integration_type is not None:
                instance_data['integration_type'] = instance.integration_type
            if instance.sync_enabled is not None:
                instance_data['sync_enabled'] = instance.sync_enabled
            if instance.sync_interval is not None:
                instance_data['sync_interval'] = instance.sync_interval

            data['instances'][config_id] = instance_data

        try:
            with open(self.instances_path, 'w') as f:
                yaml.dump(data, f, default_flow_style=False, sort_keys=False)
            logger.debug(f"Saved {len(self._service_configs)} instances")
        except Exception as e:
            logger.error(f"Failed to save instances: {e}")
            raise

    def reload(self) -> None:
        """Reload from config files."""
        self._loaded = False
        self._load()

    # =========================================================================
    # ServiceConfig Operations
    # =========================================================================

    async def list_service_configs_async(self) -> List[ServiceConfigSummary]:
        """List all service configurations (async version).

        Returns both actual ServiceConfig entries AND placeholder entries
        for installed templates that don't have configs yet.
        """
        self._ensure_loaded()

        # Get provider registry to look up 'provides' capability
        from src.services.provider_registry import get_provider_registry
        provider_registry = get_provider_registry()

        result = []
        config_template_ids = set()

        # Add actual service configs
        for config in self._service_configs.values():
            # Look up what capability this config provides
            provides = None
            provider = provider_registry.get_provider(config.template_id)
            if provider:
                provides = provider.capability

            result.append(ServiceConfigSummary(
                id=config.id,
                template_id=config.template_id,
                name=config.name,
                provides=provides,
                description=config.description,
                config=config.config.values if config.config else None,
            ))
            config_template_ids.add(config.template_id)

        # Add placeholders for installed providers that don't have a config yet.
        # Uses cached registries directly — no reload, no Docker/status checks.
        try:
            from src.config import get_settings
            from src.services.compose_registry import get_compose_registry

            settings = get_settings()
            default_services = await settings.get("default_services") or []
            user_installed = await settings.get("installed_services") or []
            removed_services = await settings.get("removed_services") or []
            installed_names = (set(default_services) | set(user_installed)) - set(removed_services)

            # Provider placeholders (YAML providers explicitly installed by user)
            for provider in provider_registry.get_providers():
                if provider.id not in installed_names:
                    continue
                if provider.id in config_template_ids:
                    continue
                result.append(ServiceConfigSummary(
                    id=provider.id,
                    template_id=provider.id,
                    name=provider.name,
                    provides=provider.capability,
                    description=provider.description,
                ))

            # Compose service placeholders (installed compose services without a config)
            registry = get_compose_registry()
            for service in registry.get_services():
                svc_name = service.service_name
                compose_base = service.compose_file.stem.replace('-compose', '')
                if svc_name in set(removed_services):
                    continue
                is_installed = svc_name in installed_names or compose_base in installed_names
                if not is_installed:
                    continue
                if service.service_id in config_template_ids:
                    continue
                result.append(ServiceConfigSummary(
                    id=service.service_id,
                    template_id=service.service_id,
                    name=service.display_name or svc_name,
                    provides=service.provides,
                    description=service.description,
                ))
        except Exception as e:
            logger.warning(f"Failed to load installed templates: {e}")

        return result

    def list_service_configs(self) -> List[ServiceConfigSummary]:
        """List all service configurations (sync wrapper)."""
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Already in async context - this shouldn't happen but handle it
                return asyncio.run_coroutine_threadsafe(
                    self.list_service_configs_async(), loop
                ).result()
            else:
                return loop.run_until_complete(self.list_service_configs_async())
        except RuntimeError:
            # No event loop - create one
            return asyncio.run(self.list_service_configs_async())

    def get_service_config(self, config_id: str) -> Optional[ServiceConfig]:
        """Get a service config by ID."""
        self._ensure_loaded()
        return self._service_configs.get(config_id)

    def get_config_overrides(self, config_id: str) -> Dict[str, Any]:
        """Get the config values for this instance, excluding interpolations.

        Returns only explicitly set config values (direct overrides), filtering out
        interpolations like ${api_keys.openai} which come from SettingsStore.

        This is useful for the UI to show only user-overridden values.
        """
        self._ensure_loaded()

        # Check if we have raw OmegaConf config (with interpolations)
        raw_config = self._omegaconf_configs.get(config_id)
        if not raw_config:
            # No raw config, return all values
            instance = self._service_configs.get(config_id)
            if not instance:
                return {}
            return instance.config.values if instance.config else {}

        # Filter out interpolations - return only direct values
        overrides = {}
        for key in raw_config:
            # OmegaConf.is_interpolation() detects ${...} references
            if not OmegaConf.is_interpolation(raw_config, key):
                # This is a direct value (user override), not an interpolation
                value = OmegaConf.select(raw_config, key)
                # Convert OmegaConf containers to regular Python types for Pydantic serialization
                if isinstance(value, (DictConfig, type(OmegaConf.create([])))):
                    value = OmegaConf.to_container(value, resolve=True)
                overrides[key] = value

        return overrides

    async def normalize_incoming_config(self, config_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize an incoming config dict before storage.

        Translates env var keys (OLLAMA_MODEL) to capability keys (model) using
        the provider's env_maps, and resolves _from_setting dict values to literal
        strings via settings.get().

        This ensures configs are always stored in canonical format:
        capability keys + literal string values. Mirrors get_display_config_overrides()
        but runs at save time instead of read time.
        """
        self._ensure_loaded()
        config_obj = self._service_configs.get(config_id)
        if not config_obj:
            return config

        from src.services.provider_registry import get_provider_registry
        provider = get_provider_registry().get_provider(config_obj.template_id)
        env_var_to_cap_key: Dict[str, str] = {}
        if provider:
            for em in provider.env_maps:
                if em.env_var:
                    env_var_to_cap_key[em.env_var] = em.key

        from src.config import get_settings
        settings = get_settings()

        result: Dict[str, Any] = {}
        for key, value in config.items():
            cap_key = env_var_to_cap_key.get(key, key)
            if isinstance(value, dict) and '_from_setting' in value:
                setting_path = value['_from_setting']
                resolved = await settings.get(setting_path)
                value = str(resolved) if resolved is not None else None
            if value is not None:
                result[cap_key] = value
        return result

    async def get_display_config_overrides(self, config_id: str) -> Dict[str, Any]:
        """Get config overrides normalized for frontend display.

        Translates env var keys (OLLAMA_MODEL) to capability keys (model) using
        the provider's env_maps schema, and resolves _from_setting dict values
        to actual string values via the settings store.

        This handles both old configs (stored with env var keys + _from_setting refs)
        and new configs (stored with capability keys + literal values).
        """
        raw_overrides = self.get_config_overrides(config_id)
        config = self._service_configs.get(config_id)
        if not config:
            return {}

        # Build reverse mapping: env_var_name → capability_key for this template
        from src.services.provider_registry import get_provider_registry
        provider = get_provider_registry().get_provider(config.template_id)
        env_var_to_cap_key: Dict[str, str] = {}
        if provider:
            for em in provider.env_maps:
                if em.env_var:
                    env_var_to_cap_key[em.env_var] = em.key

        from src.config import get_settings
        settings = get_settings()

        result: Dict[str, Any] = {}
        for key, value in raw_overrides.items():
            # Skip metadata keys
            if key.startswith('_save_') or key.startswith('_from_'):
                continue

            # Translate env var key to capability key when possible
            cap_key = env_var_to_cap_key.get(key, key)

            # Resolve _from_setting dict references to actual values
            if isinstance(value, dict) and '_from_setting' in value:
                setting_path = value['_from_setting']
                resolved = await settings.get(setting_path)
                value = str(resolved) if resolved is not None else None

            if value is not None:
                result[cap_key] = value

        return result

    def create_service_config(self, data: ServiceConfigCreate) -> ServiceConfig:
        """Create a new service configuration."""
        self._ensure_loaded()

        if data.id in self._service_configs:
            raise ValueError(f"ServiceConfig already exists: {data.id}")

        now = datetime.now(timezone.utc)

        config = ServiceConfig(
            id=data.id,
            template_id=data.template_id,
            name=data.name,
            description=data.description,
            config=ConfigValues(values=data.config),
            deployment_labels=data.deployment_labels,
            created_at=now,
            updated_at=now,
        )

        # Store both resolved ServiceConfig and raw OmegaConf config
        self._service_configs[data.id] = config
        if data.config:
            # Store raw config to preserve interpolations for saving
            self._omegaconf_configs[data.id] = OmegaConf.create(data.config)

        self._save_service_configs()

        logger.info(f"Created service config: {data.id} (template: {data.template_id})")
        return config

    def update_service_config(self, config_id: str, data: ServiceConfigUpdate) -> ServiceConfig:
        """Update a service configuration."""
        self._ensure_loaded()

        config = self._service_configs.get(config_id)
        if not config:
            raise ValueError(f"ServiceConfig not found: {config_id}")

        if data.name is not None:
            config.name = data.name
        if data.description is not None:
            config.description = data.description
        if data.config is not None:
            config.config = ConfigValues(values=data.config)
            # Update raw OmegaConf config to preserve interpolations
            if data.config:
                self._omegaconf_configs[config_id] = OmegaConf.create(data.config)
            elif config_id in self._omegaconf_configs:
                # Config cleared, remove raw config too
                del self._omegaconf_configs[config_id]
        if data.deployment_labels is not None:
            config.deployment_labels = data.deployment_labels
        if data.route is not None:
            config.route = data.route
        config.updated_at = datetime.now(timezone.utc)

        self._save_service_configs()
        logger.info(f"Updated service config: {config_id}")
        return config

    def delete_service_config(self, config_id: str) -> bool:
        """Delete a service configuration."""
        self._ensure_loaded()

        if config_id not in self._service_configs:
            return False

        # Remove inline wiring on other instances that reference this config as a source
        for other in self._service_configs.values():
            to_remove = [cap for cap, src in other.wiring.items() if src == config_id]
            for cap in to_remove:
                del other.wiring[cap]

        del self._service_configs[config_id]

        # Also clean up raw OmegaConf config
        if config_id in self._omegaconf_configs:
            del self._omegaconf_configs[config_id]

        self._save_service_configs()

        logger.info(f"Deleted service config: {config_id}")
        return True

    # =========================================================================
    # Wiring Operations
    # =========================================================================

    def list_wiring(self) -> List[Wiring]:
        """List all wiring connections (reconstructed from inline instance data)."""
        self._ensure_loaded()
        wirings = []
        for instance in self._service_configs.values():
            for capability, source_id in instance.wiring.items():
                wirings.append(Wiring(
                    id=f"{instance.id}-{capability}",
                    source_config_id=source_id,
                    target_config_id=instance.id,
                    capability=capability,
                ))
        return wirings

    def get_wiring_for_instance(self, config_id: str) -> List[Wiring]:
        """Get wiring connections where this instance is the target."""
        self._ensure_loaded()
        instance = self._service_configs.get(config_id)
        if not instance:
            return []
        return [
            Wiring(
                id=f"{config_id}-{cap}",
                source_config_id=src,
                target_config_id=config_id,
                capability=cap,
            )
            for cap, src in instance.wiring.items()
        ]

    def get_provider_for_capability(
        self,
        consumer_config_id: str,
        capability: str
    ) -> Optional[ServiceConfig]:
        """
        Get the provider ServiceConfig for a capability.

        Looks up inline wiring on the consumer instance.
        Falls back to template-level config (id == template_id) if no instance match.
        """
        self._ensure_loaded()

        # Try the exact consumer ID first
        instance = self._service_configs.get(consumer_config_id)
        if instance and capability in instance.wiring:
            source_id = instance.wiring[capability]
            provider = self.get_service_config(source_id)
            if provider:
                logger.info(f"Resolved {capability} for {consumer_config_id} -> {source_id}")
                return provider

        # Instance exists but has no wiring for this capability — inherit from its template.
        # Deployed instances (e.g. "mycelia-backend-orion--leader-") are created without wiring
        # copied from the base template ("mycelia-backend"). Fall through to the template's wiring
        # so that deploy uses what the user wired on the template unless explicitly overridden.
        if instance and capability not in instance.wiring:
            template_config = self._service_configs.get(instance.template_id)
            if template_config and capability in template_config.wiring:
                source_id = template_config.wiring[capability]
                provider = self.get_service_config(source_id)
                if provider:
                    logger.info(
                        f"Resolved {capability} for {consumer_config_id} "
                        f"via template fallback {instance.template_id} -> {source_id}"
                    )
                    return provider

        # Fallback: consumer_config_id may be a template_id — find the instance
        if not instance:
            for config in self._service_configs.values():
                if config.template_id == consumer_config_id and capability in config.wiring:
                    source_id = config.wiring[capability]
                    provider = self.get_service_config(source_id)
                    if provider:
                        logger.info(
                            f"Resolved {capability} for {consumer_config_id} "
                            f"via template match {config.id} -> {source_id}"
                        )
                        return provider

        # Extra fallback: compose service IDs include a prefix (e.g. "mycelia-compose:mycelia-backend").
        # Strip the prefix and retry so that template-level wiring entries keyed by the short
        # service name (e.g. "mycelia-backend") are found even when the caller passes the full ID.
        if ':' in consumer_config_id:
            service_name = consumer_config_id.split(':', 1)[1]
            instance_by_name = self._service_configs.get(service_name)
            if instance_by_name and capability in instance_by_name.wiring:
                source_id = instance_by_name.wiring[capability]
                provider = self.get_service_config(source_id)
                if provider:
                    logger.info(
                        f"Resolved {capability} for {consumer_config_id} "
                        f"via service-name match {service_name} -> {source_id}"
                    )
                    return provider
            # Also try template_id matching with the short service name
            for config in self._service_configs.values():
                if config.template_id == service_name and capability in config.wiring:
                    source_id = config.wiring[capability]
                    provider = self.get_service_config(source_id)
                    if provider:
                        logger.info(
                            f"Resolved {capability} for {consumer_config_id} "
                            f"via service-name template match {config.id} -> {source_id}"
                        )
                        return provider

        return None

    def create_wiring(self, data: WiringCreate) -> Wiring:
        """Set capability wiring on the consumer instance."""
        self._ensure_loaded()

        instance = self._service_configs.get(data.target_config_id)
        if not instance:
            # Auto-create a minimal ServiceConfig for template-level wiring
            instance = ServiceConfig(
                id=data.target_config_id,
                template_id=data.target_config_id,
                name=data.target_config_id,
                wiring={},
            )
            self._service_configs[data.target_config_id] = instance

        instance.wiring[data.capability] = data.source_config_id
        instance.updated_at = datetime.now(timezone.utc)
        self._save_service_configs()

        logger.info(f"Wired {data.capability}: {data.source_config_id} -> {data.target_config_id}")
        return Wiring(
            id=f"{data.target_config_id}-{data.capability}",
            source_config_id=data.source_config_id,
            target_config_id=data.target_config_id,
            capability=data.capability,
            created_at=instance.updated_at,
        )

    def delete_wiring(self, target_config_id: str, capability: str) -> bool:
        """Remove capability wiring from the consumer instance."""
        self._ensure_loaded()

        instance = self._service_configs.get(target_config_id)
        if not instance or capability not in instance.wiring:
            return False

        del instance.wiring[capability]
        instance.updated_at = datetime.now(timezone.utc)
        self._save_service_configs()
        logger.info(f"Removed {capability} wiring from {target_config_id}")
        return True

    # =========================================================================
    # Resolution
    # =========================================================================

    def resolve_capability_for_instance(
        self,
        config_id: str,
        capability: str,
    ) -> Optional[ServiceConfig]:
        """Resolve which instance provides a capability for the given instance."""
        self._ensure_loaded()
        return self.get_provider_for_capability(config_id, capability)


# =============================================================================
# Singleton
# =============================================================================

_service_config_manager: Optional[ServiceConfigManager] = None


def get_service_config_manager() -> ServiceConfigManager:
    """Get the singleton ServiceConfigManager."""
    global _service_config_manager
    if _service_config_manager is None:
        _service_config_manager = ServiceConfigManager()
    return _service_config_manager
