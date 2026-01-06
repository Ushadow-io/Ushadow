use serde::{Deserialize, Serialize};

/// Prerequisite check result
#[derive(Serialize, Deserialize, Clone)]
pub struct PrerequisiteStatus {
    pub docker_installed: bool,
    pub docker_running: bool,
    pub tailscale_installed: bool,
    pub tailscale_connected: bool,
    pub git_installed: bool,
    pub docker_version: Option<String>,
    pub tailscale_version: Option<String>,
    pub git_version: Option<String>,
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

/// Discovered Ushadow environment
#[derive(Serialize, Deserialize, Clone)]
pub struct UshadowEnvironment {
    pub name: String,
    pub color: String,
    pub localhost_url: String,
    pub tailscale_url: Option<String>,
    pub backend_port: u16,
    pub webui_port: Option<u16>,
    pub running: bool,
    pub tailscale_active: bool,
    pub containers: Vec<String>,
    pub path: Option<String>,
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
