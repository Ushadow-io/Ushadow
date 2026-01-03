"""Tailscale Serve management for dynamic routing.

This module provides functions to manage Tailscale serve routes dynamically.
Used by the Tailscale wizard for initial setup and by the deployment manager
when services are deployed/removed.
"""

import logging
import os
import docker
import yaml
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)


def get_tailnet_suffix() -> Optional[str]:
    """Get the tailnet suffix from stored Tailscale config.

    Extracts suffix from hostname like 'ushadow.spangled-kettle.ts.net'
    to return 'spangled-kettle.ts.net'.

    Returns:
        Tailnet suffix or None if not configured
    """
    try:
        config_path = "/config/tailscale.yaml"
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
                hostname = config.get('hostname', '')
                if hostname and '.' in hostname:
                    # hostname is like 'ushadow.spangled-kettle.ts.net'
                    # Return everything after the first dot
                    return hostname.split('.', 1)[1]
    except Exception as e:
        logger.debug(f"Could not read tailnet suffix: {e}")
    return None


def get_unode_dns_name(short_hostname: str) -> Optional[str]:
    """Get the full MagicDNS name for a u-node.

    Args:
        short_hostname: Short hostname like 'media-server'

    Returns:
        Full DNS name like 'media-server.spangled-kettle.ts.net' or None
    """
    suffix = get_tailnet_suffix()
    if suffix:
        return f"{short_hostname}.{suffix}"
    return None


def get_service_access_url(unode_hostname: str, port: int, is_local: bool = False) -> Optional[str]:
    """Get the access URL for a service deployed on a u-node.

    Args:
        unode_hostname: Short hostname of the u-node
        port: Service port
        is_local: Whether this is a local deployment (uses Tailscale serve)

    Returns:
        Access URL or None if cannot be determined
    """
    suffix = get_tailnet_suffix()
    if not suffix:
        return None

    if is_local:
        # Local services go through Tailscale serve on manager's hostname
        # Read manager's hostname from config
        try:
            config_path = "/config/tailscale.yaml"
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config = yaml.safe_load(f)
                    manager_hostname = config.get('hostname')
                    if manager_hostname:
                        return f"https://{manager_hostname}"
        except Exception:
            pass
        return None
    else:
        # Remote services accessed via u-node's MagicDNS + port
        dns_name = get_unode_dns_name(unode_hostname)
        if dns_name:
            return f"http://{dns_name}:{port}"
    return None

# Docker client
docker_client = docker.from_env()


def get_tailscale_container_name() -> str:
    """Get the Tailscale container name for this environment."""
    import os
    env_name = os.getenv("COMPOSE_PROJECT_NAME", "").strip()
    env_name = env_name if env_name else "ushadow"
    return f"{env_name}-tailscale"


def exec_tailscale_command(command: str) -> tuple[int, str, str]:
    """Execute a tailscale command in the container.

    Returns:
        Tuple of (exit_code, stdout, stderr)
    """
    container_name = get_tailscale_container_name()
    try:
        container = docker_client.containers.get(container_name)
        result = container.exec_run(command, demux=True)

        exit_code = result.exit_code
        output = result.output

        if isinstance(output, tuple):
            stdout = output[0].decode() if output[0] else ""
            stderr = output[1].decode() if output[1] else ""
        else:
            stdout = output.decode() if output else ""
            stderr = ""

        return exit_code, stdout, stderr
    except docker.errors.NotFound:
        logger.error(f"Tailscale container '{container_name}' not found")
        return 1, "", f"Container '{container_name}' not found"
    except Exception as e:
        logger.error(f"Error executing tailscale command: {e}")
        return 1, "", str(e)


def add_serve_route(path: str, target: str) -> bool:
    """Add a route to tailscale serve.

    Args:
        path: URL path (e.g., "/api", "/mem0", or "/" for root)
        target: Backend target (e.g., "http://backend:8000")

    Returns:
        True if successful, False otherwise
    """
    if path == "/":
        # Root route - no --set-path
        cmd = f"tailscale serve --bg {target}"
    else:
        cmd = f"tailscale serve --bg --set-path {path} {target}"

    exit_code, stdout, stderr = exec_tailscale_command(cmd)

    if exit_code == 0:
        logger.info(f"Added tailscale serve route: {path} -> {target}")
        return True
    else:
        logger.error(f"Failed to add route {path}: {stderr}")
        return False


def remove_serve_route(path: str) -> bool:
    """Remove a route from tailscale serve.

    Args:
        path: URL path to remove (e.g., "/api", "/mem0")

    Returns:
        True if successful, False otherwise
    """
    # To remove a specific path, we use tailscale serve off with the path
    if path == "/":
        cmd = "tailscale serve --https=443 off"
    else:
        cmd = f"tailscale serve --https=443 --set-path {path} off"

    exit_code, stdout, stderr = exec_tailscale_command(cmd)

    if exit_code == 0:
        logger.info(f"Removed tailscale serve route: {path}")
        return True
    else:
        logger.error(f"Failed to remove route {path}: {stderr}")
        return False


