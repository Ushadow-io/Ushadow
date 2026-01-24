use super::prerequisites_config::{PrerequisitesConfig, InstallationMethod};
use super::utils::shell_command;
use super::platform::{Platform, PlatformOps, current_platform};
use std::process::Command;

/// Generic installer that reads from YAML configuration
#[tauri::command]
pub async fn install_prerequisite(prerequisite_id: String) -> Result<String, String> {
    // Load prerequisites config
    let config = PrerequisitesConfig::load()?;

    // Get current platform
    let platform = get_current_platform();

    // Find installation method for this prerequisite on this platform
    let installation_methods = config.installation_methods
        .ok_or_else(|| format!("No installation methods defined in config"))?;

    let prereq_methods = installation_methods.get(&prerequisite_id)
        .ok_or_else(|| format!("No installation method found for '{}'", prerequisite_id))?;

    let method = prereq_methods.get(&platform)
        .ok_or_else(|| format!("No installation method for '{}' on platform '{}'", prerequisite_id, platform))?;

    // Execute the installation based on method type
    execute_installation(&prerequisite_id, method, &platform).await
}

/// Get the start command for a service prerequisite
#[tauri::command]
pub async fn start_prerequisite(prerequisite_id: String) -> Result<String, String> {
    // Load prerequisites config
    let config = PrerequisitesConfig::load()?;

    // Get the prerequisite definition
    let prereq = config.get_prerequisite(&prerequisite_id)
        .ok_or_else(|| format!("Prerequisite '{}' not found", prerequisite_id))?;

    // Check if this prerequisite has a service
    if !prereq.has_service.unwrap_or(false) {
        return Err(format!("'{}' is not a service that can be started", prerequisite_id));
    }

    // Platform-specific start logic
    let platform = get_current_platform();
    match (prerequisite_id.as_str(), platform.as_str()) {
        ("docker", "macos") => start_docker_macos().await,
        ("docker", "windows") => start_docker_windows().await,
        ("docker", "linux") => start_docker_linux().await,
        _ => Err(format!("Start not implemented for '{}' on '{}'", prerequisite_id, platform))
    }
}

/// Execute installation based on method type
async fn execute_installation(
    prereq_id: &str,
    method: &InstallationMethod,
    _platform: &str,
) -> Result<String, String> {
    match method.method.as_str() {
        "homebrew" => install_via_homebrew(prereq_id, method).await,
        "winget" => install_via_winget(prereq_id, method).await,
        "download" => install_via_download(prereq_id, method).await,
        "script" => install_via_script(prereq_id, method).await,
        "package_manager" => install_via_package_manager(prereq_id, method).await,
        "cargo" => install_via_cargo(prereq_id, method).await,
        _ => Err(format!("Unknown installation method: {}", method.method))
    }
}

/// Install via Homebrew - delegates to platform module
async fn install_via_homebrew(prereq_id: &str, method: &InstallationMethod) -> Result<String, String> {
    let package = method.package.as_ref()
        .ok_or_else(|| "No package specified for Homebrew installation".to_string())?;

    // Determine if this is a cask/app or formula
    let is_app = prereq_id == "docker" || prereq_id == "tailscale";

    Platform::install_package(package, is_app).await
}

/// Install via winget - delegates to platform module
async fn install_via_winget(_prereq_id: &str, method: &InstallationMethod) -> Result<String, String> {
    let package = method.package.as_ref()
        .ok_or_else(|| "No package specified for winget installation".to_string())?;

    Platform::install_package(package, false).await
}

/// Install via download (opens URL for manual download)
async fn install_via_download(prereq_id: &str, method: &InstallationMethod) -> Result<String, String> {
    let url = method.url.as_ref()
        .ok_or_else(|| "No URL specified for download installation".to_string())?;

    eprintln!("Opening download URL for {}: {}", prereq_id, url);

    // Special handling for Homebrew - download and open .pkg
    if prereq_id == "homebrew" {
        let pkg_url = "https://github.com/Homebrew/brew/releases/download/5.0.9/Homebrew-5.0.9.pkg";
        let tmp_dir = std::env::temp_dir();
        let pkg_path = tmp_dir.join("Homebrew-5.0.9.pkg");

        // Download the pkg file
        let response = reqwest::get(pkg_url)
            .await
            .map_err(|e| format!("Failed to download installer: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to download installer: HTTP {}", response.status()));
        }

        let bytes = response.bytes()
            .await
            .map_err(|e| format!("Failed to read installer data: {}", e))?;

        std::fs::write(&pkg_path, bytes)
            .map_err(|e| format!("Failed to save installer: {}", e))?;

        // Open the .pkg file
        Command::new("open")
            .arg(&pkg_path)
            .output()
            .map_err(|e| format!("Failed to open installer: {}", e))?;

        return Ok("Installer opened. Please follow the prompts to complete installation.".to_string());
    }

    // For other downloads, just open the URL in browser
    open::that(url)
        .map_err(|e| format!("Failed to open URL: {}", e))?;

    Ok(format!("Opening download page for {}. Please follow the installation instructions.", prereq_id))
}

