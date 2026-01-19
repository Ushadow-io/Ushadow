"""
Unified YAML parser using ruamel.yaml for comment-preserving read/write.

This module provides:
- BaseYAMLParser: Common YAML operations with comment preservation
- ComposeParser: Docker Compose file parsing with env var extraction

The ComposeParser extracts:
- Services and their configuration
- Environment variables (identifying required vs optional)
- x-ushadow extension metadata for capability requirements
"""

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass, field

from ruamel.yaml import YAML

logger = logging.getLogger(__name__)


class BaseYAMLParser:
    """
    Base YAML parser with ruamel.yaml for comment preservation.

    Provides common operations for all YAML-based configs.
    Unlike PyYAML's safe_load, ruamel preserves comments and formatting
    when round-tripping (load -> modify -> save).
    """

    def __init__(self):
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self.yaml.default_flow_style = False
        self.yaml.width = 400  # Wider lines to avoid unnecessary wrapping

    def load(self, path: Union[str, Path]) -> Dict[str, Any]:
        """
        Load YAML file, returning empty dict if not found.

        Args:
            path: Path to YAML file

        Returns:
            Parsed YAML content as dict, or empty dict if file not found
        """
        path = Path(path)
        if not path.exists():
            logger.warning(f"YAML file not found: {path}")
            return {}

        with open(path, "r") as f:
            return self.yaml.load(f) or {}

    def save(self, path: Union[str, Path], data: Dict[str, Any]) -> None:
        """
        Save data to YAML file, preserving comments if possible.

        Args:
            path: Path to save to
            data: Data to save
        """
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, "w") as f:
            self.yaml.dump(data, f)

    def get_nested(self, data: Dict, path: str, default: Any = None) -> Any:
        """
        Get nested value using dot notation.

        Args:
            data: Dict to traverse
            path: Dot-separated path (e.g., "services.mem0.environment")
            default: Value to return if path not found

        Returns:
            Value at path, or default if not found

        Example:
            >>> parser.get_nested(data, "services.mem0.image")
            "ghcr.io/ushadow-io/u-mem0-api:latest"
        """
        keys = path.split(".")
        current = data

        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return default

        return current

    def set_nested(self, data: Dict, path: str, value: Any) -> None:
        """
        Set nested value using dot notation, creating intermediate dicts.

        Args:
            data: Dict to modify
            path: Dot-separated path
            value: Value to set

        Example:
            >>> parser.set_nested(data, "services.mem0.enabled", True)
        """
        keys = path.split(".")
        current = data

        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]

        current[keys[-1]] = value

    def merge(self, base: Dict, overlay: Dict) -> Dict:
        """
        Deep merge overlay into base dict.

        Overlay values override base values. Nested dicts are merged recursively.

        Args:
            base: Base dictionary
            overlay: Dictionary to merge on top

        Returns:
            Merged dictionary (new dict, doesn't modify inputs)
        """
        result = dict(base)

        for key, value in overlay.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self.merge(result[key], value)
            else:
                result[key] = value

        return result


# ============================================================================
# Compose Parser Data Classes
# ============================================================================

@dataclass
class ComposeEnvVar:
    """
    Environment variable extracted from compose file.

    Attributes:
        name: Variable name (e.g., "OPENAI_API_KEY")
        has_default: Whether a default value is specified (includes empty string)
        default_value: The default value if specified (None, "", or actual value)
        is_required: True if no default syntax used (${VAR} vs ${VAR:-})

    Required/Optional semantics (standard bash/Docker behavior):
        ${VAR}        → required - container won't start if unset
        ${VAR:-}      → optional - defaults to empty string
        ${VAR:-value} → optional - defaults to "value"
    """
    name: str
    has_default: bool = False
    default_value: Optional[str] = None
    is_required: bool = True  # True if no default

    def __repr__(self) -> str:
        if self.has_default:
            return f"ComposeEnvVar({self.name}={self.default_value})"
        return f"ComposeEnvVar({self.name}, required)"


@dataclass
class ComposeService:
    """
    Service extracted from compose file.

    Attributes:
        name: Service name from compose (e.g., "mem0")
        image: Docker image
        env_vars: List of environment variables
        ports: Port mappings
        depends_on: Service dependencies
        profiles: Compose profiles this service belongs to
        healthcheck: Health check configuration
        requires: Capability requirements from x-ushadow (e.g., ["llm"])
        display_name: Human-readable display name from x-ushadow (e.g., "OpenMemory")
        description: Human-readable description from x-ushadow
    """
    name: str
    image: Optional[str] = None
    env_vars: List[ComposeEnvVar] = field(default_factory=list)
    ports: List[Dict[str, Any]] = field(default_factory=list)
    depends_on: List[str] = field(default_factory=list)
    profiles: List[str] = field(default_factory=list)
    healthcheck: Optional[Dict[str, Any]] = None
    volumes: List[str] = field(default_factory=list)
    networks: List[str] = field(default_factory=list)

    # From x-ushadow extension
    requires: List[str] = field(default_factory=list)  # Capabilities this service needs
    optional: List[str] = field(default_factory=list)  # Optional capabilities (used if available)
    provides: Optional[str] = None  # Capability this service implements (e.g., "memory")
    display_name: Optional[str] = None
    description: Optional[str] = None
    namespace: Optional[str] = None  # Docker Compose project name / K8s namespace
    infra_services: List[str] = field(default_factory=list)  # Infra services to start first
    route_path: Optional[str] = None  # Tailscale Serve route path (e.g., "/chronicle")

    @property
    def required_env_vars(self) -> List[ComposeEnvVar]:
        """Get env vars that must be injected (no default)."""
        return [ev for ev in self.env_vars if ev.is_required]

    @property
    def optional_env_vars(self) -> List[ComposeEnvVar]:
        """Get env vars with defaults (can be overridden)."""
        return [ev for ev in self.env_vars if not ev.is_required]


