import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react'
import { LucideIcon } from 'lucide-react'
import { api } from '../services/api'
import { getIconForLevel } from '../wizards/registry'

export type WizardMode = 'quickstart' | 'local' | 'custom' | null

export type WizardPhase = 'quickstart' | 'tailscale' | 'mobile' | 'speaker' | 'advanced'

// Setup levels for progressive onboarding
export type SetupLevel = 0 | 1 | 2 | 3
// 0 = Fresh install (nothing configured)
// 1 = Core services ready (OpenMemory + Chronicle running, web client usable)
// 2 = Network secured (Tailscale configured, mobile access)
// 3 = Complete (Speaker recognition configured)

// Individual service status tracking
export interface ServiceStatus {
  configured: boolean
  running: boolean
  error?: string
}

// Dynamic services state - keyed by service name (e.g., 'mem0', 'chronicle-backend')
export interface ServicesState {
  apiKeys: boolean // API keys or local endpoints configured
  services: Record<string, ServiceStatus> // Dynamic service statuses
}

// Core services required for each setup level (mapped from service names)
// These define which services must be running for level progression
export const CORE_SERVICES = {
  level1: ['mem0', 'chronicle-backend'], // Core services for web client
  level2: ['tailscale'], // Network security
  level3: ['speaker-recognition'], // Voice ID
} as const

export interface WizardState {
  mode: WizardMode
  completedPhases: WizardPhase[]
  currentPhase: WizardPhase | null
  services: ServicesState
}

interface WizardContextType {
  wizardState: WizardState
  setMode: (mode: WizardMode) => void
  markPhaseComplete: (phase: WizardPhase) => void
  setCurrentPhase: (phase: WizardPhase | null) => void
  resetWizard: () => void
  isPhaseComplete: (phase: WizardPhase) => boolean
  // New level-based helpers
  setupLevel: SetupLevel
  updateServiceStatus: (service: string, status: Partial<ServiceStatus> | boolean) => void
  updateApiKeysStatus: (configured: boolean) => void
  getServiceStatus: (service: string) => ServiceStatus | undefined
  getSetupLabel: () => { label: string; description: string; path: string; level: number; icon: LucideIcon }
  isFirstTimeUser: () => boolean
}

const WizardContext = createContext<WizardContextType | undefined>(undefined)

const defaultServiceStatus: ServiceStatus = {
  configured: false,
  running: false,
}

