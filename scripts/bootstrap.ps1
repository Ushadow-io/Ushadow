# =============================================================================
# Ushadow UNode Bootstrap Script (Windows)
# =============================================================================
# This script prepares a Windows machine to join a Ushadow cluster by installing:
#   - Docker Desktop (container runtime)
#   - Tailscale (secure networking)
#
# Usage (interactive):
#   iex (irm https://ushadow.io/bootstrap.ps1)
#
# Usage (auto-join with token):
#   $env:TOKEN="abc123"; $env:LEADER_URL="http://100.x.x.x:8000"; iex (irm https://ushadow.io/bootstrap.ps1)
# =============================================================================

$ErrorActionPreference = "Continue"

function Write-Step { param($msg) Write-Host "`n[$script:step/4] $msg" -ForegroundColor Cyan; $script:step++ }
function Write-Ok { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "  [ERROR] $msg" -ForegroundColor Red }

$script:step = 1
$needRestart = $false

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "  Ushadow UNode Bootstrap (Windows)" -ForegroundColor Cyan
Write-Host "==========================================`n" -ForegroundColor Cyan

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warn "Not running as Administrator. Some operations may require elevation."
}

# Step 1: Check/Install Docker
Write-Step "Checking Docker installation..."

if (Get-Command docker -ErrorAction SilentlyContinue) {
    $dockerVersion = docker --version 2>$null
    Write-Ok "Docker already installed ($dockerVersion)"
} else {
    Write-Host "  Installing Docker Desktop..." -ForegroundColor Yellow

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements | Out-Null
        $needRestart = $true
        Write-Ok "Docker Desktop installed"
    } else {
        Write-Err "winget not available. Please install Docker Desktop manually:"
        Write-Host "  https://docker.com/products/docker-desktop" -ForegroundColor White
        exit 1
    }
}

# Step 2: Check/Install Tailscale
Write-Step "Checking Tailscale installation..."

$tsPath = "$env:ProgramFiles\Tailscale\tailscale.exe"

# Also check if tailscale is in PATH
if (-not (Test-Path $tsPath)) {
    $tsInPath = Get-Command tailscale -ErrorAction SilentlyContinue
    if ($tsInPath) { $tsPath = $tsInPath.Source }
}

if (Test-Path $tsPath) {
    try {
        $tsVersion = & $tsPath version 2>$null | Select-Object -First 1
        Write-Ok "Tailscale already installed ($tsVersion)"
    } catch {
        Write-Ok "Tailscale already installed"
    }
} else {
    Write-Host "  Installing Tailscale..." -ForegroundColor Yellow

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install -e --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements | Out-Null
        $needRestart = $true
        Write-Ok "Tailscale installed"
    } else {
        Write-Err "winget not available. Please install Tailscale manually:"
        Write-Host "  https://tailscale.com/download" -ForegroundColor White
        exit 1
    }
}

# Check if restart needed
if ($needRestart) {
    Write-Host "`n==========================================" -ForegroundColor Yellow
    Write-Host "  Restart Required" -ForegroundColor Yellow
    Write-Host "==========================================`n" -ForegroundColor Yellow
    Write-Host "Please:" -ForegroundColor White
    Write-Host "  1. Restart PowerShell (or your terminal)" -ForegroundColor White
    Write-Host "  2. Start Docker Desktop and wait for it to be ready" -ForegroundColor White
    Write-Host "  3. Log in to Tailscale (system tray icon)" -ForegroundColor White
    Write-Host "  4. Run the join command from your Ushadow dashboard`n" -ForegroundColor White
    exit 0
}

# Step 3: Check Tailscale connection
Write-Step "Checking Tailscale connection..."

# Re-check tsPath in case it was just installed
if (-not (Test-Path $tsPath)) {
    $tsInPath = Get-Command tailscale -ErrorAction SilentlyContinue
    if ($tsInPath) { $tsPath = $tsInPath.Source }
}

if (-not (Test-Path $tsPath)) {
    Write-Warn "Tailscale not found. Please restart PowerShell and run this script again."
    exit 0
}

# Check if already connected
$connected = $false
try {
    $status = & $tsPath status 2>&1
    if ($LASTEXITCODE -eq 0 -and $status -notmatch "stopped|Logged out|NeedsLogin") {
        $connected = $true
    }
} catch {}

if (-not $connected) {
    Write-Host "  Starting Tailscale login (scan QR code or click URL)..." -ForegroundColor Yellow
    Write-Host ""

    # Run tailscale up with QR code display
    try {
        & $tsPath up --qr 2>&1
    } catch {
        Write-Host "  Could not show QR code. Please log in via system tray." -ForegroundColor Yellow
    }

    # Wait for connection after login attempt
    Write-Host ""
    Write-Host "  Waiting for Tailscale connection..." -ForegroundColor Gray
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $status = & $tsPath status 2>&1
            if ($LASTEXITCODE -eq 0 -and $status -notmatch "stopped|Logged out|NeedsLogin") {
                $connected = $true
                break
            }
        } catch {}
        Start-Sleep -Seconds 2
    }
}