@dataclass
class ParsedCompose:
    """
    Fully parsed compose file.

    Attributes:
        path: Path to the compose file
        services: Dict of service name -> ComposeService
        networks: Network definitions
        volumes: Volume definitions
        x_ushadow: Raw x-ushadow extension data
    """
    path: Path
    services: Dict[str, ComposeService] = field(default_factory=dict)
    networks: Dict[str, Any] = field(default_factory=dict)
    volumes: Dict[str, Any] = field(default_factory=dict)
    x_ushadow: Dict[str, Any] = field(default_factory=dict)

    def get_service(self, name: str) -> Optional[ComposeService]:
        """Get a service by name."""
        return self.services.get(name)

    def get_services_requiring(self, capability: str) -> List[ComposeService]:
        """Get all services that require a specific capability."""
        return [s for s in self.services.values() if capability in s.requires]


# ============================================================================
# Compose Parser
# ============================================================================

class ComposeParser(BaseYAMLParser):
    """
    Parser for Docker Compose files.

    Extracts services, env vars, and x-ushadow metadata.

    The x-ushadow extension allows declaring capability requirements:

        x-ushadow:
          mem0:
            requires: [llm]
          mem0-ui:
            requires: []

    Environment variables are parsed using standard Docker/bash semantics:
        ${VAR}        → Required - must be injected at runtime
        ${VAR:-}      → Optional - defaults to empty string if not set
        ${VAR:-value} → Optional - has explicit default value

    This allows conditional vars (like NEO4J_PASSWORD) to be marked optional
    with empty default, while truly required vars use ${VAR} syntax.

    Example:
        >>> parser = ComposeParser()
        >>> result = parser.parse("compose/openmemory-compose.yaml")
        >>> mem0 = result.services["mem0"]
        >>> print(mem0.requires)  # ['llm']
        >>> print([e.name for e in mem0.required_env_vars])
        ['OPENAI_API_KEY']  # Only vars using ${VAR} syntax
    """

    # Regex for ${VAR:-default} pattern
    # Matches: ${VAR}, ${VAR:-}, ${VAR:-default}
    ENV_VAR_PATTERN = re.compile(r'\$\{([^:}]+)(?::-([^}]*))?\}')

    def parse(self, path: Union[str, Path]) -> ParsedCompose:
        """
        Parse compose file and return structured result.

        Args:
            path: Path to compose file

        Returns:
            ParsedCompose with services, networks, volumes, and metadata
        """
        path = Path(path)
        data = self.load(path)

        if not data:
            logger.warning(f"Empty or missing compose file: {path}")
            return ParsedCompose(path=path)

        # Get x-ushadow metadata
        x_ushadow = data.get("x-ushadow", {})

        # Parse services
        services = {}
        for name, service_data in data.get("services", {}).items():
            service = self._parse_service(name, service_data, x_ushadow)
            services[name] = service

        return ParsedCompose(
            path=path,
            services=services,
            networks=data.get("networks", {}),
            volumes=data.get("volumes", {}),
            x_ushadow=x_ushadow,
        )

    def _parse_service(
        self,
        name: str,
        data: Dict[str, Any],
        x_ushadow: Dict[str, Any]
    ) -> ComposeService:
        """Parse a single service definition."""

        # Extract env vars
        env_vars = self._parse_env_vars(data.get("environment", []))

        # Extract depends_on (handle both short and long form)
        depends_on = self._parse_depends_on(data.get("depends_on", []))

        # Extract ports
        ports = self._parse_ports(data.get("ports", []))

        # Extract volumes (just the list, not full parsing)
        volumes = data.get("volumes", [])
        if isinstance(volumes, list):
            volumes = [str(v) if not isinstance(v, str) else v for v in volumes]
        else:
            volumes = []

        # Extract networks
        networks = data.get("networks", [])
        if isinstance(networks, list):
            networks = networks
        elif isinstance(networks, dict):
            networks = list(networks.keys())
        else:
            networks = []

        # Get x-ushadow metadata for this service
        service_meta = x_ushadow.get(name, {})
        requires = service_meta.get("requires", [])
        optional = service_meta.get("optional", [])
        provides = service_meta.get("provides")  # Capability this service implements
        display_name = service_meta.get("display_name")
        description = service_meta.get("description")
        # These are at top level of x-ushadow, shared by all services in file
        namespace = x_ushadow.get("namespace")
        infra_services = x_ushadow.get("infra_services", [])
        # Route path for Tailscale Serve (e.g., "/chronicle")
        route_path = service_meta.get("route_path")

        return ComposeService(
            name=name,
            image=self._resolve_image(data.get("image")),
            env_vars=env_vars,
            ports=ports,
            depends_on=depends_on,
            profiles=data.get("profiles", []),
            healthcheck=data.get("healthcheck"),
            volumes=volumes,
            networks=networks,
            requires=requires,
            optional=optional,
            provides=provides,
            display_name=display_name,
            description=description,
            namespace=namespace,
            infra_services=infra_services,
            route_path=route_path,
        )

    def _resolve_image(self, image: Optional[str]) -> Optional[str]:
        """
        Resolve image name, handling variable interpolation display.

        Note: We don't actually interpolate - just return the raw string
        so the caller knows what variables are expected.
        """
        return image

    def _parse_env_vars(
        self,
        environment: Union[List, Dict, None]
    ) -> List[ComposeEnvVar]:
        """
        Parse environment section into structured env vars.

        Handles:
        - List format: ["VAR=value", "VAR", "VAR=${OTHER:-default}"]
        - Dict format: {VAR: value, VAR2: "${OTHER:-default}"}
        """
        if not environment:
            return []

        env_vars = []

        # Handle list format
        if isinstance(environment, list):
            for item in environment:
                env_var = self._parse_env_item(item)
                if env_var:
                    env_vars.append(env_var)

        # Handle dict format
        elif isinstance(environment, dict):
            for key, value in environment.items():
                if value is None:
                    # Bare variable: VAR: (null in YAML)
                    env_vars.append(ComposeEnvVar(
                        name=key,
                        has_default=False,
                        default_value=None,
                        is_required=True,
                    ))
                else:
                    env_var = self._parse_env_item(f"{key}={value}")
                    if env_var:
                        env_vars.append(env_var)

        return env_vars

    def _parse_env_item(self, item: Any) -> Optional[ComposeEnvVar]:
        """Parse a single environment item."""
        if item is None or not isinstance(item, str):
            return None

        item = item.strip()
        if not item:
            return None

        # Check for KEY=VALUE format
        if "=" in item:
            key, value = item.split("=", 1)
            key = key.strip()
            value = value.strip()

            # Empty value after = means required
            if not value:
                return ComposeEnvVar(
                    name=key,
                    has_default=False,
                    default_value=None,
                    is_required=True,
                )

            # Check for ${VAR:-default} pattern in value
            match = self.ENV_VAR_PATTERN.search(value)
            if match:
                var_name, default = match.groups()
                # ${VAR} (no :-) → required (default is None)
                # ${VAR:-} → optional with empty string default
                # ${VAR:-value} → optional with explicit default
                has_default = default is not None  # If :- is present, it has a default
                return ComposeEnvVar(
                    name=key,
                    has_default=has_default,
                    default_value=default if has_default else None,
                    is_required=not has_default,
                )

            # Plain value - has a hardcoded default
            return ComposeEnvVar(
                name=key,
                has_default=True,
                default_value=value,
                is_required=False,
            )

        # Bare variable name - required, no default
        return ComposeEnvVar(
            name=item,
            has_default=False,
            default_value=None,
            is_required=True,
        )

    def _parse_depends_on(
        self,
        depends_on: Union[List, Dict, None]
    ) -> List[str]:
        """
        Parse depends_on (handles both short and long form).

        Short form: ["service1", "service2"]
        Long form: {service1: {condition: service_healthy}, ...}
        """
        if not depends_on:
            return []

        if isinstance(depends_on, list):
            return [str(d) for d in depends_on]

        if isinstance(depends_on, dict):
            return list(depends_on.keys())

        return []

    def _parse_ports(self, ports: List) -> List[Dict[str, Any]]:
        """
        Parse ports into structured format.

        Handles:
        - String format: "8080:80", "8080:80/tcp"
        - With interpolation: "${PORT:-8080}:80"
        - Dict format: {target: 80, published: 8080}
        """
        result = []
        for port in ports:
            if isinstance(port, str):
                # Remove protocol suffix
                port_str = port.replace("/tcp", "").replace("/udp", "")

                # Find the last colon that's NOT inside ${...}
                # This handles "${PORT:-8080}:80" correctly
                last_colon = -1
                depth = 0
                for i, char in enumerate(port_str):
                    if char == '{':
                        depth += 1
                    elif char == '}':
                        depth -= 1
                    elif char == ':' and depth == 0:
                        last_colon = i

                if last_colon > 0:
                    result.append({
                        "host": port_str[:last_colon],
                        "container": port_str[last_colon + 1:],
                    })
                else:
                    result.append({
                        "container": port_str,
                    })
            elif isinstance(port, dict):
                result.append({
                    "host": str(port.get("published", "")),
                    "container": str(port.get("target", "")),
                })
        return result


# ============================================================================
# Factory function
# ============================================================================

def get_compose_parser() -> ComposeParser:
    """Get a ComposeParser instance."""
    return ComposeParser()
