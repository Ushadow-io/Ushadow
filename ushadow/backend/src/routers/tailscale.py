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
import docker
from pathlib import Path
from typing import Dict, List, Optional, Literal, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tailscale", tags=["tailscale"])

# Docker client for container management
docker_client = docker.from_env()
TAILSCALE_CONTAINER_NAME = "ushadow-tailscale"


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


# ============================================================================
# Platform Detection
# ============================================================================

@router.get("/platform", response_model=PlatformInfo)
async def detect_platform() -> PlatformInfo:
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
async def get_installation_guide(os_type: str) -> InstallationGuide:
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
# Tailscale Status Check
# ============================================================================

async def run_command(command: str) -> tuple[int, str, str]:
    """Run a shell command and return exit code, stdout, stderr"""
    try:
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        return process.returncode or 0, stdout.decode(), stderr.decode()
    except Exception as e:
        logger.error(f"Error running command '{command}': {e}")
        return 1, "", str(e)


# ============================================================================
# Configuration Management
# ============================================================================

CONFIG_DIR = Path("/config")
TAILSCALE_CONFIG_FILE = CONFIG_DIR / "tailscale.yaml"


@router.get("/config", response_model=Optional[TailscaleConfig])
async def get_config() -> Optional[TailscaleConfig]:
    """Get current Tailscale configuration"""

    if not TAILSCALE_CONFIG_FILE.exists():
        return None

    try:
        with open(TAILSCALE_CONFIG_FILE, 'r') as f:
            config_data = yaml.safe_load(f)
            return TailscaleConfig(**config_data)
    except Exception as e:
        logger.error(f"Error reading config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to read configuration: {str(e)}")


@router.post("/config", response_model=TailscaleConfig)
async def save_config(config: TailscaleConfig) -> TailscaleConfig:
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


# ============================================================================
# Configuration Generation
# ============================================================================

