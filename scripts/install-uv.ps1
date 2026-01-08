# Bootstrap script to install uv on Windows
# Run with: powershell -ExecutionPolicy Bypass -File scripts\install-uv.ps1

Write-Host "Checking for uv installation..." -ForegroundColor Cyan

$uvCommand = Get-Command uv -ErrorAction SilentlyContinue

if ($uvCommand) {
    Write-Host "✓ uv is already installed: " -ForegroundColor Green -NoNewline
    & uv --version
    exit 0
}

Write-Host "Installing uv..." -ForegroundColor Yellow

try {
    # Use official Windows installer
    Write-Host "Downloading uv installer..."
    Invoke-WebRequest -Uri "https://astral.sh/uv/install.ps1" -OutFile "$env:TEMP\uv-install.ps1"

    Write-Host "Running installer..."
    & powershell -ExecutionPolicy Bypass -File "$env:TEMP\uv-install.ps1"

    # Clean up
    Remove-Item "$env:TEMP\uv-install.ps1" -ErrorAction SilentlyContinue

    # Refresh environment variables for current session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    # Verify installation
    $uvCommand = Get-Command uv -ErrorAction SilentlyContinue
    if ($uvCommand) {
        Write-Host "✓ uv installed successfully: " -ForegroundColor Green -NoNewline
        & uv --version
        Write-Host ""
        Write-Host "Note: You may need to restart your terminal for PATH changes to take effect." -ForegroundColor Yellow
    } else {
        Write-Host "✗ uv installation may have failed. Please restart your terminal and try again." -ForegroundColor Red
        Write-Host "Or install manually from: https://docs.astral.sh/uv/getting-started/installation/" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "✗ Error during installation: $_" -ForegroundColor Red
    Write-Host "Please install manually from: https://docs.astral.sh/uv/getting-started/installation/" -ForegroundColor Yellow
    exit 1
}
