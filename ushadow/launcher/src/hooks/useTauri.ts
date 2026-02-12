import { invoke } from '@tauri-apps/api/tauri'

// Type definitions for Tauri commands - matching Rust models
export interface Prerequisites {
  homebrew_installed: boolean
  docker_installed: boolean
  docker_running: boolean
  tailscale_installed: boolean
  tailscale_connected: boolean
  git_installed: boolean
  python_installed: boolean
  uv_installed: boolean
  workmux_installed: boolean
  tmux_installed: boolean
  homebrew_version: string | null
  docker_version: string | null
  tailscale_version: string | null
  git_version: string | null
  python_version: string | null
  uv_version: string | null
  workmux_version: string | null
  tmux_version: string | null
}

export interface UshadowEnvironment {
  name: string
  color: string
  localhost_url: string | null
  tailscale_url: string | null
  backend_port: number | null
  webui_port: number | null
  running: boolean
  status: 'Running' | 'Partial' | 'Stopped' | 'Available'
  tailscale_active: boolean
  containers: string[]
  path: string | null
  branch: string | null
  is_worktree: boolean
  base_branch: string | null  // "main" or "dev" - which base branch this worktree was created from
}

// Legacy alias for backward compatibility
export type Environment = UshadowEnvironment

export interface InfraService {
  name: string
  display_name: string
  running: boolean
  ports: string | null
}

// Legacy alias
export interface ContainerStatus {
  name: string
  running: boolean
  status: string
}

export interface Discovery {
  infrastructure: InfraService[]
  environments: UshadowEnvironment[]
  docker_ok: boolean
  tailscale_ok: boolean
}

// Launcher settings
export interface CodingAgentConfig {
  agent_type: string
  command: string
  args: string[]
  auto_start: boolean
}

export interface LauncherSettings {
  default_admin_email: string | null
  default_admin_password: string | null
  default_admin_name: string | null
  coding_agent: CodingAgentConfig
}

// Prerequisites configuration types
export interface Prerequisite {
  id: string
  name: string
  display_name: string
  description: string
  platforms: string[]
  check_command?: string
  check_commands?: string[]
  check_running_command?: string
  check_connected_command?: string
  fallback_paths?: string[]  // Already platform-specific when from PlatformPrerequisitesConfig
  version_filter?: string
  optional: boolean
  has_service?: boolean
  category: string
  connection_validation?: {
    starts_with?: string
  }
}

export interface InstallationMethod {
  method: string
  package?: string
  url?: string
  packages?: Record<string, string>
}

export interface PrerequisitesConfig {
  prerequisites: Prerequisite[]
  installation_methods?: Record<string, Record<string, InstallationMethod>>
}

export interface PlatformPrerequisitesConfig {
  prerequisites: Prerequisite[]
  installation_methods?: Record<string, InstallationMethod>
}

