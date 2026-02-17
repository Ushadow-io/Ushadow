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
import yaml
from pathlib import Path
from enum import Enum
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime

import docker
from docker.errors import DockerException, NotFound, APIError

from src.config.secrets import mask_if_secret
from src.services.compose_registry import get_compose_registry
from src.utils.environment import get_compose_project_name

logger = logging.getLogger(__name__)

# Service name validation pattern (alphanumeric, hyphens, underscores only)
SERVICE_NAME_PATTERN = re.compile(r'^[a-z0-9_-]+$')

# Pattern to extract env var and default from port strings like "${CHRONICLE_PORT:-8080}"
PORT_ENV_VAR_PATTERN = re.compile(r'\$\{([A-Z_][A-Z0-9_]*):-?(\d+)\}')


def _extract_port_env_vars(ports: List[Dict[str, Any]]) -> Dict[str, int]:
    """
    Extract port environment variables and their default values from compose port mappings.

    Args:
        ports: List of port dicts with 'host' and 'container' keys
               e.g., [{'host': '${CHRONICLE_PORT:-8080}', 'container': '8000'}]

    Returns:
        Dict mapping env var name to default port number
        e.g., {'CHRONICLE_PORT': 8080}
    """
    result = {}
    for port in ports:
        host_port = port.get('host', '')
        if not host_port:
            continue

        match = PORT_ENV_VAR_PATTERN.search(host_port)
        if match:
            env_var_name = match.group(1)
            default_port = int(match.group(2))
            result[env_var_name] = default_port

    return result


