mod docker;
mod discovery;
mod prerequisites;
mod installer;
mod utils;
mod permissions;
mod settings;
pub mod worktree;
// Embedded terminal module (PTY-based) - DEPRECATED in favor of native terminal integration (iTerm2/Terminal.app/gnome-terminal)
// pub mod terminal;

pub use docker::*;
pub use discovery::*;
pub use prerequisites::*;
pub use installer::*;
pub use permissions::*;
pub use settings::*;
pub use worktree::*;
// pub use terminal::*;
