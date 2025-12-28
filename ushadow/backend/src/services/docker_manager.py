"""Docker container orchestration manager for Ushadow.

This module provides centralized Docker container management for controlling
local services and integrations through the Ushadow backend API.

Services are loaded dynamically from ServiceRegistry (config/default-services.yaml)
with only core infrastructure defined here.
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

    Services are loaded dynamically from ServiceRegistry (config/default-services.yaml).
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
        self._services_cache: Optional[Dict[str, Any]] = None

    @property
    def MANAGEABLE_SERVICES(self) -> Dict[str, Any]:
        """
        Get all manageable services (core + dynamic from ServiceRegistry).

        This property replaces the old hardcoded MANAGEABLE_SERVICES dict.
        Services are loaded from config/default-services.yaml via ServiceRegistry.
        """
        if self._services_cache is not None:
            return self._services_cache

        # Start with core services
        services = dict(self.CORE_SERVICES)

        # Load dynamic services from ServiceRegistry
        try:
            registry = get_service_registry()
            for instance in registry.get_instances():
                # Skip if no docker compose file (cloud-only services)
                if not instance.docker_compose_file:
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
                    "metadata": instance.metadata,
                }

                # Add compose profile if specified
                if instance.docker_profile:
                    service_config["compose_profile"] = instance.docker_profile

                services[instance.service_id] = service_config
                logger.debug(f"Loaded dynamic service: {instance.service_id}")

        except Exception as e:
            logger.warning(f"Failed to load services from registry: {e}")

        self._services_cache = services
        logger.info(f"Loaded {len(services)} manageable services ({len(self.CORE_SERVICES)} core + {len(services) - len(self.CORE_SERVICES)} dynamic)")
        return services

    def reload_services(self) -> None:
        """Clear the services cache to reload from ServiceRegistry."""
        self._services_cache = None
        # Also reload the registry
        registry = get_service_registry()
        registry.get_instances(reload=True)
        logger.info("Services cache cleared - will reload on next access")

    def _template_to_service_type(self, template: str) -> ServiceType:
        """Map service template name to ServiceType enum."""
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

        # Get URL from config overrides or connection_url
        url = instance.config_overrides.get("server_url") or instance.connection_url
        if url:
            # Determine integration type from template
            integration_type = IntegrationType.REST
            if "mcp" in instance.template.lower():
                integration_type = IntegrationType.MCP

            endpoints.append(ServiceEndpoint(
                url=url,
                integration_type=integration_type,
                health_check_path="/health"
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
        if service_name not in self.MANAGEABLE_SERVICES:
            return False, "Service not found"

        return True, None

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
            container = self._client.containers.get(docker_container_name)

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
        # Validate service name first
        valid, _ = self.validate_service_name(service_name)
        if not valid:
            logger.warning(f"Invalid service name in start_service: {repr(service_name)}")
            return False, "Service not found"

        if not self.is_available():
            return False, "Docker not available"

        # Allow starting any service - user_controllable only restricts stopping/deleting

        try:
            container = self._client.containers.get(service_name)

            if container.status == "running":
                return True, f"Service '{service_name}' is already running"

            container.start()
            logger.info(f"Started service: {service_name}")
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

    async def _build_env_vars_for_service(self, service_name: str) -> Dict[str, str]:
        """
        Build environment variables for a service from its configuration.

        Maps service config fields to environment variables using the schema's env_var property.

        Args:
            service_name: Name of the service

        Returns:
            Dictionary of environment variables
        """
        env = os.environ.copy()  # Start with system environment

        try:
            # Import here to avoid circular dependencies
            from src.services.service_registry import get_service_registry
            from src.services.omegaconf_settings import get_omegaconf_settings

            # Get service registry and effective schema
            registry = get_service_registry()
            schema = registry.get_effective_schema(service_name)

            # Get OmegaConf settings manager
            settings = get_omegaconf_settings()

            # Map config fields to environment variables
            for field in schema:
                env_var_name = field.env_var
                if not env_var_name:
                    continue  # Skip fields without env_var mapping

                # Try to get value from different possible locations
                field_value = None

                # 1. Try service-specific preferences
                try:
                    key_path = f"service_preferences.{service_name}.{field.key}"
                    field_value = await settings.get(key_path)
                    if field_value:
                        logger.debug(f"Found {field.key} in {key_path}")
                except Exception as e:
                    logger.debug(f"Not in service_preferences: {e}")

                # 2. Try shared api_keys namespace
                if not field_value and field.key.endswith('_api_key'):
                    try:
                        key_path = f"api_keys.{field.key}"
                        field_value = await settings.get(key_path)
                        if field_value:
                            logger.debug(f"Found {field.key} in {key_path}")
                    except Exception as e:
                        logger.warning(f"Error checking api_keys.{field.key}: {e}")

                # 3. Inject if we found a value
                if field_value:
                    env[env_var_name] = str(field_value)
                    logger.debug(f"Injecting env var: {env_var_name}=*** for {service_name}")
                else:
                    logger.debug(f"No value found for {field.key} (env var: {env_var_name})")

        except Exception as e:
            logger.warning(f"Could not load service config for {service_name}: {e}")
            logger.warning("Starting service with system environment variables only")

        return env

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
            # Compose file is relative to project root
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
            env = await self._build_env_vars_for_service(service_name)

            cmd = ["docker", "compose", "-f", str(compose_path)]
            if project_name:
                cmd.extend(["-p", project_name])
            if compose_profile:
                cmd.extend(["--profile", compose_profile])
            cmd.extend(["up", "-d", docker_service_name])

            result = subprocess.run(
                cmd,
                env=env,  # Inject environment variables
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

        try:
            container = self._client.containers.get(service_name)

            if container.status != "running":
                return True, f"Service '{service_name}' is not running"

            container.stop(timeout=timeout)
            logger.info(f"Stopped service: {service_name}")
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

        try:
            # Try to find container by exact name first
            try:
                container = self._client.containers.get(service_name)
            except NotFound:
                # If not found, search by docker-compose service label
                containers = self._client.containers.list(
                    filters={"label": f"com.docker.compose.service={service_name}"}
                )
                if not containers:
                    logger.error(f"Container not found for service: {service_name}")
                    return False, "Service not found"
                container = containers[0]  # Use first matching container

            container.restart(timeout=timeout)
            logger.info(f"Restarted service: {service_name} (container: {container.name})")
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

        try:
            container = self._client.containers.get(service_name)
            logs = container.logs(tail=tail, timestamps=True).decode("utf-8")
            return True, logs

        except NotFound:
            logger.error(f"Container not found for service: {service_name}")
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
