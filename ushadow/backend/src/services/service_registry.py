"""
Service Registry - Loads service definitions from YAML configuration files.

This module provides a registry for service templates and instances, supporting:
- Template definitions with config schemas for cloud/local modes
- Service instances that inherit from templates
- Dynamic schema merging (template + instance overrides)
- Quickstart filtering for wizard UI
"""

import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from pydantic import BaseModel

import yaml

logger = logging.getLogger(__name__)

# Config file paths - check container mount first, then fallback to local
CONFIG_DIR = Path("/config") if Path("/config").exists() else Path("config")
TEMPLATES_FILE = CONFIG_DIR / "service-templates.yaml"
SERVICES_FILE = CONFIG_DIR / "default-services.yaml"


class ConfigField(BaseModel):
    """Configuration field schema definition."""
    key: str
    type: str  # secret, string, url, boolean, number
    label: str
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


@dataclass
class ServiceConfig:
    """Service instance configuration."""
    service_id: str
    name: str
    description: Optional[str]
    template: str  # References template name
    mode: str  # 'cloud' or 'local'
    is_default: bool = False
    enabled: bool = True

    # Docker deployment (for local mode)
    docker_image: Optional[str] = None
    docker_compose_file: Optional[str] = None
    docker_service_name: Optional[str] = None
    docker_profile: Optional[str] = None

    # Cloud connection
    connection_url: Optional[str] = None

    # Config overrides (merged with template schema)
    config_overrides: Dict[str, Any] = field(default_factory=dict)

    # Additional metadata
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class ServiceRegistry:
    """
    Registry for service templates and instances.

    Loads configuration from YAML files and provides query methods
    for the wizard UI and docker manager.
    """

    def __init__(self):
        self._templates: Dict[str, Dict[str, Any]] = {}
        self._instances: List[ServiceConfig] = []
        self._default_providers: Dict[str, str] = {}
        self._loaded = False

    def _load(self) -> None:
        """Load templates and services from YAML files."""
        if self._loaded:
            return

        self._load_templates()
        self._load_services()
        self._loaded = True
        logger.info(f"ServiceRegistry loaded: {len(self._templates)} templates, {len(self._instances)} services")

    def _load_templates(self) -> None:
        """Load service templates from YAML."""
        try:
            if not TEMPLATES_FILE.exists():
                logger.warning(f"Templates file not found: {TEMPLATES_FILE}")
                return

            with open(TEMPLATES_FILE, 'r') as f:
                data = yaml.safe_load(f)

            self._templates = data.get('templates', {})
            logger.debug(f"Loaded {len(self._templates)} templates")

        except Exception as e:
            logger.error(f"Failed to load templates: {e}")

    def _load_services(self) -> None:
        """Load service instances from YAML."""
        try:
            if not SERVICES_FILE.exists():
                logger.warning(f"Services file not found: {SERVICES_FILE}")
                return

            with open(SERVICES_FILE, 'r') as f:
                data = yaml.safe_load(f)

            self._default_providers = data.get('default_providers', {})

            for svc in data.get('services', []):
                instance = ServiceConfig(
                    service_id=svc['service_id'],
                    name=svc['name'],
                    description=svc.get('description'),
                    template=svc['template'],
                    mode=svc.get('mode', 'cloud'),
                    is_default=svc.get('is_default', False),
                    enabled=svc.get('enabled', True),
                    docker_image=svc.get('docker_image'),
                    docker_compose_file=svc.get('docker_compose_file'),
                    docker_service_name=svc.get('docker_service_name'),
                    docker_profile=svc.get('docker_profile'),
                    connection_url=svc.get('connection_url'),
                    config_overrides=svc.get('config_overrides', {}),
                    tags=svc.get('tags', []),
                    metadata=svc.get('metadata', {})
                )
                self._instances.append(instance)

            logger.debug(f"Loaded {len(self._instances)} service instances")

        except Exception as e:
            logger.error(f"Failed to load services: {e}")

    def get_instances(self, reload: bool = False) -> List[ServiceConfig]:
        """
        Get all service instances.

        Args:
            reload: Force reload from YAML files

        Returns:
            List of ServiceConfig instances
        """
        if reload:
            self._loaded = False
            self._instances = []
            self._templates = {}

        self._load()
        return self._instances

    def get_instance(self, service_id: str) -> Optional[ServiceConfig]:
        """
        Get a specific service instance by ID.

        Args:
            service_id: Service identifier

        Returns:
            ServiceConfig or None if not found
        """
        self._load()
        for instance in self._instances:
            if instance.service_id == service_id:
                return instance
        return None

    def get_quickstart_services(self) -> List[ServiceConfig]:
        """
        Get services marked for quickstart wizard (is_default=true).

        Returns:
            List of default ServiceConfig instances
        """
        self._load()
        return [s for s in self._instances if s.is_default]

    def get_services_by_category(
        self,
        category: str,
        enabled_only: bool = True
    ) -> List[ServiceConfig]:
        """
        Get services by template category.

        Args:
            category: Template name (e.g., 'llm', 'memory', 'transcription')
            enabled_only: Only return enabled services

        Returns:
            List of matching ServiceConfig instances
        """
        self._load()
        results = []
        for instance in self._instances:
            # Match template name (handles both 'memory' and 'memory.ui')
            template_base = instance.template.split('.')[0]
            if template_base == category:
                if enabled_only and not instance.enabled:
                    continue
                results.append(instance)
        return results

    def get_effective_schema(self, service_id: str) -> List[ConfigField]:
        """
        Get the effective config schema for a service.

        Merges template schema with instance-specific overrides.

        Args:
            service_id: Service identifier

        Returns:
            List of ConfigField with merged values
        """
        self._load()

        instance = self.get_instance(service_id)
        if not instance:
            logger.warning(f"Service not found: {service_id}")
            return []

        # Get template schema for the mode (cloud/local)
        template_name = instance.template.split('.')[0]  # Handle 'memory.ui' -> 'memory'
        template = self._templates.get(template_name, {})

        mode_config = template.get(instance.mode, {})
        schema_defs = mode_config.get('config_schema', [])

        # Build ConfigField list with overrides applied
        fields = []
        for field_def in schema_defs:
            # Start with template definition
            field_data = dict(field_def)

            # Apply instance overrides
            field_key = field_data['key']
            if field_key in instance.config_overrides:
                override_value = instance.config_overrides[field_key]
                # If override is a simple value, set as default
                if not isinstance(override_value, dict):
                    field_data['default'] = override_value
                else:
                    # Merge dict overrides
                    field_data.update(override_value)

            # Check for link override
            link_key = f"{field_key}_link"
            if link_key in instance.config_overrides:
                field_data['link'] = instance.config_overrides[link_key]

            # Check for api_key_link special case
            if 'api_key_link' in instance.config_overrides and field_key == 'api_key':
                field_data['link'] = instance.config_overrides['api_key_link']

            # Check for settings_path override
            settings_key = f"{field_key}_settings_path"
            if settings_key in instance.config_overrides:
                field_data['settings_path'] = instance.config_overrides[settings_key]
            if 'api_key_settings_path' in instance.config_overrides and field_key == 'api_key':
                field_data['settings_path'] = instance.config_overrides['api_key_settings_path']

            try:
                fields.append(ConfigField(**field_data))
            except Exception as e:
                logger.warning(f"Invalid field definition for {service_id}.{field_key}: {e}")

        return fields

    def get_template(self, template_name: str) -> Optional[Dict[str, Any]]:
        """
        Get a template definition.

        Args:
            template_name: Template identifier

        Returns:
            Template dict or None
        """
        self._load()
        return self._templates.get(template_name)

    def get_default_provider(self, category: str) -> Optional[str]:
        """
        Get the default provider for a category.

        Args:
            category: Category name (e.g., 'llm', 'memory')

        Returns:
            Service ID of default provider or None
        """
        self._load()
        return self._default_providers.get(category)


# Global singleton instance
_registry: Optional[ServiceRegistry] = None


def get_service_registry() -> ServiceRegistry:
    """Get the global ServiceRegistry instance."""
    global _registry
    if _registry is None:
        _registry = ServiceRegistry()
    return _registry
