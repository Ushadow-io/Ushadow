import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppMode = 'install' | 'infra' | 'environments'
export type BranchType = 'main' | 'dev'

export interface SpoofedPrerequisites {
  git_installed: boolean | null  // null = use real value
  docker_installed: boolean | null
  docker_running: boolean | null
  tailscale_installed: boolean | null
  homebrew_installed: boolean | null
  python_installed: boolean | null
}

interface AppState {
  // Feature flags
  dryRunMode: boolean
  showDevTools: boolean

  // UI state
  logExpanded: boolean

  // App mode
  appMode: AppMode

  // Spoofed prerequisites (for testing)
  spoofedPrereqs: SpoofedPrerequisites

  // Project settings (legacy - computed from branch paths)
  projectRoot: string
  worktreesDir: string

  // Branch management
  activeBranch: BranchType
  mainBranchPath: string
  devBranchPath: string
  mainWorktreesPath: string
  devWorktreesPath: string

  // Actions
  setDryRunMode: (enabled: boolean) => void
  setShowDevTools: (enabled: boolean) => void
  setLogExpanded: (expanded: boolean) => void
  setAppMode: (mode: AppMode) => void
  setSpoofedPrereq: (key: keyof SpoofedPrerequisites, value: boolean | null) => void
  resetSpoofedPrereqs: () => void
  setProjectRoot: (path: string) => void
  setWorktreesDir: (path: string) => void
  setActiveBranch: (branch: BranchType) => void
  setMainBranchPath: (path: string) => void
  setDevBranchPath: (path: string) => void
  setMainWorktreesPath: (path: string) => void
  setDevWorktreesPath: (path: string) => void
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
      appMode: 'install',
      spoofedPrereqs: defaultSpoofedPrereqs,
      projectRoot: '',
      worktreesDir: '',
      activeBranch: 'main',
      mainBranchPath: '',
      devBranchPath: '',
      mainWorktreesPath: '',
      devWorktreesPath: '',

      // Actions
      setDryRunMode: (enabled) => set({ dryRunMode: enabled }),
      setShowDevTools: (enabled) => set({ showDevTools: enabled }),
      setLogExpanded: (expanded) => set({ logExpanded: expanded }),
      setAppMode: (mode) => set({ appMode: mode }),
      setSpoofedPrereq: (key, value) => set((state) => ({
        spoofedPrereqs: { ...state.spoofedPrereqs, [key]: value }
      })),
      resetSpoofedPrereqs: () => set({ spoofedPrereqs: defaultSpoofedPrereqs }),
      setProjectRoot: (path) => set({ projectRoot: path }),
      setWorktreesDir: (path) => set({ worktreesDir: path }),
      setActiveBranch: (branch) => set({ activeBranch: branch }),
      setMainBranchPath: (path) => set({ mainBranchPath: path }),
      setDevBranchPath: (path) => set({ devBranchPath: path }),
      setMainWorktreesPath: (path) => set({ mainWorktreesPath: path }),
      setDevWorktreesPath: (path) => set({ devWorktreesPath: path }),
    }),
    {
      name: 'ushadow-launcher-settings',
    }
  )
)

// Helper functions to compute current paths based on active branch
export const getCurrentProjectRoot = (state: AppState): string => {
  return state.activeBranch === 'main' ? state.mainBranchPath : state.devBranchPath
}

export const getCurrentWorktreesDir = (state: AppState): string => {
  return state.activeBranch === 'main' ? state.mainWorktreesPath : state.devWorktreesPath
}
