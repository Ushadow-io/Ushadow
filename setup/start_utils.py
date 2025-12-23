"""
Startup utilities for Chronicle scripts.

Shared startup orchestration functions for go.sh and quick-start.sh.
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
    Ensure chronicle-network and infra-network exist.

    Returns:
        True if both networks exist/created, False otherwise
    """
    try:
        results = DockerNetworkManager.ensure_chronicle_networks()
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
    Check if Chronicle infrastructure is running (checks for mongo container).

    Returns:
        True if infrastructure is running, False otherwise
    """
    try:
        result = subprocess.run(
            ["docker", "ps", "--filter", "name=^mongo$", "--filter", "status=running", "-q"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return bool(result.stdout.strip())
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def start_infrastructure(
    compose_file: str = "compose/infrastructure-shared.yml",
    project_name: str = "infra",
    wait_seconds: int = 3
) -> Tuple[bool, str]:
    """
    Start Chronicle infrastructure using docker compose.

    Args:
        compose_file: Path to compose file (default: compose/infrastructure-shared.yml)
        project_name: Docker compose project name (default: infra)
        wait_seconds: Seconds to wait after starting (default: 3)

    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        # Check if compose file exists
        if not Path(compose_file).exists():
            return False, f"Compose file not found: {compose_file}"

        # Start infrastructure
        result = subprocess.run(
            ["docker", "compose", "-f", compose_file, "-p", project_name, "up", "-d"],
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.returncode != 0:
            return False, f"Failed to start infrastructure: {result.stderr}"

        # Wait for services to initialize
        if wait_seconds > 0:
            time.sleep(wait_seconds)

        return True, "Infrastructure started successfully"

    except subprocess.TimeoutExpired:
        return False, "Timeout starting infrastructure"
    except FileNotFoundError:
        return False, "Docker compose not found"
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
    elif cmd == 'start-infrastructure':
        compose_file = sys.argv[2] if len(sys.argv) > 2 else 'docker-compose.infra.yml'
        project_name = sys.argv[3] if len(sys.argv) > 3 else 'infra'
        success, msg = start_infrastructure(compose_file, project_name)
        print(json.dumps({'success': success, 'message': msg}))
    elif cmd == 'wait-backend':
        port = int(sys.argv[2]) if len(sys.argv) > 2 else 8000
        timeout = int(sys.argv[3]) if len(sys.argv) > 3 else 60
        healthy, elapsed = wait_for_backend_health(port, timeout)
        print(json.dumps({'healthy': healthy, 'elapsed': elapsed}))
