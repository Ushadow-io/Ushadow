#!/usr/bin/env python3
"""
Docker Network Fix Utility - Python Version

Fixes Docker network state issues by:
1. Stopping containers with bad network references
2. Removing old/orphaned networks
3. Using DockerNetworkManager to recreate networks properly
4. Verifying final state

Uses existing setup utilities for consistency.
"""

import sys
import subprocess
from pathlib import Path

# Add setup directory to path
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT / "setup"))

from docker_utils import DockerNetworkManager


# Colors
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    BOLD = '\033[1m'
    NC = '\033[0m'


def print_color(color: str, message: str):
    """Print colored message."""
    print(f"{color}{message}{Colors.NC}")


def run_command(cmd: list, capture: bool = True, timeout: int = 30) -> tuple[bool, str]:
    """
    Run a shell command and return success status and output.

    Args:
        cmd: Command as list of strings
        capture: Whether to capture output
        timeout: Timeout in seconds

    Returns:
        Tuple of (success: bool, output: str)
    """
    try:
        if capture:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            return result.returncode == 0, result.stdout.strip()
        else:
            result = subprocess.run(cmd, timeout=timeout)
            return result.returncode == 0, ""
    except subprocess.TimeoutExpired:
        return False, "Timeout"
    except FileNotFoundError:
        return False, "Command not found"
    except Exception as e:
        return False, str(e)


def check_docker_running() -> bool:
    """Check if Docker daemon is running."""
    success, _ = run_command(["docker", "info"])
    return success


def get_problem_containers() -> list[str]:
    """Get list of containers that may have network issues."""
    success, output = run_command([
        "docker", "ps", "-a",
        "--filter", "status=created",
        "--filter", "status=exited",
        "--format", "{{.Names}}"
    ])

    if not success or not output:
        return []

    # Filter for infrastructure containers
    containers = [
        name for name in output.split('\n')
        if any(svc in name for svc in ['mongo', 'redis', 'qdrant'])
    ]
    return containers


def stop_all_containers():
    """Stop all Ushadow containers using docker compose."""
    print("Stopping Ushadow containers...")

    # Stop main application
    run_command(
        ["docker", "compose", "down"],
        capture=False
    )

    # Stop infrastructure
    run_command(
        ["docker", "compose", "-f", "compose/docker-compose.infra.yml", "down"],
        capture=False
    )

    print_color(Colors.GREEN, "✓ Containers stopped")


def remove_problem_containers(containers: list[str]):
    """Remove containers with network issues."""
    if not containers:
        return

    print("Removing problematic containers...")
    for container in containers:
        print(f"  - Removing {container}")
        run_command(["docker", "rm", "-f", container])

    print_color(Colors.GREEN, "✓ Problematic containers removed")


def remove_old_networks():
    """Remove old network definitions."""
    print("Removing old networks...")

    networks_to_remove = [
        "ushadow-network",
        "infra-network",
        "chronicle-network"  # Legacy name
    ]

    for network in networks_to_remove:
        success, _ = run_command(["docker", "network", "rm", network])
        if success:
            print(f"  - Removed {network}")
        else:
            print(f"  - {network} not found (ok)")

    # Prune unused networks
    print("Pruning unused networks...")
    run_command(["docker", "network", "prune", "-f"])

    print_color(Colors.GREEN, "✓ Old networks removed")


def create_networks_with_manager() -> bool:
    """Use DockerNetworkManager to create networks properly."""
    print("Using DockerNetworkManager to create networks...")

    try:
        results = DockerNetworkManager.ensure_networks()

        for network, success in results.items():
            status = "✓" if success else "✗"
            color = Colors.GREEN if success else Colors.RED
            print_color(color, f"  {status} {network}")

        return all(results.values())

    except Exception as e:
        print_color(Colors.RED, f"✗ Error creating networks: {e}")
        return False


def verify_networks() -> bool:
    """Verify all required networks exist."""
    print("Verifying networks...")

    all_exist = True
    for network_name in DockerNetworkManager.NETWORKS.keys():
        exists = DockerNetworkManager.network_exists(network_name)
        status = "✓" if exists else "✗"
        color = Colors.GREEN if exists else Colors.RED
        print_color(color, f"  {status} {network_name}")

        if not exists:
            all_exist = False

    return all_exist


def list_current_networks():
    """List current Docker networks."""
    print("\nCurrent networks:")
    success, output = run_command(["docker", "network", "ls"])
    if success:
        print(output)
    else:
        print("  Could not list networks")


def main():
    """Main execution."""
    print_color(Colors.BOLD, "🔧 Docker Network Fix Utility (Python)")
    print_color(Colors.BOLD, "=" * 50)
    print()

    # Change to project root
    import os
    os.chdir(PROJECT_ROOT)

    # Step 1: Check Docker
    print_color(Colors.BLUE, "Step 1: Checking Docker...")
    print("-" * 40)

    if not check_docker_running():
        print_color(Colors.RED, "❌ Docker is not running")
        print("Please start Docker Desktop and try again.")
        return 1

    print_color(Colors.GREEN, "✓ Docker is running")
    print()

    # Step 2: Check current state
    print_color(Colors.BLUE, "Step 2: Checking current state...")
    print("-" * 40)

    list_current_networks()
    print()

    problem_containers = get_problem_containers()
    if problem_containers:
        print_color(Colors.YELLOW, f"⚠ Found {len(problem_containers)} containers with potential issues:")
        for container in problem_containers:
            print(f"  - {container}")
    else:
        print_color(Colors.GREEN, "✓ No problematic containers found")
    print()

    # Step 3: Clean up
    print_color(Colors.BLUE, "Step 3: Cleaning up...")
    print("-" * 40)

    stop_all_containers()
    print()

    if problem_containers:
        remove_problem_containers(problem_containers)
        print()

    remove_old_networks()
    print()

    # Step 4: Recreate networks
    print_color(Colors.BLUE, "Step 4: Creating networks with DockerNetworkManager...")
    print("-" * 40)

    if not create_networks_with_manager():
        print_color(Colors.YELLOW, "⚠ Some networks failed to create")
    else:
        print_color(Colors.GREEN, "✓ Networks created successfully")
    print()

    # Step 5: Verify
    print_color(Colors.BLUE, "Step 5: Verifying...")
    print("-" * 40)

    if not verify_networks():
        print_color(Colors.RED, "⚠ Some networks are missing")
        return 1

    print()
    list_current_networks()
    print()

    # Success
    print("=" * 50)
    print_color(Colors.GREEN + Colors.BOLD, "✅ Network fix complete!")
    print("=" * 50)
    print()
    print("Next steps:")
    print("  1. Run: ./go.sh         # Start application")
    print("  2. Or:  ./dev.sh        # Start in dev mode")
    print()
    print("If issues persist:")
    print("  - Check logs: docker compose logs")
    print("  - Full rebuild: docker compose build --no-cache")
    print("  - Report: https://github.com/Ushadow-io/Ushadow/issues")
    print()

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
        print_color(Colors.YELLOW, "⚠ Interrupted by user")
        sys.exit(130)
    except Exception as e:
        print()
        print_color(Colors.RED, f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
