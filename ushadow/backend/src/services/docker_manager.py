"""Docker container orchestration manager for Ushadow.

This module provides centralized Docker container management for controlling
local services and integrations through the Ushadow backend API.

Services are loaded dynamically from ServiceRegistry (config/services/*.yaml)
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

from src.services.service_registry import get_service_registry

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

    Services are loaded dynamically from ServiceRegistry (config/services/*.yaml).
    Only core infrastructure is defined here as CORE_SERVICES.
    """

    # Core infrastructure services that are always available
    # These don't come from ServiceRegistry - they're required for the system
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
        Get all manageable services (core + dynamic from ServiceRegistry).

        Combines hardcoded CORE_SERVICES with dynamic services from config/services/*.yaml.
        ServiceRegistry handles its own caching, so no additional cache needed here.
        """
        # Start with core services
        services = dict(self.CORE_SERVICES)

        # Load dynamic services from ServiceRegistry
        try:
            registry = get_service_registry()
            all_instances = registry.get_instances()
            logger.debug(f"ServiceRegistry returned {len(all_instances)} instances")
            if len(all_instances) == 0:
                logger.warning("No services found in ServiceRegistry! Check config/services/ directory.")
            for instance in all_instances:
                logger.debug(f"Processing service: {instance.service_id}")
                # Skip if no docker compose file (cloud-only services)
                if not instance.docker_compose_file:
                    logger.debug(f"Skipping {instance.service_id} - no compose file")
                    continue

                # Skip if already in core services
                if instance.service_id in services:
                    continue

                # Map template to ServiceType
                service_type = self._template_to_service_type(instance.template)

                # Build service config from ServiceConfig
                service_config = {
                    "description": instance.description or instance.name,
                    "service_type": service_type,
                    "required": False,
                    "user_controllable": True,
                    "compose_file": instance.docker_compose_file,
                    "docker_service_name": instance.docker_service_name or instance.service_id,
                    "endpoints": self._build_endpoints(instance),
                    "metadata": instance.ui,  # UI metadata (icon, category, tags, etc.)
                }

                services[instance.service_id] = service_config
                logger.debug(f"Loaded dynamic service: {instance.service_id}")

        except Exception as e:
            logger.warning(f"Failed to load services from registry: {e}")

        logger.debug(f"Loaded {len(services)} manageable services")
        return services

    def reload_services(self) -> None:
        """Force reload services from ServiceRegistry."""
        registry = get_service_registry()
        registry.reload()
        logger.info("ServiceRegistry reloaded")

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
                # Container name may have project prefix (e.g., "ushadow-chronicle-backend")
                # Search by compose service label as fallback
                containers = self._client.containers.list(
                    all=True,
                    filters={"label": f"com.docker.compose.service={docker_container_name}"}
                )
                if containers:
                    container = containers[0]

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

    async def _build_env_vars_for_service(
        self, service_name: str
    ) -> tuple[Dict[str, str], Dict[str, str]]:
        """
        Build environment variables for a service using CapabilityResolver.

        Uses the capability-based composition pattern:
        1. Load service definition from config/services/{service_name}.yaml
        2. Resolve each capability the service `uses:` to provider credentials
        3. Map canonical env vars to service-expected env vars

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
            # Determine project name based on compose file location
            if "infra" in str(compose_path):
                project_name = "infra"
            elif "memory" in str(compose_path):
                project_name = "memory"
            else:
                project_name = None

            # Check if service requires a specific compose profile
            compose_profile = self.MANAGEABLE_SERVICES[service_name].get("compose_profile")

            # Get docker service name (may differ from service_name)
            docker_service_name = self.MANAGEABLE_SERVICES[service_name].get("docker_service_name", service_name)

            # Build environment variables from service configuration
            subprocess_env, container_env = await self._build_env_vars_for_service(service_name)

            # Write container env vars to the service-specific env file
            # Compose files reference ../config/{service}.env which resolves to /config/{service}.env
            # This file is read by docker compose and injected into the container
            service_env_path = Path("/config") / f"{service_name}.env"
            with open(service_env_path, 'w') as f:
                f.write(f"# Auto-generated by CapabilityResolver for {service_name}\n")
                f.write(f"# DO NOT EDIT - regenerated on each service start\n\n")
                for key, value in container_env.items():
                    # Escape special characters in values
                    escaped_value = value.replace('\\', '\\\\').replace('"', '\\"')
                    f.write(f'{key}="{escaped_value}"\n')

            logger.info(f"Wrote {len(container_env)} env vars to {service_env_path}")

            cmd = ["docker", "compose", "-f", str(compose_path)]
            if project_name:
                cmd.extend(["-p", project_name])
            if compose_profile:
                cmd.extend(["--profile", compose_profile])
            cmd.extend(["up", "-d", docker_service_name])

            result = subprocess.run(
                cmd,
                env=subprocess_env,  # For compose file variable substitution
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
                return False, "Failed to start service"

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