@router.post("/generate-config")
async def generate_tailscale_config(config: TailscaleConfig) -> Dict[str, str]:
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
async def get_access_urls() -> AccessUrls:
    """Get access URLs for all configured services"""

    config = await get_config()
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
async def test_connection(url: str) -> Dict[str, Any]:
    """Test connection to a specific URL"""

    try:
        # Use curl to test the connection
        code, stdout, stderr = await run_command(f"curl -I -s -o /dev/null -w '%{{http_code}}' {url}")

        http_code = stdout.strip() if code == 0 else "000"
        success = http_code.startswith("2") or http_code.startswith("3")

        return {
            "url": url,
            "success": success,
            "http_code": http_code,
            "error": stderr if not success else None
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
        container = docker_client.containers.get(TAILSCALE_CONTAINER_NAME)
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
async def get_container_status() -> ContainerStatus:
    """Get Tailscale container status"""
    try:
        try:
            container = docker_client.containers.get(TAILSCALE_CONTAINER_NAME)
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


@router.post("/container/start")
async def start_tailscale_container() -> Dict[str, str]:
    """Start or create Tailscale container using Docker SDK"""
    try:
        # Check if container exists
        try:
            container = docker_client.containers.get(TAILSCALE_CONTAINER_NAME)

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
            logger.info("Creating Tailscale container with Docker SDK...")

            # Ensure network exists
            try:
                network = docker_client.networks.get("infra-network")
            except docker.errors.NotFound:
                raise HTTPException(
                    status_code=400,
                    detail="infra-network not found. Please start infrastructure first."
                )

            # Create volume if it doesn't exist
            try:
                docker_client.volumes.get("tailscale_state")
            except docker.errors.NotFound:
                docker_client.volumes.create("tailscale_state")

            # Ensure certs directory exists
            CERTS_DIR.mkdir(parents=True, exist_ok=True)

            # Create container
            container = docker_client.containers.run(
                image="tailscale/tailscale:latest",
                name=TAILSCALE_CONTAINER_NAME,
                hostname="ushadow-tailscale",
                detach=True,
                environment={
                    "TS_STATE_DIR": "/var/lib/tailscale",
                    "TS_USERSPACE": "true",
                    "TS_ACCEPT_DNS": "true",
                    "TS_EXTRA_ARGS": "--advertise-tags=tag:container",
                },
                volumes={
                    "tailscale_state": {"bind": "/var/lib/tailscale", "mode": "rw"},
                    str(CERTS_DIR.absolute()): {"bind": "/certs", "mode": "rw"},
                },
                cap_add=["NET_ADMIN", "NET_RAW"],
                network="infra-network",
                restart_policy={"Name": "unless-stopped"},
                command="sh -c 'tailscaled --tun=userspace-networking --statedir=/var/lib/tailscale & sleep infinity'"
            )

            logger.info(f"Tailscale container created: {container.id}")
            await asyncio.sleep(2)  # Give it time to start
            return {"status": "created", "message": "Tailscale container created and started"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting container: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start container: {str(e)}")


@router.get("/container/auth-url", response_model=AuthUrlResponse)
async def get_auth_url() -> AuthUrlResponse:
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
async def provision_cert_in_container(hostname: str) -> CertificateStatus:
    """Provision certificate via Tailscale container"""
    try:
        # Ensure certs directory exists
        CERTS_DIR.mkdir(parents=True, exist_ok=True)

        # Check if already exists
        cert_file = CERTS_DIR / f"{hostname}.crt"
        key_file = CERTS_DIR / f"{hostname}.key"

        if cert_file.exists() and key_file.exists():
            return CertificateStatus(provisioned=True, cert_path=str(cert_file), key_path=str(key_file))

        # Provision in container (saves to /tmp inside container)
        exit_code, stdout, stderr = await exec_in_container(f"tailscale cert {hostname}")

        if exit_code == 0:
            # Copy files from Tailscale container's /certs to backend's /config/certs
            container = docker_client.containers.get(TAILSCALE_CONTAINER_NAME)

            import tarfile
            import io

            # Copy cert file from /certs in Tailscale container
            cert_data, _ = container.get_archive(f"/certs/{hostname}.crt")
            tar_stream = io.BytesIO(b''.join(cert_data))
            tar = tarfile.open(fileobj=tar_stream)
            cert_content = tar.extractfile(f"{hostname}.crt").read()

            # Copy key file
            key_data, _ = container.get_archive(f"/certs/{hostname}.key")
            tar_stream = io.BytesIO(b''.join(key_data))
            tar = tarfile.open(fileobj=tar_stream)
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
async def configure_tailscale_serve(config: TailscaleConfig) -> Dict[str, str]:
    """Configure Tailscale serve for routing"""
    try:
        if config.deployment_mode.mode != "single":
            return {"status": "skipped", "message": "Tailscale serve only used in single mode"}

        # Get container names from environment
        compose_project = os.getenv("COMPOSE_PROJECT_NAME", "ushadow")
        backend_container = f"{compose_project}-backend"
        frontend_container = f"{compose_project}-webui"

        # Internal ports (inside containers)
        backend_internal_port = config.backend_port  # Use configured backend port
        frontend_internal_port = 5173  # Vite dev server default

        # Configure tailscale serve routes
        # We always use Caddy for routing to preserve /api paths correctly
        commands = [
            # Reset any existing serve config
            "tailscale serve reset",
            # Route everything to Caddy which handles /api/* and / routing
            "tailscale serve --bg http://ushadow-caddy:80",
        ]

        results = []
        for cmd in commands:
            logger.info(f"Running: {cmd}")
            exit_code, stdout, stderr = await exec_in_container(cmd)
            results.append({
                "command": cmd,
                "success": exit_code == 0,
                "output": stdout + stderr
            })

            if exit_code != 0:
                logger.error(f"Failed to configure serve: {stderr}")

        return {
            "status": "configured",
            "message": "Tailscale serve configured successfully",
            "results": str(results)
        }

    except Exception as e:
        logger.error(f"Error configuring tailscale serve: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to configure serve: {str(e)}")


# ============================================================================
# Setup Completion
# ============================================================================

@router.post("/complete")
async def complete_setup() -> Dict[str, str]:
    """Mark Tailscale setup as complete"""

    try:
        # Verify configuration exists
        config = await get_config()
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
