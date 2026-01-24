"""UNode management service for distributed cluster."""

import asyncio
import base64
import hashlib
import ipaddress
import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import aiohttp
from aiohttp import UnixConnector
from cryptography.fernet import Fernet
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from src.config import get_settings
from src.config.secrets import get_auth_secret_key
from src.utils.tailscale_serve import get_tailscale_status, TailscaleStatus
from src.models.unode import (
    UNode,
    UNodeInDB,
    UNodeCreate,
    UNodeRole,
    UNodeStatus,
    UNodeCapabilities,
    JoinToken,
    JoinTokenCreate,
    JoinTokenResponse,
    UNodeHeartbeat,
)

logger = logging.getLogger(__name__)
config = get_settings()

# Get backend port from OmegaConf (sync for module-level access)
BACKEND_PORT = config.get_sync("network.backend_public_port") or 8000

# =============================================================================
# Constants
# =============================================================================

# Tailscale IP ranges - CGNAT for IPv4, fd7a::/48 for IPv6
# All traffic between Tailscale nodes is encrypted via WireGuard
TAILSCALE_IPV4_NETWORK = ipaddress.ip_network("100.64.0.0/10")
TAILSCALE_IPV6_NETWORK = ipaddress.ip_network("fd7a:115c:a1e0::/48")

# U-Node manager configuration
UNODE_MANAGER_PORT = 8444  # Port where worker's manager listens
UNODE_SECRET_LENGTH = 32   # Bytes for token_urlsafe (produces ~43 char string)

# Timeout values (in seconds)
HTTP_TIMEOUT_DEFAULT = 10.0      # Default timeout for HTTP requests to workers
HTTP_TIMEOUT_PROBE = 2.0         # Quick timeout for health probes
HEARTBEAT_TIMEOUT_SECONDS = 60   # Mark node offline after this many seconds


def is_tailscale_ip(ip_str: str) -> bool:
    """
    Validate that an IP address is in the Tailscale range.

    This is a security check to ensure we only send sensitive data
    (like unode_secret) to nodes on the Tailscale mesh network,
    which provides WireGuard encryption for all traffic.

    Args:
        ip_str: IP address string to validate

    Returns:
        True if the IP is in Tailscale's CGNAT range (100.64.0.0/10)
        or Tailscale's IPv6 range (fd7a:115c:a1e0::/48)
    """
    try:
        ip = ipaddress.ip_address(ip_str)
        if isinstance(ip, ipaddress.IPv4Address):
            return ip in TAILSCALE_IPV4_NETWORK
        elif isinstance(ip, ipaddress.IPv6Address):
            return ip in TAILSCALE_IPV6_NETWORK
        return False
    except ValueError:
        return False


