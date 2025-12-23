#!/usr/bin/env python3
"""
Setup utilities for Chronicle quickstart script.
Provides port checking, Redis database validation, Docker network management,
and other setup helpers.
"""

import sys
import socket
import subprocess
import json
from typing import Optional, List, Tuple

# Import Docker network management
from docker_utils import DockerNetworkManager

# Enable debug mode via environment variable
import os
DEBUG = os.getenv("SETUP_UTILS_DEBUG", "").lower() in ("1", "true", "yes")


def check_port_in_use(port: int) -> bool:
    """
    Check if a TCP port is already in use.

    Args:
        port: Port number to check

    Returns:
        True if port is in use, False if available
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            result = sock.connect_ex(('127.0.0.1', port))
            return result == 0
    except Exception:
        return False


def check_redis_db_has_data(db_num: int, container_name: str = "redis") -> bool:
    """
    Check if a Redis database has any keys.

    Args:
        db_num: Redis database number (0-15)
        container_name: Name of the Redis Docker container

    Returns:
        True if database has data, False if empty or Redis unavailable
    """
    try:
        # Check if Redis container is running
        ps_result = subprocess.run(
            ["docker", "ps", "--filter", f"name={container_name}",
             "--filter", "status=running", "-q"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if not ps_result.stdout.strip():
            # Redis not running - consider database empty
            return False

        # Check database size
        dbsize_result = subprocess.run(
            ["docker", "exec", container_name, "redis-cli", "-n", str(db_num), "DBSIZE"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if dbsize_result.returncode == 0:
            output = dbsize_result.stdout.strip()
            # Extract number from output like "(integer) 0"
            if ")" in output:
                count = int(output.split(")")[-1].strip())
            else:
                count = int(output)
            return count > 0

        return False

    except subprocess.TimeoutExpired:
        if DEBUG:
            print(f"Warning: Timeout checking Redis database {db_num}", file=sys.stderr)
        return False
    except Exception as e:
        if DEBUG:
            print(f"Warning: Error checking Redis database {db_num}: {e}", file=sys.stderr)
        return False


def get_redis_db_env_marker(db_num: int, container_name: str = "redis") -> Optional[str]:
    """
    Get the environment marker stored in a Redis database.

    Args:
        db_num: Redis database number (0-15)
        container_name: Name of the Redis Docker container

    Returns:
        Environment name if marker exists, None otherwise
    """
    try:
        # Check if Redis container is running
        ps_result = subprocess.run(
            ["docker", "ps", "--filter", f"name={container_name}",
             "--filter", "status=running", "-q"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if not ps_result.stdout.strip():
            return None

        # Get environment marker
        result = subprocess.run(
            ["docker", "exec", container_name, "redis-cli", "-n", str(db_num),
             "GET", "chronicle:env:name"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode == 0:
            env_name = result.stdout.strip()
            # Redis returns "(nil)" for non-existent keys
            if env_name and env_name != "(nil)":
                return env_name

        return None

    except subprocess.TimeoutExpired:
        if DEBUG:
            print(f"Warning: Timeout getting marker from Redis database {db_num}", file=sys.stderr)
        return None
    except Exception as e:
        if DEBUG:
            print(f"Warning: Error getting marker from Redis database {db_num}: {e}", file=sys.stderr)
        return None


def set_redis_db_env_marker(db_num: int, env_name: str, container_name: str = "redis") -> bool:
    """
    Set the environment marker in a Redis database.

    Args:
        db_num: Redis database number (0-15)
        env_name: Environment name to store
        container_name: Name of the Redis Docker container

    Returns:
        True if successful, False otherwise
    """
    try:
        # Check if Redis container is running
        ps_result = subprocess.run(
            ["docker", "ps", "--filter", f"name={container_name}",
             "--filter", "status=running", "-q"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if not ps_result.stdout.strip():
            return False

        # Set environment marker (no expiration)
        result = subprocess.run(
            ["docker", "exec", container_name, "redis-cli", "-n", str(db_num),
             "SET", "chronicle:env:name", env_name],
            capture_output=True,
            text=True,
            timeout=5
        )

        return result.returncode == 0

    except subprocess.TimeoutExpired:
        if DEBUG:
            print(f"Warning: Timeout setting marker in Redis database {db_num}", file=sys.stderr)
        return False
    except Exception as e:
        if DEBUG:
            print(f"Warning: Error setting marker in Redis database {db_num}: {e}", file=sys.stderr)
        return False


def find_available_redis_db(preferred_db: int = 0, env_name: Optional[str] = None,
                            container_name: str = "redis") -> int:
    """
    Find an available Redis database (0-15) for the given environment.

    First checks if any database already has this environment's marker.
    If not, tries preferred database, then finds an empty one.

    Args:
        preferred_db: Preferred database number to try first
        env_name: Environment name to match against stored markers
        container_name: Name of the Redis Docker container

    Returns:
        Available database number, or preferred_db if all checks fail
    """
    # If environment name provided, check for existing database with this marker
    if env_name:
        for db in range(16):
            marker = get_redis_db_env_marker(db, container_name)
            if marker == env_name:
                # Found database already used by this environment
                return db

    # Try preferred database first if empty
    if not check_redis_db_has_data(preferred_db, container_name):
        return preferred_db

    # Try all databases 0-15 for empty one
    for db in range(16):
        if not check_redis_db_has_data(db, container_name):
            return db

    # All databases have data or Redis unavailable - return preferred
    return preferred_db


def validate_ports(ports: List[int]) -> Tuple[bool, List[int]]:
    """
    Validate that a list of ports are available.

    Args:
        ports: List of port numbers to check

    Returns:
        Tuple of (all_available, list_of_conflicts)
    """
    conflicts = [port for port in ports if check_port_in_use(port)]
    return (len(conflicts) == 0, conflicts)


def ensure_auth_secret_key(env_file: str) -> Tuple[bool, str]:
    """
    Ensure AUTH_SECRET_KEY exists in .env file, generating and writing if needed.

    Args:
        env_file: Path to .env file

    Returns:
        Tuple of (created: bool, secret_key: str)
    """
    from pathlib import Path

    # Check if file exists and has AUTH_SECRET_KEY
    if Path(env_file).exists():
        try:
            with open(env_file, 'r') as f:
                for line in f:
                    if line.startswith('AUTH_SECRET_KEY=') and '=' in line:
                        secret_key = line.split('=', 1)[1].strip()
                        if secret_key:
                            return False, secret_key
        except Exception:
            pass

    # Generate new secret key
    secret_key = None
    try:
        result = subprocess.run(
            ["openssl", "rand", "-base64", "32"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            secret_key = result.stdout.strip()
    except Exception:
        pass

    # Fallback: use Python's secrets module
    if not secret_key:
        import secrets
        secret_key = secrets.token_urlsafe(32)

    # Write to file
    try:
        # Create parent directory if needed
        Path(env_file).parent.mkdir(parents=True, exist_ok=True)

        # Append AUTH_SECRET_KEY to file
        with open(env_file, 'a') as f:
            f.write(f"AUTH_SECRET_KEY={secret_key}\n")

        return True, secret_key
    except Exception as e:
        # Return key even if write failed (caller can handle)
        print(f"Warning: Could not write to {env_file}: {e}", file=sys.stderr)
        return True, secret_key


def clear_admin_password(env_file: str) -> bool:
    """
    Clear ADMIN_PASSWORD in .env file to trigger web UI registration.

    Args:
        env_file: Path to .env file

    Returns:
        True if successful or file doesn't exist, False on error
    """
    from pathlib import Path

    if not Path(env_file).exists():
        return True

    try:
        # Read file
        with open(env_file, 'r') as f:
            lines = f.readlines()

        # Update ADMIN_PASSWORD line
        modified = False
        for i, line in enumerate(lines):
            if line.startswith('ADMIN_PASSWORD='):
                if '=' in line and line.split('=', 1)[1].strip():
                    lines[i] = 'ADMIN_PASSWORD=\n'
                    modified = True

        # Write back if modified
        if modified:
            with open(env_file, 'w') as f:
                f.writelines(lines)

        return True

    except Exception as e:
        print(f"Warning: Could not clear ADMIN_PASSWORD: {e}", file=sys.stderr)
        return False




if __name__ == '__main__':
    import sys
    import json
    
    if len(sys.argv) < 2:
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == 'ensure-auth-key':
        env_file = sys.argv[2] if len(sys.argv) > 2 else 'backends/advanced/.env'
        created, key = ensure_auth_secret_key(env_file)
        print(json.dumps({'created': created}))
