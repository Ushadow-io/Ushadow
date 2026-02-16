"""
Infrastructure Registry - Data-driven infrastructure service definitions.

Reads compose/docker-compose.infra.yml to discover available infrastructure
services and their connection patterns. No hardcoded business logic.
"""

import os
import yaml
from typing import Dict, List, Optional, Tuple
from functools import lru_cache
from pathlib import Path

from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="InfraRegistry")


class InfrastructureService:
    """Metadata about an infrastructure service from compose."""

    def __init__(
        self,
        name: str,
        image: str,
        ports: List[str],
        env_vars: List[str]
    ):
        self.name = name
        self.image = image
        self.ports = ports
        self.env_vars = env_vars
        self.url_scheme = self._infer_url_scheme()
        self.default_port = self._extract_default_port()

    def _infer_url_scheme(self) -> str:
        """
        Infer URL scheme from service name or image.

        Examples:
            mongo:8.0 → mongodb://
            redis:7-alpine → redis://
            postgres:16-alpine → postgresql://
            neo4j:latest → bolt://  (neo4j uses bolt protocol)
            qdrant/qdrant → http://
        """
        # Check service name first (most reliable)
        name_lower = self.name.lower()
        if "mongo" in name_lower:
            return "mongodb"
        elif "redis" in name_lower:
            return "redis"
        elif "postgres" in name_lower:
            return "postgresql"
        elif "neo4j" in name_lower:
            return "bolt"  # Neo4j uses bolt protocol
        elif "qdrant" in name_lower:
            return "http"
        elif "keycloak" in name_lower:
            return "http"

        # Fallback to image name
        image_lower = self.image.lower()
        if "mongo" in image_lower:
            return "mongodb"
        elif "redis" in image_lower:
            return "redis"
        elif "postgres" in image_lower:
            return "postgresql"
        elif "neo4j" in image_lower:
            return "bolt"
        elif "qdrant" in image_lower:
            return "http"
        elif "keycloak" in image_lower:
            return "http"

        # Default to http
        return "http"

    def _extract_default_port(self) -> Optional[int]:
        """
        Extract default port from port mappings.

        Returns the container port (right side of mapping).

        Examples:
            ["27017:27017"] → 27017
            ["8080:80"] → 80
            ["6333:6333", "6334:6334"] → 6333 (first)
        """
        if not self.ports:
            return None

        # Take first port
        port_str = self.ports[0]

        # Handle ${VAR:-default}:port format
        if "$" in port_str:
            # Extract port after colon
            if ":" in port_str:
                port_str = port_str.split(":", 1)[1]

        # Extract container port (after colon if present)
        if ":" in port_str:
            port_str = port_str.split(":", 1)[1]

        # Clean up protocol suffix (/tcp)
        port_str = port_str.split("/")[0]

        try:
            return int(port_str)
        except ValueError:
            return None

    def build_url(self, endpoint: str) -> str:
        """
        Build connection URL for this service.

        Args:
            endpoint: Host:port or just host (e.g., "mongo.default.svc.cluster.local:27017")

        Returns:
            Full connection URL (e.g., "mongodb://mongo.default.svc.cluster.local:27017")
        """
        return f"{self.url_scheme}://{endpoint}"

    def __repr__(self) -> str:
        return (
            f"InfrastructureService(name={self.name!r}, "
            f"scheme={self.url_scheme!r}, port={self.default_port})"
        )


class InfrastructureRegistry:
    """
    Registry of available infrastructure services from compose definitions.

    Data-driven approach: reads compose/docker-compose.infra.yml to discover
    services instead of hardcoding mappings.
    """

    def __init__(self, compose_path: Optional[Path] = None):
        if compose_path is None:
            # Default to compose/docker-compose.infra.yml in project root
            project_root = Path(__file__).parent.parent.parent.parent
            compose_path = project_root / "compose" / "docker-compose.infra.yml"

        self.compose_path = compose_path
        self._services: Optional[Dict[str, InfrastructureService]] = None

    def _load_services(self) -> Dict[str, InfrastructureService]:
        """Load infrastructure services from compose file."""
        if not self.compose_path.exists():
            logger.warning(f"Infrastructure compose file not found: {self.compose_path}")
            return {}

        try:
            with open(self.compose_path, 'r') as f:
                data = yaml.safe_load(f)

            services = {}
            for service_name, service_def in data.get('services', {}).items():
                # Skip init/helper services (no ports = not a service we connect to)
                if not service_def.get('ports'):
                    continue

                # Extract environment variables this service needs
                env_vars = []
                environment = service_def.get('environment', [])
                if isinstance(environment, list):
                    # Format: ["KEY=value", "KEY2=value2"]
                    env_vars = [e.split('=')[0] for e in environment if '=' in e]
                elif isinstance(environment, dict):
                    # Format: {KEY: value, KEY2: value2}
                    env_vars = list(environment.keys())

                services[service_name] = InfrastructureService(
                    name=service_name,
                    image=service_def.get('image', ''),
                    ports=service_def.get('ports', []),
                    env_vars=env_vars
                )

            logger.info(f"Loaded {len(services)} infrastructure services from {self.compose_path.name}")
            return services

        except Exception as e:
            logger.error(f"Failed to load infrastructure compose: {e}")
            return {}

    @property
    def services(self) -> Dict[str, InfrastructureService]:
        """Get all infrastructure services (lazy-loaded)."""
        if self._services is None:
            self._services = self._load_services()
        return self._services

    def get_service(self, name: str) -> Optional[InfrastructureService]:
        """Get infrastructure service by name."""
        return self.services.get(name)

    def get_env_var_mapping(self) -> Dict[str, List[str]]:
        """
        Get mapping of service names to environment variable names.

        Returns:
            Dict mapping service_name → [env_var_names]

        Examples:
            {
                "mongo": ["MONGO_URL", "MONGODB_URL"],
                "redis": ["REDIS_URL"],
                "postgres": ["POSTGRES_URL", "DATABASE_URL"]
            }

        Note:
            This still uses conventions (MONGO_URL for mongo service) but could
            be made configurable via infrastructure-mapping.yaml in future.
        """
        mapping = {}

        for service_name, service in self.services.items():
            # Convention-based mapping: {SERVICE_NAME}_URL
            base_vars = [f"{service_name.upper()}_URL"]

            # Add common aliases
            if service_name == "mongo":
                base_vars.append("MONGODB_URL")
            elif service_name == "postgres":
                base_vars.append("DATABASE_URL")

            mapping[service_name] = base_vars

        return mapping

    def build_url(self, service_name: str, endpoint: str) -> Optional[str]:
        """
        Build connection URL for a service.

        Args:
            service_name: Service name (e.g., "mongo", "redis")
            endpoint: Endpoint from infrastructure scan (e.g., "mongo.default.svc:27017")

        Returns:
            Connection URL or None if service not found

        Examples:
            build_url("mongo", "mongo.default.svc:27017")
            → "mongodb://mongo.default.svc:27017"
        """
        service = self.get_service(service_name)
        if not service:
            logger.warning(f"Unknown infrastructure service: {service_name}")
            return None

        return service.build_url(endpoint)


# Global singleton
_registry: Optional[InfrastructureRegistry] = None


def get_infrastructure_registry() -> InfrastructureRegistry:
    """Get the global InfrastructureRegistry singleton."""
    global _registry
    if _registry is None:
        _registry = InfrastructureRegistry()
    return _registry
