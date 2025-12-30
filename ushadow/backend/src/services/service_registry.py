"""
Service Registry

Discovers and loads service definitions from config/services/*.yaml.
Each service is self-contained - no templates needed.

Directory structure:
  config/
    services.yaml              # Index with defaults and service type info
    env-mappings.yaml          # Global env var -> settings path mappings
    services/
      openmemory.yaml          # User-facing services
      chronicle.yaml
      openai.yaml
      ...
      infrastructure/          # System-managed infrastructure
        mongodb.yaml
        redis.yaml
        ...
    deployments/
      local.yaml               # Docker deployment config
      kubernetes.yaml          # K8s deployment config (future)
    user-services/             # User-added services (gitignored)
      my-custom-llm.yaml
"""

import yaml
import logging
from pathlib import Path
from typing import Dict, List, Optional, Set
from functools import lru_cache

from src.models.service import (
    Service,
    ServiceType,
    ServiceState,
    ServiceStatus,
    ServicesIndex,
    ServiceTypeInfo,
    EnvMappingsConfig,
    DeploymentConfig,
)

logger = logging.getLogger(__name__)


class ServiceRegistry:
    """
    Central registry for all service definitions.

    Provides:
    - Service discovery from YAML files
    - Service lookup by ID, type, or tags
    - Global environment variable mappings
    - Deployment configuration
    """

    def __init__(self, config_dir: Optional[Path] = None):
        if config_dir is None:
            # Navigate from service_registry.py to project root
            project_root = Path(__file__).parent.parent.parent.parent.parent
            config_dir = project_root / "config"

        self.config_dir = Path(config_dir)

        # Directory paths
        self.services_dir = self.config_dir / "services"
        self.infrastructure_dir = self.services_dir / "infrastructure"
        self.user_services_dir = self.config_dir / "user-services"
        self.deployments_dir = self.config_dir / "deployments"

        # File paths
        self.index_path = self.config_dir / "services.yaml"
        self.env_mappings_path = self.config_dir / "env-mappings.yaml"

        # Caches (cleared on reload)
        self._services_cache: Optional[Dict[str, Service]] = None
        self._index_cache: Optional[ServicesIndex] = None
        self._env_mappings_cache: Optional[Dict[str, str]] = None
        self._deployment_cache: Dict[str, DeploymentConfig] = {}

    def reload(self) -> None:
        """Clear all caches and reload from disk."""
        self._services_cache = None
        self._index_cache = None
        self._env_mappings_cache = None
        self._deployment_cache = {}
        logger.info("Service registry caches cleared")

    # =========================================================================
    # Service Loading
    # =========================================================================

    def get_all_services(self, reload: bool = False) -> Dict[str, Service]:
        """
        Get all discovered services.

        Returns:
            Dict mapping service_id -> Service
        """
        if reload:
            self._services_cache = None

        if self._services_cache is None:
            self._services_cache = self._discover_services()

        return self._services_cache

    def get_service(self, service_id: str) -> Optional[Service]:
        """Get a specific service by ID."""
        services = self.get_all_services()
        return services.get(service_id)

    def get_services_by_type(
        self,
        service_type: ServiceType,
        include_disabled: bool = False
    ) -> List[Service]:
        """Get all services of a specific type."""
        services = self.get_all_services()
        return [
            s for s in services.values()
            if s.type == service_type
        ]

    def get_infrastructure_services(self) -> List[Service]:
        """Get all infrastructure services."""
        return self.get_services_by_type(ServiceType.INFRASTRUCTURE)

    def get_user_facing_services(self) -> List[Service]:
        """Get all non-infrastructure services."""
        services = self.get_all_services()
        return [
            s for s in services.values()
            if s.type != ServiceType.INFRASTRUCTURE
        ]

    def get_default_services(self) -> Dict[str, Service]:
        """
        Get default service for each type.

        Returns:
            Dict mapping service_type -> Service
        """
        index = self.get_index()
        services = self.get_all_services()

        defaults = {}
        for type_name, service_id in index.defaults.items():
            if service_id in services:
                defaults[type_name] = services[service_id]
            else:
                logger.warning(
                    f"Default service '{service_id}' for type '{type_name}' not found"
                )

        return defaults

    def get_quickstart_services(self) -> List[Service]:
        """Get services marked as is_default for quickstart wizard."""
        services = self.get_all_services()
        return [s for s in services.values() if s.is_default]

    def get_services_by_tag(self, tag: str) -> List[Service]:
        """Get all services with a specific tag."""
        services = self.get_all_services()
        return [s for s in services.values() if tag in s.tags]

    # =========================================================================
    # Index and Mappings
    # =========================================================================

    def get_index(self, reload: bool = False) -> ServicesIndex:
        """Get the services index (defaults and type info)."""
        if reload:
            self._index_cache = None

        if self._index_cache is None:
            self._index_cache = self._load_index()

        return self._index_cache

    def get_env_mappings(self, reload: bool = False) -> Dict[str, str]:
        """
        Get global environment variable mappings.

        Returns:
            Dict mapping ENV_VAR -> settings.path
        """
        if reload:
            self._env_mappings_cache = None

        if self._env_mappings_cache is None:
            self._env_mappings_cache = self._load_env_mappings()

        return self._env_mappings_cache

    def get_env_mapping_for_service(
        self,
        service: Service,
        env_var: str
    ) -> Optional[str]:
        """
        Get the settings path for an env var, considering service overrides.

        Args:
            service: The service to get mapping for
            env_var: Environment variable name

        Returns:
            Settings path (e.g., "secrets.api_keys.openai") or None
        """
        # Check service-specific override first
        if env_var in service.env_overrides:
            return service.env_overrides[env_var].settings_path

        # Fall back to global mapping
        mappings = self.get_env_mappings()
        return mappings.get(env_var)

    def get_service_type_info(self, type_name: str) -> Optional[ServiceTypeInfo]:
        """Get metadata about a service type."""
        index = self.get_index()
        return index.service_types.get(type_name)

    # =========================================================================
    # Deployment Configuration
    # =========================================================================

    def get_deployment_config(
        self,
        target: str = "local"
    ) -> Optional[DeploymentConfig]:
        """
        Get deployment configuration for a target.

        Args:
            target: Deployment target (local, kubernetes, etc.)

        Returns:
            DeploymentConfig or None if not found
        """
        if target not in self._deployment_cache:
            config_path = self.deployments_dir / f"{target}.yaml"
            if config_path.exists():
                self._deployment_cache[target] = self._load_deployment_config(
                    config_path
                )
            else:
                logger.warning(f"Deployment config not found: {config_path}")
                return None

        return self._deployment_cache.get(target)

    # =========================================================================
    # Dependency Resolution
    # =========================================================================

    def get_required_infrastructure(
        self,
        service_ids: List[str],
        options: Optional[Dict[str, Dict[str, any]]] = None
    ) -> Set[str]:
        """
        Get all infrastructure services required by a set of services.

        Args:
            service_ids: List of service IDs to check
            options: Optional dict of service_id -> option values

        Returns:
            Set of infrastructure service IDs needed
        """
        required = set()
        services = self.get_all_services()

        for service_id in service_ids:
            service = services.get(service_id)
            if not service:
                continue

            # Add required dependencies
            if service.depends_on:
                required.update(service.depends_on.required)

                # Check optional dependencies triggered by options
                if options and service_id in options:
                    service_options = options[service_id]
                    for opt_name, opt_def in service.options.items():
                        if opt_def.triggers_dependency:
                            opt_value = service_options.get(opt_name, opt_def.default)
                            if opt_value:
                                required.add(opt_def.triggers_dependency)

        return required

    # =========================================================================
    # Validation
    # =========================================================================

    def validate_service_config(
        self,
        service_id: str,
        env_values: Dict[str, str]
    ) -> List[str]:
        """
        Validate that required env vars are present.

        Args:
            service_id: Service to validate
            env_values: Available environment variable values

        Returns:
            List of missing required env var names
        """
        service = self.get_service(service_id)
        if not service:
            return []

        required = service.get_required_env_vars()
        missing = [var for var in required if var not in env_values or not env_values[var]]

        return missing

    # =========================================================================
    # Private Methods
    # =========================================================================

    def _discover_services(self) -> Dict[str, Service]:
        """Discover and load all services from YAML files."""
        services = {}

        # Load from config/services/*.yaml
        if self.services_dir.exists():
            for yaml_file in self.services_dir.glob("*.yaml"):
                service = self._load_service_file(yaml_file)
                if service:
                    services[service.id] = service

        # Load from config/services/infrastructure/*.yaml
        if self.infrastructure_dir.exists():
            for yaml_file in self.infrastructure_dir.glob("*.yaml"):
                service = self._load_service_file(yaml_file)
                if service:
                    services[service.id] = service

        # Load from config/user-services/*.yaml (if exists)
        if self.user_services_dir.exists():
            for yaml_file in self.user_services_dir.glob("*.yaml"):
                service = self._load_service_file(yaml_file)
                if service:
                    if service.id in services:
                        logger.warning(
                            f"User service '{service.id}' overrides built-in service"
                        )
                    services[service.id] = service

        logger.info(f"Discovered {len(services)} services")
        return services

    def _load_service_file(self, path: Path) -> Optional[Service]:
        """Load and parse a single service YAML file."""
        try:
            with open(path, 'r') as f:
                data = yaml.safe_load(f)

            if not data:
                logger.warning(f"Empty service file: {path}")
                return None

            service = Service(**data)
            logger.debug(f"Loaded service: {service.id} from {path.name}")
            return service

        except yaml.YAMLError as e:
            logger.error(f"YAML parse error in {path}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error loading service from {path}: {e}")
            return None

    def _load_index(self) -> ServicesIndex:
        """Load the services index file."""
        if not self.index_path.exists():
            logger.warning(f"Services index not found: {self.index_path}")
            return ServicesIndex()

        try:
            with open(self.index_path, 'r') as f:
                data = yaml.safe_load(f)

            if not data:
                return ServicesIndex()

            return ServicesIndex(**data)

        except Exception as e:
            logger.error(f"Error loading services index: {e}")
            return ServicesIndex()

    def _load_env_mappings(self) -> Dict[str, str]:
        """Load global environment variable mappings."""
        if not self.env_mappings_path.exists():
            logger.warning(f"Env mappings not found: {self.env_mappings_path}")
            return {}

        try:
            with open(self.env_mappings_path, 'r') as f:
                data = yaml.safe_load(f)

            if not data or 'mappings' not in data:
                return {}

            return data['mappings']

        except Exception as e:
            logger.error(f"Error loading env mappings: {e}")
            return {}

    def _load_deployment_config(self, path: Path) -> Optional[DeploymentConfig]:
        """Load a deployment configuration file."""
        try:
            with open(path, 'r') as f:
                data = yaml.safe_load(f)

            if not data:
                return None

            return DeploymentConfig(**data)

        except Exception as e:
            logger.error(f"Error loading deployment config from {path}: {e}")
            return None


# =============================================================================
# Global Instance
# =============================================================================

_service_registry: Optional[ServiceRegistry] = None


def get_service_registry(config_dir: Optional[Path] = None) -> ServiceRegistry:
    """Get the global ServiceRegistry instance."""
    global _service_registry
    if _service_registry is None:
        _service_registry = ServiceRegistry(config_dir)
    return _service_registry


def reset_service_registry() -> None:
    """Reset the global registry (for testing)."""
    global _service_registry
    _service_registry = None
