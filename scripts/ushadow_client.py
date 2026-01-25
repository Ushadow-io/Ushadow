#!/usr/bin/env python3
"""
ushadow API Client

Command-line client for interacting with the ushadow backend API.
Used by Makefile targets and scripts for service management.

Usage:
    python scripts/ushadow_client.py service start chronicle-backend
    python scripts/ushadow_client.py service stop chronicle-backend
    python scripts/ushadow_client.py service restart chronicle-backend
    python scripts/ushadow_client.py service status
    python scripts/ushadow_client.py health
"""

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


def load_env() -> dict:
    """Load environment variables from .env file."""
    env_file = Path(__file__).parent.parent / ".env"
    env_vars = {}
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, _, value = line.partition('=')
                    env_vars[key.strip()] = value.strip()
    return env_vars


def load_secrets() -> dict:
    """Load secrets from config/SECRETS/secrets.yaml."""
    secrets_file = Path(__file__).parent.parent / "config" / "SECRETS" / "secrets.yaml"
    if secrets_file.exists() and HAS_YAML:
        with open(secrets_file) as f:
            return yaml.safe_load(f) or {}
    return {}


def get_base_url() -> str:
    """Get ushadow backend URL from environment."""
    env = load_env()
    port = env.get("BACKEND_PORT", os.environ.get("BACKEND_PORT", "8000"))
    host = env.get("BACKEND_HOST", os.environ.get("BACKEND_HOST", "localhost"))
    return f"http://{host}:{port}"


# Token cache
_cached_token = None
_verbose = False


def set_verbose(verbose: bool):
    """Enable/disable verbose output."""
    global _verbose
    _verbose = verbose


def get_auth_token() -> str:
    """Get authentication token, logging in if necessary."""
    global _cached_token
    if _cached_token:
        return _cached_token

    # Try environment variable first
    token = os.environ.get("USHADOW_TOKEN")
    if token:
        _cached_token = token
        return token

    # Load credentials from secrets.yaml (preferred) or .env (fallback)
    secrets = load_secrets()
    env = load_env()

    # Get email: secrets.yaml admin.email > .env > default
    admin_config = secrets.get("admin", {})
    email = admin_config.get("email") or env.get("ADMIN_EMAIL") or os.environ.get("ADMIN_EMAIL", "admin@example.com")

    # Get password: secrets.yaml admin.password > .env > environment
    password = admin_config.get("password") or env.get("ADMIN_PASSWORD") or os.environ.get("ADMIN_PASSWORD")

    if not password:
        print("⚠️  No admin password found in secrets.yaml or .env")
        return None

    # Login via form-data (FastAPI Users expects this format)
    login_url = f"{get_base_url()}/api/auth/jwt/login"
    from urllib.parse import urlencode
    login_data = urlencode({"username": email, "password": password}).encode()

    try:
        if _verbose:
            print(f"🔐 Logging in as {email}...")
        req = Request(login_url, data=login_data, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode())
            _cached_token = result.get("access_token")
            if _verbose:
                print(f"✅ Login successful")
            return _cached_token
    except HTTPError as e:
        try:
            error_body = json.loads(e.read().decode())
            detail = error_body.get("detail", str(e))
        except Exception:
            detail = f"HTTP {e.code}: {e.reason}"
        print(f"⚠️  Login failed: {detail}")
        return None
    except Exception as e:
        print(f"⚠️  Login failed: {e}")
        return None


def api_request(endpoint: str, method: str = "GET", data: dict = None, auth: bool = False) -> dict:
    """Make an API request to ushadow backend."""
    url = f"{get_base_url()}{endpoint}"
    headers = {"Content-Type": "application/json"}

    # Add authentication if required
    if auth:
        token = get_auth_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        else:
            return {"error": True, "detail": "Authentication required but login failed"}

    body = json.dumps(data).encode() if data else None

    try:
        req = Request(url, data=body, headers=headers, method=method)
        with urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except HTTPError as e:
        try:
            raw_body = e.read().decode()
            error_body = json.loads(raw_body)
            return {"error": True, "status": e.code, "detail": error_body.get("detail", raw_body)}
        except Exception:
            return {"error": True, "status": e.code, "detail": f"HTTP {e.code}: {e.reason}"}
    except URLError as e:
        return {"error": True, "detail": f"Connection failed: {e.reason}"}
    except Exception as e:
        return {"error": True, "detail": str(e)}


