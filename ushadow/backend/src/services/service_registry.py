"""
Service Registry - Loads service definitions from YAML configuration files.

This module provides a registry for services using the capability-based composition pattern:
- Services declare what capabilities they USE (llm, transcription, memory)
- CapabilityResolver wires provider credentials at deploy time
- Services are loaded from individual files in config/services/*.yaml
"""

import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from pydantic import BaseModel

import yaml

logger = logging.getLogger(__name__)

# Config file paths - check container mount first, then fallback to local
def _get_config_dir() -> Path:
    """Resolve config directory, handling different execution contexts."""
    # Docker container mount
    if Path("/config").exists():
        return Path("/config")
    # Running from project root
    if Path("config").exists():
        return Path("config")
    # Running from ushadow/backend
    if Path("../../config").exists():
        return Path("../../config").resolve()
    # Fallback
    return Path("config")

CONFIG_DIR = _get_config_dir()
CAPABILITIES_FILE = CONFIG_DIR / "capabilities.yaml"
SERVICES_DIR = CONFIG_DIR / "services"


class ConfigField(BaseModel):
    """Configuration field schema definition."""
    key: str
    type: str = "string"  # secret, string, url, boolean, number
    label: Optional[str] = None
    description: Optional[str] = None
    required: bool = False
    default: Optional[Any] = None
    link: Optional[str] = None  # URL for getting API keys etc
    env_var: Optional[str] = None  # Environment variable mapping
    settings_path: Optional[str] = None  # Path in settings config
    options: Optional[List[str]] = None  # For select fields
    min: Optional[float] = None
    max: Optional[float] = None
    min_length: Optional[int] = None
    required_if: Optional[str] = None  # Conditional requirement


@dataclass
class CapabilityUse:
    """A capability usage declaration."""
    capability: str
    required: bool = True
    purpose: Optional[str] = None
    env_mapping: Dict[str, str] = field(default_factory=dict)


@dataclass
class DockerConfig:
    """Docker deployment configuration."""
    image: str
    compose_file: Optional[str] = None
    service_name: Optional[str] = None
    ports: List[Dict[str, Any]] = field(default_factory=list)
    health: Optional[Dict[str, Any]] = None
    volumes: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class ServiceConfig:
    """
    Service configuration from config/services/*.yaml.

    This is the new capability-based format where services declare
    what capabilities they USE rather than extending templates.
    """
    service_id: str
    name: str
    description: Optional[str] = None
    version: Optional[str] = None

    # Capabilities this service uses
    uses: List[CapabilityUse] = field(default_factory=list)

    # Docker deployment
    docker: Optional[DockerConfig] = None

    # Infrastructure dependencies
    depends_on: Dict[str, List[str]] = field(default_factory=dict)

    # Service-specific config items
    config: List[Dict[str, Any]] = field(default_factory=list)

    # UI metadata
    ui: Dict[str, Any] = field(default_factory=dict)

    # Legacy fields (for backward compatibility)
    template: Optional[str] = None
    mode: str = "local"
    is_default: bool = False
    enabled: bool = True
    tags: List[str] = field(default_factory=list)

    @property
    def docker_image(self) -> Optional[str]:
        """Legacy accessor for docker image."""
        return self.docker.image if self.docker else None

    @property
    def docker_compose_file(self) -> Optional[str]:
        """Legacy accessor for docker compose file."""
        return self.docker.compose_file if self.docker else None

    @property
    def docker_service_name(self) -> Optional[str]:
        """Legacy accessor for docker service name."""
        return self.docker.service_name if self.docker else None