/// Install via script (download and execute installation script)
async fn install_via_script(prereq_id: &str, method: &InstallationMethod) -> Result<String, String> {
    let url = method.url.as_ref()
        .ok_or_else(|| "No URL specified for script installation".to_string())?;

    eprintln!("Installing {} via script: {}", prereq_id, url);

    // Download script
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to download installation script: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to download script: HTTP {}", response.status()));
    }

    let script_content = response.text()
        .await
        .map_err(|e| format!("Failed to read script: {}", e))?;

    // Platform-specific script handling
    #[cfg(target_os = "windows")]
    {
        // Save as PowerShell script
        let tmp_dir = std::env::temp_dir();
        let script_path = tmp_dir.join(format!("install_{}.ps1", prereq_id));
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to save script: {}", e))?;

        // Execute with PowerShell (shell_command already wraps in powershell -NoProfile -Command)
        let cmd = format!("& \"{}\"", script_path.display());
        let output = shell_command(&cmd)
            .output()
            .map_err(|e| format!("Failed to execute script: {}", e))?;

        if output.status.success() {
            Ok(format!("{} installed successfully via script", prereq_id))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            Err(format!("Script installation failed:\nstderr: {}\nstdout: {}", stderr, stdout))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Save as shell script
        let tmp_dir = std::env::temp_dir();
        let script_path = tmp_dir.join(format!("install_{}.sh", prereq_id));
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to save script: {}", e))?;

        // Make executable
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(&script_path)
            .map_err(|e| format!("Failed to get script metadata: {}", e))?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&script_path, permissions)
            .map_err(|e| format!("Failed to set script permissions: {}", e))?;

        // Execute script
        let output = shell_command(&format!("bash {}", script_path.display()))
            .output()
            .map_err(|e| format!("Failed to execute script: {}", e))?;

        if output.status.success() {
            Ok(format!("{} installed successfully via script", prereq_id))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Script installation failed: {}", stderr))
        }
    }
}

/// Install via package manager (apt, yum, dnf) - delegates to platform module for Linux
async fn install_via_package_manager(_prereq_id: &str, method: &InstallationMethod) -> Result<String, String> {
    let packages = method.packages.as_ref()
        .ok_or_else(|| "No packages specified for package manager installation".to_string())?;

    // Get the platform's package manager
    let pkg_mgr = Platform::get_package_manager_path();

    // Find the package for this package manager
    let package = packages.get(&pkg_mgr)
        .or_else(|| packages.get("apt"))  // Fallback to apt
        .or_else(|| packages.values().next())  // Or any available package
        .ok_or_else(|| "No compatible package found for this system".to_string())?;

    Platform::install_package(package, false).await
}

/// Install via cargo
async fn install_via_cargo(prereq_id: &str, method: &InstallationMethod) -> Result<String, String> {
    let package = method.package.as_ref()
        .ok_or_else(|| "No package specified for cargo installation".to_string())?;

    eprintln!("Installing {} via cargo: {}", prereq_id, package);

    let output = shell_command(&format!("cargo install {}", package))
        .output()
        .map_err(|e| format!("Failed to run cargo: {}", e))?;

    if output.status.success() {
        Ok(format!("{} installed successfully via cargo", prereq_id))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("cargo install failed: {}", stderr))
    }
}

/// Start Docker - delegates to platform module
async fn start_docker_macos() -> Result<String, String> {
    Platform::start_docker().await
}

/// Start Docker - delegates to platform module
async fn start_docker_windows() -> Result<String, String> {
    Platform::start_docker().await
}

/// Start Docker - delegates to platform module
async fn start_docker_linux() -> Result<String, String> {
    Platform::start_docker().await
}

/// Get current platform string (delegates to platform module)
fn get_current_platform() -> String {
    current_platform().to_string()
}