def cmd_health(args):
    """Check ushadow backend health."""
    result = api_request("/health")
    if result.get("error"):
        print(f"❌ ushadow backend unreachable: {result.get('detail')}")
        return 1
    print(f"✅ ushadow backend healthy")
    return 0


def cmd_service_list(args):
    """List all services."""
    result = api_request("/api/services/")  # Trailing slash required

    # Handle error response
    if isinstance(result, dict) and result.get("error"):
        print(f"❌ Error: {result.get('detail')}")
        return 1

    # API returns list directly
    services = result if isinstance(result, list) else result.get("services", [])
    print(f"{'Name':<30} {'Status':<15} {'Description'}")
    print("-" * 80)
    for svc in services:
        name = svc.get("service_name", svc.get("name", "unknown"))
        status = svc.get("status", "unknown")
        health = svc.get("health", "")
        desc = svc.get("description", "")[:30]

        if status == "running":
            if health == "healthy":
                status_icon = "🟢"
            elif health == "unhealthy":
                status_icon = "🟡"
            else:
                status_icon = "🔵"
        elif status in ("stopped", "not_found", "exited"):
            status_icon = "🔴"
        else:
            status_icon = "⚪"

        print(f"{name:<30} {status_icon} {status:<12} {desc}")
    return 0


def cmd_service_action(args):
    """Start, stop, or restart a service."""
    action = args.action  # start, stop, restart
    service_name = args.service_name

    print(f"🔄 {action.capitalize()}ing {service_name}...")
    result = api_request(f"/api/services/{service_name}/{action}", method="POST", auth=True)

    if result.get("error"):
        print(f"❌ Error: {result.get('detail')}")
        return 1

    if result.get("success"):
        print(f"✅ {service_name} {action}ed successfully")
        if result.get("message"):
            print(f"   {result['message']}")
        return 0
    else:
        print(f"❌ {result.get('message', 'Operation failed')}")
        return 1


def cmd_service_status(args):
    """Get status of a specific service."""
    service_name = args.service_name
    result = api_request(f"/api/services/{service_name}")

    if result.get("error"):
        print(f"❌ Error: {result.get('detail')}")
        return 1

    status = result.get("status", "unknown")
    status_icon = "🟢" if status == "running" else "🔴" if status == "stopped" else "🟡"
    print(f"{status_icon} {service_name}: {status}")

    # Show additional info if available
    if result.get("ports"):
        print(f"   Ports: {result['ports']}")
    if result.get("container_name"):
        print(f"   Container: {result['container_name']}")

    return 0


def cmd_api(args):
    """Make a generic API request."""
    method = args.method.upper()
    endpoint = args.endpoint

    # Ensure endpoint starts with /
    if not endpoint.startswith("/"):
        endpoint = "/" + endpoint

    # Parse JSON data if provided
    data = None
    if args.data:
        try:
            data = json.loads(args.data)
        except json.JSONDecodeError as e:
            print(f"❌ Invalid JSON: {e}")
            return 1

    if _verbose:
        print(f"🔗 {method} {endpoint}")

    result = api_request(endpoint, method=method, data=data, auth=not args.no_auth)

    # Check for error (only if result is a dict)
    if isinstance(result, dict) and result.get("error"):
        print(f"❌ Error: {result.get('detail', result)}")
        return 1

    # Pretty print response
    print(json.dumps(result, indent=2))
    return 0


def cmd_service_env_export(args):
    """Export environment variables for a service to a .env file."""
    service_name = args.service_name
    output_file = args.output

    print(f"📦 Exporting env vars for {service_name}...")
    result = api_request(f"/api/services/{service_name}/env-export", auth=True)

    if result.get("error"):
        print(f"❌ Error: {result.get('detail')}")
        return 1

    if not result.get("ready"):
        missing = result.get("missing", [])
        print(f"⚠️  Warning: Some env vars may be missing: {', '.join(missing)}")
        print("   (These may have defaults in the compose file)")

    env_vars = result.get("env_vars", {})
    if not env_vars:
        print(f"⚠️  No environment variables to export")
        return 1

    # Add infrastructure vars from local .env
    dotenv = load_env()

    # COMPOSE_PROJECT_NAME from .env or default
    if "COMPOSE_PROJECT_NAME" not in env_vars:
        env_vars["COMPOSE_PROJECT_NAME"] = dotenv.get("COMPOSE_PROJECT_NAME", "ushadow")

    # Calculate service ports with offset
    port_offset = int(dotenv.get("PORT_OFFSET", "0"))
    service_ports = {
        "chronicle-backend": ("CHRONICLE_PORT", 8080),
        "chronicle-webui": ("CHRONICLE_WEBUI_PORT", 3080),
        "speaker-recognition": ("SPEAKER_PORT", 8090),
    }
    if service_name in service_ports:
        var_name, base_port = service_ports[service_name]
        if var_name not in env_vars:
            env_vars[var_name] = str(base_port + port_offset)

    # Determine output file
    if not output_file:
        output_file = f".env.{service_name}"

    # Format and write
    env_lines = [f"{k}={v}" for k, v in sorted(env_vars.items())]
    with open(output_file, "w") as f:
        f.write(f"# Environment variables for {service_name}\n")
        f.write(f"# Generated by ushadow_client.py\n")
        f.write(f"# Compose file: {result.get('compose_file', 'unknown')}\n\n")
        f.write("\n".join(env_lines))
        f.write("\n")

    print(f"✅ Exported {len(env_vars)} env vars to {output_file}")
    return 0


