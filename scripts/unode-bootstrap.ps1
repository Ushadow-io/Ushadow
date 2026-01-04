# =============================================================================
# Ushadow UNode Bootstrap Script (Windows)
# =============================================================================
# This script prepares a Windows machine to join a Ushadow cluster by installing:
#   - Docker Desktop (container runtime)
#   - Tailscale (secure networking)
#
# Usage:
#   iex (iwr https://ushadow.io/bootstrap.ps1).Content
#
# After running this script, use the join command from your Ushadow dashboard
# to connect this node to your cluster.
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
    for ($i = 0; $i -lt 10; $i++) {
        try {
            $result = & docker info 2>&1
            if ($LASTEXITCODE -eq 0) {
                $dockerRunning = $true
                break
            }
        } catch {
            # Ignore errors
        }

        if ($i -eq 0) {
            Write-Host "  Waiting for Docker to start..." -ForegroundColor Gray
        }
        Start-Sleep -Seconds 2
    }
}

if (-not $dockerRunning) {
    Write-Warn "Docker not running. Please start Docker Desktop."
    Write-Host "  After Docker starts, run the join command from your Ushadow dashboard.`n" -ForegroundColor White
    exit 0
}

Write-Ok "Docker is running"

# Done
Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  Bootstrap Complete!" -ForegroundColor Green
Write-Host "==========================================`n" -ForegroundColor Green

Write-Host "This machine is now ready to join a Ushadow cluster.`n" -ForegroundColor White
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Go to your Ushadow dashboard" -ForegroundColor White
Write-Host "  2. Navigate to Cluster > Generate Join Token" -ForegroundColor White
Write-Host "  3. Copy the join command and run it on this machine`n" -ForegroundColor White

Write-Host "System Info:" -ForegroundColor Cyan
Write-Host "  Hostname:     $env:COMPUTERNAME" -ForegroundColor White
Write-Host "  Tailscale IP: $tsIP" -ForegroundColor White
$dockerVer = docker --version 2>$null
Write-Host "  Docker:       $dockerVer`n" -ForegroundColor White
