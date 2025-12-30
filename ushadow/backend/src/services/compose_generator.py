"""
Docker Compose Generator

Generates docker-compose.yaml from service definitions.
Takes enabled services + deployment config and produces a complete compose file.

Usage:
    generator = DockerComposeGenerator()
    compose_yaml = generator.generate(
        enabled_services=['openmemory', 'chronicle'],
        options={'openmemory': {'enable_graph': True}}
    )
    generator.write_compose_file(compose_yaml, 'config/generated/docker-compose.yaml')
"""

import logging
import yaml
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from datetime import datetime

from src.models.service import (
    Service,
    ServiceType,
    Container,
    HealthCheck,
    DeploymentConfig,
)
from src.services.service_registry import get_service_registry

logger = logging.getLogger(__name__)


class DockerComposeGenerator:
    """
    Generates Docker Compose files from service definitions.

    Handles:
    - Service container definitions
    - Infrastructure dependency resolution
    - Network and volume creation
    - Environment variable placeholders
    - Health check configuration
    """

    def __init__(self, config_dir: Optional[Path] = None):
        self.registry = get_service_registry(config_dir)

    def generate(
        self,
        enabled_services: List[str],
        options: Optional[Dict[str, Dict[str, Any]]] = None,
        deployment_target: str = "local"
    ) -> Dict[str, Any]:
        """
        Generate a complete docker-compose configuration.

        Args:
            enabled_services: List of service IDs to include
            options: Dict of service_id -> option values
            deployment_target: Deployment target (local, etc.)

        Returns:
            Dict representing the docker-compose.yaml content
        """
        options = options or {}

        # Get deployment config
        deployment = self.registry.get_deployment_config(deployment_target)
        if not deployment:
            logger.warning(f"No deployment config for '{deployment_target}', using defaults")
            deployment = self._default_deployment_config()

        # Resolve infrastructure dependencies
        infra_needed = self.registry.get_required_infrastructure(
            enabled_services, options
        )

        # Add always-on infrastructure from deployment config
        if deployment.infrastructure:
            infra_needed.update(deployment.infrastructure.always)

        logger.info(f"Infrastructure needed: {sorted(infra_needed)}")

        # Build compose structure
        compose = {
            "version": "3.8",
            "name": "ushadow",
            "services": {},
            "networks": {},
            "volumes": {},
        }

        # Add header comment (will be added when writing)
        compose["x-generated"] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "enabled_services": enabled_services,
            "infrastructure": sorted(infra_needed),
        }

        # Add network
        network_name = deployment.network.name if deployment.network else "ushadow"
        compose["networks"][network_name] = {
            "driver": deployment.network.driver if deployment.network else "bridge"
        }

        # Generate infrastructure services first
        for service_id in sorted(infra_needed):
            service = self.registry.get_service(service_id)
            if service:
                self._add_service_to_compose(
                    compose, service, deployment, network_name
                )
            else:
                logger.warning(f"Infrastructure service not found: {service_id}")

        # Generate user-facing services
        for service_id in enabled_services:
            service = self.registry.get_service(service_id)
            if not service:
                logger.warning(f"Service not found: {service_id}")
                continue

            # Skip cloud services (no containers)
            if service.is_cloud:
                logger.debug(f"Skipping cloud service: {service_id}")
                continue

            self._add_service_to_compose(
                compose, service, deployment, network_name, options.get(service_id)
            )

        return compose

    def generate_yaml(
        self,
        enabled_services: List[str],
        options: Optional[Dict[str, Dict[str, Any]]] = None,
        deployment_target: str = "local"
    ) -> str:
        """
        Generate docker-compose.yaml as a string.

        Args:
            enabled_services: List of service IDs to include
            options: Dict of service_id -> option values
            deployment_target: Deployment target

        Returns:
            YAML string
        """
        compose = self.generate(enabled_services, options, deployment_target)
        return self._to_yaml(compose)

    def write_compose_file(
        self,
        compose: Dict[str, Any],
        output_path: str | Path
    ) -> Path:
        """
        Write the compose configuration to a file.

        Args:
            compose: Compose dict from generate()
            output_path: Path to write the file

        Returns:
            Path to the written file
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        yaml_content = self._to_yaml(compose)

        # Add header comment
        header = f"""# Generated by Ushadow DockerComposeGenerator
# Timestamp: {compose.get('x-generated', {}).get('timestamp', 'unknown')}
# DO NOT EDIT - This file is auto-generated from config/services/*.yaml
#
# To modify services, edit the YAML files in config/services/
# Then regenerate this file via the API or CLI.

