"""Tailscale Setup Wizard API Router

Provides endpoints for automated Tailscale and Caddy setup with HTTPS support.
Handles platform detection, installation verification, configuration, and certificate provisioning.
"""

import asyncio
import os
import platform
import re
import subprocess
import yaml
import json
import aiohttp
import docker
from pathlib import Path
from typing import Dict, List, Optional, Literal, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from src.services.auth import get_current_user, generate_jwt_for_service
from src.models.user import User
from src.config.omegaconf_settings import get_settings_store

# UNodeCapabilities moved to /api/unodes/leader/info endpoint
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tailscale", tags=["tailscale"])

# Docker client for container management
docker_client = docker.from_env()

def get_environment_name() -> str:
    """Get the current environment name from COMPOSE_PROJECT_NAME or default to 'ushadow'"""
    env_name = os.getenv("COMPOSE_PROJECT_NAME", "").strip()
    return env_name if env_name else "ushadow"

def get_tailscale_hostname() -> str:
    """Get the Tailscale hostname for this environment.

    Strips 'ushadow-' prefix if present to get clean hostnames:
    - ushadow-wiz → wiz
    - ushadow-prod → prod
    - ushadow → ushadow (base case unchanged)
    - "" or None → ushadow (fallback)
    """
    env_name = get_environment_name()
    if env_name.startswith("ushadow-"):
        hostname = env_name[8:]  # Strip "ushadow-" prefix
        return hostname if hostname else "ushadow"
    return env_name

def get_tailscale_container_name() -> str:
    """Get the Tailscale container name for this environment"""
    env_name = get_environment_name()
    return f"{env_name}-tailscale"

def get_tailscale_volume_name() -> str:
    """Get the Tailscale volume name for this environment"""
    env_name = get_environment_name()
    return f"{env_name}-tailscale-state"


# ============================================================================
# Pydantic Models
# ============================================================================

class PlatformInfo(BaseModel):
    """Platform detection information"""
    os_type: Literal["linux", "darwin", "windows", "unknown"]
    os_version: str
    architecture: str
    is_docker: bool

class DeploymentMode(BaseModel):
    """Deployment mode configuration"""
    mode: Literal["single", "multi"]
    environment: Optional[str] = Field(None, description="For single mode: dev, test, or prod")

class TailscaleConfig(BaseModel):
    """Complete Tailscale configuration"""
    hostname: str = Field(..., description="Tailscale hostname (e.g., machine-name.tail12345.ts.net)")
    deployment_mode: DeploymentMode
    https_enabled: bool = True
    use_caddy_proxy: bool = Field(..., description="True for multi-env, False for single-env")
    backend_port: int = 8000
    frontend_port: int = 3000
    environments: List[str] = Field(default_factory=lambda: ["dev", "test", "prod"])

class InstallationGuide(BaseModel):
    """Platform-specific installation instructions"""
    platform: str
    instructions: str
    download_url: str
    verification_command: str

class CertificateStatus(BaseModel):
    """Certificate provisioning status"""
    provisioned: bool
    cert_path: Optional[str] = None
    key_path: Optional[str] = None
    expires_at: Optional[str] = None
    error: Optional[str] = None

class SetupProgress(BaseModel):
    """Overall setup progress tracking"""
    step: str
    status: Literal["pending", "in_progress", "completed", "failed"]
    message: str
    progress_percent: int

class AccessUrls(BaseModel):
    """Generated access URLs after setup"""
    frontend: str
    backend: str
    environments: Dict[str, Dict[str, str]] = Field(default_factory=dict)

class ContainerStatus(BaseModel):
    """Tailscale container status"""
    exists: bool
    running: bool
    authenticated: bool = False
    hostname: Optional[str] = None
    ip_address: Optional[str] = None

class AuthUrlResponse(BaseModel):
    """Authentication URL for Tailscale"""
    auth_url: str  # Deep link for mobile app
    web_url: str  # Web URL as fallback
    qr_code_data: str  # Data URL for QR code image


class MobileConnectionQR(BaseModel):
    """QR code for mobile app connection.

    Contains minimal data for the QR code - just enough to connect.
    After connecting, mobile app fetches full details from /api/unodes/leader/info
    """
    qr_code_data: str  # Data URL for QR code image (PNG base64)
    connection_data: dict  # Raw connection data that's encoded in QR
    hostname: str
    tailscale_ip: str
    api_port: int
    api_url: str  # Full URL to leader info endpoint
    auth_token: str  # JWT token for authenticating with ushadow and chronicle  # Full URL to leader info endpoint


# ============================================================================
# Environment Info
# ============================================================================

class EnvironmentInfo(BaseModel):
    """Current environment information"""
    name: str
    tailscale_hostname: str
    tailscale_container_name: str
    tailscale_volume_name: str


@router.get("/environment", response_model=EnvironmentInfo)
async def get_environment_info(
    current_user: User = Depends(get_current_user)
) -> EnvironmentInfo:
    """Get current environment information for Tailscale setup"""
    return EnvironmentInfo(
        name=get_environment_name(),
        tailscale_hostname=get_tailscale_hostname(),
        tailscale_container_name=get_tailscale_container_name(),
        tailscale_volume_name=get_tailscale_volume_name()
    )