// Tauri command wrappers with proper typing
export const tauri = {
  // System checks
  checkPrerequisites: () => invoke<Prerequisites>('check_prerequisites'),
  getOsType: () => invoke<string>('get_os_type'),

  // Prerequisites configuration
  getPrerequisitesConfig: () => invoke<PrerequisitesConfig>('get_prerequisites_config'),
  getPlatformPrerequisitesConfig: (platform: string) => invoke<PlatformPrerequisitesConfig>('get_platform_prerequisites_config', { platform }),

  // Project management
  getDefaultProjectDir: () => invoke<string>('get_default_project_dir'),
  setProjectRoot: (path: string) => invoke<void>('set_project_root', { path }),
  checkProjectDir: (path: string) => invoke<{ path: string | null; exists: boolean; is_valid_repo: boolean }>('check_project_dir', { path }),
  cloneUshadowRepo: (targetDir: string, branch?: string) => invoke<string>('clone_ushadow_repo', { targetDir, branch }),
  updateUshadowRepo: (projectDir: string) => invoke<string>('update_ushadow_repo', { projectDir }),
  getCurrentBranch: (path: string) => invoke<string>('get_current_branch', { path }),
  checkoutBranch: (path: string, branch: string) => invoke<string>('checkout_branch', { path, branch }),
  getBaseBranch: (repoPath: string, branch: string) => invoke<string | null>('get_base_branch', { repoPath, branch }),

  // Infrastructure management
  startInfrastructure: () => invoke<string>('start_infrastructure'),
  stopInfrastructure: () => invoke<string>('stop_infrastructure'),
  restartInfrastructure: () => invoke<string>('restart_infrastructure'),

  // Environment management
  discoverEnvironments: () => invoke<Discovery>('discover_environments'),
  createEnvironment: (name: string, mode?: 'dev' | 'prod') => invoke<string>('create_environment', { name, mode }),
  checkPorts: () => invoke<[boolean, boolean, number]>('check_ports'),
  startEnvironment: (envName: string, envPath?: string) => invoke<string>('start_environment', { envName, envPath }),
  stopEnvironment: (envName: string) => invoke<string>('stop_environment', { envName }),

  // Legacy (for compatibility)
  startContainers: (envName: string) => invoke<string>('start_containers', { envName }),
  stopContainers: (envName: string) => invoke<string>('stop_containers', { envName }),
  getContainerStatus: () => invoke<ContainerStatus[]>('get_container_status'),

  // Health checks
  checkBackendHealth: () => invoke<boolean>('check_backend_health'),
  checkWebuiHealth: () => invoke<boolean>('check_webui_health'),

  // Generic installer (cross-platform, YAML-driven)
  installPrerequisite: (prerequisiteId: string) => invoke<string>('install_prerequisite', { prerequisiteId }),
  startPrerequisite: (prerequisiteId: string) => invoke<string>('start_prerequisite', { prerequisiteId }),

  // Deprecated: Old platform-specific installers (kept for backward compatibility)
  // Use installPrerequisite() instead
  installHomebrew: () => invoke<string>('install_prerequisite', { prerequisiteId: 'homebrew' }),
  installDockerViaBrew: () => invoke<string>('install_prerequisite', { prerequisiteId: 'docker' }),
  installTailscaleMacos: () => invoke<string>('install_prerequisite', { prerequisiteId: 'tailscale' }),
  installGitMacos: () => invoke<string>('install_prerequisite', { prerequisiteId: 'git' }),
  startDockerDesktopMacos: () => invoke<string>('start_prerequisite', { prerequisiteId: 'docker' }),
  installDockerWindows: () => invoke<string>('install_prerequisite', { prerequisiteId: 'docker' }),
  installTailscaleWindows: () => invoke<string>('install_prerequisite', { prerequisiteId: 'tailscale' }),
  installGitWindows: () => invoke<string>('install_prerequisite', { prerequisiteId: 'git' }),
  startDockerDesktopWindows: () => invoke<string>('start_prerequisite', { prerequisiteId: 'docker' }),
  startDockerServiceLinux: () => invoke<string>('start_prerequisite', { prerequisiteId: 'docker' }),

  // Utilities
  openBrowser: (url: string) => invoke<void>('open_browser', { url }),

  // OAuth server
  startOAuthServer: () => invoke<[number, string]>('start_oauth_server'),
  waitForOAuthCallback: (port: number) => invoke<{success: boolean, code?: string, state?: string, error?: string}>('wait_for_oauth_callback', { port }),

  // HTTP client (bypasses CORS restrictions)
  httpRequest: (url: string, method: string, headers?: Record<string, string>, body?: string) =>
    invoke<{status: number, body: string, headers: Record<string, string>}>('http_request', { url, method, headers, body }),

  // Worktree management
  listWorktrees: (mainRepo: string) => invoke<WorktreeInfo[]>('list_worktrees', { mainRepo }),
  listGitBranches: (mainRepo: string) => invoke<string[]>('list_git_branches', { mainRepo }),
  checkWorktreeExists: (mainRepo: string, branch: string) => invoke<WorktreeInfo | null>('check_worktree_exists', { mainRepo, branch }),
  checkEnvironmentConflict: (mainRepo: string, envName: string) => invoke<EnvironmentConflict | null>('check_environment_conflict', { mainRepo, envName }),
  createWorktree: (mainRepo: string, worktreesDir: string, name: string, baseBranch?: string) =>
    invoke<WorktreeInfo>('create_worktree', { mainRepo, worktreesDir, name, baseBranch }),
  createWorktreeWithWorkmux: (mainRepo: string, name: string, baseBranch?: string, background?: boolean) =>
    invoke<WorktreeInfo>('create_worktree_with_workmux', { mainRepo, name, baseBranch, background }),
  mergeWorktreeWithRebase: (mainRepo: string, name: string, useRebase: boolean, keepWorktree: boolean) =>
    invoke<string>('merge_worktree_with_rebase', { mainRepo, name, useRebase, keepWorktree }),
  listTmuxSessions: () => invoke<string[]>('list_tmux_sessions'),
  getTmuxWindowStatus: (windowName: string) => invoke<string | null>('get_tmux_window_status', { windowName }),
  getEnvironmentTmuxStatus: (envName: string) => invoke<TmuxStatus>('get_environment_tmux_status', { envName }),
  getTmuxInfo: () => invoke<string>('get_tmux_info'),
  ensureTmuxRunning: () => invoke<string>('ensure_tmux_running'),
  attachTmuxToWorktree: (worktreePath: string, envName: string) => invoke<string>('attach_tmux_to_worktree', { worktreePath, envName }),
  openInVscode: (path: string, envName?: string) => invoke<void>('open_in_vscode', { path, envName }),
  openInVscodeWithTmux: (path: string, envName: string) => invoke<void>('open_in_vscode_with_tmux', { path, envName }),
  removeWorktree: (mainRepo: string, name: string) => invoke<void>('remove_worktree', { mainRepo, name }),
  deleteEnvironment: (mainRepo: string, envName: string) => invoke<string>('delete_environment', { mainRepo, envName }),

  // Tmux management
  getTmuxSessions: () => invoke<TmuxSessionInfo[]>('get_tmux_sessions'),
  killTmuxWindow: (windowName: string) => invoke<string>('kill_tmux_window', { windowName }),
  killTmuxServer: () => invoke<string>('kill_tmux_server'),
  openTmuxInTerminal: (windowName: string, worktreePath: string) => invoke<string>('open_tmux_in_terminal', { windowName, worktreePath }),
  captureTmuxPane: (windowName: string) => invoke<string>('capture_tmux_pane', { windowName }),
  getClaudeStatus: (windowName: string) => invoke<ClaudeStatus>('get_claude_status', { windowName }),

  // Settings
  loadLauncherSettings: () => invoke<LauncherSettings>('load_launcher_settings'),
  saveLauncherSettings: (settings: LauncherSettings) => invoke<void>('save_launcher_settings', { settings }),
  writeCredentialsToWorktree: (worktreePath: string, adminEmail: string, adminPassword: string, adminName?: string) =>
    invoke<void>('write_credentials_to_worktree', { worktreePath, adminEmail, adminPassword, adminName }),

  // Configuration management
  loadProjectConfig: (projectRoot: string) => invoke<LauncherConfig>('load_project_config', { projectRoot }),
  getCurrentConfig: () => invoke<LauncherConfig | null>('get_current_config'),
  checkLauncherConfigExists: (projectRoot: string) => invoke<boolean>('check_launcher_config_exists', { projectRoot }),
  validateConfigFile: (projectRoot: string) => invoke<string>('validate_config_file', { projectRoot }),

  // Environment scanning
  scanEnvFile: (projectRoot: string) => invoke<DetectedPort[]>('scan_env_file', { projectRoot }),
  scanAllEnvVars: (projectRoot: string) => invoke<DetectedEnvVar[]>('scan_all_env_vars', { projectRoot }),

  // Infrastructure discovery
  getInfraServicesFromCompose: () => invoke<InfraService[]>('get_infra_services_from_compose'),

  // Kanban ticket/epic management (local storage)
  getTickets: (projectId?: string) => invoke<Ticket[]>('get_tickets', { projectId }),
  getEpics: (projectId?: string) => invoke<Epic[]>('get_epics', { projectId }),
  createTicket: (
    title: string,
    description: string | null,
    priority: string,
    epicId: string | null,
    tags: string[],
    environmentName: string | null,
    projectId: string | null
  ) => invoke<Ticket>('create_ticket', { title, description, priority, epicId, tags, environmentName, projectId }),
  updateTicket: (
    id: string,
    title?: string,
    description?: string,
    status?: string,
    priority?: string,
    epicId?: string,
    tags?: string[],
    order?: number,
    worktreePath?: string,
    branchName?: string,
    tmuxWindowName?: string,
    tmuxSessionName?: string,
    environmentName?: string
  ) => invoke<Ticket>('update_ticket', { id, title, description, status, priority, epicId, tags, order, worktreePath, branchName, tmuxWindowName, tmuxSessionName, environmentName }),
  deleteTicket: (id: string) => invoke<void>('delete_ticket', { id }),
  createEpic: (
    title: string,
    description: string | null,
    color: string,
    baseBranch: string,
    branchName: string | null,
    projectId: string | null
  ) => invoke<Epic>('create_epic', { title, description, color, baseBranch, branchName, projectId }),
  updateEpic: (
    id: string,
    title?: string,
    description?: string,
    color?: string,
    branchName?: string
  ) => invoke<Epic>('update_epic', { id, title, description, color, branchName }),
  deleteEpic: (id: string) => invoke<void>('delete_epic', { id }),

  // Kanban ticket-worktree integration
  createTicketWorktree: (request: {
    ticketId: string
    ticketTitle: string
    projectRoot: string
    branchName?: string
    baseBranch?: string
    epicBranch?: string
  }) => invoke<{
    worktree_path: string
    branch_name: string
    tmux_window_name: string
    tmux_session_name: string
  }>('create_ticket_worktree', { request }),
  attachTicketToWorktree: (ticketId: string, worktreePath: string, branchName: string) =>
    invoke<{
      worktree_path: string
      branch_name: string
      tmux_window_name: string
      tmux_session_name: string
    }>('attach_ticket_to_worktree', { ticketId, worktreePath, branchName }),
  startCodingAgentForTicket: (
    ticketId: string,
    tmuxWindowName: string,
    tmuxSessionName: string,
    worktreePath: string
  ) => invoke<void>('start_coding_agent_for_ticket', { ticketId, tmuxWindowName, tmuxSessionName, worktreePath }),
}

