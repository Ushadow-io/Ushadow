/// Windows platform implementation
/// All Windows-specific code lives here, making it easy to maintain and test

use super::PlatformOps;
use crate::commands::utils::{silent_command, shell_command};
use std::process::Command;

pub struct Platform;

impl PlatformOps for Platform {
    fn check_package_manager() -> bool {
        // Check if winget is available
        silent_command("winget")
            .args(["--version"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn get_package_manager_path() -> String {
        "winget".to_string()
    }

    async fn install_package(package: &str, _is_app: bool) -> Result<String, String> {
        eprintln!("Installing {} via winget", package);

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
            Ok(format!("{} installed successfully via winget", package))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("winget install failed: {}", stderr))
        }
    }

    async fn install_docker() -> Result<String, String> {
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

    async fn start_docker() -> Result<String, String> {
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

        Err("Docker Desktop.exe not found in expected locations".to_string())
    }

    async fn install_git() -> Result<String, String> {
        let output = silent_command("winget")
            .args([
                "install",
                "--id", "Git.Git",
                "-e",
                "--source", "winget",
                "--accept-package-agreements",
                "--accept-source-agreements"
            ])
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                return Ok("Git installed successfully via winget".to_string());
            }
        }

        Err("Please install Git from https://git-scm.com/download/win".to_string())
    }

    async fn install_tailscale() -> Result<String, String> {
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

    async fn install_homebrew() -> Result<String, String> {
        Err("Homebrew is only available on macOS and Linux".to_string())
    }

    fn create_shell_command(cmd: &str) -> Command {
        shell_command(cmd)
    }

    fn python_executable() -> &'static str {
        "python"
    }

    fn build_env_command(working_dir: &str, env_vars: std::collections::HashMap<String, String>, command: &str) -> String {
        // Windows PowerShell: Use ; for command chaining and $env: for env vars
        let env_string: Vec<String> = env_vars
            .iter()
            .map(|(k, v)| format!("$env:{}='{}'", k, v))
            .collect();

        format!(
            "cd '{}'; {}; {}",
            working_dir,
            env_string.join("; "),
            command
        )
    }
}
