"""
Startup utilities for Ushadow scripts.

Shared startup orchestration functions for go.sh and dev.sh.
Handles infrastructure startup, health checks, and service coordination.
"""

import subprocess
import sys
import time
import json
from typing import Tuple
from pathlib import Path

from docker_utils import DockerNetworkManager


def ensure_networks() -> bool:
    """
    Ensure ushadow-network and infra-network exist.

    Returns:
        True if both networks exist/created, False otherwise
    """
    try:
        results = DockerNetworkManager.ensure_networks()
        return all(results.values())
    except Exception as e:
        print(f"Warning: Could not create networks: {e}", file=sys.stderr)
        return False


def check_docker_available() -> bool:
    """
    Check if Docker is available and running.

    Returns:
        True if Docker is available, False otherwise
    """
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=5
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def check_infrastructure_running() -> bool:
    """
    Check if infrastructure containers are running.
    Checks for mongo, redis, and qdrant containers.

    Returns:
        True if all infrastructure containers are running, False otherwise
    """
    try:
        # Check each infrastructure service
        for service in ["mongo", "redis", "qdrant"]:
            # Use format filter to get exact container name match
            result = subprocess.run(
                ["docker", "ps", "--filter", f"name={service}", "--filter", "status=running", "--format", "{{.Names}}"],
                capture_output=True,
                text=True,
                timeout=5
            )
            # Check if we got an exact match (not a partial match)
            containers = [name.strip() for name in result.stdout.strip().split('\n') if name.strip()]
            if service not in containers:
                return False
        return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def check_infrastructure_exists() -> Tuple[bool, list]:
    """
    Check if infrastructure containers exist (running or stopped).

    Returns:
        Tuple of (all_exist: bool, existing_containers: list)
    """
    existing = []
    try:
        for service in ["mongo", "redis", "qdrant"]:
            result = subprocess.run(
                ["docker", "ps", "-a", "--filter", f"name={service}", "--format", "{{.Names}}"],
                capture_output=True,
                text=True,
                timeout=5
            )
            # Check if we got an exact match (not a partial match)
            containers = [name.strip() for name in result.stdout.strip().split('\n') if name.strip()]
            if service in containers:
                existing.append(service)

        return len(existing) == 3, existing
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False, existing


def start_infrastructure(
    compose_file: str = "compose/infrastructure-shared.yml",
    project_name: str = "infra",
    wait_seconds: int = 3
) -> Tuple[bool, str]:
    """
    Start infrastructure using docker compose or existing containers.

    Smart startup that:
    1. Ensures Docker networks exist
    2. Checks if containers exist but are stopped -> starts them
    3. If containers don't exist -> creates them with docker compose
    4. If already running -> does nothing

    Args:
        compose_file: Path to compose file (str or Path object)
        project_name: Docker compose project name (default: infra)
        wait_seconds: Seconds to wait after starting (default: 3)

    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        # Ensure Docker networks exist before starting infrastructure
        if not ensure_networks():
            return False, "Failed to create required Docker networks (ushadow-network, infra-network)"

        # Convert compose_file to Path object for consistent handling
        compose_path = Path(compose_file)

        # Check if infrastructure containers exist
        all_exist, existing = check_infrastructure_exists()

        if all_exist:
            # Containers exist, just start them
            started = []
            for container in existing:
                result = subprocess.run(
                    ["docker", "start", container],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode != 0:
                    error_msg = (result.stderr + result.stdout).strip()
                    if not error_msg:
                        error_msg = "Unknown error"
                    return False, f"Failed to start {container}: {error_msg}"
                started.append(container)

            # Wait for services to initialize
            if wait_seconds > 0:
                time.sleep(wait_seconds)

            return True, f"Started existing infrastructure containers: {', '.join(started)}"

        # Containers don't exist, create them with docker compose
        # Check if compose file exists
        if not compose_path.exists():
            return False, f"Compose file not found: {compose_file}"

        # Create and start infrastructure
        # Note: Must include --profile flags since all services in infra compose have profiles
        # Only start core infra (mongo, redis) - memory services started separately when needed
        # Use as_posix() for cross-platform file paths in docker compose
        result = subprocess.run(
            ["docker", "compose", "-f", str(compose_path.as_posix()), "-p", project_name,
             "--profile", "infra", "up", "-d"],
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.returncode != 0:
            # Combine stdout and stderr for complete error info
            error_msg = (result.stderr + result.stdout).strip()
            if not error_msg:
                error_msg = "Unknown error (no output from docker compose)"
            return False, f"Failed to create infrastructure: {error_msg}"

        # Wait for services to initialize
        if wait_seconds > 0:
            time.sleep(wait_seconds)

        return True, "Infrastructure created and started successfully"

    except subprocess.TimeoutExpired:
        return False, "Timeout starting infrastructure"
    except FileNotFoundError:
        return False, "Docker not found"
    except Exception as e:
        return False, f"Error starting infrastructure: {e}"


def wait_for_backend_health(
    port: int = 8000,
    timeout: int = 60,
    poll_interval: int = 2
) -> Tuple[bool, int]:
    """
    Wait for Chronicle backend to become healthy.

    Args:
        port: Backend port (default: 8000)
        timeout: Maximum seconds to wait (default: 60)
        poll_interval: Seconds between health checks (default: 2)

    Returns:
        Tuple of (healthy: bool, elapsed_seconds: int)
    """
    elapsed = 0

    while elapsed < timeout:
        try:
            result = subprocess.run(
                ["curl", "-s", f"http://localhost:{port}/health"],
                capture_output=True,
                timeout=5
            )

            if result.returncode == 0:
                return True, elapsed

        except subprocess.TimeoutExpired:
            pass
        except FileNotFoundError:
            # curl not available, fallback to basic check
            try:
                import socket
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                    sock.settimeout(1)
                    result = sock.connect_ex(('127.0.0.1', port))
                    if result == 0:
                        return True, elapsed
            except Exception:
                pass

        time.sleep(poll_interval)
        elapsed += poll_interval

    return False, elapsed



if __name__ == '__main__':
    import sys
    import json
    
    if len(sys.argv) < 2:
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == 'ensure-networks':
        ensure_networks()
    elif cmd == 'check-infrastructure':
        running = check_infrastructure_running()
        print(json.dumps({'running': running}))
    elif cmd == 'check-infrastructure-exists':
        all_exist, existing = check_infrastructure_exists()
        print(json.dumps({'all_exist': all_exist, 'existing': existing}))
    elif cmd == 'start-infrastructure':
        compose_file = sys.argv[2] if len(sys.argv) > 2 else 'compose/docker-compose.infra.yml'
        project_name = sys.argv[3] if len(sys.argv) > 3 else 'infra'
        success, msg = start_infrastructure(compose_file, project_name)
        print(json.dumps({'success': success, 'message': msg}))
    elif cmd == 'wait-backend':
        port = int(sys.argv[2]) if len(sys.argv) > 2 else 8000
        timeout = int(sys.argv[3]) if len(sys.argv) > 3 else 60
        healthy, elapsed = wait_for_backend_health(port, timeout)
        print(json.dumps({'healthy': healthy, 'elapsed': elapsed}))