// DetectedPort type (from env_scanner.rs)
export interface DetectedPort {
  name: string
  default_value: string | null
  base_port: number | null
  is_database: boolean
}

// DetectedEnvVar type (from env_scanner.rs)
export interface DetectedEnvVar {
  name: string
  default_value: string | null
  is_port: boolean
  is_database_port: boolean
  should_append_env_name: boolean
}

// ComposeServiceDefinition type (from docker-compose parsing)
export interface ComposeServiceDefinition {
  id: string              // Service name from compose (e.g., "postgres", "redis")
  display_name: string    // Human-readable name (e.g., "PostgreSQL", "Redis")
  default_port: number | null // Primary exposed port
  profiles: string[]      // Profiles this service belongs to
}

// WorktreeInfo type
export interface WorktreeInfo {
  path: string
  branch: string
  name: string
}

// Tmux status types
export type TmuxActivityStatus = 'Working' | 'Waiting' | 'Done' | 'Error' | 'Unknown'

export interface TmuxStatus {
  exists: boolean
  window_name: string | null
  current_command: string | null
  activity_status: TmuxActivityStatus
}

// Tmux session management types
export interface TmuxWindowInfo {
  name: string
  index: string
  active: boolean
  panes: number
}

export interface TmuxSessionInfo {
  name: string
  window_count: number
  windows: TmuxWindowInfo[]
}

