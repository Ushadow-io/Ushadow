"""
Instance Manager - Manages service/provider instances and wiring.

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

from src.models.instance import (
    Instance,
    InstanceConfig,
    InstanceCreate,
    InstanceOutputs,
    InstanceStatus,
    InstanceSummary,
    InstanceUpdate,
    Template,
    TemplateSource,
    Wiring,
    WiringCreate,
)

logger = logging.getLogger(__name__)


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
        if candidate.exists() and (candidate / "instances.yaml").exists():
            return candidate
        # Also check parent (for repo root)
        candidate = parent.parent / "config"
        if candidate.exists():
            return candidate

    # Fallback
    return Path(__file__).resolve().parents[4] / "config"


class InstanceManager:
    """
    Manages instances and wiring.

    Instances are stored in config/instances.yaml.
    Wiring is stored in config/wiring.yaml.
    """

    def __init__(self, config_dir: Optional[Path] = None):
        self.config_dir = config_dir or _get_config_dir()
        self.instances_path = self.config_dir / "instances.yaml"
        self.wiring_path = self.config_dir / "wiring.yaml"

        self._instances: Dict[str, Instance] = {}
        self._instance_configs: Dict[str, DictConfig] = {}  # Raw OmegaConf configs (preserves interpolations)
        self._wiring: List[Wiring] = {}
        self._defaults: Dict[str, str] = {}  # capability -> default instance
        self._loaded = False

    def _ensure_loaded(self) -> None:
        """Ensure config is loaded."""
        if not self._loaded:
            self._load()

    def _load(self) -> None:
        """Load instances and wiring from config files."""
        self._load_instances()
        self._load_wiring()
        self._loaded = True

    def _load_instances(self) -> None:
        """Load instances from instances.yaml using OmegaConf to preserve interpolations."""
        self._instances = {}
        self._instance_configs = {}

        if not self.instances_path.exists():
            logger.debug(f"No instances file at {self.instances_path}")
            return

        try:
            # Load with OmegaConf to preserve interpolations
            raw_cfg = OmegaConf.load(self.instances_path)
            instances_data = raw_cfg.get('instances', {}) or {}

            for instance_id, instance_data in instances_data.items():
                if instance_data is None:
                    continue

                # Store raw OmegaConf config to check for interpolations later
                config_data = instance_data.get('config', {})
                if config_data:
                    self._instance_configs[instance_id] = OmegaConf.create(config_data)

                # Resolve values for the Instance object (resolves interpolations)
                resolved_config = OmegaConf.to_container(config_data, resolve=True) if config_data else {}

                instance = Instance(
                    id=instance_id,
                    template_id=instance_data.get('template_id', ''),
                    name=instance_data.get('name', instance_id),
                    description=instance_data.get('description'),
                    config=InstanceConfig(values=resolved_config),
                    deployment_target=instance_data.get('deployment_target'),
                    status=InstanceStatus(instance_data.get('status', 'pending')),
                    outputs=InstanceOutputs(
                        access_url=instance_data.get('outputs', {}).get('access_url') if instance_data.get('outputs') else None,
                        env_vars=instance_data.get('outputs', {}).get('env_vars', {}) if instance_data.get('outputs') else {},
                        capability_values=instance_data.get('outputs', {}).get('capability_values', {}) if instance_data.get('outputs') else {},
                    ),
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
                self._instances[instance_id] = instance

            logger.info(f"Loaded {len(self._instances)} instances")

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
                    source_instance_id=wire_data['source_instance_id'],
                    source_capability=wire_data['source_capability'],
                    target_instance_id=wire_data['target_instance_id'],
                    target_capability=wire_data['target_capability'],
                    created_at=wire_data.get('created_at'),
                )
                self._wiring.append(wire)

            logger.info(f"Loaded {len(self._wiring)} wiring connections, {len(self._defaults)} defaults")

        except Exception as e:
            logger.error(f"Failed to load wiring: {e}")

    def _save_instances(self) -> None:
        """Save instances to instances.yaml."""
        data = {'instances': {}}

        for instance_id, instance in self._instances.items():
            instance_data = {
                'template_id': instance.template_id,
                'name': instance.name,
            }
            if instance.description:
                instance_data['description'] = instance.description
            if instance.config.values:
                instance_data['config'] = instance.config.values
            if instance.deployment_target:
                instance_data['deployment_target'] = instance.deployment_target
            if instance.status != InstanceStatus.PENDING:
                # Handle both enum and string status values
                status_value = instance.status.value if isinstance(instance.status, InstanceStatus) else instance.status
                instance_data['status'] = status_value
            if instance.outputs.access_url or instance.outputs.env_vars:
                instance_data['outputs'] = {}
                if instance.outputs.access_url:
                    instance_data['outputs']['access_url'] = instance.outputs.access_url
                if instance.outputs.env_vars:
                    instance_data['outputs']['env_vars'] = instance.outputs.env_vars
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

            data['instances'][instance_id] = instance_data

        try:
            with open(self.instances_path, 'w') as f:
                yaml.dump(data, f, default_flow_style=False, sort_keys=False)
            logger.debug(f"Saved {len(self._instances)} instances")
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
                'source_instance_id': wire.source_instance_id,
                'source_capability': wire.source_capability,
                'target_instance_id': wire.target_instance_id,
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
    # Instance Operations
    # =========================================================================

    def list_instances(self) -> List[InstanceSummary]:
        """List all instances."""
        self._ensure_loaded()

        # Get provider registry to look up 'provides' capability
        from src.services.provider_registry import get_provider_registry
        provider_registry = get_provider_registry()

        result = []
        for inst in self._instances.values():
            # Look up what capability this instance provides
            provides = None
            provider = provider_registry.get_provider(inst.template_id)
            if provider:
                provides = provider.capability

            result.append(InstanceSummary(
                id=inst.id,
                template_id=inst.template_id,
                name=inst.name,
                status=inst.status,
                provides=provides,
                deployment_target=inst.deployment_target,
                access_url=inst.outputs.access_url,
            ))

        return result

    def get_instance(self, instance_id: str) -> Optional[Instance]:
        """Get an instance by ID."""
        self._ensure_loaded()
        return self._instances.get(instance_id)

    def get_config_overrides(self, instance_id: str) -> Dict[str, Any]:
        """Get only the config values that are overrides (not interpolations).

        Uses OmegaConf.is_interpolation to distinguish between:
        - Overrides: Direct values like "gpt-4o"
        - Interpolations: Values like "${api_keys.openai_api_key}" that inherit from settings

        Returns only the override values for display in the UI.
        """
        self._ensure_loaded()

        raw_config = self._instance_configs.get(instance_id)
        if not raw_config:
            return {}

        overrides = {}
        for key in raw_config:
            # Check if this key is an interpolation
            if not OmegaConf.is_interpolation(raw_config, key):
                # It's a direct value (override), include it
                try:
                    overrides[key] = OmegaConf.select(raw_config, key)
                except Exception:
                    # If we can't resolve it, skip
                    pass

        return overrides

    def create_instance(self, data: InstanceCreate) -> Instance:
        """Create a new instance."""
        self._ensure_loaded()

        if data.id in self._instances:
            raise ValueError(f"Instance already exists: {data.id}")

        now = datetime.now(timezone.utc)

        # Determine initial status
        status = InstanceStatus.PENDING
        if data.deployment_target == "cloud":
            status = InstanceStatus.NOT_APPLICABLE

        instance = Instance(
            id=data.id,
            template_id=data.template_id,
            name=data.name,
            description=data.description,
            config=InstanceConfig(values=data.config),
            deployment_target=data.deployment_target,
            status=status,
            created_at=now,
            updated_at=now,
        )

        self._instances[data.id] = instance

        # Also add to _instance_configs for OmegaConf-based override detection
        if data.config:
            self._instance_configs[data.id] = OmegaConf.create(data.config)

        self._save_instances()

        logger.info(f"Created instance: {data.id} (template: {data.template_id})")
        return instance

    def update_instance(self, instance_id: str, data: InstanceUpdate) -> Instance:
        """Update an instance."""
        self._ensure_loaded()

        instance = self._instances.get(instance_id)
        if not instance:
            raise ValueError(f"Instance not found: {instance_id}")

        if data.name is not None:
            instance.name = data.name
        if data.description is not None:
            instance.description = data.description
        if data.config is not None:
            instance.config = InstanceConfig(values=data.config)
            # Also update _instance_configs for OmegaConf-based override detection
            if data.config:
                self._instance_configs[instance_id] = OmegaConf.create(data.config)
            elif instance_id in self._instance_configs:
                del self._instance_configs[instance_id]
        if data.deployment_target is not None:
            instance.deployment_target = data.deployment_target

        instance.updated_at = datetime.now(timezone.utc)

        self._save_instances()
        logger.info(f"Updated instance: {instance_id}")
        return instance

    def delete_instance(self, instance_id: str) -> bool:
        """Delete an instance."""
        self._ensure_loaded()

        if instance_id not in self._instances:
            return False

        # Remove any wiring referencing this instance
        self._wiring = [
            w for w in self._wiring
            if w.source_instance_id != instance_id and w.target_instance_id != instance_id
        ]

        del self._instances[instance_id]

        # Also clean up _instance_configs
        if instance_id in self._instance_configs:
            del self._instance_configs[instance_id]

        self._save_instances()
        self._save_wiring()

        logger.info(f"Deleted instance: {instance_id}")
        return True

    def update_instance_status(
        self,
        instance_id: str,
        status: InstanceStatus,
        access_url: Optional[str] = None,
        error: Optional[str] = None,
    ) -> Optional[Instance]:
        """Update instance status after deployment."""
        self._ensure_loaded()

        instance = self._instances.get(instance_id)
        if not instance:
            return None

        instance.status = status
        instance.error = error
        instance.updated_at = datetime.now(timezone.utc)

        if access_url:
            instance.outputs.access_url = access_url
        if status == InstanceStatus.RUNNING:
            instance.deployed_at = datetime.now(timezone.utc)

        self._save_instances()
        return instance

    async def deploy_instance(self, instance_id: str) -> tuple[bool, str]:
        """Deploy/start an instance.

        Routes deployment based on deployment_target:
        - None: Local docker (ServiceOrchestrator)
        - "cloud": Cloud provider (marks as N/A)
        - hostname: Remote unode (DeploymentManager)
        """
        self._ensure_loaded()

        instance = self._instances.get(instance_id)
        if not instance:
            return False, f"Instance not found: {instance_id}"

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
                instance.status = InstanceStatus.DEPLOYING
                self._save_instances()

                try:
                    # Deploy via deployment manager (creates Deployment record)
                    deployment = await deployment_manager.deploy_service(
                        service_id=compose_service.service_id,
                        unode_hostname=instance.deployment_target,
                        instance_id=instance_id
                    )

                    # Store deployment_id in instance
                    instance.deployment_id = deployment.id
                    instance.container_id = deployment.container_id
                    instance.container_name = deployment.container_name

                    # Update instance status based on deployment
                    if deployment.status == "running":
                        self.update_instance_status(
                            instance_id,
                            InstanceStatus.RUNNING,
                            access_url=deployment.access_url,
                        )
                        return True, f"Service deployed to {instance.deployment_target}"
                    else:
                        self.update_instance_status(
                            instance_id,
                            InstanceStatus.DEPLOYING,
                        )
                        return True, f"Service deploying to {instance.deployment_target}"

                except Exception as e:
                    logger.exception(f"Failed to deploy instance {instance_id} to unode")
                    self.update_instance_status(
                        instance_id,
                        InstanceStatus.ERROR,
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
                instance.status = InstanceStatus.DEPLOYING
                self._save_instances()

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
                    result = await orchestrator.start_service(service_name, instance_id=instance_id)
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
                            instance_id,
                            InstanceStatus.RUNNING,
                            access_url=access_url,
                        )
                        return True, f"Service {service_name} started"
                    else:
                        self.update_instance_status(
                            instance_id,
                            InstanceStatus.ERROR,
                            error=result.message,
                        )
                        return False, result.message
                except Exception as e:
                    logger.exception(f"Failed to deploy instance {instance_id}")
                    self.update_instance_status(
                        instance_id,
                        InstanceStatus.ERROR,
                        error=str(e),
                    )
                    return False, str(e)
        else:
            # Cloud provider - mark as N/A (always available)
            self.update_instance_status(instance_id, InstanceStatus.NOT_APPLICABLE)
            return True, "Cloud provider instance activated"

    async def undeploy_instance(self, instance_id: str) -> tuple[bool, str]:
        """Stop/undeploy an instance.

        For compose services: stops the docker container
        For cloud providers: marks as stopped
        """
        self._ensure_loaded()

        instance = self._instances.get(instance_id)
        if not instance:
            return False, f"Instance not found: {instance_id}"

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
                    self.update_instance_status(instance_id, InstanceStatus.STOPPED)
                    return True, f"Service {service_name} stopped"
                else:
                    return False, result.message
            except Exception as e:
                logger.exception(f"Failed to undeploy instance {instance_id}")
                return False, str(e)
        else:
            # Cloud provider - just mark as stopped
            self.update_instance_status(instance_id, InstanceStatus.STOPPED)
            return True, "Cloud provider instance deactivated"

    # =========================================================================
    # Wiring Operations
    # =========================================================================

    def list_wiring(self) -> List[Wiring]:
        """List all wiring connections."""
        self._ensure_loaded()
        return list(self._wiring)

    def get_wiring_for_instance(self, instance_id: str) -> List[Wiring]:
        """Get wiring connections where this instance is the target."""
        self._ensure_loaded()
        return [w for w in self._wiring if w.target_instance_id == instance_id]

    def get_provider_for_capability(
        self,
        consumer_instance_id: str,
        capability: str
    ) -> Optional[Instance]:
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
            if (wiring.target_instance_id == consumer_instance_id and
                wiring.target_capability == capability):
                provider_instance = self.get_instance(wiring.source_instance_id)
                if provider_instance:
                    logger.info(
                        f"Resolved {capability} for {consumer_instance_id} "
                        f"via wiring -> {wiring.source_instance_id}"
                    )
                    return provider_instance

        # 2. Check defaults
        default_instance_id = self._defaults.get(capability)
        if default_instance_id:
            provider_instance = self.get_instance(default_instance_id)
            if provider_instance:
                logger.info(
                    f"Resolved {capability} for {consumer_instance_id} "
                    f"via default -> {default_instance_id}"
                )
                return provider_instance

        # 3. No instance-level resolution found
        return None

    def create_wiring(self, data: WiringCreate) -> Wiring:
        """Create a wiring connection.
        
        For the singleton model, instance IDs can be either:
        - Actual instance IDs from instances.yaml
        - Template/provider IDs (for configured providers/services)
        """
        self._ensure_loaded()

        # Check for duplicate - only one provider per consumer+capability
        for wire in self._wiring:
            if (wire.target_instance_id == data.target_instance_id and
                wire.target_capability == data.target_capability):
                # Update existing wiring instead of error
                wire.source_instance_id = data.source_instance_id
                wire.source_capability = data.source_capability
                self._save_wiring()
                logger.info(
                    f"Updated wiring: {data.source_instance_id}.{data.source_capability} -> "
                    f"{data.target_instance_id}.{data.target_capability}"
                )
                return wire

        wire = Wiring(
            id=str(uuid.uuid4())[:8],
            source_instance_id=data.source_instance_id,
            source_capability=data.source_capability,
            target_instance_id=data.target_instance_id,
            target_capability=data.target_capability,
            created_at=datetime.now(timezone.utc),
        )

        self._wiring.append(wire)
        self._save_wiring()

        logger.info(
            f"Created wiring: {data.source_instance_id}.{data.source_capability} -> "
            f"{data.target_instance_id}.{data.target_capability}"
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

    def set_default(self, capability: str, instance_id: str) -> None:
        """Set default instance/provider for a capability.
        
        For the singleton model, instance_id can be either:
        - An actual instance ID from instances.yaml
        - A template/provider ID (for configured providers acting as singletons)
        """
        self._ensure_loaded()

        # Store the mapping - we accept both instance IDs and template/provider IDs
        # The resolution happens at runtime when the capability is needed
        if instance_id:
            self._defaults[capability] = instance_id
        elif capability in self._defaults:
            del self._defaults[capability]

        self._save_wiring()
        logger.info(f"Set default for {capability}: {instance_id}")

    # =========================================================================
    # Resolution
    # =========================================================================

    def resolve_capability_for_instance(
        self,
        instance_id: str,
        capability: str,
    ) -> Optional[Instance]:
        """
        Resolve which instance provides a capability for the given instance.

        Checks:
        1. Explicit wiring for this instance + capability
        2. Default instance for this capability
        """
        self._ensure_loaded()

        # Check explicit wiring
        for wire in self._wiring:
            if wire.target_instance_id == instance_id and wire.target_capability == capability:
                return self._instances.get(wire.source_instance_id)

        # Check defaults
        default_instance_id = self._defaults.get(capability)
        if default_instance_id:
            return self._instances.get(default_instance_id)

        return None


# =============================================================================
# Singleton
# =============================================================================

_instance_manager: Optional[InstanceManager] = None


def get_instance_manager() -> InstanceManager:
    """Get the singleton InstanceManager."""
    global _instance_manager
    if _instance_manager is None:
        _instance_manager = InstanceManager()
    return _instance_manager