if (-not $connected) {
    Write-Warn "Tailscale not connected. Please log in and try again."
    exit 0
}

# Get Tailscale IP
try {
    $tsIP = & $tsPath ip -4 2>$null
} catch {
    $tsIP = "unknown"
}
Write-Ok "Tailscale connected (IP: $tsIP)"

# Step 4: Check Docker is running
Write-Step "Checking Docker is running..."

$dockerRunning = $false
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue

if ($dockerCmd) {
    # Quick check if already running
    try {
        $result = & docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            $dockerRunning = $true
        }
    } catch {}
}

if (-not $dockerRunning) {
    # Try to start Docker Desktop
    $dockerPath = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPath) {
        Write-Host "  Starting Docker Desktop..." -ForegroundColor Yellow
        Start-Process $dockerPath
        Write-Host "  Waiting for Docker to start (this may take 30-60 seconds)..." -ForegroundColor Yellow

        # Wait up to 90 seconds
        for ($i = 0; $i -lt 18; $i++) {
            Start-Sleep -Seconds 5
            try {
                $result = & docker info 2>&1
                if ($LASTEXITCODE -eq 0) {
                    $dockerRunning = $true
                    break
                }
            } catch {}
            Write-Host "    Still waiting... ($($i * 5 + 5) seconds)" -ForegroundColor Gray
        }
    }
}

if (-not $dockerRunning) {
    Write-Warn "Docker not running yet. It may still be starting."
    Write-Host "  Wait for Docker Desktop to fully start (whale icon stops animating)," -ForegroundColor White
    Write-Host "  then run the join command from your Ushadow dashboard.`n" -ForegroundColor White
    exit 0
}

Write-Ok "Docker is running"

# Done
Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  Bootstrap Complete!" -ForegroundColor Green
Write-Host "==========================================`n" -ForegroundColor Green

Write-Host "System Info:" -ForegroundColor Cyan
Write-Host "  Hostname:     $env:COMPUTERNAME" -ForegroundColor White
Write-Host "  Tailscale IP: $tsIP" -ForegroundColor White
$dockerVer = docker --version 2>$null
Write-Host "  Docker:       $dockerVer`n" -ForegroundColor White

# Check if TOKEN and LEADER_URL were provided - if so, auto-join
if ($env:TOKEN -and $env:LEADER_URL) {
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  Joining Ushadow Cluster..." -ForegroundColor Cyan
    Write-Host "==========================================`n" -ForegroundColor Cyan

    $NODE_HOSTNAME = $env:COMPUTERNAME
    $TAILSCALE_IP = (tailscale ip -4 2>$null)

    if (-not $TAILSCALE_IP) {
        Write-Err "Could not get Tailscale IP"
        exit 1
    }

    Write-Host "[INFO] Registering $NODE_HOSTNAME ($TAILSCALE_IP) with cluster..." -ForegroundColor Cyan

    $body = @{
        token = $env:TOKEN
        hostname = $NODE_HOSTNAME
        tailscale_ip = $TAILSCALE_IP
        platform = "windows"
        manager_version = "0.1.0"
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$($env:LEADER_URL)/api/unodes/register" -Method Post -Body $body -ContentType "application/json"
        if ($response.success) {
            $UNODE_SECRET = $response.unode.metadata.unode_secret
            Write-Ok "Registered with cluster"
        } else {
            Write-Err "Registration failed: $($response.message)"
            exit 1
        }
    } catch {
        Write-Err "Registration failed: $_"
        exit 1
    }

    # Stop existing manager if running
    docker stop ushadow-manager 2>$null | Out-Null
    docker rm ushadow-manager 2>$null | Out-Null

    # Start manager
    Write-Host "[INFO] Starting ushadow-manager..." -ForegroundColor Cyan
    docker pull ghcr.io/ushadow-io/ushadow-manager:latest 2>$null | Out-Null

    docker run -d --name ushadow-manager --restart unless-stopped `
        -v //var/run/docker.sock:/var/run/docker.sock `
        -e LEADER_URL="$($env:LEADER_URL)" -e UNODE_SECRET="$UNODE_SECRET" `
        -e NODE_HOSTNAME="$NODE_HOSTNAME" -e TAILSCALE_IP="$TAILSCALE_IP" `
        -p 8444:8444 ghcr.io/ushadow-io/ushadow-manager:latest

    Write-Host "`n==========================================" -ForegroundColor Green
    Write-Ok "UNode joined successfully!"
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  Hostname:  $NODE_HOSTNAME" -ForegroundColor White
    Write-Host "  IP:        $TAILSCALE_IP" -ForegroundColor White
    Write-Host "  Manager:   http://localhost:8444" -ForegroundColor White
    Write-Host "  Dashboard: $($env:LEADER_URL)/unodes`n" -ForegroundColor White
} else {
    Write-Host "This machine is now ready to join a Ushadow cluster.`n" -ForegroundColor White
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "  1. Go to your Ushadow dashboard" -ForegroundColor White
    Write-Host "  2. Navigate to Cluster > Generate Join Token" -ForegroundColor White
    Write-Host "  3. Copy the join command and run it on this machine`n" -ForegroundColor White
}
