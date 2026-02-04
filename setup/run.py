#!/usr/bin/env python3
"""
Cross-platform Ushadow startup script.

This is the main entry point that can be called from:
- Linux/macOS: python3 setup/run.py [--quick] [--prod] [--skip-admin]
- Windows: python setup/run.py [--quick] [--prod] [--skip-admin]

It replaces the bash-specific logic in start-dev.sh with cross-platform Python.
"""

import argparse
import os
import sys
import subprocess
import time
import getpass
from pathlib import Path

# Fix Windows console encoding to support Unicode
IS_WINDOWS = sys.platform == 'win32'
if IS_WINDOWS:
    try:
        # Try to set UTF-8 encoding for stdout/stderr
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except Exception:
        pass  # Fall back to default encoding

# Add setup directory to path for imports
SCRIPT_DIR = Path(__file__).parent
# Calculate PROJECT_ROOT robustly - go up from setup directory
# Handle both normal location (repo/setup) and copied location (anywhere/setup)
PROJECT_ROOT = SCRIPT_DIR.parent

# Validate PROJECT_ROOT by checking for docker-compose.yml
# If not found, this might be a copied setup script - use current working directory instead
if not (PROJECT_ROOT / "docker-compose.yml").exists():
    # Try current working directory (where we were cd'd to)
    cwd = Path.cwd()
    if (cwd / "docker-compose.yml").exists():
        PROJECT_ROOT = cwd
    else:
        # Last resort: check if docker-compose.yml is one level up from cwd
        if (cwd.parent / "docker-compose.yml").exists():
            PROJECT_ROOT = cwd.parent

sys.path.insert(0, str(SCRIPT_DIR))

from setup_utils import validate_ports, ensure_secrets_yaml, find_available_redis_db, set_redis_db_env_marker
from start_utils import ensure_networks, check_infrastructure_running, start_infrastructure, wait_for_backend_health

# Configuration
APP_NAME = "ushadow"
APP_DISPLAY_NAME = "Ushadow"
DEFAULT_BACKEND_PORT = 8000
DEFAULT_WEBUI_PORT = 3000
INFRA_COMPOSE_FILE = PROJECT_ROOT / "compose" / "docker-compose.infra.yml"
INFRA_PROJECT_NAME = "infra"
APP_COMPOSE_FILE = PROJECT_ROOT / "docker-compose.yml"

# Colors (ANSI escape codes, works on modern Windows too)
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    BOLD = '\033[1m'
    NC = '\033[0m'  # No Color

# Platform-safe emoji/unicode characters
class Icons:
    """Platform-safe icons that work on all terminals."""
    if IS_WINDOWS:
        ROCKET = ">"
        PENCIL = "-"
        USER = "*"
        CHECK = "OK"
        CHECKMARK = "[OK]"
        CROSS = "X"
        WARNING = "!"
        ERROR = "ERROR"
        SEARCH = "?"
        BUILDING = "+"
        STOP = "[]"
        RESTART = "@"
        CLIPBOARD = "#"
        WRENCH = "*"
        SEPARATOR = "=" * 44
        BOX_TOP = "+" + ("=" * 52) + "+"
        BOX_MID = "|" + (" " * 52) + "|"
        BOX_BTM = "+" + ("=" * 52) + "+"
    else:
        ROCKET = "🚀"
        PENCIL = "📝"
        USER = "👤"
        CHECK = "✓"
        CHECKMARK = "✅"
        CROSS = "✗"
        WARNING = "⚠️"
        ERROR = "❌"
        SEARCH = "🔍"
        BUILDING = "🏗️"
        STOP = "🛑"
        RESTART = "🔄"
        CLIPBOARD = "📋"
        WRENCH = "🔧"
        SEPARATOR = "━" * 44
        BOX_TOP = "╔" + ("═" * 52) + "╗"
        BOX_MID = "║" + (" " * 52) + "║"
        BOX_BTM = "╚" + ("═" * 52) + "╝"

def print_color(color: str, message: str):
    """Print colored message."""
    print(f"{color}{message}{Colors.NC}")

def print_header():
    """Print startup header."""
    print()
    print_color(Colors.BOLD, Icons.SEPARATOR)
    print_color(Colors.BOLD, f"{Icons.ROCKET} {APP_DISPLAY_NAME} Quick Start")
    print_color(Colors.BOLD, Icons.SEPARATOR)
    print()

