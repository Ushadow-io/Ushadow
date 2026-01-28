/// Platform abstraction layer for OS-specific installation and management operations
///
/// This module provides a clean interface for platform-specific code by using:
/// - A trait that defines the common interface
/// - Separate implementation files for each platform (macos.rs, windows.rs, linux.rs)
/// - Compile-time selection of the correct implementation via cfg_attr
///
/// Benefits:
/// - Zero #[cfg] scattered in business logic
/// - Easy to test each platform independently
/// - Clear separation: see exactly what code runs on each OS
/// - Type-safe: trait ensures all platforms implement same operations

use std::collections::HashMap;

/// Platform-specific operations for package management and service control
pub trait PlatformOps {
    /// Check if the platform's package manager is installed
    fn check_package_manager() -> bool;

    /// Get the path to the package manager executable
    fn get_package_manager_path() -> String;

    /// Install a package via the platform's package manager
    async fn install_package(package: &str, is_app: bool) -> Result<String, String>;

    /// Start Docker service/application
    async fn start_docker() -> Result<String, String>;

    /// Build a command string that changes directory and runs a command with environment variables
    /// Returns the complete command string ready to be passed to shell_command()
    fn build_env_command(working_dir: &str, env_vars: HashMap<String, String>, command: &str) -> String;
}

// Use cfg_attr to select the correct platform implementation at compile time
#[cfg_attr(target_os = "macos", path = "macos.rs")]
#[cfg_attr(target_os = "windows", path = "windows.rs")]
#[cfg_attr(target_os = "linux", path = "linux.rs")]
#[cfg_attr(not(any(target_os = "macos", target_os = "windows", target_os = "linux")), path = "unsupported.rs")]
mod os;

// Re-export the platform-specific implementation as "Platform"
pub use os::Platform;

/// Get current platform name as a string
pub fn current_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    return "macos";

    #[cfg(target_os = "windows")]
    return "windows";

    #[cfg(target_os = "linux")]
    return "linux";

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return "unknown";
}
