import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppMode = 'dev' | 'quick'

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

  // App mode
  appMode: AppMode

  // Spoofed prerequisites (for testing)
  spoofedPrereqs: SpoofedPrerequisites

  // Project settings
  projectRoot: string
  worktreesDir: string

  // Actions
  setDryRunMode: (enabled: boolean) => void
  setShowDevTools: (enabled: boolean) => void
  setAppMode: (mode: AppMode) => void
  setSpoofedPrereq: (key: keyof SpoofedPrerequisites, value: boolean | null) => void
  resetSpoofedPrereqs: () => void
  setProjectRoot: (path: string) => void
  setWorktreesDir: (path: string) => void
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
      appMode: 'quick',
      spoofedPrereqs: defaultSpoofedPrereqs,
      projectRoot: '',
      worktreesDir: '',

      // Actions
      setDryRunMode: (enabled) => set({ dryRunMode: enabled }),
      setShowDevTools: (enabled) => set({ showDevTools: enabled }),
      setAppMode: (mode) => set({ appMode: mode }),
      setSpoofedPrereq: (key, value) => set((state) => ({
        spoofedPrereqs: { ...state.spoofedPrereqs, [key]: value }
      })),
      resetSpoofedPrereqs: () => set({ spoofedPrereqs: defaultSpoofedPrereqs }),
      setProjectRoot: (path) => set({ projectRoot: path }),
      setWorktreesDir: (path) => set({ worktreesDir: path }),
    }),
    {
      name: 'ushadow-launcher-settings',
    }
  )
)
