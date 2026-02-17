"""
ServiceConfig Manager - Manages service/provider instances and wiring.

Handles:
- Loading instances and wiring from config files
- CRUD operations for instances
- Wiring connections between instances
- Resolving env vars from wiring
"""

import logging
import uuid
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

    # Default: look for config dir relative to this file
    current = Path(__file__).resolve()
    for parent in current.parents:
        candidate = parent / "config"
        if candidate.exists() and (candidate / "service_configs.yaml").exists():
            return candidate
        # Also check parent (for repo root)
        candidate = parent.parent / "config"
        if candidate.exists():
            return candidate

    # Fallback
    return Path(__file__).resolve().parents[4] / "config"


class ServiceConfigManager:
    """
    Manages instances and wiring.

    ServiceConfigs are stored in config/service_configs.yaml.
    Wiring is stored in config/wiring.yaml.
    """

    def __init__(self, config_dir: Optional[Path] = None):
        self.config_dir = config_dir or _get_config_dir()
        self.instances_path = self.config_dir / "service_configs.yaml"
        self.wiring_path = self.config_dir / "wiring.yaml"

        # Dual storage: ServiceConfig objects for runtime, DictConfig for persistence
        self._service_configs: Dict[str, ServiceConfig] = {}  # Resolved configs (for runtime use)
        self._omegaconf_configs: Dict[str, DictConfig] = {}  # Raw configs with interpolations (for saving)
        self._wiring: List[Wiring] = []
        self._defaults: Dict[str, str] = {}  # capability -> default instance
        self._loaded = False

    def _ensure_loaded(self) -> None:
        """Ensure config is loaded."""
        if not self._loaded:
            self._load()

    def _load(self) -> None:
        """Load instances and wiring from config files."""
        self._load_service_configs()
        self._load_wiring()
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

    def _load_wiring(self) -> None:
        """Load wiring from wiring.yaml."""
        self._wiring = []
        self._defaults = {}

        if not self.wiring_path.exists():
            logger.debug(f"No wiring file at {self.wiring_path}")
            return

        try:
            with open(self.wiring_path, 'r') as f:
                data = yaml.safe_load(f) or {}

            # Load defaults
            self._defaults = data.get('defaults', {}) or {}

            # Load wiring connections
            for wire_data in data.get('wiring', []) or []:
                wire = Wiring(
                    id=wire_data.get('id', str(uuid.uuid4())[:8]),
                    source_config_id=wire_data['source_config_id'],
                    source_capability=wire_data['source_capability'],
                    target_config_id=wire_data['target_config_id'],
                    target_capability=wire_data['target_capability'],
                    created_at=wire_data.get('created_at'),
                )
                self._wiring.append(wire)

            logger.info(f"Loaded {len(self._wiring)} wiring connections, {len(self._defaults)} defaults")

        except Exception as e:
            logger.error(f"Failed to load wiring: {e}")

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

    def _save_wiring(self) -> None:
        """Save wiring to wiring.yaml."""
        data = {
            'defaults': self._defaults or {},
            'wiring': []
        }

        for wire in self._wiring:
            wire_data = {
                'id': wire.id,
                'source_config_id': wire.source_config_id,
                'source_capability': wire.source_capability,
                'target_config_id': wire.target_config_id,
                'target_capability': wire.target_capability,
            }
            data['wiring'].append(wire_data)

        try:
            with open(self.wiring_path, 'w') as f:
                yaml.dump(data, f, default_flow_style=False, sort_keys=False)
            logger.debug(f"Saved {len(self._wiring)} wiring connections")
        except Exception as e:
            logger.error(f"Failed to save wiring: {e}")
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
            ))
            config_template_ids.add(config.template_id)

        # Get all templates and add placeholders for installed ones without configs
        from src.services.template_service import list_templates

        try:
            templates = await list_templates()

            for template in templates:
                # Skip if not installed
                if not template.installed:
                    continue

                # Skip if already has a config
                if template.id in config_template_ids:
                    continue

                # Create placeholder entry
                result.append(ServiceConfigSummary(
                    id=template.id,
                    template_id=template.id,
                    name=template.name,
                    provides=template.provides,
                    description=template.description,
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
            deployment_target=data.deployment_target,
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
        if data.deployment_target is not None:
            config.deployment_target = data.deployment_target

        config.updated_at = datetime.now(timezone.utc)

        self._save_service_configs()
        logger.info(f"Updated service config: {config_id}")
        return config

    def delete_service_config(self, config_id: str) -> bool:
        """Delete a service configuration."""
        self._ensure_loaded()

        if config_id not in self._service_configs:
            return False

        # Remove any wiring referencing this config
        self._wiring = [
            w for w in self._wiring
            if w.source_config_id != config_id and w.target_config_id != config_id
        ]

        del self._service_configs[config_id]

        # Also clean up raw OmegaConf config
        if config_id in self._omegaconf_configs:
            del self._omegaconf_configs[config_id]

        self._save_service_configs()
        self._save_wiring()

        logger.info(f"Deleted service config: {config_id}")
        return True

    # =========================================================================
    # Wiring Operations
    # =========================================================================

    def list_wiring(self) -> List[Wiring]:
        """List all wiring connections."""
        self._ensure_loaded()
        return list(self._wiring)

    def get_wiring_for_instance(self, config_id: str) -> List[Wiring]:
        """Get wiring connections where this instance is the target."""
        self._ensure_loaded()
        return [w for w in self._wiring if w.target_config_id == config_id]

    def get_provider_for_capability(
        self,
        consumer_config_id: str,
        capability: str
    ) -> Optional[ServiceConfig]:
        """
        Get the provider instance to use for a capability.

        Resolution order:
        1. Explicit wiring for this consumer + capability
        2. Default instance for this capability
        3. None (fall back to CapabilityResolver's legacy logic)
        """
        self._ensure_loaded()

        # 1. Check explicit wiring for this consumer
        for wiring in self._wiring:
            if (wiring.target_config_id == consumer_config_id and
                wiring.target_capability == capability):
                provider_config = self.get_service_config(wiring.source_config_id)
                if provider_config:
                    logger.info(
                        f"Resolved {capability} for {consumer_config_id} "
                        f"via wiring -> {wiring.source_config_id}"
                    )
                    return provider_config

        # 2. Check defaults
        default_config_id = self._defaults.get(capability)
        if default_config_id:
            provider_config = self.get_service_config(default_config_id)
            if provider_config:
                logger.info(
                    f"Resolved {capability} for {consumer_config_id} "
                    f"via default -> {default_config_id}"
                )
                return provider_config

        # 3. No instance-level resolution found
        return None

    def create_wiring(self, data: WiringCreate) -> Wiring:
        """Create a wiring connection.
        
        For the singleton model, instance IDs can be either:
        - Actual instance IDs from service_configs.yaml
        - Template/provider IDs (for configured providers/services)
        """
        self._ensure_loaded()

        # Check for duplicate - only one provider per consumer+capability
        for wire in self._wiring:
            if (wire.target_config_id == data.target_config_id and
                wire.target_capability == data.target_capability):
                # Update existing wiring instead of error
                wire.source_config_id = data.source_config_id
                wire.source_capability = data.source_capability
                self._save_wiring()
                logger.info(
                    f"Updated wiring: {data.source_config_id}.{data.source_capability} -> "
                    f"{data.target_config_id}.{data.target_capability}"
                )
                return wire

        wire = Wiring(
            id=str(uuid.uuid4())[:8],
            source_config_id=data.source_config_id,
            source_capability=data.source_capability,
            target_config_id=data.target_config_id,
            target_capability=data.target_capability,
            created_at=datetime.now(timezone.utc),
        )

        self._wiring.append(wire)
        self._save_wiring()

        logger.info(
            f"Created wiring: {data.source_config_id}.{data.source_capability} -> "
            f"{data.target_config_id}.{data.target_capability}"
        )
        return wire

    def delete_wiring(self, wiring_id: str) -> bool:
        """Delete a wiring connection."""
        self._ensure_loaded()

        for i, wire in enumerate(self._wiring):
            if wire.id == wiring_id:
                del self._wiring[i]
                self._save_wiring()
                logger.info(f"Deleted wiring: {wiring_id}")
                return True

        return False

    def get_defaults(self) -> Dict[str, str]:
        """Get default capability -> instance mappings."""
        self._ensure_loaded()
        return dict(self._defaults)

    def set_default(self, capability: str, config_id: str) -> None:
        """Set default instance/provider for a capability.
        
        For the singleton model, config_id can be either:
        - An actual instance ID from service_configs.yaml
        - A template/provider ID (for configured providers acting as singletons)
        """
        self._ensure_loaded()

        # Store the mapping - we accept both instance IDs and template/provider IDs
        # The resolution happens at runtime when the capability is needed
        if config_id:
            self._defaults[capability] = config_id
        elif capability in self._defaults:
            del self._defaults[capability]

        self._save_wiring()
        logger.info(f"Set default for {capability}: {config_id}")

    # =========================================================================
    # Resolution
    # =========================================================================

    def resolve_capability_for_instance(
        self,
        config_id: str,
        capability: str,
    ) -> Optional[ServiceConfig]:
        """
        Resolve which instance provides a capability for the given instance.

        Checks:
        1. Explicit wiring for this instance + capability
        2. Default instance for this capability
        """
        self._ensure_loaded()

        # Check explicit wiring
        for wire in self._wiring:
            if wire.target_config_id == config_id and wire.target_capability == capability:
                return self._service_configs.get(wire.source_config_id)

        # Check defaults
        default_config_id = self._defaults.get(capability)
        if default_config_id:
            return self._service_configs.get(default_config_id)

        return None


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