# ============================================================================
# Platform Detection
# ============================================================================

@router.get("/platform", response_model=PlatformInfo)
async def detect_platform(
    current_user: User = Depends(get_current_user)
) -> PlatformInfo:
    """Detect the current platform and system information"""
    try:
        os_type = platform.system().lower()
        if os_type not in ["linux", "darwin", "windows"]:
            os_type = "unknown"

        # Check if running in Docker
        is_docker = os.path.exists("/.dockerenv") or os.path.exists("/run/.containerenv")

        return PlatformInfo(
            os_type=os_type,
            os_version=platform.version(),
            architecture=platform.machine(),
            is_docker=is_docker
        )
    except Exception as e:
        logger.error(f"Error detecting platform: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to detect platform: {str(e)}")


# ============================================================================
# Installation Guide
# ============================================================================

@router.get("/installation-guide", response_model=InstallationGuide)
async def get_installation_guide(
    os_type: str,
    current_user: User = Depends(get_current_user)
) -> InstallationGuide:
    """Get platform-specific Tailscale installation instructions"""

    guides = {
        "darwin": InstallationGuide(
            platform="macOS",
            instructions="""
# macOS Installation

1. Download the Tailscale macOS app from the link below
2. Open the downloaded .pkg file
3. Follow the installation wizard
4. After installation, Tailscale will appear in your menu bar
5. Click the Tailscale icon and select 'Log in'
6. Authenticate with your Tailscale account

Alternatively, install via Homebrew:
```bash
brew install tailscale
sudo tailscale up
```
            """.strip(),
            download_url="https://tailscale.com/download/macos",
            verification_command="tailscale status"
        ),
        "linux": InstallationGuide(
            platform="Linux",
            instructions="""
# Linux Installation

For Ubuntu/Debian:
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

For Fedora/RHEL:
```bash
sudo dnf install tailscale
sudo systemctl enable --now tailscaled
sudo tailscale up
```

For Arch Linux:
```bash
sudo pacman -S tailscale
sudo systemctl enable --now tailscaled
sudo tailscale up
```

After running `tailscale up`, follow the authentication link in your browser.
            """.strip(),
            download_url="https://tailscale.com/download/linux",
            verification_command="tailscale status"
        ),
        "windows": InstallationGuide(
            platform="Windows",
            instructions="""
# Windows Installation

1. Download the Tailscale Windows installer from the link below
2. Run the installer (.msi file)
3. Follow the installation wizard
4. After installation, Tailscale will appear in your system tray
5. Click the Tailscale icon and select 'Log in'
6. Authenticate with your Tailscale account

Alternatively, install via winget:
```powershell
winget install tailscale.tailscale
```
            """.strip(),
            download_url="https://tailscale.com/download/windows",
            verification_command="tailscale status"
        )
    }

    guide = guides.get(os_type)
    if not guide:
        raise HTTPException(status_code=400, detail=f"Unsupported platform: {os_type}")

    return guide


# ============================================================================
# Configuration Management
# ============================================================================

CONFIG_DIR = Path("/config")
TAILSCALE_CONFIG_FILE = CONFIG_DIR / "tailscale.yaml"


def _read_config() -> Optional[TailscaleConfig]:
    """Internal helper to read Tailscale configuration from disk."""
    if not TAILSCALE_CONFIG_FILE.exists():
        return None

    try:
        with open(TAILSCALE_CONFIG_FILE, 'r') as f:
            config_data = yaml.safe_load(f)
            return TailscaleConfig(**config_data)
    except Exception as e:
        logger.error(f"Error reading config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to read configuration: {str(e)}")


@router.get("/config", response_model=Optional[TailscaleConfig])
async def get_config(
    current_user: User = Depends(get_current_user)
) -> Optional[TailscaleConfig]:
    """Get current Tailscale configuration"""
    return _read_config()


@router.post("/config", response_model=TailscaleConfig)
async def save_config(
    config: TailscaleConfig,
    current_user: User = Depends(get_current_user)
) -> TailscaleConfig:
    """Save Tailscale configuration"""

    try:
        # Ensure config directory exists
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)

        # Save configuration
        config_data = config.model_dump()
        with open(TAILSCALE_CONFIG_FILE, 'w') as f:
            yaml.dump(config_data, f, default_flow_style=False)

        logger.info(f"Tailscale configuration saved to {TAILSCALE_CONFIG_FILE}")
        return config

    except Exception as e:
        logger.error(f"Error saving config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save configuration: {str(e)}")


# ============================================================================
# Certificate Provisioning
# ============================================================================

CERTS_DIR = Path("/config/certs")
PROJECT_ROOT = Path(os.getenv("PROJECT_ROOT", "/app"))


# ============================================================================
# Configuration Generation
# ============================================================================

@router.post("/generate-config")
async def generate_tailscale_config(
    config: TailscaleConfig,
    current_user: User = Depends(get_current_user)
) -> Dict[str, str]:
    """Generate Tailscale serve configuration or Caddyfile based on deployment mode"""

    try:
        if config.deployment_mode.mode == "single":
            # Generate tailscale serve configuration
            return await generate_serve_config(config)
        else:
            # Generate Caddyfile for multi-environment
            return await generate_caddyfile(config)

    except Exception as e:
        logger.error(f"Error generating configuration: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate configuration: {str(e)}")


