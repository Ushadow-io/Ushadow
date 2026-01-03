"""
Compose Service Registry - Discovers services from Docker Compose files.

This module provides a registry that uses compose files as the source of truth:
- Services are discovered from compose/*.yaml files
- Environment variables are extracted directly from compose
- Capability requirements come from x-ushadow extension
- No duplication with separate service definition files

The compose file format expected:

    x-ushadow:
      service-name:
        requires: [llm, transcription]  # Capabilities needed

    services:
      service-name:
        image: ...
        environment:
          - REQUIRED_VAR              # Must be injected
          - OPTIONAL=${VAR:-default}  # Has default, can override
"""

import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from pydantic import BaseModel

try:
    from ..config.yaml_parser import ComposeParser, ComposeService, ComposeEnvVar, ParsedCompose
except ImportError:
    # Handle direct execution or different import contexts
    from config.yaml_parser import ComposeParser, ComposeService, ComposeEnvVar, ParsedCompose

logger = logging.getLogger(__name__)


def _get_compose_dir() -> Path:
    """Resolve compose directory, handling different execution contexts."""
    # Docker container mount
    if Path("/compose").exists():
        return Path("/compose")
    # Running from project root
    if Path("compose").exists():
        return Path("compose")
    # Running from ushadow/backend
    if Path("../../compose").exists():
        return Path("../../compose").resolve()
    # Fallback
    return Path("compose")


COMPOSE_DIR = _get_compose_dir()


# ============================================================================
# Data Models
# ============================================================================

class EnvVarConfig(BaseModel):
    """
    Configuration for a single environment variable.

    This represents how the user has configured a specific env var:
    - source: Where the value comes from
    - setting_path: If source is 'setting', the path in settings store
    - value: If source is 'literal', the actual value
    """
    name: str
    source: str = "default"  # "setting", "literal", "default"
    setting_path: Optional[str] = None
    value: Optional[str] = None

    # Metadata from compose parsing
    has_default: bool = False
    default_value: Optional[str] = None
    is_required: bool = True


class ServiceEnvSchema(BaseModel):
    """
    Environment variable schema for a service.

    Returned to the UI so it can render configuration forms.
    """
    service_name: str
    compose_file: str
    requires: List[str] = []  # Capabilities required

    # Env vars categorized
    required_env_vars: List[EnvVarConfig] = []
    optional_env_vars: List[EnvVarConfig] = []


@dataclass
class DiscoveredService:
    """
    A service discovered from a compose file.

    Contains both the parsed compose data and the compose file path
    for runtime execution.
    """
    # Identity
    service_id: str  # Unique ID: compose_file:service_name
    service_name: str  # Service name in compose
    compose_file: Path  # Path to compose file

    # From compose parsing
    image: Optional[str] = None
    requires: List[str] = field(default_factory=list)
    depends_on: List[str] = field(default_factory=list)
    profiles: List[str] = field(default_factory=list)
    ports: List[Dict[str, Any]] = field(default_factory=list)
    display_name: Optional[str] = None  # From x-ushadow (e.g., "OpenMemory")
    description: Optional[str] = None  # From x-ushadow
    namespace: Optional[str] = None  # Docker Compose project / K8s namespace
    infra_services: List[str] = field(default_factory=list)  # Infra services to start first
    route_path: Optional[str] = None  # Tailscale Serve route path (e.g., "/chronicle")

    # Environment variables
    required_env_vars: List[ComposeEnvVar] = field(default_factory=list)
    optional_env_vars: List[ComposeEnvVar] = field(default_factory=list)

    # User configuration (loaded from storage)
    env_config: Dict[str, EnvVarConfig] = field(default_factory=dict)

    @property
    def all_env_vars(self) -> List[ComposeEnvVar]:
        """Get all env vars (required + optional)."""
        return self.required_env_vars + self.optional_env_vars

    def get_env_schema(self) -> ServiceEnvSchema:
        """Build schema for UI rendering."""
        required = [
            EnvVarConfig(
                name=ev.name,
                has_default=ev.has_default,
                default_value=ev.default_value,
                is_required=True,
                # Include user config if available
                source=self.env_config.get(ev.name, EnvVarConfig(name=ev.name)).source,
                setting_path=self.env_config.get(ev.name, EnvVarConfig(name=ev.name)).setting_path,
                value=self.env_config.get(ev.name, EnvVarConfig(name=ev.name)).value,
            )
            for ev in self.required_env_vars
        ]

        optional = [
            EnvVarConfig(
                name=ev.name,
                has_default=ev.has_default,
                default_value=ev.default_value,
                is_required=False,
                source=self.env_config.get(ev.name, EnvVarConfig(name=ev.name, source="default")).source,
                setting_path=self.env_config.get(ev.name, EnvVarConfig(name=ev.name)).setting_path,
                value=self.env_config.get(ev.name, EnvVarConfig(name=ev.name)).value,
            )
            for ev in self.optional_env_vars
        ]

        return ServiceEnvSchema(
            service_name=self.service_name,
            compose_file=str(self.compose_file),
            requires=self.requires,
            required_env_vars=required,
            optional_env_vars=optional,
        )


