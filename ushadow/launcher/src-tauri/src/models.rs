use serde::{Deserialize, Serialize};

/// Prerequisite check result
#[derive(Serialize, Deserialize, Clone)]
pub struct PrerequisiteStatus {
    pub homebrew_installed: bool,
    pub docker_installed: bool,
    pub docker_running: bool,
    pub tailscale_installed: bool,
    pub tailscale_connected: bool,
    pub git_installed: bool,
    pub python_installed: bool,
    pub workmux_installed: bool,
    pub tmux_installed: bool,
    pub homebrew_version: Option<String>,
    pub docker_version: Option<String>,
    pub tailscale_version: Option<String>,
    pub git_version: Option<String>,
    pub python_version: Option<String>,
    pub workmux_version: Option<String>,
    pub tmux_version: Option<String>,
}

/// Project location status
#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectStatus {
    pub path: Option<String>,
    pub exists: bool,
    pub is_valid_repo: bool,
}

/// Container status
#[derive(Serialize, Deserialize, Clone)]
pub struct ContainerStatus {
    pub running: bool,
    pub backend_healthy: bool,
    pub frontend_healthy: bool,
    pub services: Vec<ServiceInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ServiceInfo {
    pub name: String,
    pub status: String,
    pub ports: Option<String>,
}

/// Environment status
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum EnvironmentStatus {
    Running,
    Partial,
    Stopped,
    Available,
}

/// Git worktree information
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub name: String,
}

/// Discovered Ushadow environment
#[derive(Serialize, Deserialize, Clone)]
pub struct UshadowEnvironment {
    pub name: String,
    pub color: String,
    pub path: Option<String>,
    pub branch: Option<String>,
    pub status: EnvironmentStatus,
    pub running: bool,  // For React frontend compatibility
    pub localhost_url: Option<String>,
    pub tailscale_url: Option<String>,
    pub backend_port: Option<u16>,
    pub webui_port: Option<u16>,
    pub tailscale_active: bool,
    pub containers: Vec<String>,
    pub is_worktree: bool,  // True if this environment is a git worktree
}

/// Infrastructure service status
#[derive(Serialize, Deserialize, Clone)]
pub struct InfraService {
    pub name: String,
    pub display_name: String,
    pub running: bool,
    pub ports: Option<String>,
}

/// Environment discovery result
#[derive(Serialize, Deserialize, Clone)]
pub struct DiscoveryResult {
    pub infrastructure: Vec<InfraService>,
    pub environments: Vec<UshadowEnvironment>,
    pub docker_ok: bool,
    pub tailscale_ok: bool,
}

/// Tmux session status for an environment
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TmuxStatus {
    pub exists: bool,
    pub window_name: Option<String>,
    pub current_command: Option<String>,
    pub activity_status: TmuxActivityStatus,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum TmuxActivityStatus {
    Working,   // 🤖 - actively running commands
    Waiting,   // 💬 - shell prompt, waiting for input
    Done,      // ✅ - command completed successfully
    Error,     // ❌ - command failed
    Unknown,   // No status available
}

/// Tmux session information for management UI
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TmuxSessionInfo {
    pub name: String,
    pub window_count: usize,
    pub windows: Vec<TmuxWindowInfo>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TmuxWindowInfo {
    pub name: String,
    pub index: String,
    pub active: bool,
    pub panes: usize,
}