const initialState: WizardState = {
  mode: null,
  completedPhases: [],
  currentPhase: null,
  services: {
    apiKeys: false,
    services: {}, // Dynamic - populated as services are discovered/started
  },
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [wizardState, setWizardState] = useState<WizardState>(initialState)

  // Fetch state from backend
  const fetchState = () => {
    api.get('/api/wizard/setup-state')
      .then((res) => {
        if (res.data && Object.keys(res.data).length > 0) {
          setWizardState({
            ...initialState,
            ...res.data,
            services: {
              apiKeys: res.data.services?.apiKeys ?? false,
              services: res.data.services?.services ?? {},
            },
          })
        }
      })
      .catch(() => {})
  }

  // Load state from backend on mount
  useEffect(() => {
    fetchState()
  }, [])

  // Refresh state when page gains visibility (helps after OAuth redirects)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchState()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Helper to update state and persist to backend
  // Uses functional update to avoid stale closure issues when multiple updates happen quickly
  const updateState = (updater: (prev: WizardState) => WizardState) => {
    setWizardState(prev => {
      const newState = updater(prev)
      api.put('/api/wizard/setup-state', newState).catch(() => {})
      return newState
    })
  }

  const setMode = (mode: WizardMode) => {
    updateState(prev => ({ ...prev, mode }))
  }

  const markPhaseComplete = (phase: WizardPhase) => {
    updateState(prev => {
      if (prev.completedPhases.includes(phase)) {
        return prev // No change needed
      }
      return {
        ...prev,
        completedPhases: [...prev.completedPhases, phase],
      }
    })
  }

  const setCurrentPhase = (phase: WizardPhase | null) => {
    updateState(prev => ({ ...prev, currentPhase: phase }))
  }

  const resetWizard = () => {
    setWizardState(initialState)
    api.put('/api/wizard/setup-state', initialState).catch(() => {})
  }

  const isPhaseComplete = (phase: WizardPhase) => {
    return wizardState.completedPhases.includes(phase)
  }

  // Update status for a specific service (by service name, e.g., 'mem0', 'chronicle-backend')
  const updateServiceStatus = (
    service: string,
    status: Partial<ServiceStatus> | boolean
  ) => {
    updateState(prev => {
      const currentStatus = prev.services.services[service] || defaultServiceStatus
      const newStatus = typeof status === 'boolean'
        ? { ...currentStatus, configured: status, running: status }
        : { ...currentStatus, ...status }

      return {
        ...prev,
        services: {
          ...prev.services,
          services: {
            ...prev.services.services,
            [service]: newStatus,
          },
        },
      }
    })
  }

  // Update API keys status separately
  const updateApiKeysStatus = (configured: boolean) => {
    updateState(prev => ({
      ...prev,
      services: {
        ...prev.services,
        apiKeys: configured,
      },
    }))
  }

  // Get status for a specific service
  const getServiceStatus = (service: string): ServiceStatus | undefined => {
    return wizardState.services.services[service]
  }

  // Calculate current setup level based on service states
  const setupLevel = useMemo((): SetupLevel => {
    const { apiKeys, services: serviceStates } = wizardState.services

    // Helper to check if all services in a list are running
    const checkRunning = (names: readonly string[]) =>
      names.every((name) => serviceStates[name]?.running === true)

    // Helper to check if all services in a list are configured
    const checkConfigured = (names: readonly string[]) =>
      names.every((name) => serviceStates[name]?.configured === true)

    // Level 3: Everything including speaker recognition
    if (
      apiKeys &&
      checkRunning(CORE_SERVICES.level1) &&
      checkConfigured(CORE_SERVICES.level2) &&
      checkConfigured(CORE_SERVICES.level3)
    ) {
      return 3
    }

    // Level 2: Core services + Tailscale
    if (
      apiKeys &&
      checkRunning(CORE_SERVICES.level1) &&
      checkConfigured(CORE_SERVICES.level2)
    ) {
      return 2
    }

    // Level 1: Core services running (web client usable)
    if (apiKeys && checkRunning(CORE_SERVICES.level1)) {
      return 1
    }

    // Level 0: Fresh install
    return 0
  }, [wizardState.services])

  // Get dynamic label for sidebar based on completed phases
  // Flow order: quickstart → tailscale → mobile → speaker
  // Returns level number and icon to keep badge, label, and icon in sync
  const getSetupLabel = (): { label: string; description: string; path: string; level: number; icon: LucideIcon } => {
    const phases = wizardState.completedPhases

    if (!phases.includes('quickstart')) {
      return { label: 'Get Started', description: 'Set up your AI platform', path: '/wizard/start', level: 1, icon: getIconForLevel(1) }
    }
    if (!phases.includes('tailscale')) {
      return { label: 'Add Tailscale', description: 'Secure network access', path: '/wizard/tailscale', level: 2, icon: getIconForLevel(2) }
    }
    if (!phases.includes('mobile')) {
      return { label: 'Add Mobile', description: 'Connect mobile app', path: '/wizard/mobile-app', level: 3, icon: getIconForLevel(3) }
    }
    if (!phases.includes('speaker')) {
      return { label: 'Add Voice ID', description: 'Speaker recognition', path: '/wizard/speaker-recognition', level: 4, icon: getIconForLevel(4) }
    }
    return { label: 'Setup Complete', description: 'All services configured', path: '/settings', level: 5, icon: getIconForLevel(5) }
  }

  // Check if this is a first-time user (no setup started)
  const isFirstTimeUser = (): boolean => {
    return wizardState.completedPhases.length === 0
  }

  return (
    <WizardContext.Provider
      value={{
        wizardState,
        setMode,
        markPhaseComplete,
        setCurrentPhase,
        resetWizard,
        isPhaseComplete,
        setupLevel,
        updateServiceStatus,
        updateApiKeysStatus,
        getServiceStatus,
        getSetupLabel,
        isFirstTimeUser,
      }}
    >
      {children}
    </WizardContext.Provider>
  )
}

export function useWizard() {
  const context = useContext(WizardContext)
  if (context === undefined) {
    throw new Error('useWizard must be used within a WizardProvider')
  }
  return context
}