def prompt_for_config() -> dict:
    """Prompt user for configuration in interactive mode."""
    print_color(Colors.BLUE, f"{Icons.PENCIL} Configuration")
    print()

    # Environment name
    env_name = input(f"  Environment name [{APP_NAME}]: ").strip()
    if not env_name:
        env_name = APP_NAME

    # Port offset
    while True:
        offset_str = input("  Port offset [0]: ").strip()
        if not offset_str:
            port_offset = 0
            break
        try:
            port_offset = int(offset_str)
            if 0 <= port_offset < 1000:
                break
            print_color(Colors.RED, "    Port offset must be 0-999")
        except ValueError:
            print_color(Colors.RED, "    Please enter a number")

    print()
    return {"env_name": env_name, "port_offset": port_offset}

def prompt_for_admin() -> dict:
    """Prompt user for admin credentials."""
    print_color(Colors.BLUE, f"{Icons.USER} Admin Account")
    print()

    # Email
    email = input("  Admin email [admin@example.com]: ").strip()
    if not email:
        email = "admin@example.com"

    # Password
    password = getpass.getpass("  Admin password [password]: ")
    if not password:
        password = "password"

    # Display name
    name = input("  Display name [Admin]: ").strip()
    if not name:
        name = "Admin"

    print()
    return {"email": email, "password": password, "name": name}

