# =============================================================================
# Ushadow Server Install Script (Windows)
# =============================================================================
# This script sets up a Ushadow server on Windows by:
#   - Installing Git and Python (if needed)
#   - Installing Docker Desktop
#   - Cloning the repository
#   - Running the setup
#
# Usage:
#   iex (irm https://ushadow.io/server-install.ps1)
# =============================================================================

$Version = "1.0.6"

$ErrorActionPreference = "Continue"

function Write-Step { param($num, $total, $msg) Write-Host "`n[$num/$total] $msg" -ForegroundColor Cyan }
function Write-Ok { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "  [ERROR] $msg" -ForegroundColor Red }

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    # Add common install locations
    $extraPaths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312",
        "$env:LOCALAPPDATA\Programs\Python\Python312\Scripts",
        "$env:LOCALAPPDATA\Programs\Python\Python311",
        "$env:LOCALAPPDATA\Programs\Python\Python311\Scripts",
        "$env:ProgramFiles\Python312",
        "$env:ProgramFiles\Python312\Scripts",
        "$env:ProgramFiles\Git\bin",
        "$env:ProgramFiles\Git\cmd"
    )
    foreach ($p in $extraPaths) {
        if ((Test-Path $p) -and ($env:Path -notlike "*$p*")) {
            $env:Path = "$p;$env:Path"
        }
    }
}

$repoUrl = "https://github.com/Ushadow-io/Ushadow.git"
$installDir = "$env:USERPROFILE\ushadow"

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "  Ushadow Server Install (Windows) v$Version" -ForegroundColor Cyan
Write-Host "==========================================`n" -ForegroundColor Cyan

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warn "Not running as Administrator. Some operations may require elevation."
}

# Check winget is available
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Err "winget not available. Please install it from the Microsoft Store (App Installer)."
    Write-Host "  https://aka.ms/getwinget" -ForegroundColor White
    exit 1
}

# Step 1: Install Git
Write-Step 1 4 "Checking Git installation..."

Refresh-Path

if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitVersion = git --version 2>$null
    Write-Ok "Git already installed ($gitVersion)"
} else {
    Write-Host "  Installing Git (this may take a few minutes)..." -ForegroundColor Yellow
    winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements

    Refresh-Path

    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Ok "Git installed"
    } else {
        Write-Warn "Git installed but not in PATH. You may need to restart PowerShell."
    }
}

# Step 2: Install Python
Write-Step 2 4 "Checking Python installation..."

Refresh-Path

$pythonOk = $false
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pyVersion = python --version 2>&1
    if ($pyVersion -match "Python 3") {
        Write-Ok "Python already installed ($pyVersion)"
        $pythonOk = $true
    }
}

if (-not $pythonOk) {
    Write-Host "  Installing Python 3.12 (this may take a few minutes)..." -ForegroundColor Yellow
    winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements

    Refresh-Path

    if (Get-Command python -ErrorAction SilentlyContinue) {
        $pyVersion = python --version 2>&1
        Write-Ok "Python installed ($pyVersion)"
    } else {
        Write-Warn "Python installed but not in PATH. You may need to restart PowerShell."
    }
}

# Install required Python packages
Write-Host "  Installing Python dependencies..." -ForegroundColor Yellow
python -m pip install --quiet pyyaml 2>$null
Write-Ok "Python dependencies installed"

# Step 3: Install Docker Desktop
Write-Step 3 4 "Checking Docker installation..."

if (Get-Command docker -ErrorAction SilentlyContinue) {
    $dockerVersion = docker --version 2>$null
    Write-Ok "Docker already installed ($dockerVersion)"
} else {
    Write-Host "  Installing Docker Desktop (this may take several minutes)..." -ForegroundColor Yellow
    winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
    Write-Ok "Docker Desktop installed"
    Write-Warn "Docker Desktop installed - will attempt to start it automatically."
}

# Step 4: Clone repository
Write-Step 4 4 "Setting up Ushadow repository..."

Refresh-Path

if (Test-Path $installDir) {
    Write-Host "  Directory exists, pulling latest..." -ForegroundColor Yellow
    Push-Location $installDir
    try {
        git pull
        Write-Ok "Repository updated"
    } catch {
        Write-Warn "Could not update repository"
    }
    Pop-Location
} else {
    Write-Host "  Cloning repository to $installDir..." -ForegroundColor Yellow
    try {
        git clone $repoUrl $installDir
        Write-Ok "Repository cloned"
    } catch {
        Write-Err "Failed to clone repository"
        exit 1
    }
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "==========================================`n" -ForegroundColor Green

# Check if Docker is actually running
$dockerRunning = $false
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dockerRunning = $true
    }
} catch {}

if (-not $dockerRunning) {
    Write-Host ""
    Write-Host "  Starting Docker Desktop..." -ForegroundColor Yellow

    # Try to start Docker Desktop
    $dockerPath = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPath) {
        Start-Process $dockerPath
        Write-Host "  Waiting for Docker to start (this may take 30-60 seconds)..." -ForegroundColor Yellow

        # Wait up to 90 seconds for Docker to be ready
        $timeout = 90
        $elapsed = 0
        while ($elapsed -lt $timeout) {
            Start-Sleep -Seconds 5
            $elapsed += 5
            try {
                $dockerInfo = docker info 2>&1
                if ($LASTEXITCODE -eq 0) {
                    $dockerRunning = $true
                    Write-Ok "Docker Desktop is running"
                    break
                }
            } catch {}
            Write-Host "    Still waiting... ($elapsed seconds)" -ForegroundColor Gray
        }
    }
}

if ($dockerRunning) {
    Write-Host ""
    Write-Host "Starting Ushadow setup..." -ForegroundColor Cyan
    Write-Host ""

    Set-Location $installDir
    & python setup/run.py --quick --prod --skip-admin
} else {
    Write-Host ""
    Write-Warn "Docker Desktop is not running yet."
    Write-Host ""
    Write-Host "  Docker Desktop may still be starting. Next steps:" -ForegroundColor White
    Write-Host "    1. Wait for Docker Desktop to fully start (whale icon in system tray stops animating)" -ForegroundColor Yellow
    Write-Host "    2. Run these commands:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "       cd $installDir" -ForegroundColor White
    Write-Host "       python setup/run.py --quick --prod --skip-admin" -ForegroundColor White
    Write-Host ""
}
