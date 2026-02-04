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
    pub uv_installed: bool,
    pub workmux_installed: bool,
    pub tmux_installed: bool,
    pub homebrew_version: Option<String>,
    pub docker_version: Option<String>,
    pub tailscale_version: Option<String>,
    pub git_version: Option<String>,
    pub python_version: Option<String>,
    pub uv_version: Option<String>,
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
    pub created_at: Option<i64>,  // Unix timestamp (seconds since epoch)
    pub base_branch: Option<String>,  // "main" or "dev" - which base branch this worktree was created from
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

/// Claude Code status from tmux
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClaudeStatus {
    pub is_running: bool,
    pub current_task: Option<String>,
    pub last_output: Option<String>,
}

/// Environment conflict info - when creating environment that already exists
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EnvironmentConflict {
    pub name: String,
    pub current_branch: String,
    pub path: String,
    pub is_running: bool,
}

/// Compose service definition from docker-compose.yml
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ComposeServiceDefinition {
    pub id: String,           // Service name from compose (e.g., "postgres", "redis")
    pub display_name: String, // Human-readable name (e.g., "PostgreSQL", "Redis")
    pub default_port: Option<u16>, // Primary exposed port
    pub profiles: Vec<String>, // Profiles this service belongs to
}

/// Kanban ticket status
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TicketStatus {
    Backlog,
    Todo,
    InProgress,
    InReview,
    Done,
    Archived,
}

/// Kanban ticket priority
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TicketPriority {
    Low,
    Medium,
    High,
    Urgent,
}

/// Epic (collection of related tickets)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Epic {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub color: String,
    pub branch_name: Option<String>,
    pub base_branch: String,
    pub project_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Kanban ticket
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Ticket {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: TicketStatus,
    pub priority: TicketPriority,
    pub epic_id: Option<String>,
    pub tags: Vec<String>,
    pub color: Option<String>,
    pub tmux_window_name: Option<String>,
    pub tmux_session_name: Option<String>,
    pub branch_name: Option<String>,
    pub worktree_path: Option<String>,
    pub environment_name: Option<String>,
    pub project_id: Option<String>,
    pub assigned_to: Option<String>,
    pub order: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Kanban data storage structure
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct KanbanData {
    pub tickets: Vec<Ticket>,
    pub epics: Vec<Epic>,
}
