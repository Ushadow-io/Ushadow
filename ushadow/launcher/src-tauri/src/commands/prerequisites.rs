use crate::models::PrerequisiteStatus;
use std::env;

/// Check if we're in mock mode
fn is_mock_mode() -> bool {
    env::var("MOCK_MODE").unwrap_or_default() == "true"
}

/// Check if Docker is installed and running
/// Uses bash login shell to ensure shell profile is sourced and PATH includes docker
pub fn check_docker() -> (bool, bool, Option<String>) {
    use std::process::Command;

    // Mock mode for testing
    if is_mock_mode() {
        let installed = env::var("MOCK_DOCKER_INSTALLED").unwrap_or_default() == "true";
        let running = env::var("MOCK_DOCKER_RUNNING").unwrap_or_default() == "true";
        let version = if installed {
            Some("Docker version 24.0.0 (MOCKED)".to_string())
        } else {
            None
        };
        return (installed, running, version);
    }

    // Check docker CLI via bash login shell (ensures PATH is set up from shell profile)
    let version_output = Command::new("bash")
        .args(["-l", "-c", "docker --version"])
        .output();

    let (installed, version) = match version_output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, Some(version))
        }
        _ => (false, None),
    };

    if !installed {
        return (false, false, None);
    }

    // Check if Docker daemon is running
    let info_output = Command::new("bash")
        .args(["-l", "-c", "docker info"])
        .output();
    let running = matches!(info_output, Ok(output) if output.status.success());

    (installed, running, version)
}

/// Check if Git is installed
/// Uses bash login shell to ensure shell profile is sourced and PATH includes git
pub fn check_git() -> (bool, Option<String>) {
    use std::process::Command;

    // Mock mode for testing
    if is_mock_mode() {
        let installed = env::var("MOCK_GIT_INSTALLED").unwrap_or_default() == "true";
        let version = if installed {
            Some("git version 2.40.0 (MOCKED)".to_string())
        } else {
            None
        };
        return (installed, version);
    }

    let version_output = Command::new("bash")
        .args(["-l", "-c", "git --version"])
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
    use std::process::Command;

    // Mock mode for testing
    if is_mock_mode() {
        let installed = env::var("MOCK_TAILSCALE_INSTALLED").unwrap_or_default() == "true";
        let connected = installed; // If installed, assume connected in mock mode
        let version = if installed {
            Some("1.56.0 (MOCKED)".to_string())
        } else {
            None
        };
        return (installed, connected, version);
    }

    let version_output = Command::new("bash")
        .args(["-l", "-c", "tailscale --version"])
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

    let status_output = Command::new("bash")
        .args(["-l", "-c", "tailscale status"])
        .output();
    let connected = matches!(status_output, Ok(output) if output.status.success());

    (installed, connected, version)
}

/// Get full prerequisite status
#[tauri::command]
pub fn check_prerequisites() -> Result<PrerequisiteStatus, String> {
    let (docker_installed, docker_running, docker_version) = check_docker();
    let (tailscale_installed, tailscale_connected, tailscale_version) = check_tailscale();
    let (git_installed, git_version) = check_git();

    Ok(PrerequisiteStatus {
        docker_installed,
        docker_running,
        tailscale_installed,
        tailscale_connected,
        git_installed,
        docker_version,
        tailscale_version,
        git_version,
    })
}

/// Get OS type for platform-specific instructions
#[tauri::command]
pub fn get_os_type() -> Result<String, String> {
    // Mock mode for testing
    if is_mock_mode() {
        if let Ok(mock_platform) = env::var("MOCK_PLATFORM") {
            return Ok(mock_platform);
        }
    }

    #[cfg(target_os = "macos")]
    return Ok("macos".to_string());

    #[cfg(target_os = "windows")]
    return Ok("windows".to_string());

    #[cfg(target_os = "linux")]
    return Ok("linux".to_string());

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return Ok("unknown".to_string());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_docker_returns_tuple() {
        let (installed, running, version) = check_docker();
        // Just verify it returns without panicking
        // Actual values depend on system state
        if installed {
            assert!(version.is_some());
        }
        println!("Docker: installed={}, running={}, version={:?}", installed, running, version);
    }

    #[test]
    fn test_check_tailscale_returns_tuple() {
        let (installed, connected, version) = check_tailscale();
        if installed {
            assert!(version.is_some());
        }
        println!("Tailscale: installed={}, connected={}, version={:?}", installed, connected, version);
    }

    #[test]
    fn test_check_prerequisites_returns_status() {
        let result = check_prerequisites();
        assert!(result.is_ok());
        let status = result.unwrap();
        println!("Prerequisites: docker={}/{}, tailscale={}/{}",
            status.docker_installed, status.docker_running,
            status.tailscale_installed, status.tailscale_connected);
    }
}