// Claude Code status types
export interface ClaudeStatus {
  is_running: boolean
  current_task: string | null
  last_output: string | null
}

// Environment conflict types
export interface EnvironmentConflict {
  name: string
  current_branch: string
  path: string
  is_running: boolean
}

// LauncherConfig type (matches Rust struct)
export interface LauncherConfig {
  project: {
    name: string
    display_name: string
  }
  prerequisites: {
    required: string[]
    optional: string[]
  }
  setup: {
    command: string
    env_vars: string[]
  }
  infrastructure: {
    compose_file: string
    project_name: string
    profile?: string
  }
  containers: {
    naming_pattern: string
    primary_service: string
    health_endpoint: string
    tailscale_project_prefix?: string
  }
  ports: {
    allocation_strategy: string
    base_port: number
    offset: {
      min: number
      max: number
      step: number
    }
  }
  worktrees: {
    default_parent: string
    branch_prefix: string
  }
}

// Kanban types (local storage)
export type TicketStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'archived'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Epic {
  id: string
  title: string
  description?: string
  color: string
  branch_name?: string
  base_branch: string
  project_id?: string
  created_at: string
  updated_at: string
}

export interface Ticket {
  id: string
  title: string
  description?: string
  status: TicketStatus
  priority: TicketPriority
  epic_id?: string
  tags: string[]
  color?: string
  tmux_window_name?: string
  tmux_session_name?: string
  branch_name?: string
  worktree_path?: string
  environment_name?: string
  project_id?: string
  assigned_to?: string
  order: number
  created_at: string
  updated_at: string
}

export default tauri
