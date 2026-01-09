#!/usr/bin/env python3
"""
Setup utilities for Ushadow quickstart script.
Provides port checking, Redis database validation, secrets management,
and other setup helpers.
"""

import sys
import socket
import subprocess
import json
import secrets
from pathlib import Path
from typing import Optional, List, Tuple

# Import Docker network management
from docker_utils import DockerNetworkManager

# Enable debug mode via environment variable
import os
DEBUG = os.getenv("SETUP_UTILS_DEBUG", "").lower() in ("1", "true", "yes")

try:
    import yaml
except ImportError:
    yaml = None


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
             "GET", "ushadow:env:name"],
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
             "SET", "ushadow:env:name", env_name],
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


def ensure_secrets_yaml(secrets_file: str) -> Tuple[bool, dict]:
    """
    Ensure secrets.yaml exists with all required security keys.
    Generates missing keys but preserves existing ones.

    Args:
        secrets_file: Path to secrets.yaml file

    Returns:
        Tuple of (created_new_keys: bool, secrets_dict: dict)
    """
    from pathlib import Path

    if yaml is None:
        print("Error: PyYAML not installed. Run: pip install pyyaml", file=sys.stderr)
        return False, {}

    secrets_path = Path(secrets_file)
    created_new = False

    # Load existing secrets or create new structure
    if secrets_path.exists():
        try:
            with open(secrets_path, 'r') as f:
                data = yaml.safe_load(f) or {}
        except Exception as e:
            print(f"Warning: Could not load {secrets_file}: {e}", file=sys.stderr)
            data = {}
    else:
        data = {}
        created_new = True

    # Ensure security section exists
    if 'security' not in data:
        data['security'] = {}
        created_new = True

    # Generate auth_secret_key if missing
    if not data['security'].get('auth_secret_key'):
        data['security']['auth_secret_key'] = secrets.token_urlsafe(32)
        created_new = True

    # Generate session_secret if missing
    if not data['security'].get('session_secret'):
        data['security']['session_secret'] = secrets.token_urlsafe(32)
        created_new = True

    # Note: No default admin credentials - users register via /register page

    # Ensure api_keys section exists
    if 'api_keys' not in data:
        data['api_keys'] = {
            'openai': '',
            'anthropic': '',
            'deepgram': '',
            'mistral': '',
            'pieces': ''
        }

    # Ensure services section exists
    if 'services' not in data:
        data['services'] = {
            'openmemory': {'api_key': ''},
            'chronicle': {'api_key': ''}
        }

    # Write back to file
    try:
        secrets_path.parent.mkdir(parents=True, exist_ok=True)

        with open(secrets_path, 'w') as f:
            # Write header comment
            f.write(f"# Ushadow Secrets\n")
            from datetime import datetime, timezone
            f.write(f"# Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}\n")
            f.write(f"# DO NOT COMMIT - Contains sensitive credentials\n")
            f.write(f"# This file is gitignored\n\n")

            # Write YAML data
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)

        # Set restrictive permissions (Unix only)
        try:
            secrets_path.chmod(0o600)
        except (OSError, NotImplementedError):
            pass  # Windows doesn't support chmod

        return created_new, data

    except Exception as e:
        print(f"Warning: Could not write {secrets_file}: {e}", file=sys.stderr)
        return created_new, data




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

    elif cmd == 'ensure-secrets':
        secrets_file = sys.argv[2] if len(sys.argv) > 2 else 'config/SECRETS/secrets.yaml'
        created_new, secrets_data = ensure_secrets_yaml(secrets_file)
        print(json.dumps({'created_new': created_new, 'has_auth_key': bool(secrets_data.get('security', {}).get('auth_secret_key'))}))

    elif cmd == 'create-admin':
        backend_port = int(sys.argv[2]) if len(sys.argv) > 2 else 8010
        secrets_file = sys.argv[3] if len(sys.argv) > 3 else 'config/SECRETS/secrets.yaml'

        # Load admin credentials from secrets.yaml
        if yaml is None:
            print(json.dumps({'success': False, 'error': 'PyYAML not installed'}))
            sys.exit(1)

        try:
            with open(secrets_file, 'r') as f:
                secrets_data = yaml.safe_load(f) or {}

            admin = secrets_data.get('admin', {})

            # Require explicit admin credentials - no hardcoded defaults
            # Users should register via web UI if not configured
            if not admin or not admin.get('email') or not admin.get('password'):
                print(json.dumps({
                    'success': False,
                    'error': 'No admin credentials in secrets.yaml - use /register page',
                    'skip': True
                }))
                sys.exit(0)  # Not an error, just skip

            name = admin.get('name', 'admin')
            email = admin['email']
            password = admin['password']

            # Call backend setup API
            import requests
            response = requests.post(
                f'http://localhost:{backend_port}/api/auth/setup',
                json={
                    'display_name': name,
                    'email': email,
                    'password': password,
                    'confirm_password': password
                },
                timeout=10
            )

            if response.status_code == 200:
                print(json.dumps({'success': True, 'message': 'Admin user created'}))
            elif response.status_code == 409:
                # Already exists
                print(json.dumps({'success': True, 'message': 'Admin user already exists'}))
            else:
                print(json.dumps({'success': False, 'error': response.text}))
                sys.exit(1)

        except requests.exceptions.ConnectionError:
            print(json.dumps({'success': False, 'error': 'Backend not reachable'}))
            sys.exit(1)
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))
            sys.exit(1)
