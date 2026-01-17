use crate::models::PrerequisiteStatus;
use super::utils::{silent_command, shell_command};

/// Check if Docker is installed and running
/// Tries login shell first, then falls back to known paths
pub fn check_docker() -> (bool, bool, Option<String>) {
    use std::path::Path;

    // Try login shell first (silent to avoid window flash on Windows)
    let version_output = shell_command("docker --version")
        .output();

    let (mut installed, mut version, mut docker_path) = match version_output {
        Ok(output) if output.status.success() => {
            let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, Some(ver), "docker".to_string())
        }
        _ => (false, None, String::new()),
    };

    // Fallback: check known Docker paths directly (for fresh installs)
    if !installed {
        #[cfg(target_os = "macos")]
        let known_paths = [
            "/usr/local/bin/docker",           // macOS Docker Desktop (Intel)
            "/opt/homebrew/bin/docker",        // Homebrew on Apple Silicon
            "/Applications/Docker.app/Contents/Resources/bin/docker", // Docker.app direct
        ];

        #[cfg(target_os = "windows")]
        let known_paths = [
            "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe", // Docker Desktop
            "C:\\ProgramData\\DockerDesktop\\version-bin\\docker.exe",      // Alternative location
        ];

        #[cfg(target_os = "linux")]
        let known_paths = [
            "/usr/bin/docker",         // Standard package manager install
            "/usr/local/bin/docker",   // Manual install
            "/snap/bin/docker",        // Snap install
        ];

        for path in known_paths {
            if Path::new(path).exists() {
                if let Ok(output) = silent_command(path).arg("--version").output() {
                    if output.status.success() {
                        installed = true;
                        version = Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
                        docker_path = path.to_string();
                        break;
                    }
                }
            }
        }
    }

    if !installed {
        return (false, false, None);
    }

    // Check if Docker daemon is running
    let info_output = if docker_path == "docker" {
        shell_command("docker info")
            .output()
    } else {
        silent_command(&docker_path).arg("info").output()
    };
    let running = matches!(info_output, Ok(output) if output.status.success());

    (installed, running, version)
}

/// Check if Git is installed
/// Uses bash login shell to ensure shell profile is sourced and PATH includes git
pub fn check_git() -> (bool, Option<String>) {
    let version_output = shell_command("git --version")
        .output();

    match version_output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, Some(version))
        }
        _ => (false, None),
    }
}

/// Check if Tailscale is installed and connected
/// Uses bash login shell to ensure shell profile is sourced and PATH includes tailscale
pub fn check_tailscale() -> (bool, bool, Option<String>) {
    let version_output = shell_command("tailscale --version")
        .output();

    let (installed, version) = match version_output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            (true, Some(version))
        }
        _ => (false, None),
    };

    if !installed {
        return (false, false, None);
    }

    // Check if connected by trying to get Tailscale IP
    // This is more reliable than just checking exit code
    let ip_output = shell_command("tailscale ip -4")
        .output();

    let connected = match ip_output {
        Ok(output) if output.status.success() => {
            let ip = String::from_utf8_lossy(&output.stdout).trim().to_string();
            // Valid Tailscale IPs start with 100.x.x.x
            !ip.is_empty() && ip.starts_with("100.")
        }
        _ => {
            // Fallback to status command
            let status_output = shell_command("tailscale status")
                .output();
            matches!(status_output, Ok(output) if output.status.success() && !output.stdout.is_empty())
        }
    };

    (installed, connected, version)
}

/// Check if Python 3 is installed
/// Uses bash login shell to ensure shell profile is sourced and PATH includes python
pub fn check_python() -> (bool, Option<String>) {
    // Try python3 first (recommended)
    eprintln!("DEBUG: Checking python3 with shell_command");
    let version_output = shell_command("python3 --version")
        .output();

    match version_output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            eprintln!("DEBUG: python3 found - {}", version);

            // Also check the location
            if let Ok(which_out) = shell_command("which python3").output() {
                let python_path = String::from_utf8_lossy(&which_out.stdout).trim().to_string();
                eprintln!("DEBUG: python3 path: {}", python_path);
            }

            (true, Some(version))
        }
        _ => {
            eprintln!("DEBUG: python3 not found, trying 'python' command");
            // Fallback to python (might be Python 2)
            let version_output = shell_command("python --version")
                .output();

            match version_output {
                Ok(output) if output.status.success() => {
                    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    // Only count as installed if it's Python 3
                    if version.starts_with("Python 3") {
                        (true, Some(version))
                    } else {
                        (false, None)
                    }
                }
                _ => (false, None),
            }
        }
    }
}

