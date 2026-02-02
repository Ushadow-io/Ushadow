/// Unsupported platform stub
/// Provides default implementations that return errors for unsupported platforms

use super::PlatformOps;
use std::process::Command;

pub struct Platform;

impl PlatformOps for Platform {
    fn check_package_manager() -> bool {
        false
    }

    fn get_package_manager_path() -> String {
        String::new()
    }

    async fn install_package(_package: &str, _is_app: bool) -> Result<String, String> {
        Err("Package installation is not supported on this platform".to_string())
    }

    async fn install_docker() -> Result<String, String> {
        Err("Docker installation is not supported on this platform".to_string())
    }

    async fn start_docker() -> Result<String, String> {
        Err("Docker start is not supported on this platform".to_string())
    }

    async fn install_git() -> Result<String, String> {
        Err("Git installation is not supported on this platform".to_string())
    }

    async fn install_tailscale() -> Result<String, String> {
        Err("Tailscale installation is not supported on this platform".to_string())
    }

    async fn install_homebrew() -> Result<String, String> {
        Err("Homebrew is not supported on this platform".to_string())
    }

    fn create_shell_command(_cmd: &str) -> Command {
        Command::new("echo")
    }

    fn python_executable() -> &'static str {
        "python"
    }

    fn build_env_command(working_dir: &str, env_vars: std::collections::HashMap<String, String>, command: &str) -> String {
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
