/// Linux platform implementation
/// All Linux-specific code lives here, making it easy to maintain and test

use super::PlatformOps;
use crate::commands::utils::{silent_command, shell_command};
use std::process::Command;

pub struct Platform;

impl PlatformOps for Platform {
    fn check_package_manager() -> bool {
        // Check for common Linux package managers
        let managers = ["apt", "yum", "dnf", "pacman"];

        for manager in managers {
            if Command::new("which")
                .arg(manager)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
            {
                return true;
            }
        }

        false
    }

    fn get_package_manager_path() -> String {
        // Detect and return the available package manager
        let managers = ["apt", "dnf", "yum", "pacman"];

        for manager in managers {
            if Command::new("which")
                .arg(manager)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
            {
                return manager.to_string();
            }
        }

        "apt".to_string() // Default fallback
    }

    async fn install_package(package: &str, _is_app: bool) -> Result<String, String> {
        let pkg_mgr = Self::get_package_manager_path();

        eprintln!("Installing {} via {}", package, pkg_mgr);

        let args = match pkg_mgr.as_str() {
            "apt" => vec!["install", "-y", package],
            "yum" | "dnf" => vec!["install", "-y", package],
            "pacman" => vec!["-S", "--noconfirm", package],
            _ => return Err(format!("Unsupported package manager: {}", pkg_mgr))
        };

        let output = Command::new("sudo")
            .arg(&pkg_mgr)
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to run {}: {}", pkg_mgr, e))?;

        if output.status.success() {
            Ok(format!("{} installed successfully via {}", package, pkg_mgr))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("{} install failed: {}", pkg_mgr, stderr))
        }
    }

    async fn install_docker() -> Result<String, String> {
        let pkg_mgr = Self::get_package_manager_path();

        // Docker package names vary by distro
        let docker_package = match pkg_mgr.as_str() {
            "apt" => "docker.io",
            "yum" | "dnf" => "docker",
            "pacman" => "docker",
            _ => return Err("Please install Docker manually for your Linux distribution".to_string())
        };

        Self::install_package(docker_package, false).await
    }

    async fn start_docker() -> Result<String, String> {
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

    async fn install_git() -> Result<String, String> {
        Self::install_package("git", false).await
    }

    async fn install_tailscale() -> Result<String, String> {
        Err("Please install Tailscale from https://tailscale.com/download/linux".to_string())
    }

    async fn install_homebrew() -> Result<String, String> {
        Err("Homebrew installation on Linux is not yet supported. Please install manually from https://brew.sh".to_string())
    }

    fn create_shell_command(cmd: &str) -> Command {
        shell_command(cmd)
    }

    fn python_executable() -> &'static str {
        "python3"
    }

    fn build_env_command(working_dir: &str, env_vars: std::collections::HashMap<String, String>, command: &str) -> String {
        // Linux: Use && for command chaining and export for env vars
        let env_string: Vec<String> = env_vars
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();

        format!(
            "cd '{}' && {} {}",
            working_dir,
            env_string.join(" "),
            command
        )
    }
}