/// Check if uv (Python package installer) is installed
/// Uses bash login shell to ensure shell profile is sourced and PATH includes uv
pub fn check_uv() -> (bool, Option<String>) {
    let version_output = shell_command("uv --version")
        .output();

    match version_output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, Some(version))
        }
        _ => (false, None),
    }
}

/// Check if Homebrew is installed (macOS only)
/// Tries login shell first, then falls back to known paths
#[cfg(target_os = "macos")]
pub fn check_homebrew() -> (bool, Option<String>) {
    use std::path::Path;

    // Try login shell first
    let version_output = shell_command("brew --version")
        .output();

    if let Ok(output) = version_output {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            return (true, Some(version));
        }
    }

    // Try to find brew's actual location via which
    if let Ok(output) = shell_command("which brew").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && Path::new(&path).exists() {
                // Try to get version from found path
                if let Ok(ver_output) = silent_command(&path).args(["--version"]).output() {
                    if ver_output.status.success() {
                        let version = String::from_utf8_lossy(&ver_output.stdout)
                            .lines()
                            .next()
                            .unwrap_or("")
                            .trim()
                            .to_string();
                        return (true, Some(version));
                    }
                }
            }
        }
    }

    // Last resort: try known paths directly (for fresh .pkg installs where shell profile not loaded)
    let known_paths = [
        "/opt/homebrew/bin/brew",      // Apple Silicon
        "/usr/local/bin/brew",          // Intel Mac
    ];

    for path in known_paths {
        if Path::new(path).exists() {
            if let Ok(output) = silent_command(path).args(["--version"]).output() {
                if output.status.success() {
                    let version = String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    return (true, Some(version));
                }
            }
        }
    }

    (false, None)
}

/// Check if Homebrew is installed (non-macOS platforms)
#[cfg(not(target_os = "macos"))]
pub fn check_homebrew() -> (bool, Option<String>) {
    (false, None) // Homebrew not applicable on non-macOS
}

/// Check if workmux is installed
pub fn check_workmux() -> (bool, Option<String>) {
    // Mock mode for testing
    if is_mock_mode() {
        let installed = env::var("MOCK_WORKMUX_INSTALLED").unwrap_or_default() == "true";
        let version = if installed {
            Some("workmux 0.1.1 (MOCKED)".to_string())
        } else {
            None
        };
        return (installed, version);
    }

    let version_output = shell_command("workmux --version")
        .output();

    match version_output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, Some(version))
        }
        _ => (false, None),
    }
}

/// Check if tmux is installed
pub fn check_tmux() -> (bool, Option<String>) {
    // Mock mode for testing
    if is_mock_mode() {
        let installed = env::var("MOCK_TMUX_INSTALLED").unwrap_or_default() == "true";
        let version = if installed {
            Some("tmux 3.3a (MOCKED)".to_string())
        } else {
            None
        };
        return (installed, version);
    }

    let version_output = shell_command("tmux -V")
        .output();

    match version_output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, Some(version))
        }
        _ => (false, None),
    }
}

/// Get full prerequisite status
#[tauri::command]
pub fn check_prerequisites() -> Result<PrerequisiteStatus, String> {
    let (homebrew_installed, homebrew_version) = check_homebrew();
    let (docker_installed, docker_running, docker_version) = check_docker();
    let (tailscale_installed, tailscale_connected, tailscale_version) = check_tailscale();
    let (git_installed, git_version) = check_git();
    let (python_installed, python_version) = check_python();
    let (uv_installed, uv_version) = check_uv();
    let (workmux_installed, workmux_version) = check_workmux();
    let (tmux_installed, tmux_version) = check_tmux();

    Ok(PrerequisiteStatus {
        homebrew_installed,
        docker_installed,
        docker_running,
        tailscale_installed,
        tailscale_connected,
        git_installed,
        python_installed,
        uv_installed,
        workmux_installed,
        tmux_installed,
        homebrew_version,
        docker_version,
        tailscale_version,
        git_version,
        python_version,
        uv_version,
        workmux_version,
        tmux_version,
    })
}

/// Get OS type for platform-specific instructions
#[tauri::command]
pub fn get_os_type() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    return Ok("macos".to_string());

    #[cfg(target_os = "windows")]
    return Ok("windows".to_string());

    #[cfg(target_os = "linux")]
    return Ok("linux".to_string());

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return Ok("unknown".to_string());
}
