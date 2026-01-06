use super::utils::silent_command;
use std::process::Command;

/// Check if Homebrew is installed (macOS)
#[cfg(target_os = "macos")]
pub fn check_brew_installed() -> bool {
    silent_command("brew").args(["--version"]).output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

/// Install Homebrew (macOS)
/// Opens Terminal to run the official Homebrew installer script
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn install_homebrew() -> Result<String, String> {
    if check_brew_installed() {
        return Ok("Homebrew is already installed".to_string());
    }

    // The official Homebrew installation command
    // We'll open Terminal and run the installer there so user can see progress and enter password
    let install_script = r#"
        tell application "Terminal"
            activate
            do script "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        end tell
    "#;

    let output = Command::new("osascript")
        .args(["-e", install_script])
        .output()
        .map_err(|e| format!("Failed to open Terminal: {}", e))?;

    if output.status.success() {
        Ok("Homebrew installer opened in Terminal. Please follow the prompts to complete installation.".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to start Homebrew installation: {}", stderr))
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn install_homebrew() -> Result<String, String> {
    Err("Homebrew installation is only available on macOS".to_string())
}

/// Check if Homebrew is installed (exported for frontend)
#[tauri::command]
pub fn check_brew() -> bool {
    #[cfg(target_os = "macos")]
    {
        check_brew_installed()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// Install Docker via Homebrew (macOS)
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn install_docker_via_brew() -> Result<String, String> {
    if !check_brew_installed() {
        return Err("Homebrew is not installed. Please install from https://brew.sh".to_string());
    }

    // Use osascript to run brew with administrator privileges
    // This will show the native macOS password dialog
    let script = r#"do shell script "brew install --cask docker" with administrator privileges"#;

    let output = Command::new("osascript")
        .args(["-e", script])
        .output()
        .map_err(|e| format!("Failed to run osascript: {}", e))?;

    if output.status.success() {
        Ok("Docker Desktop installed successfully via Homebrew".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Check if user cancelled the password dialog
        if stderr.contains("User canceled") || stderr.contains("-128") {
            Err("Installation cancelled by user".to_string())
        } else {
            Err(format!("Brew install failed: {}", stderr))
        }
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn install_docker_via_brew() -> Result<String, String> {
    Err("Homebrew installation is only available on macOS".to_string())
}

/// Start Docker Desktop (macOS)
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn start_docker_desktop_macos() -> Result<String, String> {
    let output = Command::new("open")
        .args(["-a", "Docker"])
        .output()
        .map_err(|e| format!("Failed to open Docker Desktop: {}", e))?;

    if output.status.success() {
        Ok("Docker Desktop starting...".to_string())
    } else {
        Err("Failed to start Docker Desktop".to_string())
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn start_docker_desktop_macos() -> Result<String, String> {
    Err("macOS Docker Desktop start is only available on macOS".to_string())
}

/// Start Docker Desktop (Windows)
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn start_docker_desktop_windows() -> Result<String, String> {
    use std::path::Path;

    // Try common Docker Desktop installation paths
    let paths = vec![
        r"C:\Program Files\Docker\Docker\Docker Desktop.exe",
        r"C:\Program Files\Docker\Docker Desktop.exe",
    ];

    for path in paths {
        if Path::new(path).exists() {
            let output = Command::new(path)
                .spawn()
                .map_err(|e| format!("Failed to start Docker Desktop: {}", e))?;

            return Ok("Docker Desktop starting...".to_string());
        }
    }

    Err("Docker Desktop.exe not found in expected locations".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn start_docker_desktop_windows() -> Result<String, String> {
    Err("Windows Docker Desktop start is only available on Windows".to_string())
}

/// Install Docker Desktop via winget (Windows)
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn install_docker_windows() -> Result<String, String> {
    // Try winget first (Windows 10/11)
    let output = silent_command("winget")
        .args([
            "install",
            "--id", "Docker.DockerDesktop",
            "-e",
            "--source", "winget",
            "--accept-package-agreements",
            "--accept-source-agreements"
        ])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            return Ok("Docker Desktop installed successfully via winget. Please restart your computer to complete the installation.".to_string());
        }
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("winget install failed: {}", stderr));
    }

    Err("winget not available. Please install Docker Desktop manually from https://docker.com/products/docker-desktop".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn install_docker_windows() -> Result<String, String> {
    Err("Windows Docker installation is only available on Windows".to_string())
}

/// Install Tailscale via winget (Windows)
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn install_tailscale_windows() -> Result<String, String> {
    let output = silent_command("winget")
        .args([
            "install",
            "--id", "Tailscale.Tailscale",
            "-e",
            "--source", "winget",
            "--accept-package-agreements",
            "--accept-source-agreements"
        ])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            return Ok("Tailscale installed successfully via winget".to_string());
        }
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("winget install failed: {}", stderr));
    }

    Err("winget not available. Please install Tailscale manually.".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn install_tailscale_windows() -> Result<String, String> {
    Err("Windows Tailscale installation is only available on Windows".to_string())
}

/// Install Tailscale via Homebrew (macOS)
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn install_tailscale_macos() -> Result<String, String> {
    if !check_brew_installed() {
        return Err("Homebrew is not installed. Please install from https://brew.sh".to_string());
    }

    let output = silent_command("brew")
        .args(["install", "--cask", "tailscale"])
        .output()
        .map_err(|e| format!("Failed to run brew: {}", e))?;

    if output.status.success() {
        Ok("Tailscale installed successfully via Homebrew".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Brew install tailscale failed: {}", stderr))
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn install_tailscale_macos() -> Result<String, String> {
    Err("macOS Tailscale installation is only available on macOS".to_string())
}

/// Start Docker service (Linux)
#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn start_docker_service_linux() -> Result<String, String> {
    // Try systemctl first (most common)
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

#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub async fn start_docker_service_linux() -> Result<String, String> {
    Err("Linux Docker service start is only available on Linux".to_string())
}

// ============================================
// Project/Repository Management
// ============================================

use crate::models::ProjectStatus;
use std::path::Path;
use std::fs;

const USHADOW_REPO_URL: &str = "https://github.com/Ushadow-io/ushadow.git";

/// Get default project directory based on platform
#[tauri::command]
pub fn get_default_project_dir() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // Windows: Use user's home directory
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            return Ok(format!("{}\\Ushadow", userprofile));
        }
        Ok("C:\\Ushadow".to_string())
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return Ok(format!("{}/Ushadow", home));
        }
        Ok("/Users/Shared/Ushadow".to_string())
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return Ok(format!("{}/Ushadow", home));
        }
        Ok("/opt/Ushadow".to_string())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok("./Ushadow".to_string())
    }
}

/// Check if a directory contains a valid Ushadow project
#[tauri::command]
pub fn check_project_dir(path: String) -> Result<ProjectStatus, String> {
    let project_path = Path::new(&path);

    if !project_path.exists() {
        return Ok(ProjectStatus {
            path: Some(path),
            exists: false,
            is_valid_repo: false,
        });
    }

    // Check for key files that indicate a valid Ushadow repo
    let go_sh = project_path.join("go.sh");
    let compose_dir = project_path.join("compose");
    let git_dir = project_path.join(".git");

    let is_valid = go_sh.exists() && compose_dir.exists() && git_dir.exists();

    Ok(ProjectStatus {
        path: Some(path),
        exists: true,
        is_valid_repo: is_valid,
    })
}

/// Clone the Ushadow repository
#[tauri::command]
pub async fn clone_ushadow_repo(target_dir: String) -> Result<String, String> {
    let target_path = Path::new(&target_dir);

    // Create parent directory if it doesn't exist
    if let Some(parent) = target_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    // Clone the repository
    let output = silent_command("git")
        .args(["clone", "--depth", "1", USHADOW_REPO_URL, &target_dir])
        .output()
        .map_err(|e| format!("Failed to run git clone: {}", e))?;

    if output.status.success() {
        Ok(format!("Successfully cloned Ushadow to {}", target_dir))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Git clone failed: {}", stderr))
    }
}

/// Update an existing Ushadow repository safely (stash, pull, stash pop)
#[tauri::command]
pub async fn update_ushadow_repo(project_dir: String) -> Result<String, String> {
    // Step 1: Stash any local changes
    let stash_output = silent_command("git")
        .args(["stash", "push", "-m", "ushadow-launcher-auto-stash"])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to run git stash: {}", e))?;

    let had_changes = if stash_output.status.success() {
        let stdout = String::from_utf8_lossy(&stash_output.stdout);
        // Check if anything was actually stashed
        !stdout.contains("No local changes to save")
    } else {
        false
    };

    // Step 2: Pull latest changes
    let pull_output = silent_command("git")
        .args(["pull", "--rebase=false"])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to run git pull: {}", e))?;

    if !pull_output.status.success() {
        let stderr = String::from_utf8_lossy(&pull_output.stderr);
        // Try to restore stashed changes even if pull failed
        if had_changes {
            let _ = silent_command("git")
                .args(["stash", "pop"])
                .current_dir(&project_dir)
                .output();
        }
        return Err(format!("Git pull failed: {}", stderr));
    }

    let pull_result = String::from_utf8_lossy(&pull_output.stdout).trim().to_string();

    // Step 3: Pop stashed changes if we had any
    if had_changes {
        let pop_output = silent_command("git")
            .args(["stash", "pop"])
            .current_dir(&project_dir)
            .output()
            .map_err(|e| format!("Failed to run git stash pop: {}", e))?;

        if !pop_output.status.success() {
            let stderr = String::from_utf8_lossy(&pop_output.stderr);
            return Err(format!(
                "Update pulled but failed to restore local changes: {}. Your changes are in git stash.",
                stderr
            ));
        }

        Ok(format!("Updated and restored local changes. {}", pull_result))
    } else {
        Ok(format!("Updated: {}", pull_result))
    }
}

/// Install Git via winget (Windows)
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn install_git_windows() -> Result<String, String> {
    // Try winget first (Windows 10/11)
    let output = silent_command("winget")
        .args(["install", "--id", "Git.Git", "-e", "--source", "winget", "--accept-package-agreements", "--accept-source-agreements"])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            return Ok("Git installed successfully via winget".to_string());
        }
    }

    Err("Please install Git from https://git-scm.com/download/win".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn install_git_windows() -> Result<String, String> {
    Err("Windows Git installation is only available on Windows".to_string())
}

/// Install Git via Homebrew (macOS)
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn install_git_macos() -> Result<String, String> {
    if !check_brew_installed() {
        return Err("Homebrew is not installed. Git may already be installed via Xcode CLI tools.".to_string());
    }

    let output = silent_command("brew")
        .args(["install", "git"])
        .output()
        .map_err(|e| format!("Failed to run brew: {}", e))?;

    if output.status.success() {
        Ok("Git installed successfully via Homebrew".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Brew install git failed: {}", stderr))
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn install_git_macos() -> Result<String, String> {
    Err("macOS Git installation is only available on macOS".to_string())
}
