mod docker;
mod discovery;
mod discovery_v2;
mod prerequisites;
mod prerequisites_config;
mod repository;  // Repository and Git operations
mod generic_installer;  // YAML-driven installation
mod utils;
mod permissions;
mod settings;
mod bundled;  // Bundled resources locator
pub mod worktree;
pub mod platform;  // Platform abstraction layer
// Embedded terminal module (PTY-based) - DEPRECATED in favor of native terminal integration (iTerm2/Terminal.app/gnome-terminal)
// pub mod terminal;
mod config_commands;
mod container_discovery;
mod port_utils;

pub use docker::*;
pub use discovery::*;
pub use discovery_v2::*;
pub use prerequisites::*;
pub use prerequisites_config::*;
pub use repository::*;  // Export repository management functions
pub use generic_installer::*;  // Export generic installer functions
pub use permissions::*;
pub use settings::*;
pub use worktree::*;
// pub use terminal::*;
pub use config_commands::*;
pub use container_discovery::*;
pub use port_utils::*;
