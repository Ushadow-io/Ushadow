"""UNode management service for distributed cluster."""

import asyncio
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from src.config.settings import get_settings
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
settings = get_settings()


class UNodeManager:
    """Manages cluster u-nodes and their state."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.unodes_collection = db.unodes
        self.tokens_collection = db.join_tokens
        self._heartbeat_tasks: Dict[str, asyncio.Task] = {}
        self._unode_timeout_seconds = 60  # Mark offline after 60s

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
        import subprocess

        # Use LEADER_HOSTNAME env var, or default to "leader"
        # This ensures consistent hostname across container restarts
        hostname = os.environ.get("LEADER_HOSTNAME", "leader")

        # Try to get Tailscale IP from environment first (for containerized deployments)
        tailscale_ip = os.environ.get("TAILSCALE_IP")

        if not tailscale_ip:
            # Fall back to running tailscale command
            try:
                result = subprocess.run(
                    ["tailscale", "ip", "-4"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    tailscale_ip = result.stdout.strip()
            except Exception as e:
                logger.warning(f"Could not get Tailscale IP: {e}")

        if tailscale_ip:
            logger.info(f"Using Tailscale IP: {tailscale_ip}")

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
            "services": ["backend", "frontend", "mongodb", "redis", "qdrant"],
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

    async def create_join_token(
        self,
        user_id: str,
        request: JoinTokenCreate
    ) -> JoinTokenResponse:
        """Create a join token for new u-nodes."""
        import os

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

        # Get leader's Tailscale IP - prefer environment variable for current runtime
        leader_host = os.environ.get("TAILSCALE_IP")
        if not leader_host:
            leader = await self.unodes_collection.find_one({"role": UNodeRole.LEADER.value})
            leader_host = leader.get("tailscale_ip") or leader.get("hostname") if leader else "localhost"
        # Use BACKEND_PORT (external mapped port) for join URLs, not PORT (internal)
        leader_port = settings.BACKEND_PORT

        # Standard join commands (require Tailscale already connected)
        join_command = f'curl -sL "http://{leader_host}:{leader_port}/api/unodes/join/{token}" | sh'
        join_command_ps = f'iex (iwr "http://{leader_host}:{leader_port}/api/unodes/join/{token}/ps1").Content'
        join_script_url = f"http://{leader_host}:{leader_port}/api/unodes/join/{token}"
        join_script_url_ps = f"http://{leader_host}:{leader_port}/api/unodes/join/{token}/ps1"

        # Bootstrap commands - self-contained, install Tailscale first, then join
        bootstrap_bash = self._generate_bootstrap_bash(token, leader_host, leader_port)
        bootstrap_ps = self._generate_bootstrap_powershell(token, leader_host, leader_port)

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

    def _generate_bootstrap_bash(self, token: str, leader_host: str, leader_port: int) -> str:
        """Generate a self-contained bash bootstrap one-liner."""
        # This script installs Tailscale, prompts for login, then fetches and runs the join script
        script = f'''curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up && curl -sL "http://{leader_host}:{leader_port}/api/unodes/join/{token}" | sh'''
        return script

    def _generate_bootstrap_powershell(self, token: str, leader_host: str, leader_port: int) -> str:
        """Generate a self-contained PowerShell bootstrap one-liner."""
        # Full bootstrap script that installs Docker, Tailscale, waits for login, then joins
        script = f'''$ErrorActionPreference="Continue";$T="{token}";$L="{leader_host}";$P={leader_port};Write-Host "`n=== Ushadow UNode Bootstrap ===" -FG Cyan;$tsPath="$env:ProgramFiles\\Tailscale\\tailscale.exe";$needRestart=$false;if(!(Get-Command docker -EA 0)){{Write-Host "[1/4] Installing Docker Desktop..." -FG Yellow;if(Get-Command winget -EA 0){{winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements|Out-Null;$needRestart=$true}}else{{Write-Host "Please install Docker Desktop manually: https://docker.com/desktop" -FG Red;exit 1}}}};if(!(Test-Path $tsPath)){{Write-Host "[2/4] Installing Tailscale..." -FG Yellow;if(Get-Command winget -EA 0){{winget install -e --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements|Out-Null;$needRestart=$true}}else{{Write-Host "Please install Tailscale manually: https://tailscale.com/download" -FG Red;exit 1}}}};if($needRestart){{Write-Host "`n*** Please restart PowerShell and run this command again ***" -FG Yellow;Write-Host "*** Also start Docker Desktop and log in to Tailscale ***" -FG Yellow;exit 0}};Write-Host "[3/4] Checking Tailscale..." -FG Yellow;$connected=$false;for($i=0;$i -lt 30;$i++){{try{{$s=&$tsPath status 2>&1;if($LASTEXITCODE -eq 0){{$connected=$true;break}}}}catch{{}};Write-Host "  Waiting for Tailscale login... ($i/30)" -FG Gray;Start-Sleep 2}};if(!$connected){{Write-Host "Please log in to Tailscale, then re-run." -FG Yellow;exit 0}};Write-Host "[4/4] Joining cluster..." -FG Yellow;iex (iwr "http://$L`:$P/api/unodes/join/$T/ps1").Content'''
        return script

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
        leader_port = settings.BACKEND_PORT

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
        leader_port = settings.BACKEND_PORT

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
        result = await self.unodes_collection.update_one(
            {"hostname": heartbeat.hostname},
            {
                "$set": {
                    "status": heartbeat.status.value,
                    "last_seen": datetime.now(timezone.utc),
                    "services": heartbeat.services_running,
                    "metadata.last_metrics": heartbeat.metrics,
                }
            }
        )

        if heartbeat.capabilities:
            await self.unodes_collection.update_one(
                {"hostname": heartbeat.hostname},
                {"$set": {"capabilities": heartbeat.capabilities.model_dump()}}
            )

        return result.modified_count > 0

    async def get_unode(self, hostname: str) -> Optional[UNode]:
        """Get a u-node by hostname."""
        doc = await self.unodes_collection.find_one({"hostname": hostname})
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
            logger.info(f"Removed u-node: {hostname}")
            return True
        return False

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

    async def get_join_script(self, token: str) -> str:
        """Generate the join script for a token."""
        import os

        valid, token_doc, error = await self.validate_token(token)
        if not valid:
            return f"#!/bin/sh\necho 'Error: {error}'\nexit 1"

        # Get leader's Tailscale IP - prefer environment variable for current runtime
        leader_host = os.environ.get("TAILSCALE_IP")
        if not leader_host:
            leader = await self.unodes_collection.find_one({"role": UNodeRole.LEADER.value})
            leader_host = leader.get("tailscale_ip") or leader.get("hostname") if leader else "localhost"
        # Use BACKEND_PORT (external mapped port) for join URLs
        leader_port = settings.BACKEND_PORT

        script = f'''#!/bin/sh
# Ushadow UNode Join Script
# Generated: {datetime.now(timezone.utc).isoformat()}
# Auto-installs Docker and Tailscale if missing

TOKEN="{token}"
LEADER_URL="http://{leader_host}:{leader_port}"

echo ""
echo "=============================================="
echo "  Ushadow UNode Join"
echo "=============================================="
echo "  Leader: {leader_host}"
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
        import os

        valid, token_doc, error = await self.validate_token(token)
        if not valid:
            return f"Write-Error 'Error: {error}'; exit 1"

        # Get leader's Tailscale IP - prefer environment variable for current runtime
        leader_host = os.environ.get("TAILSCALE_IP")
        if not leader_host:
            leader = await self.unodes_collection.find_one({"role": UNodeRole.LEADER.value})
            leader_host = leader.get("tailscale_ip") or leader.get("hostname") if leader else "localhost"
        # Use BACKEND_PORT (external mapped port) for join URLs
        leader_port = settings.BACKEND_PORT

        script = f'''# Ushadow UNode Join Script (PowerShell)
# Generated: {datetime.now(timezone.utc).isoformat()}
# Auto-installs Docker and Tailscale if missing

$ErrorActionPreference = "Stop"
$TOKEN = "{token}"
$LEADER_URL = "http://{leader_host}:{leader_port}"

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  Ushadow UNode Join" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  Leader: {leader_host}"
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
docker pull ghcr.io/ushadow-io/ushadow-manager:latest

# Stop existing if running
docker stop ushadow-manager 2>$null | Out-Null
docker rm ushadow-manager 2>$null | Out-Null

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