# ============================================================================
# Compose Service Registry
# ============================================================================

class ComposeServiceRegistry:
    """
    Registry that discovers services from Docker Compose files.

    Scans compose directory for *-compose.yaml files and extracts:
    - Services and their configurations
    - Environment variables (required vs optional)
    - Capability requirements from x-ushadow extension

    Usage:
        registry = ComposeServiceRegistry()
        services = registry.get_services()

        for service in services:
            schema = service.get_env_schema()
            # Render UI form from schema
    """

    def __init__(self, compose_dir: Optional[Path] = None):
        """
        Initialize the registry.

        Args:
            compose_dir: Directory containing compose files. Defaults to auto-detected.
        """
        self.compose_dir = compose_dir or COMPOSE_DIR
        self.parser = ComposeParser()
        self._services: Dict[str, DiscoveredService] = {}
        self._compose_files: Dict[str, ParsedCompose] = {}
        self._loaded = False

    def _load(self) -> None:
        """Load and parse all compose files."""
        if self._loaded:
            return

        self._discover_compose_files()
        self._loaded = True
        logger.info(
            f"ComposeServiceRegistry loaded: {len(self._compose_files)} compose files, "
            f"{len(self._services)} services"
        )

    def refresh(self) -> None:
        """Refresh the registry by re-discovering compose files."""
        logger.info("Refreshing ComposeServiceRegistry...")
        self._services.clear()
        self._compose_files.clear()
        self._loaded = False
        self._load()
        logger.info(f"ComposeServiceRegistry refreshed: {len(self._services)} services")

    def _discover_compose_files(self) -> None:
        """Discover and parse compose files in the compose directory."""
        if not self.compose_dir.exists():
            logger.warning(f"Compose directory not found: {self.compose_dir}")
            return

        # Find compose files (pattern: *-compose.yaml or *-compose.yml)
        patterns = ["*-compose.yaml", "*-compose.yml"]
        compose_files = []
        for pattern in patterns:
            compose_files.extend(self.compose_dir.glob(pattern))

        logger.info(f"Found {len(compose_files)} compose files in {self.compose_dir}")

        for compose_file in compose_files:
            try:
                self._load_compose_file(compose_file)
            except Exception as e:
                logger.error(f"Failed to parse {compose_file}: {e}")

    def _load_compose_file(self, filepath: Path) -> None:
        """Load and parse a single compose file."""
        parsed = self.parser.parse(filepath)

        if not parsed.services:
            logger.warning(f"No services found in {filepath}")
            return

        # Store parsed compose
        self._compose_files[str(filepath)] = parsed

        # Extract services
        for name, service in parsed.services.items():
            service_id = f"{filepath.stem}:{name}"

            discovered = DiscoveredService(
                service_id=service_id,
                service_name=name,
                compose_file=filepath,
                image=service.image,
                requires=service.requires,
                depends_on=service.depends_on,
                profiles=service.profiles,
                ports=service.ports,
                display_name=service.display_name,
                description=service.description,
                namespace=service.namespace,
                infra_services=service.infra_services,
                route_path=service.route_path,
                required_env_vars=service.required_env_vars,
                optional_env_vars=service.optional_env_vars,
            )

            self._services[service_id] = discovered
            logger.debug(f"Discovered service: {service_id} (display: {service.display_name})")

    def reload(self) -> None:
        """Force reload from compose files."""
        self._loaded = False
        self._services = {}
        self._compose_files = {}
        self._load()

    # ========================================================================
    # Query Methods
    # ========================================================================

    def get_services(self, reload: bool = False) -> List[DiscoveredService]:
        """
        Get all discovered services.

        Args:
            reload: Force reload from compose files

        Returns:
            List of DiscoveredService instances
        """
        if reload:
            self.reload()
        self._load()
        return list(self._services.values())

    def get_service(self, service_id: str) -> Optional[DiscoveredService]:
        """
        Get a specific service by ID.

        Args:
            service_id: Service identifier (compose_file:service_name)

        Returns:
            DiscoveredService or None
        """
        self._load()
        return self._services.get(service_id)

    def get_service_by_name(self, service_name: str) -> Optional[DiscoveredService]:
        """
        Get a service by just its name (first match).

        Args:
            service_name: Service name in compose file

        Returns:
            DiscoveredService or None
        """
        self._load()
        for service in self._services.values():
            if service.service_name == service_name:
                return service
        return None

    def get_services_requiring(self, capability: str) -> List[DiscoveredService]:
        """
        Get all services that require a specific capability.

        Args:
            capability: Capability name (e.g., 'llm', 'transcription')

        Returns:
            List of services requiring that capability
        """
        self._load()
        return [s for s in self._services.values() if capability in s.requires]

    def get_compose_file(self, filepath: str) -> Optional[ParsedCompose]:
        """
        Get a parsed compose file.

        Args:
            filepath: Path to compose file

        Returns:
            ParsedCompose or None
        """
        self._load()
        return self._compose_files.get(filepath)

    def get_services_in_compose(self, compose_file: Path) -> List[DiscoveredService]:
        """
        Get all services from a specific compose file.

        Args:
            compose_file: Path to compose file

        Returns:
            List of services in that compose file
        """
        self._load()
        return [
            s for s in self._services.values()
            if s.compose_file == compose_file
        ]

    # ========================================================================
    # Environment Variable Resolution
    # ========================================================================

    def get_env_schema(self, service_id: str) -> Optional[ServiceEnvSchema]:
        """
        Get the environment variable schema for a service.

        Args:
            service_id: Service identifier

        Returns:
            ServiceEnvSchema for UI rendering, or None
        """
        service = self.get_service(service_id)
        if not service:
            return None
        return service.get_env_schema()

    def update_env_config(
        self,
        service_id: str,
        env_config: Dict[str, EnvVarConfig]
    ) -> bool:
        """
        Update the environment variable configuration for a service.

        Args:
            service_id: Service identifier
            env_config: Dict of env var name -> EnvVarConfig

        Returns:
            True if successful
        """
        service = self.get_service(service_id)
        if not service:
            return False

        service.env_config = env_config
        # TODO: Persist to storage
        return True

    def resolve_env_vars(
        self,
        service_id: str,
        settings_getter
    ) -> Dict[str, str]:
        """
        Resolve environment variables for runtime injection.

        Args:
            service_id: Service identifier
            settings_getter: Async function to get setting value by path

        Returns:
            Dict of env var name -> resolved value (only non-default values)
        """
        service = self.get_service(service_id)
        if not service:
            return {}

        resolved = {}

        for env_var in service.all_env_vars:
            config = service.env_config.get(env_var.name)

            if not config or config.source == "default":
                # Use compose default, don't inject
                continue

            if config.source == "setting" and config.setting_path:
                # Will be resolved at runtime
                resolved[env_var.name] = f"${{SETTING:{config.setting_path}}}"

            elif config.source == "literal" and config.value:
                resolved[env_var.name] = config.value

        return resolved


# ============================================================================
# Global Instance
# ============================================================================

_registry: Optional[ComposeServiceRegistry] = None


def get_compose_registry() -> ComposeServiceRegistry:
    """Get the global ComposeServiceRegistry instance."""
    global _registry
    if _registry is None:
        _registry = ComposeServiceRegistry()
    return _registry
