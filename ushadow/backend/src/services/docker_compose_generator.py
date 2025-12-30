"""
Docker Compose Generator

Generates docker-compose.yml files from service definitions.
This is Phase 4 of the services architecture transition.

The generator:
1. Reads service definitions from config/services/*.yaml
2. Resolves environment variables from OmegaConf settings
3. Generates docker-compose.yml files for enabled services
4. Creates .env files with resolved secrets
"""

import os
import yaml
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass

from src.models.service import Service, Container, HealthCheck, Volume, Port
from src.services.service_registry import ServiceRegistry, get_service_registry

logger = logging.getLogger(__name__)


@dataclass
class GeneratedCompose:
    """Result of compose generation."""
    compose_content: str
    env_vars: Dict[str, str]
    service_ids: List[str]
    compose_path: Path


class DockerComposeGenerator:
    """
    Generates Docker Compose files from service definitions.

    Services are defined in config/services/*.yaml and contain container
    specifications. This generator creates docker-compose.yml files that
    Docker can use to run those containers.
    """

    # Network name for inter-service communication
    NETWORK_NAME = "infra-network"

    def __init__(
        self,
        registry: Optional[ServiceRegistry] = None,
        output_dir: Optional[Path] = None,
        project_root: Optional[Path] = None
    ):
        """
        Initialize the generator.

        Args:
            registry: ServiceRegistry instance (uses global if not provided)
            output_dir: Where to write generated compose files
            project_root: Project root for relative paths
        """
        self.registry = registry or get_service_registry()

        if project_root is None:
            # Navigate from this file to project root
            project_root = Path(__file__).parent.parent.parent.parent.parent
        self.project_root = project_root

        if output_dir is None:
            # Use /config/compose-generated inside container (mounted from host config/)
            # This ensures compose files are accessible from inside the container
            config_path = Path("/config")
            if config_path.exists():
                output_dir = config_path / "compose-generated"
            else:
                output_dir = project_root / "config" / "compose-generated"
        self.output_dir = output_dir

    async def generate_for_service(
        self,
        service_id: str,
        settings: Optional[Any] = None
    ) -> Optional[GeneratedCompose]:
        """
        Generate compose configuration for a single service.

        Args:
            service_id: ID of the service to generate for
            settings: OmegaConf settings manager for env resolution

        Returns:
            GeneratedCompose with content and env vars, or None if service not found
        """
        service = self.registry.get_service(service_id)
        if not service:
            logger.error(f"Service not found: {service_id}")
            return None

        if service.is_cloud:
            logger.debug(f"Skipping cloud service: {service_id}")
            return None

        if not service.containers:
            logger.warning(f"Service has no containers: {service_id}")
            return None

        # Build compose structure
        compose_dict = await self._build_compose_dict(service, settings)

        # Convert to YAML
        compose_content = yaml.dump(
            compose_dict,
            default_flow_style=False,
            sort_keys=False,
            allow_unicode=True
        )

        # Resolve environment variables
        env_vars = await self._resolve_env_vars(service, settings)

        # Determine output path
        compose_path = self.output_dir / f"{service_id}.yml"

        return GeneratedCompose(
            compose_content=compose_content,
            env_vars=env_vars,
            service_ids=[service_id],
            compose_path=compose_path
        )

    async def generate_for_services(
        self,
        service_ids: List[str],
        settings: Optional[Any] = None,
        project_name: Optional[str] = None
    ) -> Optional[GeneratedCompose]:
        """
        Generate a combined compose file for multiple services.

        Args:
            service_ids: List of service IDs to include
            settings: OmegaConf settings manager
            project_name: Docker Compose project name

        Returns:
            GeneratedCompose with combined content
        """
        if not service_ids:
            return None

        # Collect all services
        services = []
        for sid in service_ids:
            service = self.registry.get_service(sid)
            if service and not service.is_cloud and service.containers:
                services.append(service)

        if not services:
            logger.warning("No local services with containers found")
            return None

        # Build combined compose
        compose_dict = {
            "version": "3.8",
            "services": {},
            "volumes": {},
            "networks": {
                self.NETWORK_NAME: {
                    "external": True
                }
            }
        }

        if project_name:
            compose_dict["name"] = project_name

        # Collect all env vars
        all_env_vars: Dict[str, str] = {}

        for service in services:
            service_compose = await self._build_service_containers(service, settings)
            compose_dict["services"].update(service_compose["services"])
            compose_dict["volumes"].update(service_compose.get("volumes", {}))

            env_vars = await self._resolve_env_vars(service, settings)
            all_env_vars.update(env_vars)

        # Convert to YAML
        compose_content = yaml.dump(
            compose_dict,
            default_flow_style=False,
            sort_keys=False,
            allow_unicode=True
        )

        # Output path based on service IDs or project name
        filename = project_name or "-".join(sorted(service_ids))
        compose_path = self.output_dir / f"{filename}.yml"

        return GeneratedCompose(
            compose_content=compose_content,
            env_vars=all_env_vars,
            service_ids=service_ids,
            compose_path=compose_path
        )

    async def write_compose_file(
        self,
        generated: GeneratedCompose,
        write_env: bool = True
    ) -> Path:
        """
        Write generated compose file to disk.

        Args:
            generated: GeneratedCompose to write
            write_env: Also write .env file with resolved secrets

        Returns:
            Path to the written compose file
        """
        # Ensure output directory exists
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Write compose file
        compose_path = generated.compose_path
        with open(compose_path, 'w') as f:
            f.write(f"# Auto-generated by DockerComposeGenerator\n")
            f.write(f"# Services: {', '.join(generated.service_ids)}\n")
            f.write(f"# DO NOT EDIT - regenerate with the services API\n\n")
            f.write(generated.compose_content)

        logger.info(f"Wrote compose file: {compose_path}")

        # Write .env file if requested
        if write_env and generated.env_vars:
            env_path = compose_path.with_suffix('.env')
            with open(env_path, 'w') as f:
                f.write("# Auto-generated environment file\n")
                f.write("# Contains resolved secrets - DO NOT COMMIT\n\n")
                for key, value in sorted(generated.env_vars.items()):
                    # Escape special characters in values
                    escaped_value = self._escape_env_value(value)
                    f.write(f"{key}={escaped_value}\n")
            logger.info(f"Wrote env file: {env_path}")

        return compose_path

    async def _build_compose_dict(
        self,
        service: Service,
        settings: Optional[Any]
    ) -> Dict[str, Any]:
        """Build the full compose dict for a single service."""
        compose = {
            "name": service.id,
            "services": {},
            "networks": {
                self.NETWORK_NAME: {
                    "external": True
                }
            },
            "volumes": {}
        }

        service_compose = await self._build_service_containers(service, settings)
        compose["services"] = service_compose["services"]
        compose["volumes"] = service_compose.get("volumes", {})

        return compose

    async def _build_service_containers(
        self,
        service: Service,
        settings: Optional[Any]
    ) -> Dict[str, Any]:
        """Build compose services dict for a service's containers."""
        result = {
            "services": {},
            "volumes": {}
        }

        for container in service.containers:
            container_def = await self._build_container_def(
                service, container, settings
            )
            result["services"][container.name] = container_def

            # Collect volumes
            for volume in container.volumes:
                if volume.persistent:
                    result["volumes"][volume.name] = None

        return result

    async def _build_container_def(
        self,
        service: Service,
        container: Container,
        settings: Optional[Any]
    ) -> Dict[str, Any]:
        """Build a single container definition for compose."""
        container_def: Dict[str, Any] = {
            "image": container.image,
            "container_name": container.name,
            "networks": [self.NETWORK_NAME],
            "restart": "unless-stopped"
        }

        # Ports
        if container.ports:
            container_def["ports"] = [
                f"{p.host or p.container}:{p.container}"
                for p in container.ports
            ]

        # Environment variables
        env_list = await self._build_container_env(service, container, settings)
        if env_list:
            container_def["environment"] = env_list

        # Volumes
        if container.volumes:
            container_def["volumes"] = [
                f"{v.name}:{v.path}"
                for v in container.volumes
            ]

        # Health check
        if container.health:
            container_def["healthcheck"] = self._build_healthcheck(container.health)

        # Command override
        if container.command:
            container_def["command"] = container.command

        # GPU/Deploy resources
        if container.deploy and container.deploy.resources:
            container_def["deploy"] = {
                "resources": container.deploy.resources.model_dump()
            }

        # Dependencies within the service
        deps = self._get_container_dependencies(service, container)
        if deps:
            container_def["depends_on"] = deps

        return container_def

    async def _build_container_env(
        self,
        service: Service,
        container: Container,
        settings: Optional[Any]
    ) -> List[str]:
        """Build environment variable list for a container."""
        env_list = []

        # Static values from container definition
        if container.env and container.env.values:
            for key, value in container.env.values.items():
                env_list.append(f"{key}={value}")

        # Required env vars - use variable substitution for compose
        required_vars = set()
        if container.env and container.env.required:
            required_vars.update(container.env.required)

        # Service-level required vars (for cloud services moved to containers)
        if service.env and service.env.required:
            required_vars.update(service.env.required)

        for var in sorted(required_vars):
            # Use ${VAR} syntax so compose picks up from .env file
            env_list.append(f"{var}=${{{var}}}")

        # Optional env vars (only include if set)
        optional_vars = set()
        if container.env and container.env.optional:
            optional_vars.update(container.env.optional)

        for var in sorted(optional_vars):
            # Use ${VAR:-} syntax for optional with empty default
            env_list.append(f"{var}=${{{var}:-}}")

        return env_list

    def _build_healthcheck(self, health: HealthCheck) -> Dict[str, Any]:
        """Build healthcheck dict for compose."""
        healthcheck = {
            "interval": health.interval,
            "timeout": health.timeout,
            "retries": health.retries
        }

        if health.start_period:
            healthcheck["start_period"] = health.start_period

        # Build test command
        if health.http_get and health.port:
            healthcheck["test"] = [
                "CMD", "curl", "-f",
                f"http://localhost:{health.port}{health.http_get}"
            ]
        elif health.exec:
            healthcheck["test"] = ["CMD"] + health.exec
        else:
            # Default to curl on first port if available
            healthcheck["test"] = ["CMD", "echo", "ok"]

        return healthcheck

    def _get_container_dependencies(
        self,
        service: Service,
        container: Container
    ) -> List[str]:
        """Get other containers this container depends on."""
        deps = []

        # First container has no internal deps
        # Other containers depend on containers defined before them
        container_names = [c.name for c in service.containers]
        container_idx = container_names.index(container.name)

        # Each container depends on previous ones
        if container_idx > 0:
            deps.append(container_names[container_idx - 1])

        return deps

    async def _resolve_env_vars(
        self,
        service: Service,
        settings: Optional[Any]
    ) -> Dict[str, str]:
        """
        Resolve environment variables from settings.

        Uses the service's env_overrides and global env-mappings.yaml
        to map env vars to settings paths.
        """
        env_vars: Dict[str, str] = {}

        # Get all required env vars for this service
        required_vars = service.get_required_env_vars()
        optional_vars = service.get_optional_env_vars()
        all_vars = set(required_vars) | set(optional_vars)

        for var in all_vars:
            # Get mapping (service override or global)
            mapping = self.registry.get_env_mapping_for_service(service, var)

            if not mapping:
                logger.debug(f"No mapping for env var: {var}")
                continue

            if not settings:
                logger.debug(f"No settings manager - cannot resolve {var}")
                continue

            # Get value from settings
            try:
                # Strip prefix if present
                config_path = mapping
                if config_path.startswith("secrets."):
                    config_path = config_path[8:]
                elif config_path.startswith("settings."):
                    config_path = config_path[9:]

                value = await settings.get(config_path)

                if value and str(value).strip():
                    env_vars[var] = str(value)
                    logger.debug(f"Resolved {var} from {config_path}")
                else:
                    if var in required_vars:
                        logger.warning(f"Required env var {var} has no value at {config_path}")
            except Exception as e:
                logger.warning(f"Could not resolve {var} from {mapping}: {e}")

        return env_vars

    def _escape_env_value(self, value: str) -> str:
        """Escape special characters in .env file values."""
        # If value contains special chars, wrap in quotes
        if any(c in value for c in [' ', '"', "'", '$', '`', '\\', '\n']):
            # Escape quotes and wrap
            escaped = value.replace('\\', '\\\\').replace('"', '\\"')
            return f'"{escaped}"'
        return value

    def get_compose_path_for_service(self, service_id: str) -> Path:
        """Get the expected compose file path for a service."""
        return self.output_dir / f"{service_id}.yml"

    def compose_exists_for_service(self, service_id: str) -> bool:
        """Check if a generated compose file exists for a service."""
        return self.get_compose_path_for_service(service_id).exists()


# =============================================================================
# Global Instance
# =============================================================================

_compose_generator: Optional[DockerComposeGenerator] = None


def get_compose_generator() -> DockerComposeGenerator:
    """Get the global DockerComposeGenerator instance."""
    global _compose_generator
    if _compose_generator is None:
        _compose_generator = DockerComposeGenerator()
    return _compose_generator


def reset_compose_generator() -> None:
    """Reset the global generator (for testing)."""
    global _compose_generator
    _compose_generator = None
