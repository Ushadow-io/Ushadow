import { createContext, useContext, useState, ReactNode, useMemo } from 'react'

export type WizardMode = 'quickstart' | 'local' | 'custom' | null

export type WizardPhase = 'quickstart' | 'memory' | 'chronicle' | 'speaker' | 'advanced'

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

export interface ServicesState {
  apiKeys: boolean // API keys or local endpoints configured
  openMemory: ServiceStatus
  chronicle: ServiceStatus
  tailscale: ServiceStatus
  speakerRecognition: ServiceStatus
}

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
  updateServiceStatus: (service: keyof ServicesState, status: Partial<ServiceStatus> | boolean) => void
  getSetupLabel: () => { label: string; description: string; path: string }
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
    openMemory: { ...defaultServiceStatus },
    chronicle: { ...defaultServiceStatus },
    tailscale: { ...defaultServiceStatus },
    speakerRecognition: { ...defaultServiceStatus },
  },
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [wizardState, setWizardState] = useState<WizardState>(() => {
    // Try to load from localStorage
    const saved = localStorage.getItem('ushadow-wizard-state')
    if (saved) {
      const parsed = JSON.parse(saved)
      // Ensure services object exists (migration for older saved states)
      if (!parsed.services) {
        parsed.services = initialState.services
      }
      return parsed
    }
    return initialState
  })

  const saveState = (newState: WizardState) => {
    setWizardState(newState)
    localStorage.setItem('ushadow-wizard-state', JSON.stringify(newState))
  }

  const setMode = (mode: WizardMode) => {
    saveState({ ...wizardState, mode })
  }

  const markPhaseComplete = (phase: WizardPhase) => {
    if (!wizardState.completedPhases.includes(phase)) {
      saveState({
        ...wizardState,
        completedPhases: [...wizardState.completedPhases, phase],
      })
    }
  }

  const setCurrentPhase = (phase: WizardPhase | null) => {
    saveState({ ...wizardState, currentPhase: phase })
  }

  const resetWizard = () => {
    localStorage.removeItem('ushadow-wizard-state')
    setWizardState(initialState)
  }

  const isPhaseComplete = (phase: WizardPhase) => {
    return wizardState.completedPhases.includes(phase)
  }

  // Update status for a specific service
  const updateServiceStatus = (
    service: keyof ServicesState,
    status: Partial<ServiceStatus> | boolean
  ) => {
    const newServices = { ...wizardState.services }

    if (service === 'apiKeys') {
      newServices.apiKeys = typeof status === 'boolean' ? status : true
    } else {
      const currentStatus = newServices[service] as ServiceStatus
      newServices[service] = typeof status === 'boolean'
        ? { ...currentStatus, configured: status, running: status }
        : { ...currentStatus, ...status }
    }

    saveState({ ...wizardState, services: newServices })
  }

  // Calculate current setup level based on service states
  const setupLevel = useMemo((): SetupLevel => {
    const { services } = wizardState

    // Level 3: Everything including speaker recognition
    if (
      services.apiKeys &&
      services.openMemory.running &&
      services.chronicle.running &&
      services.tailscale.configured &&
      services.speakerRecognition.configured
    ) {
      return 3
    }

    // Level 2: Core services + Tailscale
    if (
      services.apiKeys &&
      services.openMemory.running &&
      services.chronicle.running &&
      services.tailscale.configured
    ) {
      return 2
    }

    // Level 1: Core services running (web client usable)
    if (
      services.apiKeys &&
      services.openMemory.running &&
      services.chronicle.running
    ) {
      return 1
    }

    // Level 0: Fresh install
    return 0
  }, [wizardState.services])

  // Get dynamic label for sidebar based on setup level
  const getSetupLabel = (): { label: string; description: string; path: string } => {
    switch (setupLevel) {
      case 0:
        return {
          label: 'Get Started',
          description: 'Set up your AI platform',
          path: '/wizard/start',
        }
      case 1:
        return {
          label: 'Add Mobile',
          description: 'Secure network access',
          path: '/wizard/tailscale',
        }
      case 2:
        return {
          label: 'Add Voice ID',
          description: 'Speaker recognition',
          path: '/wizard/speaker',
        }
      case 3:
        return {
          label: 'Setup Complete',
          description: 'All services configured',
          path: '/settings',
        }
    }
  }

  // Check if this is a first-time user (no setup started)
  const isFirstTimeUser = (): boolean => {
    return (
      setupLevel === 0 &&
      wizardState.mode === null &&
      wizardState.completedPhases.length === 0
    )
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