class UNodeManager:
    """Manages cluster u-nodes and their state."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.unodes_collection = db.unodes
        self.tokens_collection = db.join_tokens
        self._heartbeat_tasks: Dict[str, asyncio.Task] = {}
        self._unode_timeout_seconds = HEARTBEAT_TIMEOUT_SECONDS
        # Initialize encryption key from app secret
        self._fernet = self._init_fernet()

    def _init_fernet(self) -> Fernet:
        """Initialize Fernet encryption using app secret key."""
        # Derive a 32-byte key from the app secret
        try:
            secret = get_auth_secret_key()
        except ValueError:
            secret = "default-secret-key-change-me"
        key = hashlib.sha256(secret.encode()).digest()
        # Fernet requires base64-encoded 32-byte key
        fernet_key = base64.urlsafe_b64encode(key)
        return Fernet(fernet_key)

    def _encrypt_secret(self, secret: str) -> str:
        """Encrypt a secret for storage."""
        return self._fernet.encrypt(secret.encode()).decode()

    def _decrypt_secret(self, encrypted: str) -> str:
        """Decrypt a stored secret."""
        try:
            return self._fernet.decrypt(encrypted.encode()).decode()
        except Exception:
            return ""

    async def initialize(self):
        """Initialize indexes and register self as leader."""
        # Create indexes
        await self.unodes_collection.create_index("hostname", unique=True)
        await self.unodes_collection.create_index("tailscale_ip")
        await self.unodes_collection.create_index("status")
        await self.tokens_collection.create_index("token", unique=True)
        await self.tokens_collection.create_index("expires_at")

        # Register this u-node as leader
        await self._register_self_as_leader()

    async def _register_self_as_leader(self):
        """Register the current u-node as the cluster leader."""
        import os

        hostname = None
        tailscale_ip = None
        status_data = None

        # Method 1: Try Tailscale LocalAPI via Unix socket
        ts_socket = os.environ.get("TS_SOCKET", "/var/run/tailscale/tailscaled.sock")
        if os.path.exists(ts_socket):
            try:
                connector = UnixConnector(path=ts_socket)
                async with aiohttp.ClientSession(connector=connector) as session:
                    async with session.get("http://local-tailscaled.sock/localapi/v0/status") as resp:
                        if resp.status == 200:
                            status_data = await resp.json()
                            logger.info("Got Tailscale status via LocalAPI socket for leader registration")
            except Exception as e:
                logger.debug(f"LocalAPI socket method failed: {e}")

        # Method 2: Try Docker API to exec into tailscale container
        if not status_data:
            tailscale_container = os.environ.get("TAILSCALE_CONTAINER", "")
            docker_socket = "/var/run/docker.sock"
            if tailscale_container and os.path.exists(docker_socket):
                try:
                    connector = UnixConnector(path=docker_socket)
                    async with aiohttp.ClientSession(connector=connector) as session:
                        exec_create_url = f"http://localhost/containers/{tailscale_container}/exec"
                        exec_payload = {
                            "AttachStdout": True,
                            "AttachStderr": True,
                            "Cmd": ["tailscale", "status", "--json"]
                        }
                        async with session.post(exec_create_url, json=exec_payload) as resp:
                            if resp.status == 201:
                                exec_data = await resp.json()
                                exec_id = exec_data.get("Id")
                                exec_start_url = f"http://localhost/exec/{exec_id}/start"
                                async with session.post(exec_start_url, json={"Detach": False}) as start_resp:
                                    if start_resp.status == 200:
                                        raw_output = await start_resp.read()
                                        json_start = raw_output.find(b'{')
                                        if json_start >= 0:
                                            json_data = raw_output[json_start:].decode('utf-8', errors='ignore')
                                            brace_count = 0
                                            json_end = 0
                                            for i, char in enumerate(json_data):
                                                if char == '{':
                                                    brace_count += 1
                                                elif char == '}':
                                                    brace_count -= 1
                                                    if brace_count == 0:
                                                        json_end = i + 1
                                                        break
                                            if json_end > 0:
                                                status_data = json.loads(json_data[:json_end])
                                                logger.info("Got Tailscale status via Docker API for leader registration")
                except Exception as e:
                    logger.warning(f"Docker API exec method failed for leader registration: {e}")

        # Method 3: Try local tailscale CLI
        if not status_data:
            try:
                result = await asyncio.create_subprocess_exec(
                    "tailscale", "status", "--json",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await result.communicate()
                if result.returncode == 0:
                    status_data = json.loads(stdout.decode())
                    logger.info("Got Tailscale status via local CLI for leader registration")
            except Exception as e:
                logger.debug(f"Local CLI method failed for leader registration: {e}")

        # Extract IP from Tailscale status
        if status_data:
            self_info = status_data.get("Self", {})
            tailscale_ips = self_info.get("TailscaleIPs", [])
            for ip in tailscale_ips:
                if "." in ip:  # IPv4
                    tailscale_ip = ip
                    break

        # Fall back to env var for Tailscale IP
        if not tailscale_ip:
            tailscale_ip = os.environ.get("TAILSCALE_IP")

        # Use COMPOSE_PROJECT_NAME as hostname (matches the deployment identity)
        hostname = os.environ.get("COMPOSE_PROJECT_NAME")
        if not hostname:
            # Fall back to Tailscale DNSName
            if status_data:
                self_info = status_data.get("Self", {})
                dns_name = self_info.get("DNSName", "")
                if dns_name:
                    hostname = dns_name.split(".")[0]
        if not hostname:
            import socket
            hostname = socket.gethostname()
            logger.warning(f"Could not determine hostname, using socket hostname: {hostname}")

        logger.info(f"Leader registration: hostname={hostname}, tailscale_ip={tailscale_ip}")

        # Remove any old leader entries and keep only one
        await self.unodes_collection.delete_many({
            "role": UNodeRole.LEADER.value,
            "hostname": {"$ne": hostname}
        })

        # Check if we already exist
        existing = await self.unodes_collection.find_one({"hostname": hostname})

        now = datetime.now(timezone.utc)
        unode_data = {
            "hostname": hostname,
            "display_name": f"{hostname} (Leader)",
            "role": UNodeRole.LEADER.value,
            "status": UNodeStatus.ONLINE.value,
            "tailscale_ip": tailscale_ip,
            "platform": self._detect_platform(),
            "capabilities": UNodeCapabilities(can_become_leader=True).model_dump(),
            "last_seen": now,
            "manager_version": "0.1.0",
            "services": self._detect_running_services(),
            "labels": {"type": "leader"},
            "metadata": {"is_origin": True},
        }

        if existing:
            await self.unodes_collection.update_one(
                {"hostname": hostname},
                {"$set": unode_data}
            )
            logger.info(f"Updated leader u-node: {hostname}")
        else:
            unode_data["id"] = secrets.token_hex(16)
            unode_data["registered_at"] = now
            unode_data["unode_secret_hash"] = ""  # Leader doesn't need secret
            await self.unodes_collection.insert_one(unode_data)
            logger.info(f"Registered leader u-node: {hostname}")

    def _detect_platform(self) -> str:
        """Detect the current platform."""
        import platform
        system = platform.system().lower()
        if system == "darwin":
            return "macos"
        elif system == "windows":
            return "windows"
        elif system == "linux":
            return "linux"
        return "unknown"

    def _detect_running_services(self) -> list[str]:
        """Detect running services from DockerManager (compose registry + core services)."""
        from src.services.docker_manager import get_docker_manager, ServiceStatus

        services = []
        try:
            docker_manager = get_docker_manager()
            # Get all services (not just user-controllable)
            all_services = docker_manager.list_services(user_controllable_only=False)

            for service in all_services:
                # Only include running services
                if service.status == ServiceStatus.RUNNING:
                    services.append(service.name)

            logger.info(f"Detected running services from DockerManager: {services}")
        except Exception as e:
            logger.warning(f"Failed to detect running services: {e}")
            # Fallback to core services
            services = ["backend", "frontend", "mongodb", "redis", "qdrant"]

        return sorted(services)

    async def create_join_token(
        self,
        user_id: str,
        request: JoinTokenCreate
    ) -> JoinTokenResponse:
        """Create a join token for new u-nodes."""
        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=request.expires_in_hours)

        token_doc = {
            "token": token,
            "created_at": now,
            "expires_at": expires_at,
            "created_by": user_id,
            "max_uses": request.max_uses,
            "uses": 0,
            "role": request.role.value,
            "is_active": True,
        }

        await self.tokens_collection.insert_one(token_doc)

        # Get Tailscale status for URL generation
        ts_status = get_tailscale_status()
        ext_url = ts_status.ext_url  # https://{tailscale-dns} or None
        host_url = ts_status.host_url  # http://localhost:8000

        # Use external URL if available, otherwise fall back to host URL
        base_url = ext_url or host_url

        # Standard join commands (require Tailscale already connected)
        join_command = f'curl -sL "{base_url}/api/unodes/join/{token}" | sh'
        join_command_ps = f'iex (iwr "{base_url}/api/unodes/join/{token}/ps1").Content'
        join_script_url = f"{base_url}/api/unodes/join/{token}"
        join_script_url_ps = f"{base_url}/api/unodes/join/{token}/ps1"

        # Bootstrap commands - self-contained, install Tailscale first, then join
        bootstrap_bash = self._generate_bootstrap_bash(token, base_url)
        bootstrap_ps = self._generate_bootstrap_powershell(token, base_url)

        logger.info(f"Created join token (expires: {expires_at})")

        return JoinTokenResponse(
            token=token,
            expires_at=expires_at,
            join_command=join_command,
            join_command_powershell=join_command_ps,
            join_script_url=join_script_url,
            join_script_url_powershell=join_script_url_ps,
            bootstrap_command=bootstrap_bash,
            bootstrap_command_powershell=bootstrap_ps,
        )

    def _generate_bootstrap_bash(self, token: str, base_url: str) -> str:
        """Generate a bash bootstrap command using public bootstrap script.
        
        Sets JOIN_URL env var so bootstrap.sh automatically joins the cluster
        after installing Docker + Tailscale.
        """
        join_url = f"{base_url}/api/unodes/join/{token}"
        return f'JOIN_URL="{join_url}" bash -c "$(curl -fsSL https://ushadow.io/bootstrap.sh)"'

    def _generate_bootstrap_powershell(self, token: str, base_url: str) -> str:
        """Generate a PowerShell bootstrap command using public bootstrap script.
        
        Sets JOIN_URL env var so bootstrap.ps1 automatically joins the cluster
        after installing Docker + Tailscale.
        """
        join_url = f"{base_url}/api/unodes/join/{token}/ps1"
        return f'$env:JOIN_URL="{join_url}"; iex (irm https://ushadow.io/bootstrap.ps1)'

    async def get_bootstrap_script_bash(self, token: str) -> str:
        """Generate the full bootstrap script for bash (served via public URL)."""
        import os

        valid, token_doc, error = await self.validate_token(token)
        if not valid:
            return f"#!/bin/sh\necho 'Error: {error}'\nexit 1"

        leader_host = os.environ.get("TAILSCALE_IP")
        if not leader_host:
            leader = await self.unodes_collection.find_one({"role": UNodeRole.LEADER.value})
            leader_host = leader.get("tailscale_ip") or leader.get("hostname") if leader else "localhost"
        leader_port = BACKEND_PORT

        script = f'''#!/bin/sh
# Ushadow UNode Bootstrap Script
# Installs Docker, Tailscale, connects, then joins cluster
# Generated: {datetime.now(timezone.utc).isoformat()}

set -e
TOKEN="{token}"
LEADER_URL="http://{leader_host}:{leader_port}"

echo ""
echo "=============================================="
echo "  Ushadow UNode Bootstrap"
echo "=============================================="
echo ""

# Install Tailscale
echo "[1/3] Installing Tailscale..."
if command -v tailscale >/dev/null 2>&1; then
    echo "      Tailscale already installed"
else
    curl -fsSL https://tailscale.com/install.sh | sh
fi

# Connect to Tailscale
echo "[2/3] Connecting to Tailscale..."
if tailscale status >/dev/null 2>&1; then
    echo "      Already connected"
else
    echo "      Starting Tailscale..."
    sudo tailscale up
fi

# Run the join script
echo "[3/3] Joining cluster..."
curl -sL "$LEADER_URL/api/unodes/join/$TOKEN" | sh
'''
        return script

    async def get_bootstrap_script_powershell(self, token: str) -> str:
        """Generate the full bootstrap script for PowerShell (served via public URL)."""
        import os

        valid, token_doc, error = await self.validate_token(token)
        if not valid:
            return f"Write-Error 'Error: {error}'; exit 1"

        leader_host = os.environ.get("TAILSCALE_IP")
        if not leader_host:
            leader = await self.unodes_collection.find_one({"role": UNodeRole.LEADER.value})
            leader_host = leader.get("tailscale_ip") or leader.get("hostname") if leader else "localhost"
        leader_port = BACKEND_PORT

        script = f'''# Ushadow UNode Bootstrap - All-in-one installer
# Just run: iex (iwr "http://LEADER:8000/api/unodes/bootstrap/TOKEN/ps1").Content

$ErrorActionPreference = "Continue"
$TOKEN = "{token}"
$LEADER = "{leader_host}"
$PORT = {leader_port}

Write-Host ""
Write-Host "  Ushadow UNode Setup" -ForegroundColor Cyan
Write-Host "  ===================" -ForegroundColor Cyan
Write-Host ""

$dockerExe = "$env:ProgramFiles\\Docker\\Docker\\Docker Desktop.exe"
$tsExe = "$env:ProgramFiles\\Tailscale\\tailscale.exe"
$tsGui = "$env:ProgramFiles\\Tailscale\\tailscale-ipn.exe"

# 1. Install Docker if needed
if (-not (Get-Command docker -EA SilentlyContinue)) {{
    Write-Host "[1/6] Installing Docker Desktop..." -ForegroundColor Yellow
    winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements | Out-Null
    Write-Host "      Installed!" -ForegroundColor Green
}} else {{
    Write-Host "[1/6] Docker already installed" -ForegroundColor Green
}}

# 2. Install Tailscale if needed
if (-not (Test-Path $tsExe)) {{
    Write-Host "[2/6] Installing Tailscale..." -ForegroundColor Yellow
    winget install -e --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements | Out-Null
    Write-Host "      Installed!" -ForegroundColor Green
}} else {{
    Write-Host "[2/6] Tailscale already installed" -ForegroundColor Green
}}

# 3. Start Docker Desktop and wait
Write-Host "[3/6] Starting Docker Desktop..." -ForegroundColor Yellow
$dockerOk = $false
try {{ docker info 2>&1 | Out-Null; if ($LASTEXITCODE -eq 0) {{ $dockerOk = $true }} }} catch {{}}

if (-not $dockerOk) {{
    if (Test-Path $dockerExe) {{ Start-Process $dockerExe }}
    Write-Host "      Waiting for Docker to start (this may take a minute)..." -ForegroundColor Gray
    for ($i = 0; $i -lt 90; $i++) {{
        Start-Sleep 2
        try {{ docker info 2>&1 | Out-Null; if ($LASTEXITCODE -eq 0) {{ $dockerOk = $true; break }} }} catch {{}}
    }}
}}
if ($dockerOk) {{
    Write-Host "      Docker is running!" -ForegroundColor Green
}} else {{
    Write-Host "      Docker not ready. Please start Docker Desktop and re-run." -ForegroundColor Red
    exit 1
}}

# 4. Start Tailscale and prompt login
Write-Host "[4/6] Connecting to Tailscale..." -ForegroundColor Yellow
$tsOk = $false
try {{ & $tsExe status 2>&1 | Out-Null; if ($LASTEXITCODE -eq 0) {{ $tsOk = $true }} }} catch {{}}

if (-not $tsOk) {{
    if (Test-Path $tsGui) {{ Start-Process $tsGui }}
    Write-Host ""
    Write-Host "      >>> Please log in to Tailscale in the window that opened <<<" -ForegroundColor Magenta
    Write-Host "      Waiting for Tailscale connection..." -ForegroundColor Gray
    for ($i = 0; $i -lt 120; $i++) {{
        Start-Sleep 2
        try {{ & $tsExe status 2>&1 | Out-Null; if ($LASTEXITCODE -eq 0) {{ $tsOk = $true; break }} }} catch {{}}
    }}
}}
if ($tsOk) {{
    Write-Host "      Connected to Tailscale!" -ForegroundColor Green
}} else {{
    Write-Host "      Tailscale not connected. Please log in and re-run." -ForegroundColor Red
    exit 1
}}

# 5. Register with cluster
Write-Host "[5/6] Registering with cluster..." -ForegroundColor Yellow
$HOSTNAME = $env:COMPUTERNAME
$TSIP = & $tsExe ip -4 2>$null
if (-not $TSIP) {{ Write-Host "Could not get Tailscale IP" -ForegroundColor Red; exit 1 }}

$body = @{{ token=$TOKEN; hostname=$HOSTNAME; tailscale_ip=$TSIP; platform="windows"; manager_version="0.1.0" }} | ConvertTo-Json
try {{
    $r = Invoke-RestMethod -Uri "http://$LEADER`:$PORT/api/unodes/register" -Method Post -Body $body -ContentType "application/json"
    if ($r.success) {{
        Write-Host "      Registered!" -ForegroundColor Green
        $SECRET = $r.unode.metadata.unode_secret
    }} else {{
        Write-Host "      Failed: $($r.message)" -ForegroundColor Red; exit 1
    }}
}} catch {{
    Write-Host "      Failed: $_" -ForegroundColor Red; exit 1
}}

# 6. Start manager container
Write-Host "[6/6] Starting manager..." -ForegroundColor Yellow
docker stop ushadow-manager 2>$null | Out-Null
docker rm ushadow-manager 2>$null | Out-Null
docker pull ghcr.io/ushadow-io/ushadow-manager:latest | Out-Null
docker run -d --name ushadow-manager --restart unless-stopped -v //var/run/docker.sock:/var/run/docker.sock -e LEADER_URL="http://$LEADER`:$PORT" -e NODE_SECRET="$SECRET" -e NODE_HOSTNAME="$HOSTNAME" -e TAILSCALE_IP="$TSIP" -p 8444:8444 ghcr.io/ushadow-io/ushadow-manager:latest | Out-Null

Write-Host ""
Write-Host "  Done! $HOSTNAME joined the cluster." -ForegroundColor Green
Write-Host "  Tailscale IP: $TSIP" -ForegroundColor Gray
Write-Host ""
'''
        return script

    async def validate_token(self, token: str) -> Tuple[bool, Optional[JoinToken], str]:
        """Validate a join token. Returns (valid, token_doc, error_message)."""
        token_doc = await self.tokens_collection.find_one({"token": token})

        if not token_doc:
            return False, None, "Invalid token"

        if not token_doc.get("is_active", False):
            return False, None, "Token has been revoked"

        expires_at = token_doc.get("expires_at")
        if expires_at:
            # Handle both naive and aware datetimes from MongoDB
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < datetime.now(timezone.utc):
                return False, None, "Token has expired"

        if token_doc.get("uses", 0) >= token_doc.get("max_uses", 1):
            return False, None, "Token has been used maximum times"

        # Convert ObjectId fields to strings for Pydantic
        if "_id" in token_doc:
            del token_doc["_id"]
        if "created_by" in token_doc and hasattr(token_doc["created_by"], "__str__"):
            token_doc["created_by"] = str(token_doc["created_by"])

        return True, JoinToken(**token_doc), ""

    async def register_unode(
        self,
        token: str,
        unode_data: UNodeCreate
    ) -> Tuple[bool, Optional[UNode], str]:
        """Register a new u-node using a join token."""
        # Validate token
        valid, token_doc, error = await self.validate_token(token)
        if not valid:
            return False, None, error

        # Check if u-node already exists
        existing = await self.unodes_collection.find_one(
            {"hostname": unode_data.hostname}
        )
        if existing:
            # Update existing u-node
            return await self._update_existing_unode(existing, unode_data, token_doc)

        # Generate u-node secret for authentication
        unode_secret = secrets.token_urlsafe(32)
        unode_secret_hash = hashlib.sha256(unode_secret.encode()).hexdigest()
        unode_secret_encrypted = self._encrypt_secret(unode_secret)

        now = datetime.now(timezone.utc)
        unode_id = secrets.token_hex(16)

        unode_doc = {
            "id": unode_id,
            "hostname": unode_data.hostname,
            "display_name": unode_data.hostname,
            "tailscale_ip": unode_data.tailscale_ip,
            "platform": unode_data.platform.value,
            "role": token_doc.role.value,
            "status": UNodeStatus.ONLINE.value,
            "capabilities": (unode_data.capabilities or UNodeCapabilities()).model_dump(),
            "registered_at": now,
            "last_seen": now,
            "manager_version": unode_data.manager_version,
            "services": [],
            "labels": {},
            "metadata": {},
            "unode_secret_hash": unode_secret_hash,
            "unode_secret_encrypted": unode_secret_encrypted,
        }

        await self.unodes_collection.insert_one(unode_doc)

        # Increment token usage
        await self.tokens_collection.update_one(
            {"token": token},
            {"$inc": {"uses": 1}}
        )

        logger.info(f"Registered new u-node: {unode_data.hostname} ({unode_data.tailscale_ip})")

        # Return u-node with the secret (only returned once!)
        unode = UNode(**{k: v for k, v in unode_doc.items() if k != "unode_secret_hash"})
        unode.metadata["unode_secret"] = unode_secret  # One-time secret return

        return True, unode, ""

    async def _update_existing_unode(
        self,
        existing: dict,
        unode_data: UNodeCreate,
        token_doc: JoinToken
    ) -> Tuple[bool, Optional[UNode], str]:
        """Update an existing u-node's registration."""
        now = datetime.now(timezone.utc)

        update_data = {
            "tailscale_ip": unode_data.tailscale_ip,
            "platform": unode_data.platform.value,
            "status": UNodeStatus.ONLINE.value,
            "last_seen": now,
            "manager_version": unode_data.manager_version,
        }

        if unode_data.capabilities:
            update_data["capabilities"] = unode_data.capabilities.model_dump()

        await self.unodes_collection.update_one(
            {"hostname": unode_data.hostname},
            {"$set": update_data}
        )

        updated = await self.unodes_collection.find_one({"hostname": unode_data.hostname})
        unode = UNode(**{k: v for k, v in updated.items() if k != "unode_secret_hash"})

        logger.info(f"Updated existing u-node: {unode_data.hostname}")

        return True, unode, ""

    async def process_heartbeat(self, heartbeat: UNodeHeartbeat) -> bool:
        """Process a heartbeat from a u-node."""
        update_data = {
            "status": heartbeat.status.value,
            "last_seen": datetime.now(timezone.utc),
            "services": heartbeat.services_running,
            "metadata.last_metrics": heartbeat.metrics,
        }

        # Update manager version if provided
        if heartbeat.manager_version:
            update_data["manager_version"] = heartbeat.manager_version

        # Try exact hostname match first
        result = await self.unodes_collection.update_one(
            {"hostname": heartbeat.hostname},
            {"$set": update_data}
        )

        # If no match, try case-insensitive hostname match
        if result.matched_count == 0:
            logger.warning(f"Heartbeat: No exact match for hostname '{heartbeat.hostname}', trying case-insensitive")
            result = await self.unodes_collection.update_one(
                {"hostname": {"$regex": f"^{heartbeat.hostname}$", "$options": "i"}},
                {"$set": {**update_data, "hostname": heartbeat.hostname}}  # Also fix the hostname
            )
            if result.matched_count > 0:
                logger.info(f"Heartbeat: Found node with case-insensitive match, updated hostname to '{heartbeat.hostname}'")

        # If still no match, log all known hostnames for debugging
        if result.matched_count == 0:
            all_nodes = await self.unodes_collection.find({}, {"hostname": 1, "tailscale_ip": 1}).to_list(100)
            known = [(n.get("hostname"), n.get("tailscale_ip")) for n in all_nodes]
            logger.error(f"Heartbeat: UNode '{heartbeat.hostname}' not found. Known nodes: {known}")

        if heartbeat.capabilities and result.matched_count > 0:
            await self.unodes_collection.update_one(
                {"hostname": heartbeat.hostname},
                {"$set": {"capabilities": heartbeat.capabilities.model_dump()}}
            )

        return result.matched_count > 0

    async def get_unode(self, hostname: str) -> Optional[UNode]:
        """Get a u-node by hostname."""
        doc = await self.unodes_collection.find_one({"hostname": hostname})
        if doc:
            return UNode(**{k: v for k, v in doc.items() if k != "unode_secret_hash"})
        return None

    async def get_unode_by_role(self, role: UNodeRole) -> Optional[UNode]:
        """Get the first u-node with the specified role (e.g., leader)."""
        doc = await self.unodes_collection.find_one({"role": role.value})
        if doc:
            return UNode(**{k: v for k, v in doc.items() if k != "unode_secret_hash"})
        return None

    async def list_unodes(
        self,
        status: Optional[UNodeStatus] = None,
        role: Optional[UNodeRole] = None
    ) -> List[UNode]:
        """List all u-nodes, optionally filtered by status or role."""
        query = {}
        if status:
            query["status"] = status.value
        if role:
            query["role"] = role.value

        unodes = []
        async for doc in self.unodes_collection.find(query):
            unodes.append(UNode(**{k: v for k, v in doc.items() if k != "unode_secret_hash"}))

        return unodes

    async def remove_unode(self, hostname: str) -> bool:
        """Remove a u-node from the cluster."""
        result = await self.unodes_collection.delete_one({"hostname": hostname})
        if result.deleted_count > 0:
            # Also clean up any deployments for this node
            deployments_result = await self.db.deployments.delete_many({"unode_hostname": hostname})
            if deployments_result.deleted_count > 0:
                logger.info(f"Cleaned up {deployments_result.deleted_count} deployments for {hostname}")
            logger.info(f"Removed u-node: {hostname}")
            return True
        return False

    async def release_unode(self, hostname: str) -> Tuple[bool, str]:
        """
        Release a u-node so it can be claimed by another leader.

        This removes the node from this leader's database and notifies the worker
        to clear its leader association. The worker's manager container keeps
        running and will be discoverable by other leaders.

        Returns:
            Tuple of (success, message)
        """
        # Get the node first
        unode = await self.get_unode(hostname)
        if not unode:
            return False, f"UNode {hostname} not found"

        if unode.role == UNodeRole.LEADER:
            return False, "Cannot release the leader node"

        # Try to notify the worker to release its leader association
        if unode.tailscale_ip:
            try:
                async with aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as session:
                    async with session.post(
                        f"http://{unode.tailscale_ip}:8444/release"
                    ) as response:
                        if response.status == 200:
                            logger.info(f"Notified {hostname} to release leader association")
                        else:
                            logger.warning(f"Worker {hostname} release notification failed: {response.status}")
            except Exception as e:
                # Continue even if notification fails - the node can still be released
                logger.warning(f"Could not notify worker {hostname}: {e}")

        # Remove from database
        result = await self.unodes_collection.delete_one({"hostname": hostname})
        if result.deleted_count > 0:
            # Also clean up any deployments for this node
            deployments_result = await self.db.deployments.delete_many({"unode_hostname": hostname})
            if deployments_result.deleted_count > 0:
                logger.info(f"Cleaned up {deployments_result.deleted_count} deployments for {hostname}")
            logger.info(f"Released u-node: {hostname}")
            return True, f"Node {hostname} released. It can now be claimed by another leader."

        return False, f"Failed to release {hostname}"

    async def claim_unode(
        self,
        hostname: str,
        tailscale_ip: str,
        platform: str = "linux",
        manager_version: str = "0.1.0"
    ) -> Tuple[bool, Optional[UNode], str]:
        """
        Claim a discovered u-node without requiring a token.

        This is used when a leader discovers a released/available node on the
        Tailscale network and wants to claim it. The leader initiates the claim
        rather than the worker registering with a token.

        Security: This method sends the unode_secret over HTTP, but this is
        secure because:
        1. We validate that the target IP is in the Tailscale range
        2. All Tailscale traffic is encrypted via WireGuard

        Args:
            hostname: The hostname of the node to claim
            tailscale_ip: The Tailscale IP of the node (must be in 100.64.0.0/10)
            platform: Platform type (linux, darwin, windows)
            manager_version: Version of the u-node manager

        Returns:
            Tuple of (success, unode, error_message)
        """
        # Security: Validate that the IP is in the Tailscale range
        # This ensures we only send secrets over Tailscale's encrypted network
        if not is_tailscale_ip(tailscale_ip):
            logger.warning(f"Rejecting claim for {hostname}: IP {tailscale_ip} is not a Tailscale IP")
            return False, None, f"Invalid IP address: {tailscale_ip} is not in Tailscale range"

        # Check if node already exists (maybe registered to this leader already)
        existing = await self.unodes_collection.find_one({"hostname": hostname})
        if existing:
            return False, None, f"Node {hostname} is already registered"
        
        # Try to contact the worker to get its actual info and notify it
        worker_info = None
        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=10)
            ) as session:
                # First try to get the worker's info
                async with session.get(f"http://{tailscale_ip}:8444/info") as response:
                    if response.status == 200:
                        worker_info = await response.json()
                        logger.info(f"Got worker info from {hostname}: {worker_info}")
        except Exception as e:
            logger.warning(f"Could not contact worker {hostname} at {tailscale_ip}: {e}")
            # Continue anyway - we can still claim the node
        
        # Generate u-node secret for authentication
        unode_secret = secrets.token_urlsafe(32)
        unode_secret_hash = hashlib.sha256(unode_secret.encode()).hexdigest()
        unode_secret_encrypted = self._encrypt_secret(unode_secret)
        
        now = datetime.now(timezone.utc)
        unode_id = secrets.token_hex(16)
        
        # Use worker info if available, otherwise use provided values
        actual_platform = (worker_info or {}).get("platform", platform)
        actual_version = (worker_info or {}).get("manager_version", manager_version)
        
        unode_doc = {
            "id": unode_id,
            "hostname": hostname,
            "display_name": hostname,
            "tailscale_ip": tailscale_ip,
            "platform": actual_platform,
            "role": UNodeRole.WORKER.value,
            "status": UNodeStatus.ONLINE.value,
            "capabilities": UNodeCapabilities().model_dump(),
            "registered_at": now,
            "last_seen": now,
            "manager_version": actual_version,
            "services": [],
            "labels": {},
            "metadata": {},
            "unode_secret_hash": unode_secret_hash,
            "unode_secret_encrypted": unode_secret_encrypted,
        }
        
        await self.unodes_collection.insert_one(unode_doc)
        logger.info(f"Claimed u-node: {hostname} ({tailscale_ip})")
        
        # Try to notify the worker about its new leader
        # The worker needs to know the leader URL to send heartbeats
        try:
            leader_url = os.environ.get("LEADER_URL", "")
            if not leader_url:
                # Try to construct from tailscale IP
                ts_ip = os.environ.get("TAILSCALE_IP", "")
                if ts_ip:
                    leader_url = f"http://{ts_ip}:8000"
            
            if leader_url:
                async with aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as session:
                    async with session.post(
                        f"http://{tailscale_ip}:8444/claim",
                        json={
                            "leader_url": leader_url,
                            "unode_secret": unode_secret
                        }
                    ) as response:
                        if response.status == 200:
                            logger.info(f"Notified {hostname} of new leader")
                        else:
                            logger.warning(f"Worker {hostname} claim notification returned: {response.status}")
        except Exception as e:
            logger.warning(f"Could not notify worker {hostname} of claim: {e}")
        
        # Return u-node with the secret (only returned once!)
        unode = UNode(**{k: v for k, v in unode_doc.items() if k != "unode_secret_hash"})
        unode.metadata["unode_secret"] = unode_secret  # One-time secret return
        
        return True, unode, ""

    async def update_unode_status(self, hostname: str, status: UNodeStatus) -> bool:
        """Update a u-node's status."""
        result = await self.unodes_collection.update_one(
            {"hostname": hostname},
            {"$set": {"status": status.value, "last_seen": datetime.now(timezone.utc)}}
        )
        return result.modified_count > 0

    async def check_stale_unodes(self):
        """Mark u-nodes as offline if they haven't sent a heartbeat."""
        threshold = datetime.now(timezone.utc) - timedelta(seconds=self._unode_timeout_seconds)

        result = await self.unodes_collection.update_many(
            {
                "status": UNodeStatus.ONLINE.value,
                "last_seen": {"$lt": threshold},
                "role": {"$ne": UNodeRole.LEADER.value}  # Don't mark leader offline
            },
            {"$set": {"status": UNodeStatus.OFFLINE.value}}
        )

        if result.modified_count > 0:
            logger.info(f"Marked {result.modified_count} stale u-nodes as offline")

    async def upgrade_unode(
        self,
        hostname: str,
        image: str = "ghcr.io/ushadow-io/ushadow-manager:latest"
    ) -> Tuple[bool, str]:
        """
        Trigger a remote u-node to upgrade its manager.

        Args:
            hostname: The hostname of the u-node to upgrade
            image: The new Docker image to use

        Returns:
            Tuple of (success, message)
        """
        # Get the node
        unode = await self.get_unode(hostname)
        if not unode:
            return False, f"UNode {hostname} not found"

        if not unode.tailscale_ip:
            return False, f"UNode {hostname} has no Tailscale IP"

        # Get the node secret for authentication
        unode_doc = await self.unodes_collection.find_one({"hostname": hostname})
        if not unode_doc:
            return False, f"UNode {hostname} not found in database"

        # Decrypt the stored secret for authentication
        encrypted_secret = unode_doc.get("unode_secret_encrypted", "")
        node_secret = self._decrypt_secret(encrypted_secret) if encrypted_secret else ""

        if not node_secret:
            return False, f"No authentication secret available for {hostname}. Node may need to re-register."

        manager_url = f"http://{unode.tailscale_ip}:8444"

        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=120)  # Long timeout for image pull
            ) as session:
                async with session.post(
                    f"{manager_url}/upgrade",
                    json={"image": image},
                    headers={"X-Node-Secret": node_secret}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"Upgrade initiated on {hostname}: {data.get('message')}")
                        return True, data.get("message", "Upgrade initiated")
                    elif response.status == 401:
                        return False, "Authentication failed - node requires secret"
                    else:
                        text = await response.text()
                        return False, f"Upgrade failed: {response.status} - {text}"

        except aiohttp.ClientConnectorError:
            return False, f"Cannot connect to {hostname} at {manager_url}"
        except asyncio.TimeoutError:
            return False, f"Timeout connecting to {hostname}"
        except Exception as e:
            logger.error(f"Error upgrading {hostname}: {e}")
            return False, str(e)

    async def discover_tailscale_peers(self) -> List[Dict[str, Any]]:
        """
        Discover all Tailscale peers on the network and probe for u-node managers.
        
        Supports multiple discovery methods:
        1. Tailscale LocalAPI via shared Unix socket (TS_SOCKET env var)
        2. Docker API to exec into TAILSCALE_CONTAINER
        3. Direct tailscale CLI command (if available locally)
        
        Returns list of discovered peers with their status:
        - registered: Node is registered to this leader
        - available: Node has u-node manager but not registered
        - unknown: Tailscale peer with no u-node manager detected
        """
        discovered_peers = []
        status_data = None
        
        try:
            # Method 1: Try Tailscale LocalAPI via Unix socket
            ts_socket = os.environ.get("TS_SOCKET", "/var/run/tailscale/tailscaled.sock")
            if os.path.exists(ts_socket):
                try:
                    connector = UnixConnector(path=ts_socket)
                    async with aiohttp.ClientSession(connector=connector) as session:
                        async with session.get("http://local-tailscaled.sock/localapi/v0/status") as resp:
                            if resp.status == 200:
                                status_data = await resp.json()
                                logger.info("Got Tailscale status via LocalAPI socket")
                except Exception as e:
                    logger.debug(f"LocalAPI socket method failed: {e}")
            
            # Method 2: Try Docker API to exec into tailscale container
            if not status_data:
                tailscale_container = os.environ.get("TAILSCALE_CONTAINER", "")
                docker_socket = "/var/run/docker.sock"
                if tailscale_container and os.path.exists(docker_socket):
                    try:
                        connector = UnixConnector(path=docker_socket)
                        async with aiohttp.ClientSession(connector=connector) as session:
                            # Create exec instance
                            exec_create_url = f"http://localhost/containers/{tailscale_container}/exec"
                            exec_payload = {
                                "AttachStdout": True,
                                "AttachStderr": True,
                                "Cmd": ["tailscale", "status", "--json"]
                            }
                            async with session.post(exec_create_url, json=exec_payload) as resp:
                                if resp.status == 201:
                                    exec_data = await resp.json()
                                    exec_id = exec_data.get("Id")
                                    
                                    # Start exec and get output
                                    exec_start_url = f"http://localhost/exec/{exec_id}/start"
                                    async with session.post(exec_start_url, json={"Detach": False}) as start_resp:
                                        if start_resp.status == 200:
                                            # Docker sends 8-byte header per frame, then data
                                            raw_output = await start_resp.read()
                                            # Skip Docker stream headers (8 bytes per chunk)
                                            # Find the JSON start
                                            json_start = raw_output.find(b'{')
                                            if json_start >= 0:
                                                json_data = raw_output[json_start:].decode('utf-8', errors='ignore')
                                                # Find the end of the JSON object
                                                brace_count = 0
                                                json_end = 0
                                                for i, char in enumerate(json_data):
                                                    if char == '{':
                                                        brace_count += 1
                                                    elif char == '}':
                                                        brace_count -= 1
                                                        if brace_count == 0:
                                                            json_end = i + 1
                                                            break
                                                if json_end > 0:
                                                    status_data = json.loads(json_data[:json_end])
                                                    logger.info("Got Tailscale status via Docker API exec")
                    except Exception as e:
                        logger.warning(f"Docker API exec method failed: {e}")
            
            # Method 3: Try local tailscale CLI
            if not status_data:
                try:
                    result = await asyncio.create_subprocess_exec(
                        "tailscale", "status", "--json",
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout, stderr = await result.communicate()
                    if result.returncode == 0:
                        status_data = json.loads(stdout.decode())
                        logger.info("Got Tailscale status via local CLI")
                except Exception as e:
                    logger.debug(f"Local CLI method failed: {e}")
            
            if not status_data:
                logger.warning("All Tailscale discovery methods failed")
                return []
            
            peers = status_data.get("Peer", {})
            
            # Get registered nodes for comparison
            registered_nodes = await self.list_unodes()
            registered_ips = {node.tailscale_ip for node in registered_nodes if node.tailscale_ip}
            registered_hostnames = {node.hostname for node in registered_nodes}
            
            # Probe each peer for u-node manager
            for peer_id, peer_info in peers.items():
                hostname = peer_info.get("DNSName", "").split(".")[0]  # Get short hostname
                tailscale_ip = peer_info.get("TailscaleIPs", [None])[0]
                
                if not tailscale_ip:
                    continue
                
                peer_data = {
                    "hostname": hostname,
                    "tailscale_ip": tailscale_ip,
                    "os": peer_info.get("OS", "unknown"),
                    "online": peer_info.get("Online", False),
                    "last_seen": peer_info.get("LastSeen"),
                }
                
                # Check if already registered
                if tailscale_ip in registered_ips or hostname in registered_hostnames:
                    peer_data["status"] = "registered"
                    # Get full registered node info
                    for node in registered_nodes:
                        if node.tailscale_ip == tailscale_ip or node.hostname == hostname:
                            peer_data["registered_to"] = "this_leader"
                            peer_data["role"] = node.role
                            peer_data["node_id"] = node.id
                            break
                else:
                    # Probe for u-node manager on port 8444
                    has_unode_manager = await self._probe_unode_manager(tailscale_ip, 8444)
                    
                    if has_unode_manager:
                        peer_data["status"] = "available"
                        # Try to get more info from the u-node manager
                        node_info = await self._get_unode_info(tailscale_ip, 8444)
                        if node_info:
                            peer_data.update(node_info)
                            # Check if registered to another leader
                            if node_info.get("leader_ip") and node_info.get("leader_ip") != await self._get_own_tailscale_ip():
                                peer_data["registered_to"] = "other_leader"
                                peer_data["leader_ip"] = node_info["leader_ip"]
                    else:
                        peer_data["status"] = "unknown"
                
                discovered_peers.append(peer_data)
            
        except Exception as e:
            logger.error(f"Error discovering Tailscale peers: {e}")
        
        return discovered_peers
    
    async def _probe_unode_manager(self, ip: str, port: int, timeout: float = 2.0) -> bool:
        """Check if a u-node manager is running on the given IP:port."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"http://{ip}:{port}/health",
                    timeout=aiohttp.ClientTimeout(total=timeout)
                ) as response:
                    return response.status == 200
        except Exception:
            return False
    
    async def _get_unode_info(self, ip: str, port: int, timeout: float = 2.0) -> Optional[Dict[str, Any]]:
        """Get u-node manager info from the given IP:port."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"http://{ip}:{port}/unode/info",
                    timeout=aiohttp.ClientTimeout(total=timeout)
                ) as response:
                    if response.status == 200:
                        return await response.json()
        except Exception:
            pass
        return None
    
    async def _get_own_tailscale_ip(self) -> Optional[str]:
        """Get this leader's Tailscale IP."""
        try:
            result = await asyncio.create_subprocess_exec(
                "tailscale", "ip", "-4",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await result.communicate()
            if result.returncode == 0:
                return stdout.decode().strip()
        except Exception as e:
            logger.warning(f"Could not get own Tailscale IP: {e}")
        return None

    async def get_join_script(self, token: str) -> str:
        """Generate the join script for a token."""
        valid, token_doc, error = await self.validate_token(token)
        if not valid:
            return f"#!/bin/sh\necho 'Error: {error}'\nexit 1"

        # Get Tailscale status for URL generation
        ts_status = get_tailscale_status()
        ext_url = ts_status.ext_url  # https://{tailscale-dns} or None
        host_url = ts_status.host_url  # http://localhost:8000
        leader_url = ext_url or host_url
        leader_display = ts_status.hostname or 'localhost'

        script = f'''#!/bin/sh
# Ushadow UNode Join Script
# Generated: {datetime.now(timezone.utc).isoformat()}
# Auto-installs Docker and Tailscale if missing

TOKEN="{token}"
LEADER_URL="{leader_url}"

echo ""
echo "=============================================="
echo "  Ushadow UNode Join"
echo "=============================================="
echo "  Leader: {leader_display}"
echo ""

# Detect OS
detect_os() {{
    case "$(uname -s)" in
        Linux*)
            if [ -f /etc/os-release ]; then
                . /etc/os-release
                echo "$ID"
            else
                echo "linux"
            fi
            ;;
        Darwin*) echo "macos";;
        MINGW*|CYGWIN*|MSYS*) echo "windows";;
        *)       echo "unknown";;
    esac
}}

OS=$(detect_os)
echo "[1/5] Detected OS: $OS"

# Install Docker if missing
install_docker() {{
    echo "[2/5] Checking Docker..."
    if command -v docker >/dev/null 2>&1; then
        echo "      Docker already installed"
        return 0
    fi

    echo "      Installing Docker..."
    case "$OS" in
        ubuntu|debian|pop)
            sudo apt-get update -qq
            sudo apt-get install -y -qq docker.io
            sudo systemctl enable --now docker
            sudo usermod -aG docker $USER
            ;;
        fedora|rhel|centos|rocky|alma)
            sudo dnf install -y docker
            sudo systemctl enable --now docker
            sudo usermod -aG docker $USER
            ;;
        macos)
            if command -v brew >/dev/null 2>&1; then
                echo "      Installing Docker via Homebrew..."
                brew install --cask docker
                open -a Docker
                echo ""
                echo "      Docker Desktop installed and starting."
                echo "      Please complete Docker setup, then re-run this script."
                exit 0
            else
                echo "      Please install Docker Desktop from: https://docs.docker.com/desktop/install/mac-install/"
                echo "      Then re-run this script."
                exit 1
            fi
            ;;
        windows)
            if command -v winget >/dev/null 2>&1; then
                echo "      Installing Docker Desktop via winget..."
                winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
                echo ""
                echo "      Docker Desktop installed!"
                echo "      Please start Docker Desktop and complete setup, then re-run this script."
                exit 0
            else
                echo "      Please install Docker Desktop from: https://docs.docker.com/desktop/install/windows-install/"
                echo "      Or install winget first: https://aka.ms/getwinget"
                echo "      Then re-run this script."
                exit 1
            fi
            ;;
        *)
            curl -fsSL https://get.docker.com | sh
            sudo usermod -aG docker $USER
            ;;
    esac
    echo "      Docker installed!"
}}

# Install Tailscale if missing
install_tailscale() {{
    echo "[3/5] Checking Tailscale..."
    if command -v tailscale >/dev/null 2>&1; then
        echo "      Tailscale already installed"
        return 0
    fi

    echo "      Installing Tailscale..."
    case "$OS" in
        ubuntu|debian|pop|fedora|rhel|centos|rocky|alma|arch|opensuse*)
            curl -fsSL https://tailscale.com/install.sh | sh
            ;;
        macos)
            if command -v brew >/dev/null 2>&1; then
                echo "      Installing Tailscale via Homebrew..."
                brew install --cask tailscale
                open -a Tailscale
                echo ""
                echo "      Tailscale installed! Please log in, then re-run this script."
                exit 0
            else
                echo "      Please install Tailscale from: https://tailscale.com/download/mac"
                echo "      Then re-run this script."
                exit 1
            fi
            ;;
        windows)
            if command -v winget >/dev/null 2>&1; then
                echo "      Installing Tailscale via winget..."
                winget install -e --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements
                echo ""
                echo "      Tailscale installed!"
                echo "      Please start Tailscale from Start Menu and log in, then re-run this script."
                exit 0
            else
                echo "      Please install Tailscale from: https://tailscale.com/download/windows"
                echo "      Or install winget first: https://aka.ms/getwinget"
                echo "      Then re-run this script."
                exit 1
            fi
            ;;
        *)
            curl -fsSL https://tailscale.com/install.sh | sh
            ;;
    esac
    echo "      Tailscale installed!"
}}

# Connect to Tailscale if not connected
connect_tailscale() {{
    echo "[4/5] Checking Tailscale connection..."
    if tailscale status >/dev/null 2>&1; then
        echo "      Already connected to Tailscale"
    else
        echo "      Starting Tailscale..."
        case "$OS" in
            macos)
                open -a Tailscale
                echo ""
                echo "      Tailscale app opened. Please log in, then re-run this script."
                exit 0
                ;;
            windows)
                echo "      Please open Tailscale from the Start Menu and log in."
                echo "      Then re-run this script."
                exit 0
                ;;
            *)
                sudo tailscale up
                ;;
        esac
    fi
}}

# Main installation
install_docker
install_tailscale
connect_tailscale

# Get u-node info
NODE_HOSTNAME=$(hostname)
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")

if [ -z "$TAILSCALE_IP" ]; then
    echo "      Could not get Tailscale IP. Please ensure Tailscale is connected."
    exit 1
fi
echo "      Tailscale IP: $TAILSCALE_IP"

# Detect platform for registration
case "$(uname -s)" in
    Linux*)  PLATFORM="linux";;
    Darwin*) PLATFORM="macos";;
    MINGW*|CYGWIN*|MSYS*) PLATFORM="windows";;
    *)       PLATFORM="unknown";;
esac

# Register with leader
echo "[5/5] Registering with cluster..."
REGISTER_RESPONSE=$(curl -s -X POST "$LEADER_URL/api/unodes/register" \\
    -H "Content-Type: application/json" \\
    -d "{{
        \\"token\\": \\"$TOKEN\\",
        \\"hostname\\": \\"$NODE_HOSTNAME\\",
        \\"tailscale_ip\\": \\"$TAILSCALE_IP\\",
        \\"platform\\": \\"$PLATFORM\\",
        \\"manager_version\\": \\"0.1.0\\"
    }}")

# Check if registration succeeded
if echo "$REGISTER_RESPONSE" | grep -q '"success":true'; then
    UNODE_SECRET=$(echo "$REGISTER_RESPONSE" | grep -o '"unode_secret":"[^"]*"' | cut -d'"' -f4)
    echo "      Registered with cluster!"
else
    ERROR=$(echo "$REGISTER_RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
    echo "      Registration failed: $ERROR"
    echo "      Full response: $REGISTER_RESPONSE"
    exit 1
fi

# Stop existing manager if running
docker stop ushadow-manager 2>/dev/null || true
docker rm ushadow-manager 2>/dev/null || true

# Pull and run manager
echo ""
echo "Starting ushadow-manager..."
docker pull ghcr.io/ushadow-io/ushadow-manager:latest

docker run -d \\
    --name ushadow-manager \\
    --restart unless-stopped \\
    -v /var/run/docker.sock:/var/run/docker.sock \\
    -e LEADER_URL="$LEADER_URL" \\
    -e UNODE_SECRET="$UNODE_SECRET" \\
    -e NODE_HOSTNAME="$NODE_HOSTNAME" \\
    -e TAILSCALE_IP="$TAILSCALE_IP" \\
    -p 8444:8444 \\
    ghcr.io/ushadow-io/ushadow-manager:latest

echo ""
echo "=============================================="
echo "  UNode joined successfully!"
echo "=============================================="
echo "  Hostname:  $NODE_HOSTNAME"
echo "  IP:        $TAILSCALE_IP"
echo "  Manager:   http://localhost:8444"
echo "  Dashboard: $LEADER_URL/unodes"
echo ""
'''
        return script

    async def get_join_script_powershell(self, token: str) -> str:
        """Generate the PowerShell join script for a token."""
        valid, token_doc, error = await self.validate_token(token)
        if not valid:
            return f"Write-Error 'Error: {error}'; exit 1"

        # Get Tailscale status for URL generation
        ts_status = get_tailscale_status()
        ext_url = ts_status.ext_url  # https://{tailscale-dns} or None
        host_url = ts_status.host_url  # http://localhost:8000
        leader_url = ext_url or host_url
        leader_display = ts_status.hostname or 'localhost'

        script = f'''# Ushadow UNode Join Script (PowerShell)
# Generated: {datetime.now(timezone.utc).isoformat()}
# Auto-installs Docker and Tailscale if missing

$ErrorActionPreference = "Stop"
$TOKEN = "{token}"
$LEADER_URL = "{leader_url}"

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  Ushadow UNode Join" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  Leader: {leader_display}"
Write-Host ""

# Check if running as admin for installations
function Test-Admin {{
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}}

# Install Docker if missing
function Install-DockerDesktop {{
    Write-Host "[2/5] Checking Docker..." -ForegroundColor Yellow
    if (Get-Command docker -ErrorAction SilentlyContinue) {{
        Write-Host "      Docker already installed" -ForegroundColor Green
        return $true
    }}

    Write-Host "      Installing Docker Desktop via winget..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {{
        winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
        Write-Host ""
        Write-Host "      Docker Desktop installed!" -ForegroundColor Green
        Write-Host "      Please start Docker Desktop and complete setup, then re-run this script." -ForegroundColor Yellow
        exit 0
    }} else {{
        Write-Host "      winget not found. Please install Docker Desktop manually:" -ForegroundColor Red
        Write-Host "      https://docs.docker.com/desktop/install/windows-install/"
        exit 1
    }}
}}

# Install Tailscale if missing
function Install-Tailscale {{
    Write-Host "[3/5] Checking Tailscale..." -ForegroundColor Yellow
    if (Get-Command tailscale -ErrorAction SilentlyContinue) {{
        Write-Host "      Tailscale already installed" -ForegroundColor Green
        return $true
    }}

    Write-Host "      Installing Tailscale via winget..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {{
        winget install -e --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements
        Write-Host ""
        Write-Host "      Tailscale installed!" -ForegroundColor Green
        Write-Host "      Please start Tailscale from Start Menu and log in, then re-run this script." -ForegroundColor Yellow
        exit 0
    }} else {{
        Write-Host "      winget not found. Please install Tailscale manually:" -ForegroundColor Red
        Write-Host "      https://tailscale.com/download/windows"
        exit 1
    }}
}}

# Check Tailscale connection
function Test-TailscaleConnection {{
    Write-Host "[4/5] Checking Tailscale connection..." -ForegroundColor Yellow
    try {{
        $status = tailscale status 2>&1
        if ($LASTEXITCODE -eq 0) {{
            Write-Host "      Already connected to Tailscale" -ForegroundColor Green
            return $true
        }}
    }} catch {{}}

    Write-Host "      Please open Tailscale from the Start Menu and log in." -ForegroundColor Yellow
    Write-Host "      Then re-run this script."
    exit 0
}}

# Main
Write-Host "[1/5] Detected OS: Windows" -ForegroundColor Yellow

Install-DockerDesktop
Install-Tailscale
Test-TailscaleConnection

# Get u-node info
$NODE_HOSTNAME = $env:COMPUTERNAME
$TAILSCALE_IP = (tailscale ip -4 2>$null)

if (-not $TAILSCALE_IP) {{
    Write-Host "      Could not get Tailscale IP. Please ensure Tailscale is connected." -ForegroundColor Red
    exit 1
}}
Write-Host "      Tailscale IP: $TAILSCALE_IP" -ForegroundColor Green

# Register with leader
Write-Host "[5/5] Registering with cluster..." -ForegroundColor Yellow
$body = @{{
    token = $TOKEN
    hostname = $NODE_HOSTNAME
    tailscale_ip = $TAILSCALE_IP
    platform = "windows"
    manager_version = "0.1.0"
}} | ConvertTo-Json

try {{
    $response = Invoke-RestMethod -Uri "$LEADER_URL/api/unodes/register" -Method Post -Body $body -ContentType "application/json"
    if ($response.success) {{
        Write-Host "      Registered with cluster!" -ForegroundColor Green
        $UNODE_SECRET = $response.unode.metadata.unode_secret
    }} else {{
        Write-Host "      Registration failed: $($response.message)" -ForegroundColor Red
        exit 1
    }}
}} catch {{
    Write-Host "      Registration failed: $_" -ForegroundColor Red
    exit 1
}}

# Start the manager container
Write-Host ""
Write-Host "Starting ushadow-manager..." -ForegroundColor Yellow
$ErrorActionPreference = "Continue"
docker pull ghcr.io/ushadow-io/ushadow-manager:latest 2>$null | Out-Null
docker stop ushadow-manager 2>$null | Out-Null
docker rm ushadow-manager 2>$null | Out-Null
$ErrorActionPreference = "Stop"

docker run -d `
    --name ushadow-manager `
    --restart unless-stopped `
    -v //var/run/docker.sock:/var/run/docker.sock `
    -e LEADER_URL="$LEADER_URL" `
    -e UNODE_SECRET="$UNODE_SECRET" `
    -e NODE_HOSTNAME="$NODE_HOSTNAME" `
    -e TAILSCALE_IP="$TAILSCALE_IP" `
    -p 8444:8444 `
    ghcr.io/ushadow-io/ushadow-manager:latest

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "  UNode joined successfully!" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host "  Hostname:  $NODE_HOSTNAME"
Write-Host "  IP:        $TAILSCALE_IP"
Write-Host "  Manager:   http://localhost:8444"
Write-Host "  Leader:    $LEADER_URL"
Write-Host ""
'''
        return script


# Global instance (initialized on startup)
_unode_manager: Optional[UNodeManager] = None


async def get_unode_manager() -> UNodeManager:
    """Get the global UNodeManager instance."""
    global _unode_manager
    if _unode_manager is None:
        raise RuntimeError("UNodeManager not initialized. Call init_unode_manager first.")
    return _unode_manager


async def init_unode_manager(db: AsyncIOMotorDatabase) -> UNodeManager:
    """Initialize the global UNodeManager."""
    global _unode_manager
    _unode_manager = UNodeManager(db)
    await _unode_manager.initialize()
    return _unode_manager