async def generate_serve_config(config: TailscaleConfig) -> Dict[str, str]:
    """Generate tailscale serve configuration for single environment mode"""

    env = config.deployment_mode.environment or "dev"
    backend_port = config.backend_port
    frontend_port = config.frontend_port

    # Generate tailscale serve commands
    commands = [
        f"# Tailscale Serve Configuration for {env} environment",
        f"tailscale serve https / http://localhost:{frontend_port}",
        f"tailscale serve https /api http://localhost:{backend_port}",
        f"tailscale serve https /auth http://localhost:{backend_port}",
        "",
        "# To view current configuration:",
        "tailscale serve status",
        "",
        "# To reset configuration:",
        "tailscale serve reset"
    ]

    config_content = "\n".join(commands)

    # Save to file
    serve_config_file = CONFIG_DIR / "tailscale-serve-commands.sh"
    with open(serve_config_file, 'w') as f:
        f.write(config_content)
    os.chmod(serve_config_file, 0o755)

    return {
        "mode": "single",
        "config_file": str(serve_config_file),
        "content": config_content
    }


async def generate_caddyfile(config: TailscaleConfig) -> Dict[str, str]:
    """Generate Caddyfile for multi-environment mode with Caddy reverse proxy"""

    hostname = config.hostname
    cert_path = f"/certs/{hostname}.crt"
    key_path = f"/certs/{hostname}.key"

    # Generate Caddyfile content
    caddyfile_lines = [
        f"https://{hostname} {{",
        f"    tls {cert_path} {key_path}",
        "",
    ]

    # Add route for each environment
    for env in config.environments:
        # Calculate ports for this environment
        port_offset = {"dev": 0, "test": 10, "prod": 20}.get(env, 0)
        backend_port = config.backend_port + port_offset
        frontend_port = config.frontend_port + port_offset

        caddyfile_lines.extend([
            f"    # {env.upper()} environment",
            f"    handle_path /{env}/* {{",
            f"        @api path /api/*",
            f"        handle @api {{",
            f"            reverse_proxy backend-{env}:{backend_port}",
            f"        }}",
            f"        @auth path /auth/*",
            f"        handle @auth {{",
            f"            reverse_proxy backend-{env}:{backend_port}",
            f"        }}",
            f"        reverse_proxy frontend-{env}:{frontend_port}",
            f"    }}",
            "",
        ])

    # Add root redirect
    caddyfile_lines.extend([
        "    # Root redirect to dev environment",
        "    handle / {",
        "        redir /dev/ permanent",
        "    }",
        "}"
    ])

    caddyfile_content = "\n".join(caddyfile_lines)

    # Save Caddyfile
    caddyfile_path = CONFIG_DIR / "Caddyfile"
    with open(caddyfile_path, 'w') as f:
        f.write(caddyfile_content)

    logger.info(f"Caddyfile generated at {caddyfile_path}")

    return {
        "mode": "multi",
        "config_file": str(caddyfile_path),
        "content": caddyfile_content
    }


# ============================================================================
# Access URLs
# ============================================================================

@router.get("/access-urls", response_model=AccessUrls)
async def get_access_urls(
    current_user: User = Depends(get_current_user)
) -> AccessUrls:
    """Get access URLs for all configured services"""

    config = _read_config()
    if not config:
        raise HTTPException(status_code=404, detail="Tailscale not configured")

    base_url = f"https://{config.hostname}"

    if config.deployment_mode.mode == "single":
        env = config.deployment_mode.environment or "dev"
        return AccessUrls(
            frontend=base_url,
            backend=f"{base_url}/api",
            environments={
                env: {
                    "frontend": base_url,
                    "backend": f"{base_url}/api"
                }
            }
        )
    else:
        # Multi-environment mode
        environments = {}
        for env in config.environments:
            environments[env] = {
                "frontend": f"{base_url}/{env}/",
                "backend": f"{base_url}/{env}/api"
            }

        return AccessUrls(
            frontend=f"{base_url}/dev/",
            backend=f"{base_url}/dev/api",
            environments=environments
        )


# ============================================================================
# Testing & Verification
# ============================================================================

