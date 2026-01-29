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
from dataclasses import dataclass
import json

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

# Docker client (lazy initialized)
_docker_client = None


def _get_docker_client():
    """Get Docker client, lazily initialized."""
    global _docker_client
    if _docker_client is None:
        _docker_client = docker.from_env()
    return _docker_client


def get_tailscale_container_name() -> str:
    """Get the Tailscale container name for this environment."""
    import os
    env_name = os.getenv("COMPOSE_PROJECT_NAME", "").strip()
    env_name = env_name if env_name else "ushadow"
    return f"{env_name}-tailscale"


def exec_tailscale_command(command: str) -> tuple[int, str, str]:
    """Execute a tailscale command in the container.

    Args:
        command: Command to execute. Can include pipes and shell operators.

    Returns:
        Tuple of (exit_code, stdout, stderr)
    """
    container_name = get_tailscale_container_name()
    try:
        container = _get_docker_client().containers.get(container_name)
        # If command contains pipes or shell operators, wrap in sh -c
        if '|' in command or '&&' in command or '||' in command or '>' in command or '<' in command:
            cmd = ['/bin/sh', '-c', command]
        else:
            cmd = command
        result = container.exec_run(cmd, demux=True)

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


@dataclass
class TailscaleStatus:
    """Unified Tailscale status information."""
    hostname: Optional[str] = None  # Full DNS name like "pink.spangled-kettle.ts.net"
    ip: Optional[str] = None  # IPv4 address like "100.x.x.x"
    authenticated: bool = False

    @property
    def ext_url(self) -> Optional[str]:
        """External HTTPS URL (through Tailscale serve)."""
        return f"https://{self.hostname}" if self.hostname else None

    @property
    def host_url(self) -> str:
        """Host/local URL for direct container access."""
        backend_port = int(os.getenv("BACKEND_PORT", "8000"))
        return f"http://localhost:{backend_port}"


def get_tailscale_status() -> TailscaleStatus:
    """Get Tailscale status (hostname, IP) from container.

    This is the single source of truth for Tailscale connection info.
    Use this instead of calling exec_in_container directly.

    Returns:
        TailscaleStatus with hostname, ip, and authenticated flag
    """
    status = TailscaleStatus()

    # Try to get status from container
    try:
        exit_code, stdout, _ = exec_tailscale_command("tailscale status --json")
        if exit_code == 0 and stdout.strip():
            data = json.loads(stdout)
            self_node = data.get("Self", {})

            # Get hostname (DNSName)
            dns_name = self_node.get("DNSName", "")
            if dns_name:
                status.hostname = dns_name.rstrip(".")
                status.authenticated = True

            # Get IPv4 address
            tailscale_ips = self_node.get("TailscaleIPs", [])
            for ip in tailscale_ips:
                if "." in ip:  # IPv4
                    status.ip = ip
                    break
    except Exception as e:
        logger.debug(f"Could not get Tailscale status from container: {e}")

    # Fall back to config file if container didn't return hostname
    if not status.hostname:
        try:
            config_path = "/config/tailscale.yaml"
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config = yaml.safe_load(f)
                    hostname = config.get('hostname', '')
                    if hostname:
                        status.hostname = hostname
                        status.authenticated = True
        except Exception as e:
            logger.debug(f"Could not read Tailscale hostname from config: {e}")

    # Fall back to env var for IP
    if not status.ip:
        status.ip = os.environ.get("TAILSCALE_IP")

    return status


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
    frontend_port: int = None  # Auto-detect from DEV_MODE
) -> bool:
    """Configure the base routes for an environment.

    Sets up:
    - /api/* -> backend/api (path preserved)
    - /auth/* -> backend/auth (path preserved)
    - /* -> frontend

    Note: Audio WebSockets use /ws/audio/relay (part of /api/* routing)
    The relay handles forwarding to Chronicle/Mycelia internally

    Note: Tailscale serve strips the path prefix, so we include it in the
    target URL to preserve the full path at the service.

    Chronicle REST APIs use /api/services/chronicle-backend/proxy/* through
    the ushadow backend. WebSockets connect directly for low latency.

    Args:
        backend_container: Backend container name (defaults to {env}-backend)
        frontend_container: Frontend container name (defaults to {env}-webui)
        backend_port: Backend internal port (default 8000)
        frontend_port: Frontend internal port (auto-detect: 5173 for dev, 80 for prod)

    Returns:
        True if all routes configured successfully
    """
    import os
    env_name = os.getenv("COMPOSE_PROJECT_NAME", "").strip() or "ushadow"

    if not backend_container:
        backend_container = f"{env_name}-backend"
    if not frontend_container:
        frontend_container = f"{env_name}-webui"

    # Frontend webui container port depends on dev/prod mode
    # Dev mode: Vite dev server on 5173
    # Prod mode: nginx on 80
    # (WEBUI_PORT env var is the external port mapping, not internal)
    if frontend_port is None:
        dev_mode = os.getenv("DEV_MODE", "false").lower() == "true"
        frontend_port = 5173 if dev_mode else 80

    backend_base = f"http://{backend_container}:{backend_port}"
    frontend_target = f"http://{frontend_container}:{frontend_port}"

    success = True

    # Configure backend routes - include path in target to preserve it
    # (Tailscale serve strips the --set-path prefix from the request)
    backend_routes = ["/api", "/auth"]
    for route in backend_routes:
        target = f"{backend_base}{route}"
        if not add_serve_route(route, target):
            success = False

    # NOTE: Audio WebSockets are handled by the audio relay at /ws/audio/relay
    # The relay forwards to Chronicle/Mycelia/other services via internal Docker networking
    # No direct Chronicle WebSocket routing needed at Layer 1

    # NOTE: Chronicle REST APIs are accessed via generic proxy pattern:
    # /api/services/chronicle-backend/proxy/* - unified auth through ushadow backend

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
