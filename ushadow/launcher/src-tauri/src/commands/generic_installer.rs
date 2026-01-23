use super::prerequisites_config::{PrerequisitesConfig, InstallationMethod};
use super::utils::{silent_command, shell_command};
#[cfg(target_os = "macos")]
use super::installer::{check_brew_installed, get_brew_path};
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

/// Install via Homebrew (macOS)
#[cfg(target_os = "macos")]
async fn install_via_homebrew(prereq_id: &str, method: &InstallationMethod) -> Result<String, String> {
    if !check_brew_installed() {
        return Err("Homebrew is not installed".to_string());
    }

    let package = method.package.as_ref()
        .ok_or_else(|| "No package specified for Homebrew installation".to_string())?;

    let brew_path = get_brew_path();

    // Determine if this is a cask or formula
    let is_cask = prereq_id == "docker" || prereq_id == "tailscale";

    let args = if is_cask {
        vec!["install", "--cask", package]
    } else {
        vec!["install", package]
    };

    eprintln!("Installing {} via Homebrew: {} {}", prereq_id, brew_path, args.join(" "));

    // For apps that require admin privileges (like Docker), use osascript
    if prereq_id == "docker" {
        let script = format!(
            r#"do shell script "{} install --cask {}" with administrator privileges"#,
            brew_path, package
        );

        let output = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("Failed to run osascript: {}", e))?;

        if output.status.success() {
            Ok(format!("{} installed successfully via Homebrew", prereq_id))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("User canceled") || stderr.contains("-128") {
                Err("Installation cancelled by user".to_string())
            } else {
                Err(format!("Homebrew install failed: {}", stderr))
            }
        }
    } else {
        // For other packages, run brew directly
        let output = silent_command(&brew_path)
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to run brew: {}", e))?;

        if output.status.success() {
            Ok(format!("{} installed successfully via Homebrew", prereq_id))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Homebrew install failed: {}", stderr))
        }
    }
}

#[cfg(not(target_os = "macos"))]
async fn install_via_homebrew(_prereq_id: &str, _method: &InstallationMethod) -> Result<String, String> {
    Err("Homebrew installation is only available on macOS".to_string())
}

/// Install via winget (Windows)
async fn install_via_winget(prereq_id: &str, method: &InstallationMethod) -> Result<String, String> {
    let package = method.package.as_ref()
        .ok_or_else(|| "No package specified for winget installation".to_string())?;

    eprintln!("Installing {} via winget: {}", prereq_id, package);

    let output = silent_command("winget")
        .args([
            "install",
            "--id", package,
            "-e",
            "--source", "winget",
            "--accept-package-agreements",
            "--accept-source-agreements"
        ])
        .output()
        .map_err(|e| format!("Failed to run winget: {}", e))?;

    if output.status.success() {
        Ok(format!("{} installed successfully via winget", prereq_id))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("winget install failed: {}", stderr))
    }
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

    // Save script to temp file
    let tmp_dir = std::env::temp_dir();
    let script_path = tmp_dir.join(format!("install_{}.sh", prereq_id));
    std::fs::write(&script_path, script_content)
        .map_err(|e| format!("Failed to save script: {}", e))?;

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(&script_path)
            .map_err(|e| format!("Failed to get script metadata: {}", e))?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&script_path, permissions)
            .map_err(|e| format!("Failed to set script permissions: {}", e))?;
    }

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

/// Install via package manager (apt, yum, dnf)
async fn install_via_package_manager(prereq_id: &str, method: &InstallationMethod) -> Result<String, String> {
    let packages = method.packages.as_ref()
        .ok_or_else(|| "No packages specified for package manager installation".to_string())?;

    // Detect package manager
    let (pkg_mgr, package) = if let Some(pkg) = packages.get("apt") {
        ("apt", pkg)
    } else if let Some(pkg) = packages.get("yum") {
        ("yum", pkg)
    } else if let Some(pkg) = packages.get("dnf") {
        ("dnf", pkg)
    } else {
        return Err("No supported package manager found".to_string());
    };

    eprintln!("Installing {} via {}: {}", prereq_id, pkg_mgr, package);

    let args = match pkg_mgr {
        "apt" => vec!["install", "-y", package],
        "yum" | "dnf" => vec!["install", "-y", package],
        _ => return Err(format!("Unsupported package manager: {}", pkg_mgr))
    };

    let output = Command::new("sudo")
        .arg(pkg_mgr)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run {}: {}", pkg_mgr, e))?;

    if output.status.success() {
        Ok(format!("{} installed successfully via {}", prereq_id, pkg_mgr))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("{} install failed: {}", pkg_mgr, stderr))
    }
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

/// Start Docker on macOS
async fn start_docker_macos() -> Result<String, String> {
    Command::new("open")
        .args(["-a", "Docker"])
        .output()
        .map_err(|e| format!("Failed to open Docker Desktop: {}", e))?;

    Ok("Docker Desktop starting...".to_string())
}

/// Start Docker on Windows
async fn start_docker_windows() -> Result<String, String> {
    use std::path::Path;

    let paths = vec![
        r"C:\Program Files\Docker\Docker\Docker Desktop.exe",
        r"C:\Program Files\Docker\Docker Desktop.exe",
    ];

    for path in paths {
        if Path::new(path).exists() {
            Command::new(path)
                .spawn()
                .map_err(|e| format!("Failed to start Docker Desktop: {}", e))?;

            return Ok("Docker Desktop starting...".to_string());
        }
    }

    Err("Docker Desktop.exe not found".to_string())
}

/// Start Docker on Linux
async fn start_docker_linux() -> Result<String, String> {
    // Try systemctl first
    let systemctl_output = Command::new("systemctl")
        .args(["start", "docker"])
        .output();

    if let Ok(output) = systemctl_output {
        if output.status.success() {
            return Ok("Docker service started via systemctl".to_string());
        }
    }

    // Fallback to service command
    let service_output = Command::new("service")
        .args(["docker", "start"])
        .output();

    if let Ok(output) = service_output {
        if output.status.success() {
            return Ok("Docker service started via service command".to_string());
        }
    }

    Err("Failed to start Docker service. Try: sudo systemctl start docker".to_string())
}

/// Get current platform string
fn get_current_platform() -> String {
    #[cfg(target_os = "macos")]
    return "macos".to_string();

    #[cfg(target_os = "windows")]
    return "windows".to_string();

    #[cfg(target_os = "linux")]
    return "linux".to_string();

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return "unknown".to_string();
}
