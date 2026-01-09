"""Tailscale Serve Configuration Generator.

This module generates and applies the tailscale-serve.json configuration
for routing traffic through Tailscale Serve.

The configuration is generated from:
1. Base routes (ushadow backend + frontend) - always present
2. Service routes - dynamically added when services are deployed

When services are deployed/undeployed, the full config is regenerated
and applied via `tailscale serve set-raw`.
"""

import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from pydantic import BaseModel

from .tailscale_serve import exec_tailscale_command, get_tailnet_suffix

logger = logging.getLogger(__name__)


# ============================================================================
# Configuration Models
# ============================================================================

@dataclass
class ServeRoute:
    """A single route in the Tailscale Serve configuration."""
    path: str  # URL path (e.g., "/api", "/chronicle")
    container: str  # Docker container name
    port: int  # Container's internal port
    preserve_path: bool = True  # Include path in backend URL


@dataclass
class ServeConfig:
    """Full Tailscale Serve configuration."""
    hostname: str  # Full hostname (e.g., "pink.spangled-kettle.ts.net")
    routes: List[ServeRoute] = field(default_factory=list)

    def to_json(self) -> Dict[str, Any]:
        """Convert to Tailscale Serve JSON format."""
        handlers = {}

        for route in self.routes:
            # Build the proxy URL
            # If preserve_path is True, append the path to the backend URL
            # (Tailscale Serve strips the path prefix from the request)
            if route.preserve_path and route.path != "/":
                target = f"http://{route.container}:{route.port}{route.path}"
            else:
                target = f"http://{route.container}:{route.port}"

            handlers[route.path] = {"Proxy": target}

        return {
            "version": "alpha0",
            "TCP": {
                "443": {
                    "HTTPS": True
                }
            },
            "Web": {
                f"{self.hostname}:443": {
                    "Handlers": handlers
                }
            }
        }

    def to_json_string(self) -> str:
        """Convert to formatted JSON string."""
        return json.dumps(self.to_json(), indent=2)


# ============================================================================
# Route Collection
# ============================================================================

def get_base_routes(env_name: str = None) -> List[ServeRoute]:
    """Get the base routes for ushadow backend and frontend.

    These routes are always present regardless of which services are deployed.

    Args:
        env_name: Environment name (e.g., "ushadow-pink"). If None, auto-detected.

    Returns:
        List of base ServeRoute objects
    """
    if not env_name:
        env_name = os.getenv("COMPOSE_PROJECT_NAME", "").strip() or "ushadow"

    backend = f"{env_name}-backend"
    frontend = f"{env_name}-webui"

    # Use port 5173 for dev (Vite), port 80 for prod (nginx)
    dev_mode = os.getenv("DEV_MODE", "false").lower() == "true"
    frontend_port = 5173 if dev_mode else 80

    return [
        # Frontend catches all unmatched paths
        ServeRoute(path="/", container=frontend, port=frontend_port, preserve_path=False),
        # Backend API routes
        ServeRoute(path="/api", container=backend, port=8000, preserve_path=True),
        ServeRoute(path="/auth", container=backend, port=8000, preserve_path=True),
    ]


def get_deployed_service_routes(env_name: str = None) -> List[ServeRoute]:
    """Get routes from all currently deployed services.

    Reads the compose registry and checks which services are running,
    then generates routes based on:
    - route_path from x-ushadow (or defaults to /{service_name})
    - internal port from compose ports field

    Args:
        env_name: Environment name for container naming

    Returns:
        List of ServeRoute objects from deployed services
    """
    if not env_name:
        env_name = os.getenv("COMPOSE_PROJECT_NAME", "").strip() or "ushadow"

    routes = []

    try:
        from .compose_registry import get_compose_registry
        from .docker_manager import DockerManager

        registry = get_compose_registry()
        docker_manager = DockerManager()

        # Get all discovered services
        for service in registry.get_services():
            # Skip services without a route_path defined
            # (only services that explicitly want routing get routes)
            if not service.route_path:
                continue

            # Build the container name for this service
            container_name = f"{env_name}-{service.service_name}"

            # Check if the container is running
            try:
                container = docker_manager.client.containers.get(container_name)
                if container.status != "running":
                    logger.debug(f"Service {service.service_name} not running, skipping route")
                    continue
            except Exception:
                logger.debug(f"Container {container_name} not found, skipping route")
                continue

            # Get internal port from compose ports (first container port)
            internal_port = 8000  # Default
            if service.ports:
                first_port = service.ports[0]
                container_port = first_port.get("container")
                if container_port:
                    try:
                        internal_port = int(container_port)
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid container port for {service.service_name}: {container_port}")

            # Add route for this service
            routes.append(ServeRoute(
                path=service.route_path,
                container=container_name,
                port=internal_port,
                preserve_path=True,  # Always preserve path for service routes
            ))
            logger.debug(f"Added route: {service.route_path} -> {container_name}:{internal_port}")

    except Exception as e:
        logger.error(f"Error collecting service routes: {e}")

    return routes


