"""Docker container orchestration manager for Ushadow.

This module provides centralized Docker container management for controlling
local services and integrations through the Ushadow backend API.

Services are loaded dynamically from ServiceRegistry (config/services/*.yaml)
with only core infrastructure defined here. Docker Compose files are generated
on-demand by DockerComposeGenerator.
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
from src.services.docker_compose_generator import get_compose_generator

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
    Docker Compose files are generated on-demand by DockerComposeGenerator.
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
        Services are loaded from config/services/*.yaml via ServiceRegistry.
        """
        if self._services_cache is not None:
            return self._services_cache

        # Start with core services
        services = dict(self.CORE_SERVICES)

        # Load dynamic services from ServiceRegistry (new API)
        try:
            registry = get_service_registry()
            all_services = registry.get_all_services()

            for service_id, service in all_services.items():
                # Skip if no containers (cloud-only services)
                if not service.containers:
                    continue

                # Skip if already in core services
                if service_id in services:
                    continue

                # Map service type to ServiceType enum
                service_type = self._service_type_to_enum(service.type)

                # Get the primary container name for Docker operations
                primary_container = service.containers[0].name if service.containers else service_id

                # Build service config from new Service model
                service_config = {
                    "description": service.description or service.name,
                    "service_type": service_type,
                    "required": False,
                    "user_controllable": True,
                    "docker_service_name": primary_container,
                    "endpoints": self._build_endpoints_from_service(service),
                    "containers": [c.name for c in service.containers],
                }

                services[service_id] = service_config
                logger.debug(f"Loaded dynamic service: {service_id} -> container: {primary_container}")

        except Exception as e:
            logger.warning(f"Failed to load services from registry: {e}")
            import traceback
            traceback.print_exc()

        self._services_cache = services
        logger.info(f"Loaded {len(services)} manageable services ({len(self.CORE_SERVICES)} core + {len(services) - len(self.CORE_SERVICES)} dynamic)")
        return services

    def reload_services(self) -> None:
        """Clear the services cache to reload from ServiceRegistry."""
        self._services_cache = None
        # Also reload the registry
        registry = get_service_registry()
        registry.get_all_services(reload=True)
        logger.info("Services cache cleared - will reload on next access")

    def _service_type_to_enum(self, service_type: str) -> ServiceType:
        """Map service type string to ServiceType enum."""
        mapping = {
            "memory": ServiceType.MEMORY_SOURCE,
            "llm": ServiceType.INTEGRATION,
            "transcription": ServiceType.INTEGRATION,
            "conversation_engine": ServiceType.APPLICATION,
            "infrastructure": ServiceType.INFRASTRUCTURE,
            "workflow": ServiceType.WORKFLOW,
            "agent": ServiceType.AGENT,
            "mcp": ServiceType.MCP_SERVER,
        }
        return mapping.get(service_type, ServiceType.INTEGRATION)

    def _build_endpoints_from_service(self, service) -> List[ServiceEndpoint]:
        """Build ServiceEndpoint list from new Service model."""
        endpoints = []

        # Get URL from api_base or container ports
        url = service.api_base
        if not url and service.containers:
            # Try to build URL from first container's ports
            container = service.containers[0]
            if container.ports:
                port = container.ports[0]
                host_port = port.host or port.container
                url = f"http://localhost:{host_port}"

        if url:
            # Determine integration type from service type
            integration_type = IntegrationType.REST
            if service.type == "mcp":
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
            # Container doesn't exist - generate compose file if needed
            compose_file = self.MANAGEABLE_SERVICES[service_name].get("compose_file")

            if not compose_file:
                # Try to generate a compose file for this service
                compose_file = await self._ensure_compose_file(service_name)

            if compose_file:
                return await self._start_service_via_compose(service_name, compose_file)

            logger.error(f"Container not found and no compose file for service: {service_name}")
            return False, "Service not found - no container or compose file"
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

        Uses ServiceRegistry to get required env vars and resolves them from settings.

        Args:
            service_name: Name of the service

        Returns:
            Dictionary of environment variables
        """
        env = os.environ.copy()  # Start with system environment

        try:
            from src.services.omegaconf_settings import get_omegaconf_settings

            registry = get_service_registry()
            service = registry.get_service(service_name)

            if not service:
                logger.warning(f"Service not found: {service_name}")
                return env

            settings = get_omegaconf_settings()

            # Get all required env vars for this service
            required_vars = service.get_required_env_vars()

            for env_var in required_vars:
                # Get mapping for this env var (service override or global)
                mapping = registry.get_env_mapping_for_service(service, env_var)

                if not mapping:
                    logger.debug(f"No mapping for {env_var}")
                    continue

                # Strip prefix if present
                config_path = mapping
                if config_path.startswith("secrets."):
                    config_path = config_path[8:]
                elif config_path.startswith("settings."):
                    config_path = config_path[9:]

                try:
                    value = await settings.get(config_path)
                    if value and str(value).strip():
                        env[env_var] = str(value)
                        logger.debug(f"Resolved {env_var} from {config_path}")
                except Exception as e:
                    logger.warning(f"Could not resolve {env_var}: {e}")

        except Exception as e:
            logger.warning(f"Could not load service config for {service_name}: {e}")
            import traceback
            traceback.print_exc()

        return env

    def _ensure_network_exists(self) -> bool:
        """Ensure the infra-network exists for inter-service communication."""
        try:
            if not self.is_available():
                return False

            network_name = "infra-network"
            try:
                self._client.networks.get(network_name)
                return True
            except NotFound:
                # Create the network
                self._client.networks.create(
                    network_name,
                    driver="bridge",
                    check_duplicate=True
                )
                logger.info(f"Created Docker network: {network_name}")
                return True
        except Exception as e:
            logger.error(f"Failed to ensure network exists: {e}")
            return False

    async def _ensure_compose_file(self, service_name: str) -> Optional[str]:
        """
        Generate compose file for a service.

        Always regenerates to pick up any changes in service definition YAML.

        Args:
            service_name: Name of the service

        Returns:
            Path to compose file, or None if cannot generate
        """
        try:
            # Reload service registry to pick up any YAML changes
            registry = get_service_registry()
            registry.reload()

            # Clear our local services cache too
            self._services_cache = None

            generator = get_compose_generator()

            # Get settings manager for env var resolution
            from src.services.omegaconf_settings import get_omegaconf_settings
            settings = get_omegaconf_settings()

            # Always regenerate to pick up any YAML changes
            logger.info(f"Generating compose file for service: {service_name}")
            generated = await generator.generate_for_service(service_name, settings)

            if not generated:
                logger.warning(f"Could not generate compose file for {service_name}")
                return None

            # Write compose file
            compose_path = await generator.write_compose_file(generated, write_env=True)
            logger.info(f"Generated compose file: {compose_path}")

            # Update service config with compose file path
            if service_name in self._services_cache:
                self._services_cache[service_name]["compose_file"] = str(compose_path)

            return str(compose_path)

        except Exception as e:
            logger.error(f"Error ensuring compose file for {service_name}: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def _start_service_via_compose(self, service_name: str, compose_file: str) -> tuple[bool, str]:
        """
        Start a service using docker-compose.

        Args:
            service_name: Name of the service to start
            compose_file: Path to the compose file (absolute or relative)

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            compose_path = Path(compose_file)

            if not compose_path.exists():
                logger.error(f"Compose file not found: {compose_path}")
                return False, "Service configuration not found"

            # Ensure Docker network exists
            self._ensure_network_exists()

            # Get the directory containing the compose file for working directory
            compose_dir = compose_path.parent if compose_path.parent.exists() else Path(".")

            # Determine project name
            # Generated files use service name as project
            # Legacy files use their location-based names
            if "generated" in str(compose_path):
                project_name = service_name
            elif "infra" in str(compose_path):
                project_name = "infra"
            elif "memory" in str(compose_path):
                project_name = "memory"
            else:
                project_name = service_name  # Default to service name

            # Check if service requires a specific compose profile
            compose_profile = self.MANAGEABLE_SERVICES[service_name].get("compose_profile")

            # Get docker service name (may differ from service_name)
            # For generated compose files, the container names are in the service definition
            docker_service_name = self.MANAGEABLE_SERVICES[service_name].get("docker_service_name", service_name)

            # Build environment variables from service configuration
            env = await self._build_env_vars_for_service(service_name)

            # Also load from .env file if it exists alongside compose file
            env_file = compose_path.with_suffix('.env')
            if env_file.exists():
                logger.debug(f"Loading environment from: {env_file}")
                with open(env_file, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, _, value = line.partition('=')
                            # Remove quotes if present
                            value = value.strip('"').strip("'")
                            env[key] = value

            cmd = ["docker", "compose", "-f", str(compose_path)]
            if project_name:
                cmd.extend(["-p", project_name])
            if compose_profile:
                cmd.extend(["--profile", compose_profile])
            cmd.extend(["up", "-d", docker_service_name])

            logger.info(f"Running: {' '.join(cmd)}")

            result = subprocess.run(
                cmd,
                env=env,
                cwd=str(compose_dir),
                capture_output=True,
                text=True,
                timeout=120  # Longer timeout for image pulls
            )

            if result.returncode == 0:
                logger.info(f"Started service via compose: {service_name}")
                return True, f"Service '{service_name}' started successfully"
            else:
                logger.error(f"Failed to start {service_name} via compose: {result.stderr}")
                # Extract the most relevant error from stderr
                error_msg = self._parse_docker_error(result.stderr)
                return False, error_msg

        except subprocess.TimeoutExpired:
            logger.error(f"Timeout starting {service_name} via compose")
            return False, "Service start timeout - image may still be pulling"
        except Exception as e:
            logger.error(f"Error starting {service_name} via compose: {e}")
            return False, f"Failed to start service: {str(e)}"

    def _parse_docker_error(self, stderr: str) -> str:
        """
        Parse Docker stderr to extract the most relevant error message.

        Args:
            stderr: Full stderr output from docker compose

        Returns:
            User-friendly error message
        """
        if not stderr:
            return "Unknown error"

        # Split into lines and filter
        lines = stderr.strip().split('\n')

        # Look for "Error response from daemon" which is the actual error
        error_lines = []
        for line in lines:
            # Skip warning lines about orphan containers
            if 'level=warning' in line and 'orphan containers' in line:
                continue
            # Skip empty lines
            if not line.strip():
                continue
            # Capture error response lines
            if 'Error response from daemon' in line or 'error' in line.lower():
                error_lines.append(line.strip())

        if error_lines:
            # Return the most specific error (usually the last one)
            return error_lines[-1]

        # If no specific error found, return last non-empty line
        for line in reversed(lines):
            if line.strip():
                return line.strip()

        return "Unknown error"

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

        # Get docker container name (may differ from service_name)
        docker_service_name = self.MANAGEABLE_SERVICES[service_name].get("docker_service_name", service_name)

        try:
            container = self._client.containers.get(docker_service_name)

            if container.status != "running":
                return True, f"Service '{service_name}' is not running"

            container.stop(timeout=timeout)
            logger.info(f"Stopped service: {service_name}")
            return True, f"Service '{service_name}' stopped successfully"

        except NotFound:
            # Try stopping via compose if we have a compose file
            compose_file = self.MANAGEABLE_SERVICES[service_name].get("compose_file")
            if compose_file:
                return self._stop_service_via_compose(service_name, compose_file, timeout)

            # Also check for generated compose file
            generator = get_compose_generator()
            if generator.compose_exists_for_service(service_name):
                compose_path = str(generator.get_compose_path_for_service(service_name))
                return self._stop_service_via_compose(service_name, compose_path, timeout)

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

    def _stop_service_via_compose(
        self,
        service_name: str,
        compose_file: str,
        timeout: int = 10
    ) -> tuple[bool, str]:
        """
        Stop a service using docker-compose.

        Args:
            service_name: Name of the service to stop
            compose_file: Path to the compose file
            timeout: Seconds to wait before killing

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            compose_path = Path(compose_file)
            if not compose_path.exists():
                return False, "Service configuration not found"

            compose_dir = compose_path.parent

            # Determine project name (same logic as start)
            if "generated" in str(compose_path):
                project_name = service_name
            elif "infra" in str(compose_path):
                project_name = "infra"
            elif "memory" in str(compose_path):
                project_name = "memory"
            else:
                project_name = service_name

            docker_service_name = self.MANAGEABLE_SERVICES[service_name].get(
                "docker_service_name", service_name
            )

            cmd = ["docker", "compose", "-f", str(compose_path)]
            if project_name:
                cmd.extend(["-p", project_name])
            cmd.extend(["stop", "-t", str(timeout), docker_service_name])

            logger.info(f"Running: {' '.join(cmd)}")

            result = subprocess.run(
                cmd,
                cwd=str(compose_dir),
                capture_output=True,
                text=True,
                timeout=timeout + 30
            )

            if result.returncode == 0:
                logger.info(f"Stopped service via compose: {service_name}")
                return True, f"Service '{service_name}' stopped successfully"
            else:
                logger.error(f"Failed to stop {service_name} via compose: {result.stderr}")
                return False, "Failed to stop service"

        except subprocess.TimeoutExpired:
            logger.error(f"Timeout stopping {service_name} via compose")
            return False, "Service stop timeout"
        except Exception as e:
            logger.error(f"Error stopping {service_name} via compose: {e}")
            return False, f"Failed to stop service: {str(e)}"

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
