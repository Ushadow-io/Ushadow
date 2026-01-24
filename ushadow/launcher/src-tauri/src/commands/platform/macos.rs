/// macOS platform implementation
/// All macOS-specific code lives here, making it easy to maintain and test

use super::PlatformOps;
use crate::commands::utils::{silent_command, shell_command, quote_path};
use std::process::Command;

pub struct Platform;

impl PlatformOps for Platform {
    fn check_package_manager() -> bool {
        // Check if Homebrew is installed
        if shell_command("brew --version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return true;
        }

        // Fallback: try to find brew's actual location via which
        if let Ok(output) = shell_command("which brew").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() && std::path::Path::new(&path).exists() {
                    // Verify it's executable
                    if silent_command(&path)
                        .args(["--version"])
                        .output()
                        .map(|o| o.status.success())
                        .unwrap_or(false)
                    {
                        return true;
                    }
                }
            }
        }

        // Last resort: try known paths directly
        let known_paths = [
            "/opt/homebrew/bin/brew",  // Apple Silicon
            "/usr/local/bin/brew",     // Intel Mac
        ];

        for path in known_paths {
            if std::path::Path::new(path).exists() {
                if silent_command(path)
                    .args(["--version"])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
                {
                    return true;
                }
            }
        }

        false
    }

    fn get_package_manager_path() -> String {
        // First check if brew is in PATH
        if shell_command("brew --version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return "brew".to_string();
        }

        // Try to find brew's actual location via which
        if let Ok(output) = shell_command("which brew").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() && std::path::Path::new(&path).exists() {
                    if silent_command(&path)
                        .args(["--version"])
                        .output()
                        .map(|o| o.status.success())
                        .unwrap_or(false)
                    {
                        return path;
                    }
                }
            }
        }

        // Fall back to known paths
        let known_paths = [
            "/opt/homebrew/bin/brew",  // Apple Silicon
            "/usr/local/bin/brew",     // Intel Mac
        ];

        for path in known_paths {
            if std::path::Path::new(path).exists() {
                if silent_command(path)
                    .args(["--version"])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
                {
                    return path.to_string();
                }
            }
        }

        "brew".to_string()
    }

    async fn install_package(package: &str, is_app: bool) -> Result<String, String> {
        if !Self::check_package_manager() {
            return Err("Homebrew is not installed".to_string());
        }

        let brew_path = Self::get_package_manager_path();

        let args = if is_app {
            vec!["install", "--cask", package]
        } else {
            vec!["install", package]
        };

        eprintln!("Installing {} via Homebrew: {} {}", package, brew_path, args.join(" "));

        // For apps that require admin privileges, use osascript
        if is_app {
            let script = format!(
                r#"do shell script "{} install --cask {}" with administrator privileges"#,
                brew_path, package
            );

            let output = Command::new("osascript")
                .args(["-e", &script])
                .output()
                .map_err(|e| format!("Failed to run osascript: {}", e))?;

            if output.status.success() {
                Ok(format!("{} installed successfully via Homebrew", package))
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
                Ok(format!("{} installed successfully via Homebrew", package))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("Homebrew install failed: {}", stderr))
            }
        }
    }

    async fn start_docker() -> Result<String, String> {
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

    fn build_env_command(working_dir: &str, env_vars: std::collections::HashMap<String, String>, command: &str) -> String {
        // Unix/macOS: Use && for command chaining and export for env vars
        let env_string: Vec<String> = env_vars
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();

        // Quote the working directory to handle spaces and special chars
        let working_dir_quoted = quote_path(working_dir);

        format!(
            "cd {} && {} {}",
            working_dir_quoted,
            env_string.join(" "),
            command
        )
    }
}
