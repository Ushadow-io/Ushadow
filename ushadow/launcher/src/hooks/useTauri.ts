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
  homebrew_version: string | null
  docker_version: string | null
  tailscale_version: string | null
  git_version: string | null
  python_version: string | null
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

// Tauri command wrappers with proper typing
export const tauri = {
  // System checks
  checkPrerequisites: () => invoke<Prerequisites>('check_prerequisites'),
  getOsType: () => invoke<string>('get_os_type'),
  checkBrew: () => invoke<boolean>('check_brew'),

  // Project management
  getDefaultProjectDir: () => invoke<string>('get_default_project_dir'),
  setProjectRoot: (path: string) => invoke<void>('set_project_root', { path }),
  checkProjectDir: (path: string) => invoke<{ path: string | null; exists: boolean; is_valid_repo: boolean }>('check_project_dir', { path }),
  cloneUshadowRepo: (targetDir: string) => invoke<string>('clone_ushadow_repo', { targetDir }),
  updateUshadowRepo: (projectDir: string) => invoke<string>('update_ushadow_repo', { projectDir }),

  // Infrastructure management
  startInfrastructure: () => invoke<string>('start_infrastructure'),
  stopInfrastructure: () => invoke<string>('stop_infrastructure'),
  restartInfrastructure: () => invoke<string>('restart_infrastructure'),

  // Environment management
  discoverEnvironments: () => invoke<Discovery>('discover_environments'),
  createEnvironment: (name: string, mode?: 'dev' | 'prod') => invoke<string>('create_environment', { name, mode }),
  checkPorts: () => invoke<[boolean, boolean, number]>('check_ports'),
  startEnvironment: (envName: string) => invoke<string>('start_environment', { envName }),
  stopEnvironment: (envName: string) => invoke<string>('stop_environment', { envName }),

  // Legacy (for compatibility)
  startContainers: (envName: string) => invoke<string>('start_containers', { envName }),
  stopContainers: (envName: string) => invoke<string>('stop_containers', { envName }),
  getContainerStatus: () => invoke<ContainerStatus[]>('get_container_status'),

  // Health checks
  checkBackendHealth: () => invoke<boolean>('check_backend_health'),
  checkWebuiHealth: () => invoke<boolean>('check_webui_health'),

  // Installers - macOS
  installHomebrew: () => invoke<string>('install_homebrew'),
  installDockerViaBrew: () => invoke<string>('install_docker_via_brew'),
  installTailscaleMacos: () => invoke<string>('install_tailscale_macos'),
  installGitMacos: () => invoke<string>('install_git_macos'),
  startDockerDesktopMacos: () => invoke<string>('start_docker_desktop_macos'),

  // Installers - Windows
  installDockerWindows: () => invoke<string>('install_docker_windows'),
  installTailscaleWindows: () => invoke<string>('install_tailscale_windows'),
  installGitWindows: () => invoke<string>('install_git_windows'),
  startDockerDesktopWindows: () => invoke<string>('start_docker_desktop_windows'),

  // Installers - Linux
  startDockerServiceLinux: () => invoke<string>('start_docker_service_linux'),

  // Utilities
  openBrowser: (url: string) => invoke<void>('open_browser', { url }),

  // Worktree management
  listWorktrees: (mainRepo: string) => invoke<WorktreeInfo[]>('list_worktrees', { mainRepo }),
  createWorktree: (mainRepo: string, worktreesDir: string, name: string, baseBranch?: string) =>
    invoke<WorktreeInfo>('create_worktree', { mainRepo, worktreesDir, name, baseBranch }),
  openInVscode: (path: string) => invoke<void>('open_in_vscode', { path }),
  removeWorktree: (mainRepo: string, name: string) => invoke<void>('remove_worktree', { mainRepo, name }),
}

// WorktreeInfo type
export interface WorktreeInfo {
  path: string
  branch: string
  name: string
}

export default tauri
