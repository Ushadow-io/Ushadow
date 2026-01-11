# Bootstrap script to install uv on Windows
# Run with: powershell -ExecutionPolicy Bypass -File scripts\install-uv.ps1

Write-Host "Checking for uv installation..." -ForegroundColor Cyan

$uvCommand = Get-Command uv -ErrorAction SilentlyContinue

if ($uvCommand) {
    Write-Host "[OK] uv is already installed: " -ForegroundColor Green -NoNewline
    & uv --version
    exit 0
}

Write-Host "Installing uv..." -ForegroundColor Yellow

try {
    # Use official one-liner installer
    Write-Host "Running: irm https://astral.sh/uv/install.ps1 | iex"
    Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression

    # Refresh environment variables for current session
    Write-Host "Refreshing PATH..."
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")

    # Combine paths safely, handling nulls
    if ($machinePath -and $userPath) {
        $env:Path = $machinePath + ";" + $userPath
    } elseif ($machinePath) {
        $env:Path = $machinePath
    } elseif ($userPath) {
        $env:Path = $userPath
    }

    # Verify installation
    Write-Host "Verifying installation..."
    $uvCommand = Get-Command uv -ErrorAction SilentlyContinue
    if ($uvCommand) {
        Write-Host "[OK] uv installed successfully: " -ForegroundColor Green -NoNewline
        & uv --version
        Write-Host ""
        Write-Host "Note: You may need to restart your terminal for PATH changes to take effect." -ForegroundColor Yellow
    } else {
        Write-Host "[ERROR] uv installation may have failed. Please restart your terminal and try again." -ForegroundColor Red
        Write-Host "Or install manually from: https://docs.astral.sh/uv/getting-started/installation/" -ForegroundColor Yellow
        exit 1
    }
}
catch {
    Write-Host "[ERROR] Error during installation: $_" -ForegroundColor Red
    Write-Host "Please install manually from: https://docs.astral.sh/uv/getting-started/installation/" -ForegroundColor Yellow
    exit 1
}