def check_port_in_use(port: int, host: str = "0.0.0.0", exclude_container: Optional[str] = None) -> Optional[str]:
    """
    Check if a port is in use on the host.

    Note: When running inside a Docker container, socket bind tests don't work
    reliably for detecting host ports. We rely primarily on the Docker API check.

    Args:
        port: Port number to check
        host: Host address to check (default: 0.0.0.0)
        exclude_container: Container name pattern to exclude from check (for self-check)

    Returns:
        None if port is available, or a string describing what's using it
    """
    logger.info(f"Checking if port {port} is in use (exclude_container={exclude_container})")

    docker_available = False

    # Check if any Docker container is using this port via Docker API
    try:
        client = docker.from_env()
        client.ping()  # Verify Docker is actually responsive
        docker_available = True

        containers = client.containers.list(all=False)  # Only running containers
        logger.debug(f"Found {len(containers)} running Docker containers")

        for container in containers:
            container_name = container.name
            container_status = container.status

            # Skip the container we're trying to start (if specified)
            if exclude_container and exclude_container in container_name:
                logger.debug(f"Skipping excluded container: {container_name}")
                continue

            # Check NetworkSettings.Ports (actual active port bindings for running containers)
            network_settings = container.attrs.get("NetworkSettings", {})
            ports = network_settings.get("Ports", {})

            if ports:
                for container_port, bindings in ports.items():
                    if bindings:
                        for binding in bindings:
                            host_ip = binding.get("HostIp", "")
                            host_port = binding.get("HostPort")
                            if host_port:
                                try:
                                    if int(host_port) == port:
                                        logger.info(f"Port {port} in use by Docker container '{container_name}' (status: {container_status})")
                                        return f"Docker: {container_name}"
                                except ValueError:
                                    pass

        logger.debug(f"No Docker container found using port {port}")

    except Exception as e:
        logger.warning(f"Docker API check failed: {e}")
        # If Docker fails, we can't reliably check ports from inside a container
        # Fall through to socket test, but log a warning

    # Socket bind test - NOTE: This doesn't work reliably from inside a container!
    # It will test the container's network namespace, not the host's.
    # We only use this as a backup for non-Docker processes when Docker API fails.
    if not docker_available:
        logger.warning("Docker API unavailable - socket test may be unreliable from container")

    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
            # Port is available (at least in our network namespace)
            logger.debug(f"Socket bind test passed for port {port}")
            return None
    except socket.error as e:
        logger.debug(f"Socket bind test failed for port {port}: {e}")

    # Port is in use - try to find what's using it via lsof
    # NOTE: lsof also runs inside the container, so may not find host processes
    try:
        result = subprocess.run(
            ["lsof", "-i", f":{port}", "-P", "-n"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:
                parts = lines[1].split()
                if len(parts) >= 2:
                    process_info = f"{parts[0]} (PID: {parts[1]})"
                    logger.info(f"Port {port} in use by process: {process_info}")
                    return process_info
        return "unknown process"
    except Exception as e:
        logger.debug(f"lsof check failed: {e}")
        return "unknown process"


def debug_list_docker_ports() -> Dict[str, List[Dict[str, Any]]]:
    """
    Debug function to list all Docker container port bindings.
    Returns a dict mapping container names to their port bindings.
    """
    result = {}
    try:
        client = docker.from_env()
        containers = client.containers.list(all=False)  # Only running containers
        for container in containers:
            ports_info = []
            network_settings = container.attrs.get("NetworkSettings", {})
            ports = network_settings.get("Ports", {})
            if ports:
                for container_port, bindings in ports.items():
                    if bindings:
                        for binding in bindings:
                            ports_info.append({
                                "container_port": container_port,
                                "host_ip": binding.get("HostIp", ""),
                                "host_port": binding.get("HostPort")
                            })
            if ports_info:
                result[container.name] = ports_info
    except Exception as e:
        logger.error(f"Failed to list Docker ports: {e}")
    return result


@dataclass
class PortConflict:
    """Represents a port conflict."""
    port: int
    env_var: Optional[str]  # The env var that controls this port (e.g., CHRONICLE_PORT)
    used_by: str  # Description of what's using the port
    suggested_port: int  # A suggested alternative port


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
    container_name: Optional[str]  # Actual Docker container name
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
            "compose_discovered": True,  # Uses compose file for env var resolution
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
            "compose_discovered": True,  # Uses compose file for env var resolution
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

        Cached after first access to avoid repeated compose registry lookups.
        """
        # Return cached value if available
        if hasattr(self, '_manageable_services_cache'):
            return self._manageable_services_cache

        # Start with core services
        services = dict(self.CORE_SERVICES)

        # Load services from ComposeServiceRegistry (compose-first approach)
        try:
            compose_registry = get_compose_registry()
            all_compose_services = list(compose_registry.get_services())
            logger.info(f"[MANAGEABLE_SERVICES] Found {len(all_compose_services)} services from compose registry")
            logger.info(f"[MANAGEABLE_SERVICES] Service names: {[s.service_name for s in all_compose_services]}")
            for service in all_compose_services:
                # Skip if already in core services
                if service.service_name in services:
                    logger.debug(f"[MANAGEABLE_SERVICES] Skipping {service.service_name} (already in core)")
                    continue

                # Use service_name as the key
                service_config = {
                    "description": f"From {service.compose_file.name}",
                    "service_type": ServiceType.INTEGRATION,
                    "required": False,
                    "user_controllable": True,
                    "compose_file": str(service.compose_file),
                    "docker_service_name": service.service_name,
                    "namespace": service.namespace,  # Docker Compose project / K8s namespace
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

        # Cache the result to avoid repeated lookups
        self._manageable_services_cache = services
        return services

    def reload_services(self) -> None:
        """Force reload services from ComposeServiceRegistry and clear cache."""
        # Clear cache
        if hasattr(self, '_manageable_services_cache'):
            delattr(self, '_manageable_services_cache')

        # Reload compose registry
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
                container_name=None,
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
                container_name=None,
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
            logger.debug(f"[get_service_info] Looking for docker_container_name: {docker_container_name}")

            # Try to find container by exact name first
            container = None
            try:
                container = self._client.containers.get(docker_container_name)
                logger.debug(f"[get_service_info] Found by exact name: {container.name}, status: {container.status}")
            except NotFound:
                # Container name may have project prefix (e.g., "ushadow-wiz-frame-chronicle-backend")
                # Search by compose service label, preferring declared namespace
                current_project = get_compose_project_name()

                # Use declared namespace from x-ushadow, fall back to current project
                service_namespace = service_config.get("namespace")
                target_projects = []
                if service_namespace:
                    target_projects.append(service_namespace)
                target_projects.append(current_project)

                logger.debug(f"[get_service_info] Searching by label, target_projects: {target_projects}")

                containers = self._client.containers.list(
                    all=False,  # Only search running containers
                    filters={"label": f"com.docker.compose.service={docker_container_name}"}
                )
                logger.debug(f"[get_service_info] Found {len(containers)} RUNNING containers with label com.docker.compose.service={docker_container_name}")
                for c in containers:
                    logger.debug(f"[get_service_info]   - {c.name}, project: {c.labels.get('com.docker.compose.project', 'unknown')}, status: {c.status}")
                if containers:
                    # Check if multiple running containers exist
                    if len(containers) > 1:
                        running_projects = [c.labels.get('com.docker.compose.project', 'unknown') for c in containers]
                        logger.warning(
                            f"[get_service_info] Multiple RUNNING containers found for {docker_container_name}: {running_projects}. "
                            f"Will use container from {target_projects[0] if target_projects else 'first match'}"
                        )

                    # Match containers from declared namespace or current project
                    for target_project in target_projects:
                        for c in containers:
                            labels = c.labels or {}
                            container_project = labels.get("com.docker.compose.project", "")
                            if container_project == target_project:
                                container = c
                                logger.debug(f"[get_service_info] Matched container {c.name} in project {container_project}")
                                break
                        if container:
                            break

                    if not container:
                        # Log what we found but didn't match
                        found_projects = [c.labels.get('com.docker.compose.project', 'unknown') for c in containers]
                        logger.warning(
                            f"[get_service_info] Found {len(containers)} RUNNING containers for {docker_container_name} "
                            f"but none in target projects {target_projects}. Found in: {found_projects}. Using first container."
                        )
                        # Use the first running container as fallback
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
                container_name=container.name,
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
                container_name=None,
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
                container_name=None,
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

    def get_service_ports(self, service_name: str) -> List[Dict[str, Any]]:
        """
        Get the ports that a service would use.

        Args:
            service_name: Name of the service

        Returns:
            List of port configurations with 'port', 'env_var', and 'source' keys
        """
        from src.config import get_settings

        service_config = self.MANAGEABLE_SERVICES.get(service_name, {})
        ports = service_config.get('ports', [])
        if not ports:
            metadata = service_config.get('metadata', {})
            ports = metadata.get('ports', [])

        # Load port overrides from services.{name}.ports
        settings = get_settings()
        config_key = service_name.replace("-", "_")
        port_overrides = settings.get_sync(f"services.{config_key}.ports") or {}

        result = []
        for port_config in ports:
            host_port = port_config.get('host', '')
            if not host_port:
                continue

            # Check if it's an env var reference
            match = PORT_ENV_VAR_PATTERN.search(str(host_port))
            if match:
                env_var = match.group(1)
                default_port = int(match.group(2))

                # Check: 1) config override, 2) environment, 3) default
                override_port = port_overrides.get(env_var)

                if override_port is not None:
                    actual_port = int(override_port)
                    logger.debug(f"Using port {actual_port} from config for {env_var}")
                elif os.environ.get(env_var):
                    try:
                        actual_port = int(os.environ.get(env_var))
                        logger.debug(f"Using port {actual_port} from environment for {env_var}")
                    except ValueError:
                        actual_port = default_port
                else:
                    actual_port = default_port
                    logger.debug(f"Using default port {actual_port} for {env_var}")

                result.append({
                    'port': actual_port,
                    'env_var': env_var,
                    'default_port': default_port,
                    'container_port': port_config.get('container')
                })
            else:
                # Static port
                try:
                    port_num = int(str(host_port).split(':')[0])
                    result.append({
                        'port': port_num,
                        'env_var': None,
                        'default_port': port_num,
                        'container_port': port_config.get('container')
                    })
                except ValueError:
                    continue

        return result

    def check_port_conflicts(self, service_name: str) -> List[PortConflict]:
        """
        Check if a service's ports conflict with ports already in use.

        Args:
            service_name: Name of the service to check

        Returns:
            List of PortConflict objects for any conflicting ports
        """
        conflicts = []
        service_ports = self.get_service_ports(service_name)

        logger.info(f"Checking port conflicts for service '{service_name}'")
        logger.info(f"Service ports to check: {service_ports}")

        # Build the full container name pattern to exclude (only OUR environment's container)
        # Container names follow pattern: {COMPOSE_PROJECT_NAME}-{service_name}
        compose_project = get_compose_project_name()
        exclude_pattern = f"{compose_project}-{service_name}"
        logger.debug(f"Exclude pattern for self-check: {exclude_pattern}")

        # Debug: log all Docker port bindings
        docker_ports = debug_list_docker_ports()
        if docker_ports:
            logger.info(f"Current Docker port bindings: {docker_ports}")
        else:
            logger.info("No Docker port bindings found")

        for port_info in service_ports:
            port = port_info['port']
            # Exclude ONLY our own environment's container when checking
            used_by = check_port_in_use(port, exclude_container=exclude_pattern)

            if used_by:
                logger.warning(f"Port conflict detected: port {port} is used by {used_by}")
                # Find a suggested alternative port
                suggested = port + 1
                while check_port_in_use(suggested) and suggested < port + 100:
                    suggested += 1

                conflicts.append(PortConflict(
                    port=port,
                    env_var=port_info.get('env_var'),
                    used_by=used_by,
                    suggested_port=suggested
                ))
            else:
                logger.debug(f"Port {port} is available")

        if conflicts:
            logger.warning(f"Found {len(conflicts)} port conflict(s) for service '{service_name}'")
        else:
            logger.info(f"No port conflicts for service '{service_name}'")

        return conflicts

    async def start_service(self, service_name: str, config_id: Optional[str] = None) -> tuple[bool, str]:
        """
        Start a Docker service.

        Args:
            service_name: Name of the service to start
            config_id: Optional instance ID for wiring-aware env resolution

        Returns:
            Tuple of (success: bool, message: str)
        """
        logger.info(f"start_service called with: {repr(service_name)}, config_id={config_id}")

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
                return await self._start_service_via_compose(service_name, compose_file, config_id)

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

        Uses the entity-based Settings API (v2) to resolve values from all sources:
        - Service-specific config
        - Capability providers
        - Global settings
        - Defaults

        Args:
            service_name: Name of the service (docker_service_name)

        Returns:
            Dict of env var name -> resolved value
        """
        from src.config import get_settings

        settings = get_settings()
        compose_registry = get_compose_registry()

        # Find the service in compose registry
        service = compose_registry.get_service_by_name(service_name)
        if not service:
            return {}

        # Use entity-based Settings API to resolve all env vars
        # This automatically checks: service config, capabilities, providers, settings, defaults
        resolutions = await settings.for_service(service.service_id)

        resolved = {}

        # Get provider registry for suggestions
        from src.services.provider_registry import get_provider_registry
        provider_registry = get_provider_registry()

        for env_var in service.all_env_vars:
            resolution = resolutions.get(env_var.name)

            if resolution and resolution.found and resolution.value:
                resolved[env_var.name] = str(resolution.value)
                logger.debug(
                    f"Resolved {env_var.name} from {resolution.source.value}: {mask_if_secret(env_var.name, str(resolution.value))}"
                )
            elif env_var.is_required:
                logger.warning(
                    f"Service {service_name}: required env var {env_var.name} has no value"
                )

        logger.info(
            f"Resolved {len(resolved)} env vars for {service_name} using Settings API v2"
        )
        return resolved

    async def _build_env_vars_for_service(
        self, service_name: str, config_id: Optional[str] = None
    ) -> tuple[Dict[str, str], Dict[str, str]]:
        """
        Build environment variables for a service.

        Uses saved compose config for compose-discovered services, with fallback
        to CapabilityResolver for required capabilities.

        Args:
            service_name: Name of the service
            config_id: Optional instance ID for wiring-aware resolution

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

                # Add WELL_KNOWN_ENV_MAPPINGS to subprocess_env for Docker Compose variable substitution
                # This allows compose files to use ${AUTH_SECRET_KEY} which gets substituted by Docker
                from src.services.service_orchestrator import WELL_KNOWN_ENV_MAPPINGS
                from src.config import get_settings_store
                settings_store = get_settings_store()
                for env_name, settings_path in WELL_KNOWN_ENV_MAPPINGS.items():
                    if env_name not in subprocess_env:  # Don't override already-set values
                        value = await settings_store.get(settings_path)
                        if value:
                            subprocess_env[env_name] = str(value)

                # Also try CapabilityResolver for any capabilities declared in x-ushadow
                requires = service_config.get("metadata", {}).get("requires", [])
                if requires:
                    from src.services.capability_resolver import get_capability_resolver
                    resolver = get_capability_resolver()
                    resolver.reload()

                    # Get env vars from capability resolver
                    # Capability resolver takes priority over compose config because:
                    # - Wired provider instances may have custom config overrides
                    # - ServiceConfig-specific config should override global defaults
                    try:
                        # Use instance-aware resolution if config_id provided
                        if config_id:
                            cap_env = await resolver.resolve_for_instance(config_id)
                        else:
                            cap_env = await resolver.resolve_for_service(service_name)

                        # OVERRIDE compose config with capability resolver values
                        # This allows wired instances to override global provider config
                        for key, value in cap_env.items():
                            if key in container_env and container_env[key] != value:
                                old_val = mask_if_secret(key, container_env[key])
                                new_val = mask_if_secret(key, value)
                                logger.info(
                                    f"[Override] {key}: {old_val} -> {new_val} "
                                    f"(capability resolver overrides compose config)"
                                )
                            container_env[key] = value
                            subprocess_env[key] = value
                    except Exception as e:
                        logger.debug(f"CapabilityResolver fallback for {service_name}: {e}")

                # Apply ServiceConfig-specific env var overrides (highest priority)
                if config_id:
                    from src.services.service_config_manager import get_service_config_manager
                    sc_manager = get_service_config_manager()
                    service_config = sc_manager.get_service_config(config_id)

                    if service_config and service_config.config.values:
                        for key, value in service_config.config.values.items():
                            # Skip internal metadata fields (prefixed with _)
                            if key.startswith('_'):
                                continue

                            # Handle _from_setting references
                            if isinstance(value, dict) and '_from_setting' in value:
                                # Resolve the setting path
                                from src.config import get_settings
                                settings = get_settings()
                                setting_path = value['_from_setting']
                                resolved_value = await settings.get(setting_path)
                                if resolved_value:
                                    value = str(resolved_value)
                                else:
                                    continue

                            # Apply the override
                            if key in container_env and str(container_env[key]) != str(value):
                                old_val = mask_if_secret(key, container_env[key])
                                new_val = mask_if_secret(key, value)
                                logger.info(
                                    f"[ServiceConfig Override] {key}: {old_val} -> {new_val} "
                                    f"(config_id={config_id})"
                                )
                            container_env[key] = str(value)
                            subprocess_env[key] = str(value)

                # Apply port overrides from services.{name}.ports
                from src.config import get_settings
                settings = get_settings()
                config_key = service_name.replace("-", "_")
                port_overrides = settings.get_sync(f"services.{config_key}.ports") or {}
                for env_var, port in port_overrides.items():
                    container_env[env_var] = str(port)
                    subprocess_env[env_var] = str(port)
                    logger.info(f"Applied port override: {env_var}={port}")

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
            # Use instance-aware resolution if config_id provided
            if config_id:
                container_env = await resolver.resolve_for_instance(config_id)
            else:
                container_env = await resolver.resolve_for_service(service_name)

            # Also add to subprocess env for compose file substitution
            subprocess_env.update(container_env)

            logger.info(
                f"Resolved {len(container_env)} env vars for {service_name} "
                f"via capability resolver" + (f" (instance={config_id})" if config_id else "")
            )

        except ValueError:
            # Re-raise validation errors
            raise
        except Exception as e:
            logger.error(f"Failed to resolve env vars for {service_name}: {e}")
            raise ValueError(f"Failed to configure service: {e}")

        return subprocess_env, container_env

    async def _start_infra_services(self, infra_services: list[str]) -> tuple[bool, str]:
        """
        Start infrastructure services from docker-compose.infra.yml.

        Args:
            infra_services: List of service names to start (e.g., ["postgres", "qdrant"])

        Returns:
            Tuple of (success: bool, message: str)
        """
        if not infra_services:
            return True, "No infra services required"

        try:
            # Infra compose file is in /compose inside container
            infra_compose_path = Path("/compose/docker-compose.infra.yml")
            if not infra_compose_path.exists():
                logger.warning(f"Infra compose file not found: {infra_compose_path}")
                return False, "Infrastructure compose file not found"

            import os
            subprocess_env = os.environ.copy()
            subprocess_env["COMPOSE_IGNORE_ORPHANS"] = "true"

            for service in infra_services:
                logger.info(f"Starting infra service: {service}")
                cmd = [
                    "docker", "compose",
                    "-f", str(infra_compose_path),
                    "-p", "infra",
                    "up", "-d", service
                ]

                result = subprocess.run(
                    cmd,
                    env=subprocess_env,
                    cwd=str(infra_compose_path.parent),
                    capture_output=True,
                    text=True,
                    timeout=120  # Longer timeout for pulling images
                )

                if result.returncode != 0:
                    logger.error(f"Failed to start infra service {service}: {result.stderr}")
                    return False, f"Failed to start infra service '{service}': {result.stderr[:200]}"

                logger.info(f"Started infra service: {service}")

            return True, f"Started infra services: {', '.join(infra_services)}"

        except subprocess.TimeoutExpired:
            logger.error("Timeout starting infra services")
            return False, "Infrastructure service start timeout"
        except Exception as e:
            logger.error(f"Error starting infra services: {e}")
            return False, f"Failed to start infrastructure: {str(e)}"

    async def _start_service_via_compose(self, service_name: str, compose_file: str, config_id: Optional[str] = None) -> tuple[bool, str]:
        """
        Start a service using docker-compose.

        Args:
            service_name: Name of the service to start
            compose_file: Relative path to the compose file (from project root)
            config_id: Optional instance ID for wiring-aware env resolution

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            # Get the discovered service from the registry for metadata
            compose_registry = get_compose_registry()
            discovered = compose_registry.get_service_by_name(service_name)

            # Check if this service requires infra services to be started first
            infra_services = discovered.infra_services if discovered else []
            if infra_services:
                logger.info(f"Service {service_name} requires infra services: {infra_services}")
                success, msg = await self._start_infra_services(infra_services)
                if not success:
                    return False, msg

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
            # Use declared namespace from x-ushadow, fall back to COMPOSE_PROJECT_NAME
            project_name = discovered.namespace if discovered else None
            if not project_name:
                project_name = get_compose_project_name()
            if not project_name:
                # Fallback for infra services or if env not set
                if "infra" in str(compose_path):
                    project_name = "infra"
                else:
                    project_name = "ushadow"

            logger.info(f"[start_service_via_compose] Using project_name: {project_name} for service: {service_name}")

            # Check if service requires a specific compose profile (use first profile if any)
            compose_profile = discovered.profiles[0] if discovered and discovered.profiles else None

            # Get docker service name from the discovered service
            docker_service_name = discovered.service_name if discovered else service_name
            logger.info(f"[DEBUG] Deploying service_name={service_name} -> docker_service_name={docker_service_name}, discovered={discovered.service_id if discovered else None}")

            # Build environment variables from service configuration
            # All env vars are passed via subprocess_env for compose ${VAR} substitution
            subprocess_env, container_env = await self._build_env_vars_for_service(service_name, config_id)

            # Suppress orphan warnings when running services from different compose files
            # in the same project namespace (e.g., chronicle + main backend share auth)
            subprocess_env["COMPOSE_IGNORE_ORPHANS"] = "true"

            logger.info(f"━━━ Starting {service_name} with {len(container_env)} environment variables ━━━")

            # Build docker compose command with explicit env var passing
            # Using --env-file /dev/null to clear default .env loading
            # All env vars come from subprocess_env for ${VAR} substitution
            cmd = ["docker", "compose", "-f", str(compose_path)]
            if project_name:
                cmd.extend(["-p", project_name])
            if compose_profile:
                cmd.extend(["--profile", compose_profile])
            cmd.extend(["up", "-d", docker_service_name])

            # Log final env vars being passed to service (with secrets masked)
            logged_vars = [f"{key}={mask_if_secret(key, value)}" for key, value in sorted(container_env.items())]
            logger.info(f"[Final Config] {service_name}: {', '.join(logged_vars)}")

            result = subprocess.run(
                cmd,
                env=subprocess_env,  # All env vars passed here for compose variable substitution
                cwd=str(compose_dir),
                capture_output=True,
                text=True,
                timeout=180  # Increased to 3 minutes for services that need building
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

    def build_image_from_compose(
        self,
        compose_file: str,
        service_name: str,
        tag: Optional[str] = None
    ) -> tuple[bool, str]:
        """
        Build a Docker image from a compose file's build configuration.

        Handles path translation between container and host paths when running
        inside a container with Docker socket mounted.

        Args:
            compose_file: Path to compose file (container path like /compose/file.yml)
            service_name: Service name in the compose file
            tag: Optional tag for the built image (defaults to service_name:latest)

        Returns:
            Tuple of (success, message_or_error)
        """
        project_root = os.environ.get("PROJECT_ROOT", "")
        if not project_root:
            return False, "PROJECT_ROOT not set - cannot determine host paths for build"

        try:
            # Read compose file from container mount
            with open(compose_file, 'r') as f:
                compose_data = yaml.safe_load(f)

            service_def = compose_data.get('services', {}).get(service_name, {})
            if not service_def:
                return False, f"Service '{service_name}' not found in {compose_file}"

            build_config = service_def.get('build')
            if not build_config:
                return False, f"No build configuration found for {service_name}"

            # Parse build config
            if isinstance(build_config, str):
                build_context = build_config
                dockerfile = "Dockerfile"
            elif isinstance(build_config, dict):
                build_context = build_config.get('context', '.')
                dockerfile = build_config.get('dockerfile', 'Dockerfile')
            else:
                return False, f"Invalid build configuration for {service_name}"

            # Expand environment variables in build context (e.g., ${PROJECT_ROOT:-..})
            def expand_env_vars(s: str) -> str:
                """Expand ${VAR:-default} style environment variables.

                Uses shell-like semantics: if var is unset OR empty, use default.
                """
                import re
                pattern = r'\$\{([^}:]+)(?::-([^}]*))?\}'
                def replace(match):
                    var_name = match.group(1)
                    default = match.group(2) or ''
                    value = os.environ.get(var_name, '')
                    # Shell semantics: use default if var is unset OR empty
                    return value if value else default
                return re.sub(pattern, replace, s)

            logger.info(f"Build context before expansion: {build_context}")
            logger.info(f"PROJECT_ROOT env: {project_root!r}")

            build_context = expand_env_vars(build_context)
            dockerfile = expand_env_vars(dockerfile)

            logger.info(f"Build context after expansion: {build_context}")

            # Convert compose file path to host path
            if compose_file.startswith("/compose/"):
                host_compose_file = f"{project_root}/compose/{compose_file[9:]}"
            elif compose_file.startswith("/"):
                host_compose_file = f"{project_root}{compose_file}"
            else:
                host_compose_file = f"{project_root}/{compose_file}"

            logger.info(f"Host compose file: {host_compose_file}")

            # Resolve build context path relative to compose file (on host)
            host_compose_dir = os.path.dirname(host_compose_file)
            logger.info(f"Host compose dir: {host_compose_dir}")

            # If build_context is already absolute, use it directly
            if os.path.isabs(build_context):
                host_build_context = build_context
            else:
                host_build_context = os.path.normpath(os.path.join(host_compose_dir, build_context))

            logger.info(f"Host build context (resolved): {host_build_context}")

            # Note: Can't validate if path exists here because we're in container,
            # but Docker daemon runs on host. Docker SDK will return proper error if path invalid.

            # Determine image tag
            image_tag = tag or f"{service_name}:latest"

            logger.info(f"Building {image_tag} from context: {host_build_context!r}, dockerfile: {dockerfile!r}")
            logger.info(f"[BUILD DEBUG] path type: {type(host_build_context)}, value: {host_build_context!r}, is_empty: {not host_build_context}")

            # Validate build_context is not empty
            if not host_build_context or host_build_context.strip() == '':
                return False, f"Build context is empty after path resolution. Original: {build_context!r}"

            # Build using docker compose CLI instead of SDK
            # The SDK checks if path exists from container perspective, but we need host perspective
            # docker compose properly handles build context resolution
            logger.info(f"[BUILD] Using docker compose build: docker compose -f {compose_file} build {service_name}")

            import subprocess
            try:
                # Run docker compose build - use container path for compose file
                # Docker compose reads from mounted /compose directory
                # PROJECT_ROOT env var ensures build contexts resolve to host paths
                cmd = ["docker", "compose", "-f", compose_file, "build", service_name]
                logger.info(f"[BUILD] Running: {' '.join(cmd)} from cwd=/ with PROJECT_ROOT={project_root}")

                # Use environment with PROJECT_ROOT set to host path
                env = os.environ.copy()
                env['PROJECT_ROOT'] = project_root

                result = subprocess.run(
                    cmd,
                    cwd="/",  # Use root of container filesystem
                    env=env,  # Use environment with PROJECT_ROOT set to host path
                    capture_output=True,
                    text=True,
                    timeout=600  # 10 minute timeout for builds
                )

                # Log build output
                if result.stdout:
                    logger.info(f"Build stdout:\n{result.stdout}")
                if result.stderr:
                    logger.info(f"Build stderr:\n{result.stderr}")

                if result.returncode != 0:
                    return False, f"Docker compose build failed (exit {result.returncode}): {result.stderr}"

            except subprocess.TimeoutExpired:
                return False, "Build timed out after 10 minutes"
            except Exception as e:
                logger.error(f"Build subprocess error: {e}", exc_info=True)
                return False, f"Build subprocess failed: {str(e)}"

            logger.info(f"Successfully built image: {image_tag}")
            return True, f"Successfully built {image_tag}"

        except FileNotFoundError:
            return False, f"Compose file not found: {compose_file}"
        except docker.errors.BuildError as e:
            return False, f"Docker build failed: {str(e)}"
        except Exception as e:
            logger.error(f"Build error: {e}", exc_info=True)
            return False, f"Build failed: {str(e)}"

    def image_exists(self, image: str) -> bool:
        """Check if a Docker image exists locally."""
        try:
            self._client.images.get(image)
            return True
        except docker.errors.ImageNotFound:
            return False
        except Exception as e:
            logger.warning(f"Error checking image {image}: {e}")
            return False


# Global instance
_docker_manager: Optional[DockerManager] = None


def get_docker_manager() -> DockerManager:
    """Get the global DockerManager instance."""
    global _docker_manager
    if _docker_manager is None:
        _docker_manager = DockerManager()
        _docker_manager.initialize()
    return _docker_manager