"""
        with open(output_path, 'w') as f:
            f.write(header + yaml_content)

        logger.info(f"Wrote docker-compose file: {output_path}")
        return output_path

    def _add_service_to_compose(
        self,
        compose: Dict[str, Any],
        service: Service,
        deployment: DeploymentConfig,
        network_name: str,
        service_options: Optional[Dict[str, Any]] = None
    ) -> None:
        """Add a service's containers to the compose configuration."""
        service_options = service_options or {}

        for container in service.containers:
            compose_service = self._build_compose_service(
                container, service, deployment, network_name, service_options
            )
            compose["services"][container.name] = compose_service

            # Add volumes
            for volume in container.volumes:
                if volume.persistent:
                    volume_name = f"{deployment.volume_prefix}_{volume.name}"
                    if volume_name not in compose["volumes"]:
                        compose["volumes"][volume_name] = None  # Use default driver

    def _build_compose_service(
        self,
        container: Container,
        service: Service,
        deployment: DeploymentConfig,
        network_name: str,
        service_options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Build a single compose service definition."""
        compose_svc: Dict[str, Any] = {
            "image": container.image,
            "networks": [network_name],
            "restart": "unless-stopped",
        }

        # Container name (optional, for easier identification)
        compose_svc["container_name"] = container.name

        # Ports
        if container.ports:
            compose_svc["ports"] = []
            for port in container.ports:
                host_port = port.host or port.container
                compose_svc["ports"].append(f"{host_port}:{port.container}")

        # Environment variables
        env_vars = self._build_environment(container, service, service_options)
        if env_vars:
            compose_svc["environment"] = env_vars

        # Volumes
        if container.volumes:
            compose_svc["volumes"] = []
            for volume in container.volumes:
                volume_name = f"{deployment.volume_prefix}_{volume.name}"
                compose_svc["volumes"].append(f"{volume_name}:{volume.path}")

        # Command
        if container.command:
            compose_svc["command"] = container.command

        # Health check
        if container.health:
            compose_svc["healthcheck"] = self._build_healthcheck(
                container.health, deployment
            )

        # Dependencies
        if service.depends_on:
            depends = []
            for dep_id in service.depends_on.required:
                dep_service = self.registry.get_service(dep_id)
                if dep_service and dep_service.containers:
                    # Use first container name as dependency
                    depends.append(dep_service.containers[0].name)
            if depends:
                compose_svc["depends_on"] = depends

        # Deploy config (GPU, resources)
        if container.deploy:
            compose_svc["deploy"] = self._build_deploy_config(container.deploy)

        # Logging
        if deployment.logging:
            compose_svc["logging"] = {
                "driver": deployment.logging.driver,
                "options": deployment.logging.options,
            }

        return compose_svc

    def _build_environment(
        self,
        container: Container,
        service: Service,
        service_options: Dict[str, Any]
    ) -> List[str]:
        """
        Build environment variable list for a container.

        Uses ${VAR} syntax so docker-compose reads from .env or shell environment.
        """
        env_list = []

        # Static values from container env
        if container.env and container.env.values:
            for key, value in container.env.values.items():
                # Substitute service options into values
                resolved_value = self._resolve_option_vars(value, service_options)
                env_list.append(f"{key}={resolved_value}")

        # Required env vars - use ${VAR} placeholder
        if container.env and container.env.required:
            for var in container.env.required:
                if not any(e.startswith(f"{var}=") for e in env_list):
                    env_list.append(f"{var}=${{{var}}}")

        # Optional env vars - use ${VAR:-} placeholder (empty default)
        if container.env and container.env.optional:
            for var in container.env.optional:
                if not any(e.startswith(f"{var}=") for e in env_list):
                    env_list.append(f"{var}=${{{var}:-}}")

        # Cloud service env (top-level)
        if service.env:
            if service.env.values:
                for key, value in service.env.values.items():
                    resolved_value = self._resolve_option_vars(value, service_options)
                    if not any(e.startswith(f"{key}=") for e in env_list):
                        env_list.append(f"{key}={resolved_value}")

            if service.env.required:
                for var in service.env.required:
                    if not any(e.startswith(f"{var}=") for e in env_list):
                        env_list.append(f"{var}=${{{var}}}")

            if service.env.optional:
                for var in service.env.optional:
                    if not any(e.startswith(f"{var}=") for e in env_list):
                        env_list.append(f"{var}=${{{var}:-}}")

        return sorted(env_list)

    def _resolve_option_vars(
        self,
        value: str,
        service_options: Dict[str, Any]
    ) -> str:
        """Resolve ${OPTION_NAME:-default} patterns in values."""
        import re

        def replace_option(match):
            var_expr = match.group(1)
            if ":-" in var_expr:
                var_name, default = var_expr.split(":-", 1)
            else:
                var_name = var_expr
                default = ""

            # Check if it's a service option (uppercase version of option name)
            option_key = var_name.lower()
            if option_key in service_options:
                opt_value = service_options[option_key]
                return str(opt_value).lower() if isinstance(opt_value, bool) else str(opt_value)

            # Keep original placeholder for env vars
            return match.group(0)

        return re.sub(r'\$\{([^}]+)\}', replace_option, value)

    def _build_healthcheck(
        self,
        health: HealthCheck,
        deployment: DeploymentConfig
    ) -> Dict[str, Any]:
        """Build compose healthcheck configuration."""
        healthcheck: Dict[str, Any] = {}

        # Test command
        if health.http_get and health.port:
            # Use curl for HTTP checks
            healthcheck["test"] = [
                "CMD-SHELL",
                f"curl -f http://localhost:{health.port}{health.http_get} || exit 1"
            ]
        elif health.exec:
            healthcheck["test"] = ["CMD"] + health.exec
        else:
            return {}  # No valid health check

        # Timing with deployment overrides
        timeout_mult = deployment.health.timeout_multiplier if deployment.health else 1.0
        retries_extra = deployment.health.retries_extra if deployment.health else 0

        healthcheck["interval"] = health.interval
        healthcheck["timeout"] = self._multiply_duration(health.timeout, timeout_mult)
        healthcheck["retries"] = health.retries + retries_extra

        if health.start_period:
            healthcheck["start_period"] = health.start_period

        return healthcheck

    def _multiply_duration(self, duration: str, multiplier: float) -> str:
        """Multiply a duration string (e.g., '5s') by a factor."""
        import re
        match = re.match(r'^(\d+)([smh])$', duration)
        if not match:
            return duration

        value = int(match.group(1))
        unit = match.group(2)
        new_value = int(value * multiplier)
        return f"{new_value}{unit}"

    def _build_deploy_config(self, deploy) -> Dict[str, Any]:
        """Build compose deploy configuration (for GPU, etc.)."""
        result: Dict[str, Any] = {}

        if deploy.resources and deploy.resources.reservations:
            result["resources"] = {
                "reservations": deploy.resources.reservations
            }

        return result if result else None

    def _default_deployment_config(self) -> DeploymentConfig:
        """Return default deployment config when none is found."""
        from src.models.service import (
            NetworkConfig, InfrastructureConfig, LoggingConfig
        )
        return DeploymentConfig(
            target="docker",
            network=NetworkConfig(name="ushadow", driver="bridge"),
            volume_prefix="ushadow",
            infrastructure=InfrastructureConfig(
                always=["mongodb", "redis"],
                on_demand=["qdrant", "neo4j"]
            ),
            logging=LoggingConfig()
        )

    def _to_yaml(self, compose: Dict[str, Any]) -> str:
        """Convert compose dict to YAML string."""
        # Custom representer for None values (empty volumes)
        def represent_none(dumper, data):
            return dumper.represent_scalar('tag:yaml.org,2002:null', '')

        yaml.add_representer(type(None), represent_none)

        # Remove internal x-generated before output
        output = {k: v for k, v in compose.items() if not k.startswith('x-')}

        return yaml.dump(
            output,
            default_flow_style=False,
            sort_keys=False,
            allow_unicode=True
        )


# =============================================================================
# Convenience Functions
# =============================================================================

def generate_compose_for_services(
    enabled_services: List[str],
    options: Optional[Dict[str, Dict[str, Any]]] = None,
    output_path: Optional[str | Path] = None,
    deployment_target: str = "local"
) -> str:
    """
    Convenience function to generate docker-compose.yaml.

    Args:
        enabled_services: List of service IDs to include
        options: Dict of service_id -> option values
        output_path: If provided, write to this file
        deployment_target: Deployment target

    Returns:
        YAML string
    """
    generator = DockerComposeGenerator()
    compose = generator.generate(enabled_services, options, deployment_target)

    if output_path:
        generator.write_compose_file(compose, output_path)

    return generator._to_yaml(compose)
