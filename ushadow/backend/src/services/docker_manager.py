"""Docker container orchestration manager for Ushadow.

This module provides centralized Docker container management for controlling
local services and integrations through the Ushadow backend API.

Services are discovered from Docker Compose files via ComposeServiceRegistry
and use capability-based composition via CapabilityResolver.
"""

import logging
import os
import re
import subprocess
from pathlib import Path
from enum import Enum
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime

import docker
from docker.errors import DockerException, NotFound, APIError

from src.services.compose_registry import get_compose_registry

logger = logging.getLogger(__name__)

# Service name validation pattern (alphanumeric, hyphens, underscores only)
SERVICE_NAME_PATTERN = re.compile(r'^[a-z0-9_-]+$')


class ServiceStatus(str, Enum):
    """Service status enum."""

    RUNNING = "running"
    STOPPED = "stopped"
    PAUSED = "paused"
    RESTARTING = "restarting"
    DEAD = "dead"
    CREATED = "created"
    EXITED = "exited"
    UNKNOWN = "unknown"
    NOT_FOUND = "not_found"


class ServiceType(str, Enum):
    """Service type classification."""

    INFRASTRUCTURE = "infrastructure"  # MongoDB, Redis, etc.
    INTEGRATION = "integration"  # External services like Pieces, OpenMemory
    MEMORY_SOURCE = "memory_source"  # Memory providers
    MCP_SERVER = "mcp_server"  # MCP protocol servers
    APPLICATION = "application"  # Core ushadow components
    WORKFLOW = "workflow"  # n8n, automation tools
    AGENT = "agent"  # Agent Zero, autonomous agents


class IntegrationType(str, Enum):
    """How the service integrates with Ushadow."""

    REST = "rest"  # REST API endpoint
    MCP = "mcp"  # Model Context Protocol server
    GRAPHQL = "graphql"  # GraphQL endpoint
    WEBSOCKET = "websocket"  # WebSocket connection
    GRPC = "grpc"  # gRPC service


@dataclass
class ServiceEndpoint:
    """Service endpoint configuration."""

    url: str
    integration_type: IntegrationType
    health_check_path: Optional[str] = "/health"
    requires_auth: bool = False
    auth_type: Optional[str] = None  # "bearer", "basic", "api_key"


@dataclass
class ServiceInfo:
    """Information about a Docker service/container."""

    name: str
    container_id: Optional[str]
    status: ServiceStatus
    service_type: ServiceType
    image: Optional[str]
    created: Optional[datetime]
    ports: Dict[str, str]
    health: Optional[str]
    endpoints: List[ServiceEndpoint]
    description: Optional[str] = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None  # Extra service-specific data


