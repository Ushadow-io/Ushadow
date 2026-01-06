use serde::{Deserialize, Serialize};

/// Prerequisite check result
#[derive(Serialize, Deserialize, Clone)]
pub struct PrerequisiteStatus {
    pub docker_installed: bool,
    pub docker_running: bool,
    pub tailscale_installed: bool,
    pub tailscale_connected: bool,
    pub docker_version: Option<String>,
    pub tailscale_version: Option<String>,
    pub vscode_installed: bool,
    pub git_installed: bool,
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
#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub enum EnvironmentStatus {
    Running,    // Docker containers are up
    Partial,    // Some containers running
    Stopped,    // Containers exist but stopped
    Available,  // Worktree exists, no containers
}

/// Discovered Ushadow environment
#[derive(Serialize, Deserialize, Clone)]
pub struct UshadowEnvironment {
    pub name: String,
    pub color: String,
    pub path: Option<String>,
    pub branch: Option<String>,
    pub status: EnvironmentStatus,
    pub localhost_url: Option<String>,
    pub tailscale_url: Option<String>,
    pub backend_port: Option<u16>,
    pub webui_port: Option<u16>,
    pub tailscale_active: bool,
}

/// Worktree info from git
#[derive(Serialize, Deserialize, Clone)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub name: String,
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
