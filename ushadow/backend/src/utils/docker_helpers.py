"""
Docker-specific utility functions.

Extracted from deployment_platforms.py to avoid duplication.
"""

from typing import Dict, List, Tuple, Optional
import logging

from src.models.deployment import DeploymentStatus

logger = logging.getLogger(__name__)


def parse_port_config(
    ports: List[str],
    service_id: Optional[str] = None
) -> Tuple[Dict[str, int], Dict[str, dict], Optional[int]]:
    """
    Parse port configuration from docker-compose format.

    Args:
        ports: List of port strings like ["8080:80", "9000:9000/tcp", "443"]
        service_id: Optional service ID for logging

    Returns:
        Tuple of (port_bindings, exposed_ports, first_host_port)
        - port_bindings: {container_port/protocol: host_port} for Docker API
        - exposed_ports: {container_port/protocol: {}} for Docker API
        - first_host_port: First host port for deployment tracking (None if only exposed)

    Examples:
        >>> parse_port_config(["8080:80", "9000:9000/tcp"])
        ({'80/tcp': 8080, '9000/tcp': 9000}, {'80/tcp': {}, '9000/tcp': {}}, 8080)

        >>> parse_port_config(["443"])
        ({}, {'443/tcp': {}}, 443)

    Raises:
        ValueError: If port format is invalid
    """
    if service_id:
        logger.info(f"[PORT DEBUG] Starting port parsing for {service_id}")
        logger.info(f"[PORT DEBUG] Input ports: {ports}")

    port_bindings = {}
    exposed_ports = {}
    first_host_port = None

    for port_str in ports:
        if service_id:
            logger.info(f"[PORT DEBUG] Processing port_str: {port_str}")

        if ":" in port_str:
            # Format: "host_port:container_port" or "host_port:container_port/protocol"
            host_port, container_port = port_str.split(":", 1)

            # Add protocol if not specified
            if "/" not in container_port:
                port_key = f"{container_port}/tcp"
            else:
                port_key = container_port

            try:
                port_bindings[port_key] = int(host_port)
                exposed_ports[port_key] = {}

                # Save first host port for deployment tracking
                if first_host_port is None:
                    first_host_port = int(host_port)

                if service_id:
                    logger.info(
                        f"[PORT DEBUG] Mapped: host={host_port} -> "
                        f"container={container_port} (key={port_key})"
                    )
            except ValueError as e:
                raise ValueError(f"Invalid port number in '{port_str}': {e}")

        else:
            # Format: "container_port" or "container_port/protocol" (expose only, no host binding)
            if "/" not in port_str:
                port_key = f"{port_str}/tcp"
            else:
                port_key = port_str

            exposed_ports[port_key] = {}

            # For exposed-only ports, use the container port for tracking
            if first_host_port is None:
                try:
                    # Extract port number from "port/protocol" format
                    port_num = port_str.split("/")[0] if "/" in port_str else port_str
                    first_host_port = int(port_num)
                except ValueError as e:
                    raise ValueError(f"Invalid port number in '{port_str}': {e}")

            if service_id:
                logger.info(f"[PORT DEBUG] Exposed only: {port_key}")

    if service_id:
        logger.info(f"[PORT DEBUG] Final port_bindings: {port_bindings}")
        logger.info(f"[PORT DEBUG] Final exposed_ports: {exposed_ports}")
        logger.info(f"[PORT DEBUG] Tracking first_host_port: {first_host_port}")

    return port_bindings, exposed_ports, first_host_port


def map_docker_status(docker_status: str) -> DeploymentStatus:
    """
    Map Docker container status to DeploymentStatus enum.

    Args:
        docker_status: Status from docker.containers.get().status
            ("created", "restarting", "running", "paused", "exited", "dead", etc.)

    Returns:
        DeploymentStatus enum value

    Examples:
        >>> map_docker_status("running")
        DeploymentStatus.RUNNING

        >>> map_docker_status("exited")
        DeploymentStatus.STOPPED

        >>> map_docker_status("dead")
        DeploymentStatus.FAILED

        >>> map_docker_status("unknown")
        DeploymentStatus.FAILED
    """
    status_map = {
        "created": DeploymentStatus.PENDING,
        "restarting": DeploymentStatus.DEPLOYING,
        "running": DeploymentStatus.RUNNING,
        "paused": DeploymentStatus.STOPPED,
        "exited": DeploymentStatus.STOPPED,
        "dead": DeploymentStatus.FAILED,
        "removing": DeploymentStatus.REMOVING,
    }

    return status_map.get(docker_status.lower(), DeploymentStatus.FAILED)