@router.post("/test-connection")
async def test_connection(
    url: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Test connection to a specific URL"""

    # Validate URL to prevent SSRF
    if not url.startswith(('http://', 'https://')):
        return {
            "url": url,
            "success": False,
            "error": "URL must start with http:// or https://"
        }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.head(url, timeout=aiohttp.ClientTimeout(total=10), allow_redirects=True) as response:
                http_code = str(response.status)
                success = response.status >= 200 and response.status < 400

                return {
                    "url": url,
                    "success": success,
                    "http_code": http_code,
                    "error": None if success else f"HTTP {http_code}"
                }

    except aiohttp.ClientError as e:
        logger.error(f"Connection error testing {url}: {e}")
        return {
            "url": url,
            "success": False,
            "error": str(e)
        }
    except Exception as e:
        logger.error(f"Error testing connection to {url}: {e}")
        return {
            "url": url,
            "success": False,
            "error": str(e)
        }


# ============================================================================
# Tailscale Container Management
# ============================================================================

async def exec_in_container(command: str) -> tuple[int, str, str]:
    """Execute command in Tailscale container"""
    try:
        container_name = get_tailscale_container_name()
        container = docker_client.containers.get(container_name)
        result = container.exec_run(command, demux=True)

        # Handle both tuple and non-tuple results
        if isinstance(result, tuple):
            exit_code = result[0]
            output = result[1]
        else:
            exit_code = result.exit_code
            output = result.output

        # Decode output
        if isinstance(output, tuple):
            stdout = output[0].decode() if output[0] else ""
            stderr = output[1].decode() if output[1] else ""
        else:
            stdout = output.decode() if output else ""
            stderr = ""

        return exit_code, stdout, stderr
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Tailscale container not found")
    except Exception as e:
        logger.error(f"Error executing in container: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to execute command: {str(e)}")


@router.get("/container/status", response_model=ContainerStatus)
async def get_container_status(
    current_user: User = Depends(get_current_user)
) -> ContainerStatus:
    """Get Tailscale container status"""
    try:
        container_name = get_tailscale_container_name()
        try:
            container = docker_client.containers.get(container_name)
            container.reload()  # Refresh status
            is_running = container.status == 'running'

            if not is_running:
                return ContainerStatus(exists=True, running=False)

            # Check if authenticated - try to get status
            try:
                exit_code, stdout, _ = await exec_in_container("tailscale status --json")

                if exit_code == 0 and stdout.strip():
                    status_data = json.loads(stdout)
                    self_node = status_data.get('Self')

                    if self_node:
                        hostname = self_node.get('DNSName', '').rstrip('.')
                        tailscale_ips = self_node.get('TailscaleIPs', [])
                        ip_address = tailscale_ips[0] if tailscale_ips else None

                        return ContainerStatus(
                            exists=True,
                            running=True,
                            authenticated=bool(hostname),
                            hostname=hostname,
                            ip_address=ip_address
                        )

                # Not authenticated yet
                return ContainerStatus(exists=True, running=True, authenticated=False)

            except Exception as exec_error:
                logger.warning(f"Failed to get Tailscale status from container: {exec_error}")
                # Container running but can't get status yet (might be starting up)
                return ContainerStatus(exists=True, running=True, authenticated=False)

        except docker.errors.NotFound:
            return ContainerStatus(exists=False, running=False)

    except Exception as e:
        logger.error(f"Error checking container status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to check container status: {str(e)}")


# ============================================================================
# Mobile App Connection
# ============================================================================

@router.get("/mobile/connect-qr", response_model=MobileConnectionQR)
async def get_mobile_connection_qr(
    current_user: User = Depends(get_current_user)
) -> MobileConnectionQR:
    """Generate QR code for mobile app to connect to this leader.

    The QR code contains minimal connection details (hostname, Tailscale IP, port)
    plus an auth token for automatic authentication with ushadow and chronicle.
    After scanning, the mobile app fetches full details from /api/unodes/leader/info
    """
    try:
        container_name = get_tailscale_container_name()

        try:
            container = docker_client.containers.get(container_name)
            if container.status != 'running':
                raise HTTPException(
                    status_code=400,
                    detail="Tailscale is not running. Complete Tailscale setup first."
                )
        except docker.errors.NotFound:
            raise HTTPException(
                status_code=400,
                detail="Tailscale is not configured. Complete Tailscale setup first."
            )

        # Get Tailscale status to get IP
        exit_code, stdout, _ = await exec_in_container("tailscale status --json")

        if exit_code != 0 or not stdout.strip():
            raise HTTPException(
                status_code=400,
                detail="Tailscale is not authenticated. Complete authentication first."
            )

        status_data = json.loads(stdout)
        self_node = status_data.get('Self')

        if not self_node:
            raise HTTPException(
                status_code=400,
                detail="Could not get Tailscale status. Please try again."
            )

        hostname = self_node.get('DNSName', '').rstrip('.')
        tailscale_ips = self_node.get('TailscaleIPs', [])

        if not tailscale_ips:
            raise HTTPException(
                status_code=400,
                detail="No Tailscale IP found. Please ensure Tailscale is connected."
            )

        # Use the IPv4 address (first one that starts with 100.)
        tailscale_ip = None
        for ip in tailscale_ips:
            if ip.startswith('100.'):
                tailscale_ip = ip
                break

        if not tailscale_ip:
            tailscale_ip = tailscale_ips[0]  # Fallback to first IP

        config = get_settings_store()
        api_port = config.get_sync("network.backend_public_port") or 8000
        final_hostname = hostname or get_tailscale_hostname()
        
        # Build full API URL for leader info endpoint
        api_url = f"https://{final_hostname}/api/unodes/leader/info"

        # Generate auth token for mobile app (valid for ushadow and chronicle)
        # Both services now share the same database (ushadow-blue) so user IDs match
        auth_token = generate_jwt_for_service(
            user_id=str(current_user.id),
            user_email=current_user.email,
            audiences=["ushadow", "chronicle"]
        )

        # Minimal connection data for QR code
        connection_data = {
            "type": "ushadow-connect",
            "v": 3,  # Version 3 includes auth token
            "hostname": final_hostname,
            "ip": tailscale_ip,
            "port": api_port,
            "api_url": api_url,
            "auth_token": auth_token,
        }

        # Generate QR code
        import io
        import base64
        import qrcode

        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(json.dumps(connection_data))
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")

        # Convert to data URL
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()
        qr_code_data = f"data:image/png;base64,{img_str}"

        return MobileConnectionQR(
            qr_code_data=qr_code_data,
            connection_data=connection_data,
            hostname=final_hostname,
            tailscale_ip=tailscale_ip,
            api_port=api_port,
            api_url=api_url,
            auth_token=auth_token,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating mobile connection QR: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate connection QR: {str(e)}"
        )


@router.post("/container/start")
async def start_tailscale_container(
    current_user: User = Depends(get_current_user)
) -> Dict[str, str]:
    """Start or create Tailscale container using Docker SDK.

    Creates a per-environment Tailscale container using COMPOSE_PROJECT_NAME.
    The container will be named {env}-tailscale and use {env} as its hostname.
    """
    try:
        container_name = get_tailscale_container_name()
        volume_name = get_tailscale_volume_name()
        env_name = get_environment_name()
        ts_hostname = get_tailscale_hostname()

        # Check if container exists
        try:
            container = docker_client.containers.get(container_name)

            # Reload to get fresh status
            container.reload()

            if container.status == 'running':
                return {"status": "already_running", "message": "Tailscale container is already running"}
            else:
                container.start()
                # Give it a moment to start
                await asyncio.sleep(2)
                return {"status": "started", "message": "Tailscale container started"}

        except docker.errors.NotFound:
            # Container doesn't exist - create it using Docker SDK
            logger.info(f"Creating Tailscale container '{container_name}' for environment '{env_name}'...")

            # Ensure infra network exists
            try:
                infra_network = docker_client.networks.get("infra-network")
            except docker.errors.NotFound:
                raise HTTPException(
                    status_code=400,
                    detail="infra-network not found. Please start infrastructure first."
                )

            # Get environment's compose network if it exists
            env_network_name = f"{env_name}_default"
            env_network = None
            try:
                env_network = docker_client.networks.get(env_network_name)
            except docker.errors.NotFound:
                logger.warning(f"Environment network '{env_network_name}' not found - will only use infra-network")

            # Create volume if it doesn't exist (per-environment)
            try:
                docker_client.volumes.get(volume_name)
            except docker.errors.NotFound:
                docker_client.volumes.create(volume_name)
                logger.info(f"Created Tailscale volume: {volume_name}")

            # Ensure certs directory exists
            CERTS_DIR.mkdir(parents=True, exist_ok=True)

            # Create container with environment-specific name and hostname
            # The hostname becomes the Tailscale machine name (e.g., wiz.your-tailnet.ts.net)
            # Add Docker Compose labels so the container is part of the compose project
            container = docker_client.containers.run(
                image="tailscale/tailscale:latest",
                name=container_name,
                hostname=ts_hostname,  # This sets the Tailscale hostname (e.g., "wiz")
                detach=True,
                environment={
                    "TS_STATE_DIR": "/var/lib/tailscale",
                    "TS_USERSPACE": "true",
                    "TS_ACCEPT_DNS": "true",
                    "TS_EXTRA_ARGS": "--advertise-tags=tag:container",
                    "TS_HOSTNAME": ts_hostname,  # Explicitly set Tailscale hostname
                    "TS_SERVE_CONFIG": "/config/tailscale-serve.json",
                },
                labels={
                    "com.docker.compose.project": env_name,
                    "com.docker.compose.service": "tailscale",
                    "com.docker.compose.oneoff": "False",
                },
                volumes={
                    volume_name: {"bind": "/var/lib/tailscale", "mode": "rw"},
                    f"{PROJECT_ROOT}/config/certs": {"bind": "/certs", "mode": "rw"},
                    f"{PROJECT_ROOT}/config": {"bind": "/config", "mode": "ro"},
                },
                cap_add=["NET_ADMIN", "NET_RAW"],
                network="infra-network",
                restart_policy={"Name": "unless-stopped"},
                command="sh -c 'tailscaled --tun=userspace-networking --statedir=/var/lib/tailscale & sleep infinity'"
            )

            # Connect to environment's compose network for routing to backend/frontend
            if env_network:
                try:
                    env_network.connect(container)
                    logger.info(f"Connected Tailscale container to environment network '{env_network_name}'")
                except Exception as e:
                    logger.warning(f"Failed to connect to environment network: {e}")

            logger.info(f"Tailscale container '{container_name}' created with hostname '{ts_hostname}': {container.id}")
            await asyncio.sleep(2)  # Give it time to start
            return {
                "status": "created",
                "message": f"Tailscale container '{container_name}' created and started with hostname '{ts_hostname}'"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting container: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start container: {str(e)}")


@router.post("/container/start-with-caddy")
async def start_tailscale_with_caddy(
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Start both Tailscale and Caddy containers, then configure routing.

    This sets up the full reverse proxy architecture:
    - Tailscale handles secure HTTPS access via MagicDNS
    - Caddy handles path-based routing to services

    Route configuration:
    - /chronicle/* -> Chronicle backend (strips prefix)
    - /api/* -> Ushadow backend
    - /auth/* -> Ushadow backend
    - /ws_pcm -> Ushadow WebSocket
    - /* -> Ushadow frontend
    """
    results = {
        "tailscale": {"status": "pending"},
        "caddy": {"status": "pending"},
        "routing": {"status": "pending"}
    }

    try:
        # 1. Start Caddy first (Tailscale depends on it)
        caddy_result = await start_caddy_container()
        results["caddy"] = caddy_result

        if caddy_result.get("status") not in ["running", "started", "created"]:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to start Caddy: {caddy_result}"
            )

        # 2. Start Tailscale
        ts_result = await start_tailscale_container(current_user)
        results["tailscale"] = ts_result

        return {
            "status": "started",
            "message": "Tailscale and Caddy started successfully",
            "details": results
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting Tailscale with Caddy: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/container/start-caddy")
async def start_caddy_container() -> Dict[str, str]:
    """Start or create Caddy reverse proxy container.

    Creates the Caddy container for path-based routing to services.
    Must be called before configuring Tailscale Serve routes.
    """
    try:
        container_name = "ushadow-caddy"

        try:
            container = docker_client.containers.get(container_name)
            container.reload()

            if container.status == "running":
                return {"status": "running", "message": "Caddy is already running"}
            else:
                container.start()
                await asyncio.sleep(2)
                return {"status": "started", "message": "Caddy container started"}

        except docker.errors.NotFound:
            # Create Caddy container
            logger.info("Creating Caddy container...")

            # Ensure infra network exists
            try:
                infra_network = docker_client.networks.get("infra-network")
            except docker.errors.NotFound:
                raise HTTPException(
                    status_code=400,
                    detail="infra-network not found. Please start infrastructure first."
                )

            # Create volumes
            for vol_name in ["ushadow-caddy-data", "ushadow-caddy-config"]:
                try:
                    docker_client.volumes.get(vol_name)
                except docker.errors.NotFound:
                    docker_client.volumes.create(vol_name)

            # Caddyfile path
            caddyfile_path = PROJECT_ROOT / "config" / "Caddyfile"
            if not caddyfile_path.exists():
                raise HTTPException(
                    status_code=400,
                    detail="Caddyfile not found at config/Caddyfile"
                )

            container = docker_client.containers.run(
                image="caddy:2-alpine",
                name=container_name,
                detach=True,
                ports={"80/tcp": 8880},
                volumes={
                    str(caddyfile_path.absolute()): {"bind": "/etc/caddy/Caddyfile", "mode": "ro"},
                    "ushadow-caddy-data": {"bind": "/data", "mode": "rw"},
                    "ushadow-caddy-config": {"bind": "/config", "mode": "rw"},
                },
                network="infra-network",
                restart_policy={"Name": "unless-stopped"},
            )

            logger.info(f"Caddy container created: {container.id}")
            await asyncio.sleep(2)
            return {"status": "created", "message": "Caddy container created and started"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting Caddy: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/caddy/status")
async def get_caddy_status(
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get Caddy container status."""
    try:
        container = docker_client.containers.get("ushadow-caddy")
        container.reload()

        return {
            "exists": True,
            "running": container.status == "running",
            "status": container.status,
            "id": container.short_id
        }
    except docker.errors.NotFound:
        return {"exists": False, "running": False}
    except Exception as e:
        logger.error(f"Error checking Caddy status: {e}")
        return {"exists": False, "running": False, "error": str(e)}


@router.post("/configure-caddy-routing")
async def configure_caddy_routing(
    current_user: User = Depends(get_current_user)
) -> Dict[str, str]:
    """Configure Tailscale Serve to route all traffic through Caddy.

    This replaces direct service routes with a single route to Caddy,
    which then handles path-based routing to individual services.
    """
    try:
        from src.services.tailscale_serve import configure_caddy_proxy_route, is_caddy_running

        if not is_caddy_running():
            return {
                "status": "error",
                "message": "Caddy is not running. Start it first with /container/start-caddy"
            }

        success = configure_caddy_proxy_route()

        if success:
            return {
                "status": "configured",
                "message": "Tailscale Serve configured to route through Caddy"
            }
        else:
            return {
                "status": "error",
                "message": "Failed to configure Tailscale Serve routing"
            }

    except Exception as e:
        logger.error(f"Error configuring Caddy routing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/container/auth-url", response_model=AuthUrlResponse)
async def get_auth_url(
    current_user: User = Depends(get_current_user)
) -> AuthUrlResponse:
    """Get Tailscale authentication URL with QR code"""
    try:
        # Try to get status first (shows login URL if logged out)
        exit_code, stdout, stderr = await exec_in_container("tailscale status")

        output = stdout + stderr
        logger.info(f"Tailscale status output: {output}")

        # Extract URL from status output (appears when logged out)
        url_match = re.search(r'(https://login\.tailscale\.com/[^\s]+)', output)

        if not url_match:
            # Status didn't have URL - try running tailscale up
            # Note: This will print the URL and exit since we're not interactive
            exit_code, stdout, stderr = await exec_in_container("sh -c 'timeout 5 tailscale up || true'")
            output = stdout + stderr
            logger.info(f"Tailscale up output: {output}")

            url_match = re.search(r'(https://login\.tailscale\.com/[^\s]+)', output)

        if not url_match:
            raise HTTPException(status_code=500, detail=f"Could not extract auth URL. Output: {output}")

        web_auth_url = url_match.group(1)

        # Use plain HTTPS URL - if Tailscale app is installed,
        # iOS/Android will automatically prompt "Open in Tailscale?"
        auth_url = web_auth_url

        # Generate QR code as data URL
        try:
            import qrcode
            import io
            import base64

            qr = qrcode.QRCode(version=1, box_size=10, border=4)
            qr.add_data(auth_url)
            qr.make(fit=True)

            img = qr.make_image(fill_color="black", back_color="white")

            # Convert to data URL
            buffered = io.BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            qr_code_data = f"data:image/png;base64,{img_str}"

            return AuthUrlResponse(
                auth_url=auth_url,
                web_url=web_auth_url,
                qr_code_data=qr_code_data
            )

        except ImportError:
            # qrcode not available - return URL only
            return AuthUrlResponse(
                auth_url=auth_url,
                web_url=web_auth_url,
                qr_code_data=""
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting auth URL: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get auth URL: {str(e)}")


@router.post("/container/provision-cert")
async def provision_cert_in_container(
    hostname: str,
    current_user: User = Depends(get_current_user)
) -> CertificateStatus:
    """Provision certificate via Tailscale container"""
    try:
        # Ensure certs directory exists
        CERTS_DIR.mkdir(parents=True, exist_ok=True)

        # Check if already exists
        cert_file = CERTS_DIR / f"{hostname}.crt"
        key_file = CERTS_DIR / f"{hostname}.key"

        if cert_file.exists() and key_file.exists():
            return CertificateStatus(provisioned=True, cert_path=str(cert_file), key_path=str(key_file))

        # Provision in container - explicitly save to /certs directory
        cert_cmd = f"tailscale cert --cert-file /certs/{hostname}.crt --key-file /certs/{hostname}.key {hostname}"
        exit_code, stdout, stderr = await exec_in_container(cert_cmd)

        if exit_code == 0:
            # Copy files from Tailscale container's /certs to backend's /config/certs
            container_name = get_tailscale_container_name()
            container = docker_client.containers.get(container_name)

            import tarfile
            import io

            # Copy cert file from /certs in Tailscale container
            cert_data, _ = container.get_archive(f"/certs/{hostname}.crt")
            tar_stream = io.BytesIO(b''.join(cert_data))
            with tarfile.open(fileobj=tar_stream) as tar:
                cert_content = tar.extractfile(f"{hostname}.crt").read()

            # Copy key file
            key_data, _ = container.get_archive(f"/certs/{hostname}.key")
            tar_stream = io.BytesIO(b''.join(key_data))
            with tarfile.open(fileobj=tar_stream) as tar:
                key_content = tar.extractfile(f"{hostname}.key").read()

            # Write to backend's config/certs
            with open(cert_file, 'wb') as f:
                f.write(cert_content)
            with open(key_file, 'wb') as f:
                f.write(key_content)

            # Set proper permissions
            os.chmod(cert_file, 0o644)
            os.chmod(key_file, 0o600)

            logger.info(f"Certificates copied from Tailscale container to {CERTS_DIR}")

            return CertificateStatus(provisioned=True, cert_path=str(cert_file), key_path=str(key_file))
        else:
            error = stderr or stdout or "Unknown error"
            return CertificateStatus(provisioned=False, error=error)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error provisioning certificate in container: {e}", exc_info=True)
        return CertificateStatus(provisioned=False, error=str(e))


# ============================================================================
# Tailscale Serve Configuration
# ============================================================================

@router.post("/configure-serve")
async def configure_tailscale_serve(
    config: TailscaleConfig,
    current_user: User = Depends(get_current_user)
) -> Dict[str, str]:
    """Configure Tailscale serve for routing.

    Sets up base routes: /api/* and /auth/* to backend, /* to frontend.
    Uses the tailscale_serve helper module for dynamic route management.
    """
    try:
        from src.services.tailscale_serve import configure_base_routes, get_serve_status

        # Configure base routes for this environment
        success = configure_base_routes()

        if success:
            status = get_serve_status() or "Routes configured"
            return {
                "status": "configured",
                "message": "Tailscale serve configured successfully",
                "routes": status
            }
        else:
            return {
                "status": "partial",
                "message": "Some routes may have failed to configure"
            }

    except Exception as e:
        logger.error(f"Error configuring tailscale serve: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to configure serve: {str(e)}")


# ============================================================================
# Setup Completion
# ============================================================================

@router.post("/complete")
async def complete_setup(
    current_user: User = Depends(get_current_user)
) -> Dict[str, str]:
    """Mark Tailscale setup as complete"""

    try:
        # Verify configuration exists
        config = _read_config()
        if not config:
            raise HTTPException(status_code=400, detail="Configuration not found")

        # Verify certificate exists
        cert_file = CERTS_DIR / f"{config.hostname}.crt"
        if not cert_file.exists():
            raise HTTPException(status_code=400, detail="Certificate not provisioned")

        logger.info("Tailscale setup marked as complete")

        return {
            "status": "complete",
            "message": "Tailscale setup completed successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing setup: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to complete setup: {str(e)}")


# ============================================================================
# CORS Configuration
# ============================================================================

class UpdateCorsRequest(BaseModel):
    """Request to update CORS origins with Tailscale hostname"""
    hostname: str = Field(..., description="Tailscale hostname (e.g., machine.tail12345.ts.net)")


@router.post("/update-cors")
async def update_cors_origins(
    request: UpdateCorsRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, str]:
    """Add Tailscale hostname to CORS allowed origins.

    This endpoint appends the Tailscale HTTPS origin to the security.cors_origins
    setting so the frontend can make requests from the Tailscale URL.

    Note: The CORS middleware reads origins at startup. A server restart may be
    needed for the new origin to take effect.
    """
    try:
        settings = get_settings_store()

        # Build the origin URL
        origin = f"https://{request.hostname}"

        # Get current origins (async to avoid stale cache)
        current_origins = await settings.get("security.cors_origins", "")

        # Parse existing origins (handle both string and None)
        if current_origins and str(current_origins).strip():
            origins_list = [o.strip() for o in str(current_origins).split(",") if o.strip()]
        else:
            origins_list = []

        logger.info(f"Current CORS origins before update: {origins_list}")

        # Check if already present
        if origin in origins_list:
            return {
                "status": "already_present",
                "origin": origin,
                "message": f"Origin {origin} is already in CORS allowed origins"
            }

        # Append new origin
        origins_list.append(origin)
        new_origins = ",".join(origins_list)

        # Save updated origins to security.cors_origins
        await settings.update({"security.cors_origins": new_origins})

        logger.info(f"Updated CORS origins to: {new_origins}")

        return {
            "status": "success",
            "origin": origin,
            "message": f"Added {origin} to CORS allowed origins. Restart may be required for changes to take effect."
        }

    except Exception as e:
        logger.error(f"Error updating CORS origins: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update CORS origins: {str(e)}")


# ============================================================================
# Route Management
# ============================================================================

class RegenerateRoutesResponse(BaseModel):
    """Response from route regeneration."""
    success: bool
    message: str
    routes_count: int = 0
    config_path: Optional[str] = None


@router.post("/routes/regenerate", response_model=RegenerateRoutesResponse)
async def regenerate_serve_routes(
    current_user: User = Depends(get_current_user)
) -> RegenerateRoutesResponse:
    """Regenerate Tailscale Serve routes from all deployed services.

    This scans all compose files for route definitions, checks which services
    are running, and generates/applies the tailscale-serve.json configuration.

    Routes are defined in x-ushadow section of compose files:
        x-ushadow:
          service-name:
            routes:
              - path: /chronicle
                internal_port: 8000
                preserve_path: true
    """
    try:
        from src.services.tailscale_serve_config import (
            generate_serve_config,
            write_serve_config,
            apply_serve_config,
        )

        # Generate config from current state
        config = generate_serve_config()

        # Write to file
        config_path = write_serve_config(config)

        # Apply via set-raw
        success = apply_serve_config(config)

        if success:
            return RegenerateRoutesResponse(
                success=True,
                message=f"Successfully regenerated {len(config.routes)} routes",
                routes_count=len(config.routes),
                config_path=config_path,
            )
        else:
            return RegenerateRoutesResponse(
                success=False,
                message="Generated config but failed to apply via set-raw",
                routes_count=len(config.routes),
                config_path=config_path,
            )

    except ValueError as e:
        # Missing hostname or other config issue
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error regenerating routes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to regenerate routes: {str(e)}")


class ServeRoutesStatus(BaseModel):
    """Current Tailscale Serve routes status."""
    hostname: Optional[str] = None
    routes: List[Dict[str, Any]] = []
    config_exists: bool = False
    tailscale_configured: bool = False


@router.get("/routes/status", response_model=ServeRoutesStatus)
async def get_serve_routes_status(
    current_user: User = Depends(get_current_user)
) -> ServeRoutesStatus:
    """Get current Tailscale Serve routes status.

    Returns the current hostname, configured routes, and whether
    Tailscale Serve is properly configured.
    """
    try:
        import yaml as pyyaml

        # Check if tailscale config exists
        config_path = "/config/tailscale.yaml"
        hostname = None
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                ts_config = pyyaml.safe_load(f)
                hostname = ts_config.get('hostname')

        # Check if serve config exists
        serve_config_path = "/config/tailscale-serve.json"
        config_exists = os.path.exists(serve_config_path)
        routes = []

        if config_exists:
            with open(serve_config_path, 'r') as f:
                serve_config = json.load(f)
                # Extract routes from config
                web = serve_config.get("Web", {})
                for host_port, handler_config in web.items():
                    handlers = handler_config.get("Handlers", {})
                    for path, proxy_config in handlers.items():
                        routes.append({
                            "path": path,
                            "proxy": proxy_config.get("Proxy", ""),
                            "host": host_port,
                        })

        # Check if Tailscale Serve is configured (has routes)
        from src.services.tailscale_serve import get_serve_status
        serve_status = get_serve_status()
        tailscale_configured = bool(serve_status and serve_status.strip())

        return ServeRoutesStatus(
            hostname=hostname,
            routes=routes,
            config_exists=config_exists,
            tailscale_configured=tailscale_configured,
        )

    except Exception as e:
        logger.error(f"Error getting routes status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get routes status: {str(e)}")