class ServiceRegistry:
    """
    Registry for service definitions.

    Loads service configurations from individual YAML files in config/services/
    and provides query methods for the wizard UI and docker manager.
    """

    def __init__(self):
        self._templates: Dict[str, Dict[str, Any]] = {}
        self._services: Dict[str, ServiceConfig] = {}
        self._loaded = False

    def _load(self) -> None:
        """Load templates and services from YAML files."""
        if self._loaded:
            return

        self._load_templates()
        self._load_services()
        self._loaded = True
        logger.info(
            f"ServiceRegistry loaded: {len(self._templates)} templates, "
            f"{len(self._services)} services"
        )

    def _load_templates(self) -> None:
        """Load capability definitions from YAML (used for legacy template access)."""
        try:
            if not CAPABILITIES_FILE.exists():
                logger.warning(f"Capabilities file not found: {CAPABILITIES_FILE}")
                return

            with open(CAPABILITIES_FILE, 'r') as f:
                data = yaml.safe_load(f)

            # Load capabilities (also available as templates for backward compat)
            self._templates = data.get('capabilities', {})
            logger.debug(f"Loaded {len(self._templates)} capabilities")

        except Exception as e:
            logger.error(f"Failed to load capabilities: {e}")

    def _load_services(self) -> None:
        """Load service definitions from config/services/*.yaml."""
        try:
            logger.info(f"Looking for services in: {SERVICES_DIR} (exists={SERVICES_DIR.exists()})")
            if not SERVICES_DIR.exists():
                logger.warning(f"Services directory not found: {SERVICES_DIR}")
                return

            yaml_files = list(SERVICES_DIR.glob("*.yaml"))
            logger.info(f"Found {len(yaml_files)} YAML files in {SERVICES_DIR}")

            for service_file in yaml_files:
                try:
                    self._load_service_file(service_file)
                    logger.info(f"Loaded service file: {service_file.name}")
                except Exception as e:
                    logger.error(f"Failed to load service {service_file}: {e}")

            logger.info(f"Loaded {len(self._services)} services total")

        except Exception as e:
            logger.error(f"Failed to load services: {e}")

    def _load_service_file(self, filepath: Path) -> None:
        """Load a single service definition file."""
        with open(filepath, 'r') as f:
            data = yaml.safe_load(f)

        if not data or 'id' not in data:
            logger.warning(f"Invalid service file (missing 'id'): {filepath}")
            return

        # Parse uses declarations
        uses = []
        for use_data in data.get('uses', []):
            uses.append(CapabilityUse(
                capability=use_data['capability'],
                required=use_data.get('required', True),
                purpose=use_data.get('purpose'),
                env_mapping=use_data.get('env_mapping', {})
            ))

        # Parse docker config
        docker = None
        docker_data = data.get('docker')
        if docker_data:
            docker = DockerConfig(
                image=docker_data.get('image', ''),
                compose_file=docker_data.get('compose_file'),
                service_name=docker_data.get('service_name'),
                ports=docker_data.get('ports', []),
                health=docker_data.get('health'),
                volumes=docker_data.get('volumes', [])
            )

        # Parse UI metadata
        ui_data = data.get('ui', {})

        service = ServiceConfig(
            service_id=data['id'],
            name=data.get('name', data['id']),
            description=data.get('description'),
            version=data.get('version'),
            uses=uses,
            docker=docker,
            depends_on=data.get('depends_on', {}),
            config=data.get('config', []),
            ui=ui_data,
            # Legacy/convenience fields
            mode='local' if docker else 'cloud',
            is_default=ui_data.get('is_default', False),
            enabled=True,
            tags=ui_data.get('tags', [])
        )

        self._services[service.service_id] = service

    def reload(self) -> None:
        """Force reload from YAML files."""
        self._loaded = False
        self._services = {}
        self._templates = {}
        self._load()

    def get_services(self, reload: bool = False) -> List[ServiceConfig]:
        """
        Get all service definitions.

        Args:
            reload: Force reload from YAML files

        Returns:
            List of ServiceConfig instances
        """
        if reload:
            self.reload()
        self._load()
        return list(self._services.values())

    # Alias for backward compatibility
    def get_instances(self, reload: bool = False) -> List[ServiceConfig]:
        """Alias for get_services() for backward compatibility."""
        return self.get_services(reload)

    def get_service(self, service_id: str) -> Optional[ServiceConfig]:
        """
        Get a specific service by ID.

        Args:
            service_id: Service identifier

        Returns:
            ServiceConfig or None if not found
        """
        self._load()
        return self._services.get(service_id)

    # Alias for backward compatibility
    def get_instance(self, service_id: str) -> Optional[ServiceConfig]:
        """Alias for get_service() for backward compatibility."""
        return self.get_service(service_id)

    def get_quickstart_services(self) -> List[ServiceConfig]:
        """
        Get services marked for quickstart wizard (is_default=true).

        Returns:
            List of default ServiceConfig instances
        """
        self._load()
        return [s for s in self._services.values() if s.is_default]

    def get_services_by_category(
        self,
        category: str,
        enabled_only: bool = True
    ) -> List[ServiceConfig]:
        """
        Get services by category tag.

        Args:
            category: Category tag (e.g., 'memory', 'conversation_engine')
            enabled_only: Only return enabled services

        Returns:
            List of matching ServiceConfig instances
        """
        self._load()
        results = []
        for service in self._services.values():
            # Check UI category
            if service.ui.get('category') == category:
                if enabled_only and not service.enabled:
                    continue
                results.append(service)
                continue

            # Check tags
            if category in service.tags:
                if enabled_only and not service.enabled:
                    continue
                results.append(service)

        return results

    def get_service_config_schema(self, service_id: str) -> List[ConfigField]:
        """
        Get the config schema for a service.

        Builds ConfigField list from the service's 'config' section.

        Args:
            service_id: Service identifier

        Returns:
            List of ConfigField
        """
        self._load()

        service = self.get_service(service_id)
        if not service:
            logger.warning(f"Service not found: {service_id}")
            return []

        fields = []
        for config_item in service.config:
            try:
                field = ConfigField(
                    key=config_item.get('key', ''),
                    type=config_item.get('type', 'string'),
                    label=config_item.get('label', config_item.get('key', '')),
                    description=config_item.get('description'),
                    required=config_item.get('required', False),
                    default=config_item.get('default'),
                    link=config_item.get('link'),
                    env_var=config_item.get('env_var'),
                    settings_path=config_item.get('settings_path'),
                    options=config_item.get('options'),
                    min=config_item.get('min'),
                    max=config_item.get('max'),
                    min_length=config_item.get('min_length'),
                    required_if=config_item.get('required_if')
                )
                fields.append(field)
            except Exception as e:
                logger.warning(
                    f"Invalid config field for {service_id}.{config_item.get('key')}: {e}"
                )

        return fields

    # Legacy alias
    def get_effective_schema(self, service_id: str) -> List[ConfigField]:
        """Legacy alias for get_service_config_schema()."""
        return self.get_service_config_schema(service_id)

    def get_template(self, template_name: str) -> Optional[Dict[str, Any]]:
        """
        Get a template/capability definition.

        Args:
            template_name: Template identifier

        Returns:
            Template dict or None
        """
        self._load()
        return self._templates.get(template_name)


# Global singleton instance
_registry: Optional[ServiceRegistry] = None


def get_service_registry() -> ServiceRegistry:
    """Get the global ServiceRegistry instance."""
    global _registry
    if _registry is None:
        _registry = ServiceRegistry()
    return _registry