def cmd_instance_list(args):
    """List all service instances."""
    result = api_request("/api/svc-configs", auth=True)

    if isinstance(result, dict) and result.get("error"):
        print(f"❌ Error: {result.get('detail')}")
        return 1

    instances = result if isinstance(result, list) else []
    if not instances:
        print("No instances found")
        return 0

    print(f"{'Name':<40} {'Template':<30} {'Target':<20} {'Status'}")
    print("-" * 120)
    for inst in instances:
        name = inst.get("name", "unknown")[:39]
        template = inst.get("template_id", "unknown")[:29]
        target = inst.get("deployment_target", "unknown")[:19]
        status = inst.get("status", "unknown")

        # Status icon
        if status == "running":
            status_icon = "🟢"
        elif status in ("stopped", "failed"):
            status_icon = "🔴"
        else:
            status_icon = "🟡"

        print(f"{name:<40} {template:<30} {target:<20} {status_icon} {status}")
    return 0


def cmd_instance_get(args):
    """Get details of a specific instance."""
    instance_id = args.instance_id
    result = api_request(f"/api/svc-configs/{instance_id}", auth=True)

    if result.get("error"):
        print(f"❌ Error: {result.get('detail')}")
        return 1

    print(json.dumps(result, indent=2))
    return 0


def cmd_instance_create(args):
    """Create a new service instance."""
    data = {
        "id": args.id,
        "template_id": args.template_id,
        "name": args.name,
        "deployment_target": args.target,
        "config": {}
    }

    if args.description:
        data["description"] = args.description

    if args.config:
        try:
            data["config"] = json.loads(args.config)
        except json.JSONDecodeError as e:
            print(f"❌ Invalid config JSON: {e}")
            return 1

    print(f"📦 Creating instance '{args.id}' ({args.name}) from template '{args.template_id}'...")
    result = api_request("/api/svc-configs", method="POST", data=data, auth=True)

    if result.get("error"):
        print(f"❌ Error: {result.get('detail')}")
        return 1

    print(f"✅ Instance created: {result.get('id')}")
    print(json.dumps(result, indent=2))
    return 0


def cmd_instance_delete(args):
    """Delete a service instance."""
    instance_id = args.instance_id

    if not args.yes:
        response = input(f"⚠️  Delete instance '{instance_id}'? [y/N] ")
        if response.lower() not in ('y', 'yes'):
            print("Cancelled")
            return 0

    print(f"🗑️  Deleting instance '{instance_id}'...")
    result = api_request(f"/api/svc-configs/{instance_id}", method="DELETE", auth=True)

    if result.get("error"):
        print(f"❌ Error: {result.get('detail')}")
        return 1

    print(f"✅ Instance deleted")
    return 0


def cmd_instance_deploy(args):
    """Deploy an instance."""
    instance_id = args.instance_id
    print(f"🚀 Deploying instance '{instance_id}'...")
    result = api_request(f"/api/svc-configs/{instance_id}/deploy", method="POST", auth=True)

    if result.get("error"):
        print(f"❌ Error: {result.get('detail')}")
        return 1

    print(f"✅ Instance deployed")
    if result.get("message"):
        print(f"   {result['message']}")
    return 0


def cmd_instance_undeploy(args):
    """Undeploy an instance."""
    instance_id = args.instance_id
    print(f"🛑 Undeploying instance '{instance_id}'...")
    result = api_request(f"/api/svc-configs/{instance_id}/undeploy", method="POST", auth=True)

    if result.get("error"):
        print(f"❌ Error: {result.get('detail')}")
        return 1

    print(f"✅ Instance undeployed")
    return 0