def check_docker():
    """Check if Docker is available."""
    try:
        result = subprocess.run(
            ["docker", "--version"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print_color(Colors.GREEN, f"{Icons.CHECKMARK} Docker found: {result.stdout.strip()}")
            return True
    except FileNotFoundError:
        pass

    print_color(Colors.RED, f"{Icons.ERROR} Docker not found. Please install Docker Desktop.")
    return False

def generate_env_file(env_name: str, port_offset: int, env_file: Path, secrets_file: Path, dev_mode: bool = False, quick_mode: bool = False):
    """Generate .env file with configuration."""
    backend_port = DEFAULT_BACKEND_PORT + port_offset
    webui_port = DEFAULT_WEBUI_PORT + port_offset

    # Validate ports
    all_available, conflicts = validate_ports([backend_port, webui_port])
    if conflicts:
        if quick_mode:
            # In quick mode, automatically find available ports
            print_color(Colors.YELLOW, f"{Icons.WARNING}  Port conflict detected: {conflicts}")
            print_color(Colors.BLUE, f"{Icons.SEARCH} Auto-finding available ports...")
            
            # Try incrementing port offset until we find available ports (max 100 attempts)
            for _ in range(100):
                port_offset += 10  # Increment by 10 to avoid nearby conflicts
                backend_port = DEFAULT_BACKEND_PORT + port_offset
                webui_port = DEFAULT_WEBUI_PORT + port_offset
                
                all_available, conflicts = validate_ports([backend_port, webui_port])
                if all_available:
                    print_color(Colors.GREEN, f"{Icons.CHECKMARK} Found available ports (offset: {port_offset})")
                    break
            else:
                print_color(Colors.RED, f"{Icons.ERROR} Could not find available ports after 100 attempts")
                return None
        else:
            print_color(Colors.RED, f"{Icons.ERROR} Port conflict: {conflicts}")
            return None

    # Find available Redis database
    preferred_redis_db = (port_offset // 10) % 16
    redis_db = find_available_redis_db(preferred_redis_db, env_name)
    set_redis_db_env_marker(redis_db, env_name)

    # Set database names
    if env_name == APP_NAME:
        mongodb_database = APP_NAME
        compose_project_name = APP_NAME
    else:
        mongodb_database = f"{APP_NAME}_{env_name}"
        compose_project_name = f"{APP_NAME}-{env_name.lower()}"

    # Generate .env content
    env_content = f"""# {APP_DISPLAY_NAME} Environment Configuration
# Generated by setup/run.py
# DO NOT COMMIT - Contains environment-specific configuration

# ==========================================
# ENVIRONMENT & PROJECT NAMING
# ==========================================
ENV_NAME={env_name}
COMPOSE_PROJECT_NAME={compose_project_name}

# ==========================================
# PORT CONFIGURATION
# ==========================================
PORT_OFFSET={port_offset}
BACKEND_PORT={backend_port}
WEBUI_PORT={webui_port}

# ==========================================
# DATABASE ISOLATION
# ==========================================
MONGODB_DATABASE={mongodb_database}
REDIS_DATABASE={redis_db}

# ==========================================
# CORS & FRONTEND CONFIGURATION
# ==========================================
CORS_ORIGINS=http://localhost:{webui_port},http://127.0.0.1:{webui_port},http://localhost:{backend_port},http://127.0.0.1:{backend_port}
VITE_BACKEND_URL=http://localhost:{backend_port}
VITE_ENV_NAME={env_name}
HOST_IP=localhost

# Development mode
DEV_MODE={'true' if dev_mode else 'false'}

# ==========================================
# DATABASE CONFIGURATION
# ==========================================
POSTGRES_USER=ushadow
POSTGRES_PASSWORD=ushadow
POSTGRES_DB=ushadow
POSTGRES_MULTIPLE_DATABASES=metamcp,openmemory

NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password

# ==========================================
# KEYCLOAK SSO CONFIGURATION
# ==========================================
# These env vars are used for deployment overrides via OmegaConf interpolation
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_EXTERNAL_URL=http://localhost:8081
KEYCLOAK_REALM=ushadow
KEYCLOAK_CLIENT_ID=ushadow-frontend
KEYCLOAK_CLIENT_SECRET=
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=admin
KEYCLOAK_PORT=8081
KEYCLOAK_MGMT_PORT=9000
"""

    env_file.write_text(env_content)
    os.chmod(env_file, 0o600)

    print_color(Colors.GREEN, f"{Icons.CHECKMARK} Environment configured")
    print(f"  Name:     {env_name}")
    print(f"  Project:  {compose_project_name}")
    print(f"  Backend:  {backend_port}")
    print(f"  WebUI:    {webui_port}")
    print(f"  Database: {mongodb_database}")
    print()

    # Ensure secrets.yaml exists
    created_new, _ = ensure_secrets_yaml(str(secrets_file))
    if created_new:
        print_color(Colors.GREEN, f"Secrets file written: {Icons.CHECKMARK} {secrets_file}")
    else:
        print(f"Secrets already configured: {Icons.CHECKMARK} {secrets_file}")

    return {
        "backend_port": backend_port,
        "webui_port": webui_port,
    }

def get_compose_cmd(dev_mode: bool) -> list:
    """Get the base docker compose command with correct override file."""
    override_name = "dev-webui.yml" if dev_mode else "prod-webui.yml"
    override_file = PROJECT_ROOT / "compose" / "overrides" / override_name
    # Use as_posix() to get forward slashes on all platforms (docker compose accepts this)
    return ["docker", "compose", "-f", str(APP_COMPOSE_FILE.as_posix()), "-f", str(override_file.as_posix())]


def read_dev_mode_from_env() -> bool:
    """Read DEV_MODE from .env file."""
    env_file = PROJECT_ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("DEV_MODE="):
                return line.split("=")[1].strip().lower() == "true"
    return False


def compose_up(dev_mode: bool, build: bool = False) -> bool:
    """Start containers (optionally with rebuild)."""
    # Ensure Docker networks exist
    if not ensure_networks():
        print_color(Colors.RED, f"{Icons.ERROR} Failed to create required Docker networks (ushadow-network, infra-network)")
        print_color(Colors.YELLOW, "   Make sure Docker is running and you have permissions to create networks")
        return False

    # Check/start infrastructure
    infra_running = check_infrastructure_running()
    if not infra_running:
        print_color(Colors.YELLOW, f"{Icons.BUILDING}  Starting infrastructure...")
        success, message = start_infrastructure(INFRA_COMPOSE_FILE, INFRA_PROJECT_NAME)
        if not success:
            print_color(Colors.RED, f"{Icons.ERROR} {message}")
            return False

    mode_label = "dev" if dev_mode else "prod"
    action = "Building and starting" if build else "Starting"
    print_color(Colors.BLUE, f"{Icons.ROCKET} {action} {APP_DISPLAY_NAME} ({mode_label} mode)...")

    cmd = get_compose_cmd(dev_mode) + ["up", "-d"]
    if build:
        cmd.append("--build")

    # Use native path format for cwd (subprocess handles it correctly)
    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))
    if result.returncode != 0:
        print_color(Colors.RED, f"{Icons.ERROR} Failed to start application")
        return False

    print_color(Colors.GREEN, f"{Icons.CHECKMARK} Done")
    return True


def compose_down(dev_mode: bool) -> bool:
    """Stop containers."""
    mode_label = "dev" if dev_mode else "prod"
    print_color(Colors.BLUE, f"{Icons.STOP} Stopping {APP_DISPLAY_NAME} ({mode_label} mode)...")

    cmd = get_compose_cmd(dev_mode) + ["down"]
    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))

    if result.returncode != 0:
        print_color(Colors.RED, f"{Icons.ERROR} Failed to stop application")
        return False

    print_color(Colors.GREEN, f"{Icons.CHECKMARK} Stopped")
    return True


