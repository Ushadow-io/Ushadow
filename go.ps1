# Ushadow Quick Start - Windows PowerShell
#
# This is the Windows equivalent of ./go.sh
# It runs the Python-based startup script.
#
# Usage:
#   .\go.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Ushadow Quick Start (Windows)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check for Python
$pythonCmd = $null

if (Get-Command python -ErrorAction SilentlyContinue) {
    $pyVersion = python --version 2>&1
    if ($pyVersion -match "Python 3") {
        $pythonCmd = "python"
    }
}

if (-not $pythonCmd -and (Get-Command python3 -ErrorAction SilentlyContinue)) {
    $pythonCmd = "python3"
}

if (-not $pythonCmd) {
    Write-Host "[ERROR] Python 3 is required but not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Python 3.10 or later from:" -ForegroundColor Yellow
    Write-Host "  https://www.python.org/downloads/windows/" -ForegroundColor White
    Write-Host ""
    Write-Host "Or install via winget:" -ForegroundColor Yellow
    Write-Host "  winget install Python.Python.3.12" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "[OK] Using $pythonCmd" -ForegroundColor Green
Write-Host ""

# Check for Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker is required but not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Docker Desktop from:" -ForegroundColor Yellow
    Write-Host "  https://docs.docker.com/desktop/install/windows-install/" -ForegroundColor White
    Write-Host ""
    Write-Host "Or install via winget:" -ForegroundColor Yellow
    Write-Host "  winget install Docker.DockerDesktop" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Make sure we're in the project directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Run the Python startup script
& $pythonCmd setup/run.py --quick --prod --no-admin