# ============================================================================
# Config Generation
# ============================================================================

def generate_serve_config(hostname: str = None, env_name: str = None) -> ServeConfig:
    """Generate the full Tailscale Serve configuration.

    Combines base routes with routes from all deployed services.

    Args:
        hostname: Full Tailscale hostname. If None, read from config.
        env_name: Environment name for container naming

    Returns:
        ServeConfig object ready to be applied
    """
    if not hostname:
        # Try to get hostname from tailscale config
        try:
            import yaml
            config_path = "/config/tailscale.yaml"
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config = yaml.safe_load(f)
                    hostname = config.get('hostname')
        except Exception as e:
            logger.warning(f"Could not read Tailscale hostname: {e}")

    if not hostname:
        raise ValueError("Tailscale hostname not configured")

    # Collect all routes
    base_routes = get_base_routes(env_name)
    service_routes = get_deployed_service_routes(env_name)

    # Merge routes (service routes come first to take precedence)
    # More specific paths should come before less specific ones
    all_routes = service_routes + base_routes

    # Sort by path length (longer paths first) to ensure correct matching
    # The "/" path should always be last
    all_routes.sort(key=lambda r: (r.path == "/", -len(r.path)))

    logger.info(f"Generated Tailscale Serve config with {len(all_routes)} routes")
    for route in all_routes:
        logger.debug(f"  {route.path} -> {route.container}:{route.port}")

    return ServeConfig(hostname=hostname, routes=all_routes)


def write_serve_config(config: ServeConfig, output_path: str = None) -> str:
    """Write the Tailscale Serve configuration to a JSON file.

    Args:
        config: ServeConfig to write
        output_path: Path to write to. Defaults to /config/tailscale-serve.json

    Returns:
        Path to the written file
    """
    if not output_path:
        output_path = "/config/tailscale-serve.json"

    json_content = config.to_json_string()

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        f.write(json_content)

    logger.info(f"Wrote Tailscale Serve config to {output_path}")
    return output_path


# ============================================================================
# Config Application
# ============================================================================

def apply_serve_config(config: ServeConfig = None) -> bool:
    """Apply the Tailscale Serve configuration via set-raw.

    If no config is provided, generates one from current state.

    Note: This writes the config to /config/tailscale-serve.json first,
    then reads it via set-raw since we can't pipe stdin through docker exec.

    Args:
        config: ServeConfig to apply. If None, generates from current state.

    Returns:
        True if successful, False otherwise
    """
    if config is None:
        config = generate_serve_config()

    # Write config to file first (Tailscale container mounts /config)
    config_path = "/config/tailscale-serve.json"
    write_serve_config(config, config_path)

    # Apply via set-config with file path
    # The file path is the same inside the container since /config is mounted
    # Use --all to apply the full config (overwrites all services)
    cmd = f"tailscale serve set-config --all {config_path}"

    exit_code, stdout, stderr = exec_tailscale_command(cmd)

    if exit_code == 0:
        logger.info("Applied Tailscale Serve configuration successfully")
        return True
    else:
        logger.error(f"Failed to apply Tailscale Serve config: {stderr}")
        return False


def apply_serve_config_from_file(config_path: str = None) -> bool:
    """Apply Tailscale Serve configuration from a JSON file.

    Args:
        config_path: Path to the config file. Defaults to /config/tailscale-serve.json

    Returns:
        True if successful, False otherwise
    """
    if not config_path:
        config_path = "/config/tailscale-serve.json"

    if not os.path.exists(config_path):
        logger.error(f"Config file not found: {config_path}")
        return False

    # Apply via set-config with file path
    # Use --all to apply the full config (overwrites all services)
    cmd = f"tailscale serve set-config --all {config_path}"

    exit_code, stdout, stderr = exec_tailscale_command(cmd)

    if exit_code == 0:
        logger.info(f"Applied Tailscale Serve config from {config_path}")
        return True
    else:
        logger.error(f"Failed to apply config: {stderr}")
        return False


# ============================================================================
# Convenience Functions
# ============================================================================

def regenerate_and_apply(hostname: str = None, env_name: str = None) -> bool:
    """Regenerate the config from current state and apply it.

    This is the main entry point for updating routes when services
    are deployed or undeployed.

    Args:
        hostname: Tailscale hostname (optional, read from config if not provided)
        env_name: Environment name (optional, read from env if not provided)

    Returns:
        True if successful, False otherwise
    """
    try:
        config = generate_serve_config(hostname=hostname, env_name=env_name)
        write_serve_config(config)
        return apply_serve_config(config)
    except Exception as e:
        logger.error(f"Failed to regenerate and apply serve config: {e}")
        return False