def compose_restart(dev_mode: bool) -> bool:
    """Restart containers."""
    mode_label = "dev" if dev_mode else "prod"
    print_color(Colors.BLUE, f"{Icons.RESTART} Restarting {APP_DISPLAY_NAME} ({mode_label} mode)...")

    cmd = get_compose_cmd(dev_mode) + ["restart"]
    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))

    if result.returncode != 0:
        print_color(Colors.RED, f"{Icons.ERROR} Failed to restart application")
        return False

    print_color(Colors.GREEN, f"{Icons.CHECKMARK} Restarted")
    return True


def start_services(dev_mode: bool):
    """Start infrastructure and application services (legacy - calls compose_up with build)."""
    return compose_up(dev_mode, build=True)

def wait_and_open(backend_port: int, webui_port: int, open_browser: bool):
    """Wait for backend health and optionally open browser."""
    print()
    print("   Waiting for backend to be healthy...")
    time.sleep(3)

    healthy, _ = wait_for_backend_health(backend_port, timeout=60)

    print()
    if healthy:
        print_color(Colors.GREEN + Colors.BOLD, f"{Icons.CHECKMARK} {APP_DISPLAY_NAME} is ready!")
    else:
        print_color(Colors.YELLOW, f"{Icons.WARNING}  Backend is starting... (may take a moment)")

    # Print success box
    print()
    print_color(Colors.BOLD, Icons.BOX_TOP)
    print_color(Colors.BOLD, Icons.BOX_MID)
    print_color(Colors.BOLD, f"║  {Icons.ROCKET} {APP_DISPLAY_NAME} is ready!                          ║")
    print_color(Colors.BOLD, Icons.BOX_MID)
    print_color(Colors.BOLD, f"║     http://localhost:{webui_port}                          ║")
    print_color(Colors.BOLD, Icons.BOX_MID)
    print_color(Colors.BOLD, Icons.BOX_BTM)
    print()

    # First-time setup instructions
    print_color(Colors.BOLD, f"{Icons.CLIPBOARD} First-Time Setup:")
    print()
    print("  1. Open the web interface (link above)")
    print("  2. Complete the setup wizard:")
    print("     • Create admin account")
    print("     • Configure API keys (OpenAI, Deepgram, etc.)")
    print("     • Select LLM and memory providers")
    print()

    # Open browser if requested
    if open_browser:
        url = f"http://localhost:{webui_port}/register"
        print_color(Colors.BLUE, "🌐 Opening registration page...")

        import webbrowser
        webbrowser.open(url)

    # Helpful commands
    print_color(Colors.BOLD, "Helpful commands:")
    print("  Stop:    make down    (or: docker compose down)")
    print("  Restart: make restart")
    print("  Logs:    make logs    (or: docker compose logs -f)")
    print()

    print_color(Colors.GREEN + Colors.BOLD, "🎉 Setup complete!")
    print()