def main():
    parser = argparse.ArgumentParser(description="ushadow API Client")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Health command
    health_parser = subparsers.add_parser("health", help="Check ushadow backend health")
    health_parser.set_defaults(func=cmd_health)

    # Generic API command
    api_parser = subparsers.add_parser("api", help="Make authenticated API request")
    api_parser.add_argument("method", choices=["get", "post", "put", "delete", "GET", "POST", "PUT", "DELETE"],
                           help="HTTP method")
    api_parser.add_argument("endpoint", help="API endpoint (e.g., /api/services/)")
    api_parser.add_argument("-d", "--data", help="JSON request body")
    api_parser.add_argument("--no-auth", action="store_true", help="Skip authentication")
    api_parser.set_defaults(func=cmd_api)

    # Service command group
    service_parser = subparsers.add_parser("service", help="Service management")
    service_subparsers = service_parser.add_subparsers(dest="service_command")

    # service list
    list_parser = service_subparsers.add_parser("list", help="List all services")
    list_parser.set_defaults(func=cmd_service_list)

    # service status <name>
    status_parser = service_subparsers.add_parser("status", help="Get service status")
    status_parser.add_argument("service_name", help="Service name")
    status_parser.set_defaults(func=cmd_service_status)

    # service start/stop/restart <name>
    for action in ["start", "stop", "restart"]:
        action_parser = service_subparsers.add_parser(action, help=f"{action.capitalize()} a service")
        action_parser.add_argument("service_name", help="Service name")
        action_parser.set_defaults(func=cmd_service_action, action=action)

    # service env-export <name> [--output FILE]
    env_export_parser = service_subparsers.add_parser("env-export", help="Export env vars to .env file")
    env_export_parser.add_argument("service_name", help="Service name")
    env_export_parser.add_argument("-o", "--output", help="Output file (default: .env.<service>)")
    env_export_parser.set_defaults(func=cmd_service_env_export)

    # Instance command group
    instance_parser = subparsers.add_parser("instance", help="Instance management")
    instance_subparsers = instance_parser.add_subparsers(dest="instance_command")

    # instance list
    inst_list_parser = instance_subparsers.add_parser("list", help="List all instances")
    inst_list_parser.set_defaults(func=cmd_instance_list)

    # instance get <id>
    inst_get_parser = instance_subparsers.add_parser("get", help="Get instance details")
    inst_get_parser.add_argument("instance_id", help="Instance ID")
    inst_get_parser.set_defaults(func=cmd_instance_get)

    # instance create <id> <template_id> <name> <target> [options]
    inst_create_parser = instance_subparsers.add_parser("create", help="Create new instance")
    inst_create_parser.add_argument("id", help="Instance ID (lowercase, alphanumeric with hyphens)")
    inst_create_parser.add_argument("template_id", help="Template ID (e.g., ushadow-compose:ushadow-backend)")
    inst_create_parser.add_argument("name", help="Instance name (display name)")
    inst_create_parser.add_argument("target", help="Deployment target (e.g., k8s://cluster-id/namespace or local)")
    inst_create_parser.add_argument("-d", "--description", help="Instance description")
    inst_create_parser.add_argument("-c", "--config", help="Config as JSON string")
    inst_create_parser.set_defaults(func=cmd_instance_create)

    # instance delete <id>
    inst_delete_parser = instance_subparsers.add_parser("delete", help="Delete instance")
    inst_delete_parser.add_argument("instance_id", help="Instance ID")
    inst_delete_parser.add_argument("-y", "--yes", action="store_true", help="Skip confirmation")
    inst_delete_parser.set_defaults(func=cmd_instance_delete)

    # instance deploy <id>
    inst_deploy_parser = instance_subparsers.add_parser("deploy", help="Deploy instance")
    inst_deploy_parser.add_argument("instance_id", help="Instance ID")
    inst_deploy_parser.set_defaults(func=cmd_instance_deploy)

    # instance undeploy <id>
    inst_undeploy_parser = instance_subparsers.add_parser("undeploy", help="Undeploy instance")
    inst_undeploy_parser.add_argument("instance_id", help="Instance ID")
    inst_undeploy_parser.set_defaults(func=cmd_instance_undeploy)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    if args.command == "service" and not args.service_command:
        service_parser.print_help()
        return 1

    if args.command == "instance" and not args.instance_command:
        instance_parser.print_help()
        return 1

    # Set verbose mode
    if args.verbose:
        set_verbose(True)

    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
