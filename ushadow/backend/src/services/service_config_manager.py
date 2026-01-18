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
    ServiceOutputs,
    ServiceConfigStatus,
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

    def _parse_service_outputs(self, outputs_data: Dict[str, Any]) -> ServiceOutputs:
        """
        Parse ServiceOutputs from YAML data, handling both old and new formats.

        Old format: env_vars is Dict[str, str]
        New format: env_vars is Dict[str, EnvVarValue] with value/source/source_path

        Args:
            outputs_data: Raw outputs dict from YAML

        Returns:
            ServiceOutputs with properly typed env_vars
        """
        from src.models.service_config import EnvVarValue, EnvVarSource

        env_vars_raw = outputs_data.get('env_vars', {})
        env_vars_parsed = {}

        for key, value in env_vars_raw.items():
            if isinstance(value, dict) and 'value' in value:
                # New format: already has EnvVarValue structure
                env_vars_parsed[key] = EnvVarValue(
                    value=value['value'],
                    source=value.get('source', EnvVarSource.DEFAULT),
                    source_path=value.get('source_path')
                )
            elif isinstance(value, str):
                # Old format: just a string value
                # Assume it came from default/provider (we don't know the exact source)
                env_vars_parsed[key] = EnvVarValue(
                    value=value,
                    source=EnvVarSource.DEFAULT,
                    source_path=None
                )
            else:
                logger.warning(f"Unexpected env_vars format for {key}: {type(value)}")

        return ServiceOutputs(
            access_url=outputs_data.get('access_url'),
            env_vars=env_vars_parsed,
            capability_values=outputs_data.get('capability_values', {})
        )

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
                    deployment_target=instance_data.get('deployment_target'),
                    status=ServiceConfigStatus(instance_data.get('status', 'pending')),
                    outputs=self._parse_service_outputs(instance_data.get('outputs', {})),
                    created_at=instance_data.get('created_at'),
                    deployed_at=instance_data.get('deployed_at'),
                    updated_at=instance_data.get('updated_at'),
                    error=instance_data.get('error'),
                    # Deployment tracking
                    deployment_id=instance_data.get('deployment_id'),
                    container_id=instance_data.get('container_id'),
                    container_name=instance_data.get('container_name'),
                    # Integration-specific fields
                    integration_type=instance_data.get('integration_type'),
                    sync_enabled=instance_data.get('sync_enabled'),
                    sync_interval=instance_data.get('sync_interval'),
                    last_sync_at=instance_data.get('last_sync_at'),
                    last_sync_status=instance_data.get('last_sync_status'),
                    last_sync_items_count=instance_data.get('last_sync_items_count'),
                    last_sync_error=instance_data.get('last_sync_error'),
                    next_sync_at=instance_data.get('next_sync_at'),
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
            if instance.deployment_target:
                instance_data['deployment_target'] = instance.deployment_target
            if instance.status != ServiceConfigStatus.PENDING:
                # Handle both enum and string status values
                status_value = instance.status.value if isinstance(instance.status, ServiceConfigStatus) else instance.status
                instance_data['status'] = status_value
            if instance.outputs.access_url or instance.outputs.env_vars:
                instance_data['outputs'] = {}
                if instance.outputs.access_url:
                    instance_data['outputs']['access_url'] = instance.outputs.access_url
                if instance.outputs.env_vars:
                    # Serialize EnvVarValue objects to dicts
                    instance_data['outputs']['env_vars'] = {
                        k: v.model_dump() if hasattr(v, 'model_dump') else v
                        for k, v in instance.outputs.env_vars.items()
                    }
                if instance.outputs.capability_values:
                    instance_data['outputs']['capability_values'] = instance.outputs.capability_values
            if instance.created_at:
                instance_data['created_at'] = instance.created_at.isoformat() if isinstance(instance.created_at, datetime) else instance.created_at
            if instance.error:
                instance_data['error'] = instance.error

            # Deployment tracking fields
            if instance.deployment_id:
                instance_data['deployment_id'] = instance.deployment_id
            if instance.container_id:
                instance_data['container_id'] = instance.container_id
            if instance.container_name:
                instance_data['container_name'] = instance.container_name

            # Integration-specific fields
            if instance.integration_type is not None:
                instance_data['integration_type'] = instance.integration_type
            if instance.sync_enabled is not None:
                instance_data['sync_enabled'] = instance.sync_enabled
            if instance.sync_interval is not None:
                instance_data['sync_interval'] = instance.sync_interval
            if instance.last_sync_at:
                instance_data['last_sync_at'] = instance.last_sync_at.isoformat() if isinstance(instance.last_sync_at, datetime) else instance.last_sync_at
            if instance.last_sync_status:
                instance_data['last_sync_status'] = instance.last_sync_status
            if instance.last_sync_items_count is not None:
                instance_data['last_sync_items_count'] = instance.last_sync_items_count
            if instance.last_sync_error:
                instance_data['last_sync_error'] = instance.last_sync_error
            if instance.next_sync_at:
                instance_data['next_sync_at'] = instance.next_sync_at.isoformat() if isinstance(instance.next_sync_at, datetime) else instance.next_sync_at

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

    def list_service_configs(self) -> List[ServiceConfigSummary]:
        """List all instances."""
        self._ensure_loaded()

        # Get provider registry to look up 'provides' capability
        from src.services.provider_registry import get_provider_registry
        provider_registry = get_provider_registry()

        result = []
        for inst in self._service_configs.values():
            # Look up what capability this instance provides
            provides = None
            provider = provider_registry.get_provider(inst.template_id)
            if provider:
                provides = provider.capability

            result.append(ServiceConfigSummary(
                id=inst.id,
                template_id=inst.template_id,
                name=inst.name,
                status=inst.status,
                provides=provides,
                deployment_target=inst.deployment_target,
                access_url=inst.outputs.access_url,
            ))

        return result

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

    def create_instance(self, data: ServiceConfigCreate) -> ServiceConfig:
        """Create a new instance."""
        self._ensure_loaded()

        if data.id in self._service_configs:
            raise ValueError(f"ServiceConfig already exists: {data.id}")

        now = datetime.now(timezone.utc)

        # Determine initial status
        status = ServiceConfigStatus.PENDING
        if data.deployment_target == "cloud":
            status = ServiceConfigStatus.NOT_APPLICABLE

        instance = ServiceConfig(
            id=data.id,
            template_id=data.template_id,
            name=data.name,
            description=data.description,
            config=ConfigValues(values=data.config),
            deployment_target=data.deployment_target,
            status=status,
            created_at=now,
            updated_at=now,
        )

        # Store both resolved ServiceConfig and raw OmegaConf config
        self._service_configs[data.id] = instance
        if data.config:
            # Store raw config to preserve interpolations for saving
            self._omegaconf_configs[data.id] = OmegaConf.create(data.config)

        self._save_service_configs()

        logger.info(f"Created instance: {data.id} (template: {data.template_id})")
        return instance

    def update_instance(self, config_id: str, data: ServiceConfigUpdate) -> ServiceConfig:
        """Update an instance."""
        self._ensure_loaded()

        instance = self._service_configs.get(config_id)
        if not instance:
            raise ValueError(f"ServiceConfig not found: {config_id}")

        if data.name is not None:
            instance.name = data.name
        if data.description is not None:
            instance.description = data.description
        if data.config is not None:
            instance.config = ConfigValues(values=data.config)
            # Update raw OmegaConf config to preserve interpolations
            if data.config:
                self._omegaconf_configs[config_id] = OmegaConf.create(data.config)
            elif config_id in self._omegaconf_configs:
                # Config cleared, remove raw config too
                del self._omegaconf_configs[config_id]
        if data.deployment_target is not None:
            instance.deployment_target = data.deployment_target

        instance.updated_at = datetime.now(timezone.utc)

        self._save_service_configs()
        logger.info(f"Updated instance: {config_id}")
        return instance

    def delete_instance(self, config_id: str) -> bool:
        """Delete an instance."""
        self._ensure_loaded()

        if config_id not in self._service_configs:
            return False

        # Remove any wiring referencing this instance
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

        logger.info(f"Deleted instance: {config_id}")
        return True

    def update_instance_status(
        self,
        config_id: str,
        status: ServiceConfigStatus,
        access_url: Optional[str] = None,
        error: Optional[str] = None,
    ) -> Optional[ServiceConfig]:
        """Update instance status after deployment."""
        self._ensure_loaded()

        instance = self._service_configs.get(config_id)
        if not instance:
            return None

        instance.status = status
        instance.error = error
        instance.updated_at = datetime.now(timezone.utc)

        if access_url:
            instance.outputs.access_url = access_url
        if status == ServiceConfigStatus.RUNNING:
            instance.deployed_at = datetime.now(timezone.utc)

        self._save_service_configs()
        return instance

    async def deploy_instance(self, config_id: str) -> tuple[bool, str]:
        """Deploy/start an instance.

        Routes deployment based on deployment_target:
        - None: Local docker (ServiceOrchestrator)
        - "cloud": Cloud provider (marks as N/A)
        - hostname: Remote unode (DeploymentManager)
        """
        self._ensure_loaded()

        instance = self._service_configs.get(config_id)
        if not instance:
            return False, f"ServiceConfig not found: {config_id}"

        # Get template to determine deployment type
        from src.services.compose_registry import get_compose_registry
        compose_registry = get_compose_registry()

        # Check if this is a compose service
        compose_service = compose_registry.get_service(instance.template_id)

        if compose_service:
            # Check deployment target
            if instance.deployment_target and instance.deployment_target != "cloud":
                # Remote unode deployment - use DeploymentManager
                from src.services.deployment_manager import get_deployment_manager
                deployment_manager = get_deployment_manager()

                # Update status to deploying
                instance.status = ServiceConfigStatus.DEPLOYING
                self._save_service_configs()

                try:
                    # Deploy via deployment manager (creates Deployment record)
                    deployment = await deployment_manager.deploy_service(
                        service_id=compose_service.service_id,
                        unode_hostname=instance.deployment_target,
                        config_id=config_id
                    )

                    # Store deployment_id in instance
                    instance.deployment_id = deployment.id
                    instance.container_id = deployment.container_id
                    instance.container_name = deployment.container_name

                    # Update instance status based on deployment
                    if deployment.status == "running":
                        self.update_instance_status(
                            config_id,
                            ServiceConfigStatus.RUNNING,
                            access_url=deployment.access_url,
                        )
                        return True, f"Service deployed to {instance.deployment_target}"
                    else:
                        self.update_instance_status(
                            config_id,
                            ServiceConfigStatus.DEPLOYING,
                        )
                        return True, f"Service deploying to {instance.deployment_target}"

                except Exception as e:
                    logger.exception(f"Failed to deploy instance {config_id} to unode")
                    self.update_instance_status(
                        config_id,
                        ServiceConfigStatus.ERROR,
                        error=str(e),
                    )
                    return False, str(e)
            else:
                # Local docker deployment - use ServiceOrchestrator
                from src.services.service_orchestrator import get_service_orchestrator
                from src.services.docker_manager import get_docker_manager
                from src.config.omegaconf_settings import get_settings_store

                orchestrator = get_service_orchestrator()
                docker_mgr = get_docker_manager()
                settings_store = get_settings_store()

                # Update status to deploying
                instance.status = ServiceConfigStatus.DEPLOYING
                self._save_service_configs()

                # Use service_name (not template_id) for orchestrator calls
                service_name = compose_service.service_name

                # Check for port conflicts before deploying
                conflicts = docker_mgr.check_port_conflicts(service_name)
                if conflicts:
                    logger.info(f"Found {len(conflicts)} port conflicts for {service_name}, remapping to available ports")

                    # Remap ports to suggested alternatives
                    for conflict in conflicts:
                        if conflict.env_var and conflict.suggested_port:
                            # Save port override in service preferences
                            # This matches the pattern from /api/services/{name}/port-override
                            pref_key = f"services.{service_name}.ports.{conflict.env_var}"
                            await settings_store.set(pref_key, conflict.suggested_port)
                            logger.info(f"Remapped {conflict.env_var}: {conflict.port} -> {conflict.suggested_port}")

                try:
                    result = await orchestrator.start_service(service_name, config_id=config_id)
                    if result.success:
                        # Get the service status to find access URL
                        status_info = await orchestrator.get_service_status(service_name)
                        access_url = None
                        if status_info and status_info.get("status") == "running":
                            # Try to get the access URL from docker details
                            details = await orchestrator.get_docker_details(service_name)
                            if details and details.ports:
                                # ports is Dict[str, str] where key is container port, value is host port
                                # e.g., {"8080/tcp": "32768"}
                                for container_port, host_port in details.ports.items():
                                    if host_port:
                                        access_url = f"http://localhost:{host_port}"
                                        break

                        self.update_instance_status(
                            config_id,
                            ServiceConfigStatus.RUNNING,
                            access_url=access_url,
                        )
                        return True, f"Service {service_name} started"
                    else:
                        self.update_instance_status(
                            config_id,
                            ServiceConfigStatus.ERROR,
                            error=result.message,
                        )
                        return False, result.message
                except Exception as e:
                    logger.exception(f"Failed to deploy instance {config_id}")
                    self.update_instance_status(
                        config_id,
                        ServiceConfigStatus.ERROR,
                        error=str(e),
                    )
                    return False, str(e)
        else:
            # Cloud provider - mark as N/A (always available)
            self.update_instance_status(config_id, ServiceConfigStatus.NOT_APPLICABLE)
            return True, "Cloud provider instance activated"

    async def undeploy_instance(self, config_id: str) -> tuple[bool, str]:
        """Stop/undeploy an instance.

        For compose services: stops the docker container
        For cloud providers: marks as stopped
        """
        self._ensure_loaded()

        instance = self._service_configs.get(config_id)
        if not instance:
            return False, f"ServiceConfig not found: {config_id}"

        # Get template to determine deployment type
        from src.services.compose_registry import get_compose_registry
        compose_registry = get_compose_registry()

        # Check if this is a compose service
        compose_service = compose_registry.get_service(instance.template_id)

        if compose_service:
            # This is a compose service - use ServiceOrchestrator
            from src.services.service_orchestrator import get_service_orchestrator
            orchestrator = get_service_orchestrator()

            # Use service_name (not template_id) for orchestrator calls
            service_name = compose_service.service_name

            try:
                result = orchestrator.stop_service(service_name)
                if result.success:
                    self.update_instance_status(config_id, ServiceConfigStatus.STOPPED)
                    return True, f"Service {service_name} stopped"
                else:
                    return False, result.message
            except Exception as e:
                logger.exception(f"Failed to undeploy instance {config_id}")
                return False, str(e)
        else:
            # Cloud provider - just mark as stopped
            self.update_instance_status(config_id, ServiceConfigStatus.STOPPED)
            return True, "Cloud provider instance deactivated"

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
