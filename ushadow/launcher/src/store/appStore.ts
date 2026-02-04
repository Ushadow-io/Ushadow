import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppMode = 'install' | 'infra' | 'environments' | 'kanban'

export interface SpoofedPrerequisites {
  git_installed: boolean | null  // null = use real value
  docker_installed: boolean | null
  docker_running: boolean | null
  tailscale_installed: boolean | null
  homebrew_installed: boolean | null
  python_installed: boolean | null
}

export interface ProjectConfig {
  id: string  // Unique identifier (timestamp or uuid)
  name: string  // Project name from .launcher-config.yaml
  displayName: string  // Human-readable name
  rootPath: string  // Absolute path to project root
  worktreesPath: string  // Absolute path to worktrees directory
  configPath: string  // Path to .launcher-config.yaml
  addedAt: number  // Timestamp when added
}

interface AppState {
  // Feature flags
  dryRunMode: boolean
  showDevTools: boolean
  multiProjectMode: boolean  // Enable multi-project support
  kanbanEnabled: boolean     // Enable Kanban board feature

  // UI state
  logExpanded: boolean

  // App mode
  appMode: AppMode

  // Spoofed prerequisites (for testing)
  spoofedPrereqs: SpoofedPrerequisites

  // Project settings (legacy - for backward compat when multiProjectMode=false)
  projectRoot: string
  worktreesDir: string

  // Multi-project support
  projects: ProjectConfig[]
  activeProjectId: string | null

  // Actions
  setDryRunMode: (enabled: boolean) => void
  setShowDevTools: (enabled: boolean) => void
  setLogExpanded: (expanded: boolean) => void
  setMultiProjectMode: (enabled: boolean) => void
  setKanbanEnabled: (enabled: boolean) => void
  setAppMode: (mode: AppMode) => void
  setSpoofedPrereq: (key: keyof SpoofedPrerequisites, value: boolean | null) => void
  resetSpoofedPrereqs: () => void
  setProjectRoot: (path: string) => void
  setWorktreesDir: (path: string) => void

  // Multi-project actions
  addProject: (project: ProjectConfig) => void
  removeProject: (projectId: string) => void
  setActiveProject: (projectId: string) => void
  updateProject: (projectId: string, updates: Partial<ProjectConfig>) => void
}

const defaultSpoofedPrereqs: SpoofedPrerequisites = {
  git_installed: null,
  docker_installed: null,
  docker_running: null,
  tailscale_installed: null,
  homebrew_installed: null,
  python_installed: null,
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Defaults
      dryRunMode: false,
      showDevTools: false,
      logExpanded: true,
      multiProjectMode: false,
      kanbanEnabled: false,
      appMode: 'install',
      spoofedPrereqs: defaultSpoofedPrereqs,
      projectRoot: '',
      worktreesDir: '',
      projects: [],
      activeProjectId: null,

      // Actions
      setDryRunMode: (enabled) => set({ dryRunMode: enabled }),
      setShowDevTools: (enabled) => set({ showDevTools: enabled }),
      setLogExpanded: (expanded) => set({ logExpanded: expanded }),
      setMultiProjectMode: (enabled) => set({ multiProjectMode: enabled }),
      setKanbanEnabled: (enabled) => set({ kanbanEnabled: enabled }),
      setAppMode: (mode) => set({ appMode: mode }),
      setSpoofedPrereq: (key, value) => set((state) => ({
        spoofedPrereqs: { ...state.spoofedPrereqs, [key]: value }
      })),
      resetSpoofedPrereqs: () => set({ spoofedPrereqs: defaultSpoofedPrereqs }),
      setProjectRoot: (path) => set({ projectRoot: path }),
      setWorktreesDir: (path) => set({ worktreesDir: path }),

      // Multi-project actions
      addProject: (project) => set((state) => ({
        projects: [...state.projects, project],
        activeProjectId: project.id,
      })),
      removeProject: (projectId) => set((state) => ({
        projects: state.projects.filter(p => p.id !== projectId),
        activeProjectId: state.activeProjectId === projectId ? null : state.activeProjectId,
      })),
      setActiveProject: (projectId) => set({ activeProjectId: projectId }),
      updateProject: (projectId, updates) => set((state) => ({
        projects: state.projects.map(p =>
          p.id === projectId ? { ...p, ...updates } : p
        ),
      })),
    }),
    {
      name: 'ushadow-launcher-settings',
    }
  )
)