def main():
    parser = argparse.ArgumentParser(description=f"{APP_DISPLAY_NAME} Quick Start")
    parser.add_argument("--quick", action="store_true", help="Use defaults without prompts")
    parser.add_argument("--dev", action="store_true", help="Development mode with hot-reload")
    parser.add_argument("--prod", action="store_true", help="Production mode")
    parser.add_argument("--skip-admin", action="store_true", help="Skip admin creation (use web wizard)")
    parser.add_argument("--open-browser", action="store_true", help="Automatically open browser to registration page")
    parser.add_argument("--reset", action="store_true", help="Reset configuration")
    # Simple compose operations (read DEV_MODE from .env)
    parser.add_argument("--up", action="store_true", help="Start containers (no rebuild)")
    parser.add_argument("--down", action="store_true", help="Stop containers")
    parser.add_argument("--build", action="store_true", help="Rebuild and start containers")
    parser.add_argument("--restart", action="store_true", help="Restart containers")
    args = parser.parse_args()

    # Change to project root
    os.chdir(PROJECT_ROOT)

    # Handle simple compose operations (read mode from .env)
    if args.up or args.down or args.build or args.restart:
        # Use explicit --dev/--prod flag if provided, otherwise read from .env
        if args.dev:
            dev_mode = True
        elif args.prod:
            dev_mode = False
        else:
            dev_mode = read_dev_mode_from_env()

        if args.down:
            sys.exit(0 if compose_down(dev_mode) else 1)
        elif args.restart:
            sys.exit(0 if compose_restart(dev_mode) else 1)
        elif args.up:
            sys.exit(0 if compose_up(dev_mode, build=False) else 1)
        elif args.build:
            # Ensure secrets before build
            secrets_file = PROJECT_ROOT / "config" / "SECRETS" / "secrets.yaml"
            ensure_secrets_yaml(str(secrets_file))
            sys.exit(0 if compose_up(dev_mode, build=True) else 1)

    # Full setup flow
    dev_mode = args.dev and not args.prod

    # Print header
    print_header()

    # Check Docker
    if not check_docker():
        sys.exit(1)

    print()

    # Configuration paths
    env_file = PROJECT_ROOT / ".env"
    config_dir = PROJECT_ROOT / "config"
    secrets_dir = config_dir / "SECRETS"
    secrets_file = secrets_dir / "secrets.yaml"

    # Ensure config and secrets directories exist
    config_dir.mkdir(exist_ok=True)
    secrets_dir.mkdir(exist_ok=True)

    # Always ensure secrets.yaml exists with auth keys
    created_new, secrets_data = ensure_secrets_yaml(str(secrets_file))
    if created_new:
        print_color(Colors.GREEN, f"Secrets file written: {Icons.CHECKMARK} {secrets_file}")
    else:
        print(f"Secrets already configured: {Icons.CHECKMARK} {secrets_file}")

    # Check for existing config
    use_existing = False
    if env_file.exists() and not args.reset:
        if args.quick:
            use_existing = True
        else:
            # Read current config to show user
            env_content = env_file.read_text()
            current_env = ""
            current_backend = DEFAULT_BACKEND_PORT
            current_webui = DEFAULT_WEBUI_PORT
            for line in env_content.splitlines():
                if line.startswith("ENV_NAME="):
                    current_env = line.split("=")[1]
                elif line.startswith("BACKEND_PORT="):
                    current_backend = int(line.split("=")[1])
                elif line.startswith("WEBUI_PORT="):
                    current_webui = int(line.split("=")[1])

            print_color(Colors.YELLOW, f"📁 Existing config found: {current_env} (ports {current_backend}/{current_webui})")
            reuse = input("  Reuse existing config? [Y/n]: ").strip().lower()
            use_existing = reuse != 'n'
            print()

    if use_existing:
        print_color(Colors.GREEN, f"{Icons.CHECKMARK} Using existing configuration")
        env_content = env_file.read_text()
        backend_port = DEFAULT_BACKEND_PORT
        webui_port = DEFAULT_WEBUI_PORT
        for line in env_content.splitlines():
            if line.startswith("BACKEND_PORT="):
                backend_port = int(line.split("=")[1])
            elif line.startswith("WEBUI_PORT="):
                webui_port = int(line.split("=")[1])
        config = {"backend_port": backend_port, "webui_port": webui_port}
    else:
        # Prompt for config in interactive mode
        if args.quick:
            # In quick mode, read from environment variables (set by launcher)
            env_name = os.environ.get("ENV_NAME", APP_NAME)
            port_offset = int(os.environ.get("PORT_OFFSET", "0"))
        else:
            user_config = prompt_for_config()
            env_name = user_config["env_name"]
            port_offset = user_config["port_offset"]

            # Prompt for admin credentials
            if not args.skip_admin:
                admin_creds = prompt_for_admin()
                try:
                    import yaml
                    secrets_data['admin'] = {
                        'name': admin_creds['name'],
                        'email': admin_creds['email'],
                        'password': admin_creds['password']
                    }
                    with open(secrets_file, 'w') as f:
                        f.write("# Ushadow Secrets\n")
                        f.write("# DO NOT COMMIT - Contains sensitive credentials\n\n")
                        yaml.dump(secrets_data, f, default_flow_style=False, sort_keys=False)
                    print_color(Colors.GREEN, f"{Icons.CHECKMARK} Admin credentials saved to secrets.yaml")
                except Exception as e:
                    print_color(Colors.YELLOW, f"{Icons.WARNING}  Could not save admin credentials: {e}")

        print_color(Colors.BLUE, f"{Icons.WRENCH} Generating configuration...")
        print()
        config = generate_env_file(
            env_name=env_name,
            port_offset=port_offset,
            env_file=env_file,
            secrets_file=secrets_file,
            dev_mode=dev_mode,
            quick_mode=args.quick
        )
        if not config:
            sys.exit(1)

    print()

    # Start services
    if not start_services(dev_mode):
        sys.exit(1)

    # Wait and optionally open browser
    wait_and_open(
        config["backend_port"],
        config["webui_port"],
        open_browser=args.open_browser
    )

if __name__ == "__main__":
    main()