def reset_serve() -> bool:
    """Reset all tailscale serve configuration.

    Returns:
        True if successful, False otherwise
    """
    exit_code, stdout, stderr = exec_tailscale_command("tailscale serve reset")

    if exit_code == 0:
        logger.info("Reset tailscale serve configuration")
        return True
    else:
        logger.error(f"Failed to reset serve: {stderr}")
        return False


def get_serve_status() -> Optional[str]:
    """Get current tailscale serve status.

    Returns:
        Status string or None if error
    """
    exit_code, stdout, stderr = exec_tailscale_command("tailscale serve status")

    if exit_code == 0:
        return stdout
    return None


def configure_base_routes(
    backend_container: str = None,
    frontend_container: str = None,
    backend_port: int = 8000,
    frontend_port: int = 5173
) -> bool:
    """Configure the base routes for an environment.

    Sets up:
    - /api/* -> backend/api (path preserved)
    - /auth/* -> backend/auth (path preserved)
    - /ws_pcm -> backend/ws_pcm (websocket)
    - /ws_omi -> backend/ws_omi (websocket)
    - /* -> frontend

    Note: Tailscale serve strips the path prefix, so we include it in the
    target URL to preserve the full path at the backend.

    Args:
        backend_container: Backend container name (defaults to {env}-backend)
        frontend_container: Frontend container name (defaults to {env}-webui)
        backend_port: Backend internal port (default 8000)
        frontend_port: Frontend internal port (default 5173)

    Returns:
        True if all routes configured successfully
    """
    import os
    env_name = os.getenv("COMPOSE_PROJECT_NAME", "").strip() or "ushadow"

    if not backend_container:
        backend_container = f"{env_name}-backend"
    if not frontend_container:
        frontend_container = f"{env_name}-webui"

    backend_base = f"http://{backend_container}:{backend_port}"
    frontend_target = f"http://{frontend_container}:{frontend_port}"

    success = True

    # Configure backend routes - include path in target to preserve it
    # (Tailscale serve strips the --set-path prefix from the request)
    backend_routes = ["/api", "/auth", "/ws_pcm", "/ws_omi"]
    for route in backend_routes:
        target = f"{backend_base}{route}"
        if not add_serve_route(route, target):
            success = False

    # Chronicle backend route
    chronicle_container = "chronicle-backend"
    chronicle_port = 8000
    if not add_serve_route("/chronicle", f"http://{chronicle_container}:{chronicle_port}"):
        success = False

    # Frontend catches everything else
    if not add_serve_route("/", frontend_target):
        success = False

    return success


def add_service_route(service_id: str, container_name: str, port: int, path: str = None) -> bool:
    """Add a route for a deployed service.

    Note: Tailscale serve strips the path prefix, so we include it in the
    target URL to preserve the full path at the service.

    Args:
        service_id: Service identifier (used as default path)
        container_name: Container name to route to
        port: Container port
        path: URL path (defaults to /{service_id})

    Returns:
        True if successful
    """
    if path is None:
        path = f"/{service_id}"

    # Include path in target to preserve it (Tailscale strips the prefix)
    target = f"http://{container_name}:{port}{path}"
    return add_serve_route(path, target)


def remove_service_route(service_id: str, path: str = None) -> bool:
    """Remove a route for a deployed service.

    Args:
        service_id: Service identifier
        path: URL path (defaults to /{service_id})

    Returns:
        True if successful
    """
    if path is None:
        path = f"/{service_id}"

    return remove_serve_route(path)


def configure_caddy_proxy_route(caddy_port: int = 8880) -> bool:
    """Configure Tailscale Serve to route all traffic through Caddy proxy.

    Instead of configuring individual service routes, this sets up a single
    route that sends all HTTPS traffic to the Caddy reverse proxy.

    Caddy handles the path-based routing:
    - /chronicle/* -> Chronicle backend (strips prefix)
    - /api/* -> Ushadow backend
    - /auth/* -> Ushadow backend
    - /ws_pcm -> Ushadow WebSocket
    - /* -> Ushadow frontend

    Args:
        caddy_port: Caddy's listening port (default 8880)

    Returns:
        True if successful
    """
    caddy_target = f"http://ushadow-caddy:{caddy_port}"

    # Reset any existing routes first
    reset_serve()

    # Single route - all traffic goes to Caddy
    success = add_serve_route("/", caddy_target)

    if success:
        logger.info(f"Configured Tailscale Serve to use Caddy proxy at {caddy_target}")
    else:
        logger.error("Failed to configure Caddy proxy route")

    return success


def is_caddy_running() -> bool:
    """Check if the Caddy container is running.

    Returns:
        True if Caddy container exists and is running
    """
    try:
        container = docker_client.containers.get("ushadow-caddy")
        return container.status == "running"
    except docker.errors.NotFound:
        return False
    except Exception as e:
        logger.error(f"Error checking Caddy status: {e}")
        return False


def get_routing_mode() -> str:
    """Determine the current routing mode.

    Returns:
        'caddy' if using Caddy proxy, 'direct' if using direct routes, 'none' if not configured
    """
    status = get_serve_status()
    if not status:
        return "none"

    # If routing to caddy container, we're in caddy mode
    if "ushadow-caddy" in status or "caddy" in status.lower():
        return "caddy"
    elif status.strip():
        return "direct"
    return "none"