class DockerManager:
    """
    Manages Docker containers for Ushadow services and integrations.

    Services are discovered from Docker Compose files via ComposeServiceRegistry.
    Only core infrastructure is defined here as CORE_SERVICES.
    """

    # Core infrastructure services that are always available
    # These are required system infrastructure, not from compose files
    CORE_SERVICES = {
        "mongo": {
            "description": "MongoDB database",
            "service_type": ServiceType.INFRASTRUCTURE,
            "required": True,
            "user_controllable": False,
            "endpoints": []
        },
        "redis": {
            "description": "Redis cache",
            "service_type": ServiceType.INFRASTRUCTURE,
            "required": True,
            "user_controllable": False,
            "endpoints": []
        },
        "qdrant": {
            "description": "Qdrant vector database",
            "service_type": ServiceType.INFRASTRUCTURE,
            "required": True,
            "user_controllable": False,
            "endpoints": [
                ServiceEndpoint(
                    url="http://qdrant:6333",
                    integration_type=IntegrationType.REST,
                    health_check_path="/healthz"
                )
            ]
        },
        "neo4j": {
            "description": "Neo4j graph database",
            "service_type": ServiceType.INFRASTRUCTURE,
            "required": False,
            "user_controllable": True,
            "compose_file": "docker-compose.infra.yml",
            "compose_profile": "neo4j",
            "endpoints": [
                ServiceEndpoint(
                    url="http://neo4j:7474",
                    integration_type=IntegrationType.REST,
                    requires_auth=True,
                    auth_type="basic"
                )
            ]
        },
        # Application services (the ushadow app itself)
        "ushadow-backend": {
            "description": "Ushadow backend API",
            "service_type": ServiceType.APPLICATION,
            "required": True,
            "user_controllable": False,
            "endpoints": [
                ServiceEndpoint(
                    url="http://ushadow-backend:8010",
                    integration_type=IntegrationType.REST,
                    health_check_path="/health"
                )
            ]
        },
        "ushadow-frontend": {
            "description": "Ushadow frontend web UI",
            "service_type": ServiceType.APPLICATION,
            "required": True,
            "user_controllable": False,
            "endpoints": []
        },
    }

    def __init__(self):
        """Initialize Docker manager."""
        self._client: Optional[docker.DockerClient] = None
        self._initialized = False
        self._docker_available = False

    @property
    def MANAGEABLE_SERVICES(self) -> Dict[str, Any]:
        """
        Get all manageable services (core + compose-discovered).

        Combines hardcoded CORE_SERVICES with services discovered from
        compose/*-compose.yaml files via ComposeServiceRegistry.
        """
        # Start with core services
        services = dict(self.CORE_SERVICES)

        # Load services from ComposeServiceRegistry (compose-first approach)
        try:
            compose_registry = get_compose_registry()
            for service in compose_registry.get_services():
                # Skip if already in core services
                if service.service_name in services:
                    continue

                # Use service_name as the key
                service_config = {
                    "description": f"From {service.compose_file.name}",
                    "service_type": ServiceType.INTEGRATION,
                    "required": False,
                    "user_controllable": True,
                    "compose_file": str(service.compose_file),
                    "docker_service_name": service.service_name,
                    "endpoints": [],
                    "metadata": {
                        "compose_service_id": service.service_id,
                        "requires": service.requires,
                        "ports": service.ports,
                    },
                    # All compose services use compose env var resolution
                    "compose_discovered": True,
                }

                services[service.service_name] = service_config
                logger.debug(f"Loaded compose service: {service.service_name}")

        except Exception as e:
            logger.warning(f"Failed to load services from compose registry: {e}")

        logger.debug(f"Loaded {len(services)} manageable services")
        return services

    def reload_services(self) -> None:
        """Force reload services from ComposeServiceRegistry."""
        registry = get_compose_registry()
        registry.reload()
        logger.info("ComposeServiceRegistry reloaded")

    def _template_to_service_type(self, template: Optional[str]) -> ServiceType:
        """Map service template name to ServiceType enum."""
        if not template:
            return ServiceType.INTEGRATION
        template_base = template.split('.')[0]  # Handle "memory.ui" -> "memory"
        mapping = {
            "memory": ServiceType.MEMORY_SOURCE,
            "llm": ServiceType.INTEGRATION,
            "transcription": ServiceType.INTEGRATION,
            "speaker_recognition": ServiceType.INTEGRATION,
            "workflow": ServiceType.WORKFLOW,
            "agent": ServiceType.AGENT,
            "mcp": ServiceType.MCP_SERVER,
        }
        return mapping.get(template_base, ServiceType.INTEGRATION)

    def _build_endpoints(self, instance) -> List[ServiceEndpoint]:
        """Build ServiceEndpoint list from ServiceConfig."""
        endpoints = []

        if instance.docker and instance.docker.ports:
            # Build URL from first port mapping
            port_config = instance.docker.ports[0]
            host_port = port_config.get('host', port_config.get('container'))
            protocol = port_config.get('protocol', 'http')

            # Use docker service name for internal URL
            docker_name = instance.docker.service_name or instance.service_id
            url = f"{protocol}://{docker_name}:{host_port}"

            # Determine integration type from UI category or tags
            integration_type = IntegrationType.REST
            tags = instance.ui.get('tags', [])
            if 'mcp' in tags:
                integration_type = IntegrationType.MCP

            # Get health check path from docker config
            health_path = "/health"
            if instance.docker.health:
                health_path = instance.docker.health.get('http_get', '/health')

            endpoints.append(ServiceEndpoint(
                url=url,
                integration_type=integration_type,
                health_check_path=health_path
            ))

        return endpoints

    def initialize(self) -> bool:
        """
        Initialize Docker client connection.

        Returns:
            True if Docker is available, False otherwise
        """
        if self._initialized:
            return self._docker_available

        try:
            self._client = docker.from_env()
            # Test connection
            self._client.ping()
            self._docker_available = True
            logger.info("Docker client initialized successfully")
        except DockerException as e:
            logger.warning(f"Docker not available: {e}")
            self._docker_available = False
        except Exception as e:
            logger.error(f"Failed to initialize Docker client: {e}")
            self._docker_available = False
        finally:
            self._initialized = True

        return self._docker_available

    def is_available(self) -> bool:
        """Check if Docker is available."""
        if not self._initialized:
            self.initialize()
        return self._docker_available

    def validate_service_name(self, service_name: str) -> tuple[bool, str]:
        """
        Validate service name format and whitelist.

        Args:
            service_name: Service name to validate

        Returns:
            Tuple of (valid: bool, error_message: str or None)
        """
        # Check for empty or None
        if not service_name:
            return False, "Service name cannot be empty"

        # Length check (prevent excessively long names)
        if len(service_name) > 100:
            return False, "Service name is too long"

        # Format validation - only allow alphanumeric, hyphens, underscores
        if not SERVICE_NAME_PATTERN.match(service_name):
            return False, "Invalid service name format"

        # Whitelist check - needs instance access for dynamic MANAGEABLE_SERVICES
        available_services = list(self.MANAGEABLE_SERVICES.keys())
        if service_name not in self.MANAGEABLE_SERVICES:
            logger.warning(f"Service '{service_name}' not in MANAGEABLE_SERVICES. Available: {available_services}")
            return False, "Service not found"

        logger.debug(f"Service '{service_name}' validated OK")
        return True, None

    def _get_container_name(self, service_name: str) -> str:
        """
        Get the actual Docker container name for a service.

        Services may have a different container name than their service_id.
        E.g., service_id='chronicle' -> container='chronicle-backend'

        Args:
            service_name: Service ID from MANAGEABLE_SERVICES

        Returns:
            Docker container name to use for API calls
        """
        config = self.MANAGEABLE_SERVICES.get(service_name, {})
        return config.get("docker_service_name", service_name)

    def get_service_info(self, service_name: str) -> ServiceInfo:
        """
        Get information about a specific service.

        Args:
            service_name: Name of the service/container

        Returns:
            ServiceInfo object with service details
        """
        # Validate service name first
        valid, _ = self.validate_service_name(service_name)
        if not valid:
            logger.warning(f"Invalid service name attempted: {repr(service_name)}")
            return ServiceInfo(
                name=service_name,
                container_id=None,
                status=ServiceStatus.UNKNOWN,
                service_type=ServiceType.APPLICATION,
                image=None,
                created=None,
                ports={},
                health=None,
                endpoints=[],
                error="Service not found"
            )

        service_config = self.MANAGEABLE_SERVICES[service_name]

        if not self.is_available():
            return ServiceInfo(
                name=service_name,
                container_id=None,
                status=ServiceStatus.UNKNOWN,
                service_type=service_config["service_type"],
                image=None,
                created=None,
                ports={},
                health=None,
                endpoints=service_config.get("endpoints", []),
                description=service_config.get("description"),
                error="Docker not available"
            )

        try:
            # Use docker_service_name if specified (e.g., "mem0" for "openmemory" service)
            docker_container_name = service_config.get("docker_service_name", service_name)

            # Try to find container by exact name first
            container = None
            try:
                container = self._client.containers.get(docker_container_name)
            except NotFound:
                # Container name may have project prefix (e.g., "ushadow-wiz-frame-chronicle-backend")
                # Search by compose service label, preferring our project
                import os
                current_project = os.environ.get("COMPOSE_PROJECT_NAME", "ushadow")

                containers = self._client.containers.list(
                    all=True,
                    filters={"label": f"com.docker.compose.service={docker_container_name}"}
                )
                if containers:
                    # Prefer containers from current project, then infra
                    preferred_projects = [current_project, "infra"]
                    for project in preferred_projects:
                        for c in containers:
                            labels = c.labels or {}
                            if labels.get("com.docker.compose.project") == project:
                                container = c
                                break
                        if container:
                            break
                    # Fall back to first container if no preferred project found
                    if not container:
                        container = containers[0]
                        logger.warning(
                            f"Container {docker_container_name} found but not in project '{current_project}'. "
                            f"Using: {container.name} (project: {container.labels.get('com.docker.compose.project', 'unknown')})"
                        )

            if not container:
                raise NotFound(f"Container not found: {docker_container_name}")

            # Extract port mappings
            ports = {}
            if container.attrs.get("NetworkSettings", {}).get("Ports"):
                for container_port, host_bindings in container.attrs["NetworkSettings"]["Ports"].items():
                    if host_bindings:
                        for binding in host_bindings:
                            host_port = binding.get("HostPort")
                            if host_port:
                                ports[container_port] = host_port

            # Get health status if available
            health = None
            if container.attrs.get("State", {}).get("Health"):
                health = container.attrs["State"]["Health"].get("Status")

            return ServiceInfo(
                name=service_name,
                container_id=container.id[:12],
                status=ServiceStatus(container.status.lower()) if container.status.lower() in [s.value for s in ServiceStatus] else ServiceStatus.UNKNOWN,
                service_type=service_config["service_type"],
                image=container.image.tags[0] if container.image.tags else container.image.short_id,
                created=datetime.fromisoformat(container.attrs["Created"].replace("Z", "+00:00")),
                ports=ports,
                health=health,
                endpoints=service_config.get("endpoints", []),
                description=service_config.get("description"),
                metadata=service_config.get("metadata")
            )

        except NotFound:
            return ServiceInfo(
                name=service_name,
                container_id=None,
                status=ServiceStatus.NOT_FOUND,
                service_type=service_config["service_type"],
                image=None,
                created=None,
                ports={},
                health=None,
                endpoints=service_config.get("endpoints", []),
                description=service_config.get("description"),
                metadata=service_config.get("metadata")
            )
        except Exception as e:
            # Log detailed error but return generic message to user
            logger.error(f"Error getting service info for {service_name}: {e}")
            return ServiceInfo(
                name=service_name,
                container_id=None,
                status=ServiceStatus.UNKNOWN,
                service_type=service_config["service_type"],
                image=None,
                created=None,
                ports={},
                health=None,
                endpoints=service_config.get("endpoints", []),
                description=service_config.get("description"),
                error="Unable to retrieve service information"
            )

    def list_services(
        self,
        user_controllable_only: bool = True,
        service_type: Optional[ServiceType] = None
    ) -> List[ServiceInfo]:
        """
        List all manageable services and their status.

        Args:
            user_controllable_only: If True, only return services users can control
            service_type: Optional filter by service type

        Returns:
            List of ServiceInfo objects
        """
        services = []
        for service_name, config in self.MANAGEABLE_SERVICES.items():
            # Filter by user controllable flag
            if user_controllable_only and not config.get("user_controllable", True):
                continue

            # Filter by service type
            if service_type and config.get("service_type") != service_type:
                continue

            service_info = self.get_service_info(service_name)
            services.append(service_info)

        return services

    async def start_service(self, service_name: str) -> tuple[bool, str]:
        """
        Start a Docker service.

        Args:
            service_name: Name of the service to start

        Returns:
            Tuple of (success: bool, message: str)
        """
        logger.info(f"start_service called with: {repr(service_name)}")

        # Validate service name first
        valid, error_msg = self.validate_service_name(service_name)
        if not valid:
            logger.warning(f"Validation failed for {repr(service_name)}: {error_msg}")
            return False, "Service not found"

        if not self.is_available():
            return False, "Docker not available"

        # Allow starting any service - user_controllable only restricts stopping/deleting
        container_name = self._get_container_name(service_name)

        try:
            container = self._client.containers.get(container_name)

            if container.status == "running":
                return True, f"Service '{service_name}' is already running"

            container.start()
            logger.info(f"Started service: {service_name} (container: {container_name})")
            return True, f"Service '{service_name}' started successfully"

        except NotFound:
            # Container doesn't exist - try to start via compose if compose_file is specified
            compose_file = self.MANAGEABLE_SERVICES[service_name].get("compose_file")
            if compose_file:
                return await self._start_service_via_compose(service_name, compose_file)

            logger.error(f"Container not found for service: {service_name}")
            return False, "Service not found"
        except APIError as e:
            # Log detailed error but return generic message
            logger.error(f"Docker API error starting {service_name}: {e}")
            return False, "Failed to start service"
        except Exception as e:
            # Log detailed error but return generic message
            logger.error(f"Error starting {service_name}: {e}")
            return False, "Failed to start service"

    async def _build_env_vars_from_compose_config(
        self, service_name: str
    ) -> Dict[str, str]:
        """
        Build environment variables from user's saved compose configuration.

        For compose-discovered services, users configure env vars via the
        /api/compose/services/{id}/env endpoint. This method resolves those
        configurations to actual values.

        Args:
            service_name: Name of the service (docker_service_name)

        Returns:
            Dict of env var name -> resolved value
        """
        from src.config.omegaconf_settings import get_omegaconf_settings

        settings = get_omegaconf_settings()
        compose_registry = get_compose_registry()

        # Find the service in compose registry
        service = compose_registry.get_service_by_name(service_name)
        if not service:
            return {}

        # Load saved configuration
        config_key = f"service_env_config.{service.service_id.replace(':', '_')}"
        saved_config = await settings.get(config_key)
        saved_config = saved_config or {}

        resolved = {}

        # Load settings for auto-mapping fallback
        omega_config = await settings.load_config()
        from omegaconf import OmegaConf
        all_settings = OmegaConf.to_container(omega_config, resolve=True)
        api_keys = all_settings.get('api_keys', {})
        security_keys = all_settings.get('security', {})
        admin_keys = all_settings.get('admin', {})

        for env_var in service.all_env_vars:
            config = saved_config.get(env_var.name, {})
            source = config.get("source", "default")

            if source == "setting":
                setting_path = config.get("setting_path")
                if setting_path:
                    value = await settings.get(setting_path)
                    if value:
                        resolved[env_var.name] = str(value)
                    elif env_var.is_required:
                        logger.warning(
                            f"Service {service_name}: env var {env_var.name} "
                            f"references empty setting {setting_path}"
                        )

            elif source == "literal":
                value = config.get("value")
                if value:
                    resolved[env_var.name] = value
                elif env_var.is_required:
                    logger.warning(
                        f"Service {service_name}: env var {env_var.name} "
                        f"has no literal value configured"
                    )

            elif source == "default":
                # Try auto-mapping from settings before using compose default
                env_lower = env_var.name.lower()
                found_value = None

                # Check api_keys
                for key, value in api_keys.items():
                    if value and (key in env_lower or env_lower.replace('_', '') in key.replace('_', '')):
                        found_value = str(value)
                        logger.debug(f"Auto-mapped {env_var.name} from api_keys.{key}")
                        break

                # Check security keys
                if not found_value:
                    for key, value in security_keys.items():
                        if value and (key in env_lower or env_lower.replace('_', '') in key.replace('_', '')):
                            found_value = str(value)
                            logger.debug(f"Auto-mapped {env_var.name} from security.{key}")
                            break

                # Check admin keys (for ADMIN_PASSWORD, etc.)
                if not found_value:
                    for key, value in admin_keys.items():
                        if value and (key in env_lower or env_lower.replace('_', '') in key.replace('_', '')):
                            found_value = str(value)
                            logger.debug(f"Auto-mapped {env_var.name} from admin.{key}")
                            break

                if found_value:
                    resolved[env_var.name] = found_value

        logger.info(
            f"Resolved {len(resolved)} env vars for {service_name} from compose config"
        )
        return resolved

    async def _build_env_vars_for_service(
        self, service_name: str
    ) -> tuple[Dict[str, str], Dict[str, str]]:
        """
        Build environment variables for a service.

        Uses saved compose config for compose-discovered services, with fallback
        to CapabilityResolver for required capabilities.

        Args:
            service_name: Name of the service

        Returns:
            Tuple of (subprocess_env, container_env):
            - subprocess_env: Full environment for docker compose command (for variable substitution)
            - container_env: Just the resolved vars to inject into the container

        Raises:
            ValueError: If service has unresolved required capabilities
        """
        subprocess_env = os.environ.copy()  # For compose file variable substitution
        container_env: Dict[str, str] = {}  # For container env vars

        # Check if this is a compose-discovered service
        service_config = self.MANAGEABLE_SERVICES.get(service_name, {})
        is_compose_discovered = service_config.get("compose_discovered", False)

        if is_compose_discovered:
            # Use compose config approach
            try:
                container_env = await self._build_env_vars_from_compose_config(service_name)
                subprocess_env.update(container_env)

                # Also try CapabilityResolver for any capabilities declared in x-ushadow
                requires = service_config.get("metadata", {}).get("requires", [])
                if requires:
                    from src.services.capability_resolver import get_capability_resolver
                    resolver = get_capability_resolver()
                    resolver.reload()

                    # Get additional env vars from capability resolver
                    # This handles the case where user hasn't explicitly configured
                    # all env vars but has configured providers
                    try:
                        cap_env = await resolver.resolve_for_service(service_name)
                        # Only add vars not already configured
                        for key, value in cap_env.items():
                            if key not in container_env:
                                container_env[key] = value
                                subprocess_env[key] = value
                    except Exception as e:
                        logger.debug(f"CapabilityResolver fallback for {service_name}: {e}")

                return subprocess_env, container_env

            except Exception as e:
                logger.error(f"Failed to build env vars from compose config: {e}")
                raise ValueError(f"Failed to configure service: {e}")

        # Traditional approach using CapabilityResolver
        try:
            # Import here to avoid circular dependencies
            from src.services.capability_resolver import get_capability_resolver

            resolver = get_capability_resolver()

            # Reload to pick up any config changes (YAML files might have been edited)
            resolver.reload()

            # Validate first to get clear error messages
            validation = await resolver.validate_service(service_name)

            if not validation['can_start']:
                missing_caps = validation.get('missing_capabilities', [])
                missing_creds = validation.get('missing_credentials', [])

                error_parts = []
                if missing_caps:
                    error_parts.append("Missing capabilities:")
                    for cap in missing_caps:
                        error_parts.append(f"  - {cap['capability']}: {cap['message']}")

                if missing_creds:
                    error_parts.append("Missing credentials:")
                    for cred in missing_creds:
                        link_hint = f" (get at: {cred['link']})" if cred.get('link') else ""
                        error_parts.append(
                            f"  - {cred['label']}: set {cred['settings_path']}{link_hint}"
                        )

                logger.error(f"Service {service_name} cannot start:\n" + "\n".join(error_parts))
                raise ValueError("\n".join(error_parts))

            # Log any warnings
            for warning in validation.get('warnings', []):
                logger.warning(f"Service {service_name}: {warning}")

            # Resolve all env vars for the container
            container_env = await resolver.resolve_for_service(service_name)

            # Also add to subprocess env for compose file substitution
            subprocess_env.update(container_env)

            logger.info(
                f"Resolved {len(container_env)} env vars for {service_name} "
                f"via capability resolver"
            )

        except ValueError:
            # Re-raise validation errors
            raise
        except Exception as e:
            logger.error(f"Failed to resolve env vars for {service_name}: {e}")
            raise ValueError(f"Failed to configure service: {e}")

        return subprocess_env, container_env

    async def _start_service_via_compose(self, service_name: str, compose_file: str) -> tuple[bool, str]:
        """
        Start a service using docker-compose.

        Args:
            service_name: Name of the service to start
            compose_file: Relative path to the compose file (from project root)

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            # Translate relative paths to container mount points
            # compose/xxx.yaml -> /compose/xxx.yaml (mounted in container)
            # docker-compose.infra.yml -> /config/../docker-compose.infra.yml (project root)
            if compose_file.startswith("compose/"):
                # Compose files are mounted at /compose
                compose_path = Path("/") / compose_file
            elif compose_file.startswith("docker-compose"):
                # Root compose files - check /config parent or current dir
                compose_path = Path("/config").parent / compose_file
                if not compose_path.exists():
                    compose_path = Path(compose_file)
            else:
                compose_path = Path(compose_file)

            if not compose_path.exists():
                logger.error(f"Compose file not found: {compose_path}")
                return False, "Service configuration not found"

            # Get the directory containing the compose file for working directory
            compose_dir = compose_path.parent if compose_path.parent.exists() else Path(".")

            # Run docker-compose up -d for this service
            # Use COMPOSE_PROJECT_NAME from environment for consistent container naming
            import os
            project_name = os.environ.get("COMPOSE_PROJECT_NAME")
            if not project_name:
                # Fallback for infra services or if env not set
                if "infra" in str(compose_path):
                    project_name = "infra"
                else:
                    project_name = "ushadow"

            # Check if service requires a specific compose profile
            compose_profile = self.MANAGEABLE_SERVICES[service_name].get("compose_profile")

            # Get docker service name (may differ from service_name)
            docker_service_name = self.MANAGEABLE_SERVICES[service_name].get("docker_service_name", service_name)

            # Build environment variables from service configuration
            # All env vars are passed via subprocess_env for compose ${VAR} substitution
            subprocess_env, container_env = await self._build_env_vars_for_service(service_name)

            logger.info(f"Resolved {len(container_env)} env vars for {service_name} (passing directly)")

            # Build docker compose command with explicit env var passing
            # Using --env-file /dev/null to clear default .env loading
            # All env vars come from subprocess_env for ${VAR} substitution
            cmd = ["docker", "compose", "-f", str(compose_path)]
            if project_name:
                cmd.extend(["-p", project_name])
            if compose_profile:
                cmd.extend(["--profile", compose_profile])
            cmd.extend(["up", "-d", docker_service_name])

            # Log which env vars are being passed (without values for secrets)
            secret_keys = {'API_KEY', 'SECRET', 'PASSWORD', 'TOKEN'}
            logged_vars = []
            for key in container_env:
                is_secret = any(s in key.upper() for s in secret_keys)
                logged_vars.append(f"{key}={'***' if is_secret else container_env[key][:20]+'...' if len(container_env.get(key, '')) > 20 else container_env.get(key, '')}")
            logger.debug(f"Container env vars for {service_name}: {logged_vars}")

            result = subprocess.run(
                cmd,
                env=subprocess_env,  # All env vars passed here for compose variable substitution
                cwd=str(compose_dir),
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode == 0:
                logger.info(f"Started service via compose: {service_name}")
                return True, f"Service '{service_name}' started successfully"
            else:
                logger.error(f"Failed to start {service_name} via compose: {result.stderr}")
                # Extract useful error message from stderr
                error_msg = result.stderr.strip() if result.stderr else "Unknown error"
                # Truncate very long errors but keep useful info
                if len(error_msg) > 300:
                    error_msg = error_msg[:300] + "..."
                return False, f"Failed to start: {error_msg}"

        except subprocess.TimeoutExpired:
            logger.error(f"Timeout starting {service_name} via compose")
            return False, "Service start timeout"
        except ValueError as e:
            # Validation errors (missing credentials, etc.) - return the message
            logger.warning(f"Cannot start {service_name}: {e}")
            return False, str(e)
        except Exception as e:
            logger.error(f"Error starting {service_name} via compose: {e}")
            return False, "Failed to start service"

    def stop_service(self, service_name: str, timeout: int = 10) -> tuple[bool, str]:
        """
        Stop a Docker service.

        Args:
            service_name: Name of the service to stop
            timeout: Seconds to wait before killing the container

        Returns:
            Tuple of (success: bool, message: str)
        """
        # Validate service name first
        valid, _ = self.validate_service_name(service_name)
        if not valid:
            logger.warning(f"Invalid service name in stop_service: {repr(service_name)}")
            return False, "Service not found"

        if not self.is_available():
            return False, "Docker not available"

        # Check if service is user controllable
        if not self.MANAGEABLE_SERVICES[service_name].get("user_controllable", True):
            return False, "Operation not permitted"

        # Prevent stopping required services
        if self.MANAGEABLE_SERVICES[service_name].get("required", False):
            return False, "Operation not permitted"

        container_name = self._get_container_name(service_name)

        try:
            # Try to find container by exact name first
            container = None
            try:
                container = self._client.containers.get(container_name)
            except NotFound:
                # Container name may have project prefix - search by compose service label
                containers = self._client.containers.list(
                    all=True,
                    filters={"label": f"com.docker.compose.service={container_name}"}
                )
                if containers:
                    container = containers[0]

            if not container:
                logger.error(f"Container not found for service: {service_name} (container: {container_name})")
                return False, "Service not found"

            if container.status != "running":
                return True, f"Service '{service_name}' is not running"

            container.stop(timeout=timeout)
            logger.info(f"Stopped service: {service_name} (container: {container_name})")
            return True, f"Service '{service_name}' stopped successfully"

        except NotFound:
            logger.error(f"Container not found for service: {service_name}")
            return False, "Service not found"
        except APIError as e:
            # Log detailed error but return generic message
            logger.error(f"Docker API error stopping {service_name}: {e}")
            return False, "Failed to stop service"
        except Exception as e:
            # Log detailed error but return generic message
            logger.error(f"Error stopping {service_name}: {e}")
            return False, "Failed to stop service"

    def restart_service(self, service_name: str, timeout: int = 10, internal: bool = False) -> tuple[bool, str]:
        """
        Restart a Docker service.

        Args:
            service_name: Name of the service to restart
            timeout: Seconds to wait before killing the container
            internal: If True, bypass user_controllable check (for system-initiated restarts)

        Returns:
            Tuple of (success: bool, message: str)
        """
        # Validate service name first
        valid, _ = self.validate_service_name(service_name)
        if not valid:
            logger.warning(f"Invalid service name in restart_service: {repr(service_name)}")
            return False, "Service not found"

        if not self.is_available():
            return False, "Docker not available"

        # Check if service is user controllable (unless internal restart)
        if not internal and not self.MANAGEABLE_SERVICES[service_name].get("user_controllable", True):
            return False, "Operation not permitted"

        container_name = self._get_container_name(service_name)

        try:
            # Try to find container by exact name first
            try:
                container = self._client.containers.get(container_name)
            except NotFound:
                # If not found, search by docker-compose service label
                containers = self._client.containers.list(
                    filters={"label": f"com.docker.compose.service={container_name}"}
                )
                if not containers:
                    logger.error(f"Container not found for service: {service_name} (container: {container_name})")
                    return False, "Service not found"
                container = containers[0]  # Use first matching container

            container.restart(timeout=timeout)
            logger.info(f"Restarted service: {service_name} (container: {container_name})")
            return True, f"Service '{service_name}' restarted successfully"

        except NotFound:
            logger.error(f"Container not found for service: {service_name}")
            return False, "Service not found"
        except APIError as e:
            # Log detailed error but return generic message
            logger.error(f"Docker API error restarting {service_name}: {e}")
            return False, "Failed to restart service"
        except Exception as e:
            # Log detailed error but return generic message
            logger.error(f"Error restarting {service_name}: {e}")
            return False, "Failed to restart service"

    def get_service_logs(self, service_name: str, tail: int = 100) -> tuple[bool, str]:
        """
        Get logs from a Docker service.

        Args:
            service_name: Name of the service
            tail: Number of lines to retrieve from the end

        Returns:
            Tuple of (success: bool, logs: str)
        """
        # Validate service name first
        valid, _ = self.validate_service_name(service_name)
        if not valid:
            logger.warning(f"Invalid service name in get_service_logs: {repr(service_name)}")
            return False, "Service not found"

        if not self.is_available():
            return False, "Docker not available"

        container_name = self._get_container_name(service_name)

        try:
            container = self._client.containers.get(container_name)
            logs = container.logs(tail=tail, timestamps=True).decode("utf-8")
            return True, logs

        except NotFound:
            logger.error(f"Container not found for service: {service_name} (container: {container_name})")
            return False, "Service not found"
        except Exception as e:
            # Log detailed error but return generic message
            logger.error(f"Error getting logs for {service_name}: {e}")
            return False, "Failed to retrieve logs"

    def add_dynamic_service(
        self,
        service_name: str,
        service_config: Dict[str, Any]
    ) -> tuple[bool, str]:
        """
        Add a dynamic service configuration (e.g., for Pieces app or custom integrations).

        This allows runtime registration of new services without code changes.

        Args:
            service_name: Unique name for the service
            service_config: Service configuration dict with keys:
                - description: str
                - service_type: ServiceType
                - endpoints: List[ServiceEndpoint]
                - user_controllable: bool (optional, default True)
                - compose_file: str (optional)
                - metadata: dict (optional)

        Returns:
            Tuple of (success: bool, message: str)
        """
        # Validate service name format
        if not SERVICE_NAME_PATTERN.match(service_name):
            return False, "Invalid service name format"

        # Check if service already exists
        if service_name in self.MANAGEABLE_SERVICES:
            return False, f"Service '{service_name}' already exists"

        # Validate required fields
        required_fields = ["description", "service_type", "endpoints"]
        for field in required_fields:
            if field not in service_config:
                return False, f"Missing required field: {field}"

        # Add service to manageable services
        self.MANAGEABLE_SERVICES[service_name] = {
            "description": service_config["description"],
            "service_type": service_config["service_type"],
            "endpoints": service_config["endpoints"],
            "user_controllable": service_config.get("user_controllable", True),
            "required": False,  # Dynamic services are never required
            "compose_file": service_config.get("compose_file"),
            "metadata": service_config.get("metadata", {})
        }

        logger.info(f"Added dynamic service: {service_name}")
        return True, f"Service '{service_name}' registered successfully"


# Global instance
_docker_manager: Optional[DockerManager] = None


def get_docker_manager() -> DockerManager:
    """Get the global DockerManager instance."""
    global _docker_manager
    if _docker_manager is None:
        _docker_manager = DockerManager()
        _docker_manager.initialize()
    return _docker_manager
