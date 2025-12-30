import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { providersApi } from '../services/api'

export type WizardMode = 'quickstart' | 'local' | 'custom' | null

export type WizardPhase = 'quickstart' | 'memory' | 'chronicle' | 'speaker' | 'advanced'

/**
 * Provider selections by capability.
 * Maps capability ID (llm, transcription, memory) to provider ID (openai, deepgram, etc.)
 */
export type SelectedProviders = Record<string, string>

export interface WizardState {
  mode: WizardMode
  completedPhases: WizardPhase[]
  currentPhase: WizardPhase | null
  /** Selected providers per capability (synced with backend) */
  selectedProviders: SelectedProviders
}

interface WizardContextType {
  wizardState: WizardState
  setMode: (mode: WizardMode) => void
  markPhaseComplete: (phase: WizardPhase) => void
  setCurrentPhase: (phase: WizardPhase | null) => void
  resetWizard: () => void
  isPhaseComplete: (phase: WizardPhase) => boolean
  /** Update a single provider selection (syncs to backend) */
  selectProvider: (capability: string, providerId: string) => Promise<void>
  /** Update multiple provider selections at once (syncs to backend) */
  updateProviders: (providers: SelectedProviders) => Promise<void>
  /** Apply default providers for a mode (cloud/local) */
  applyDefaultProviders: (mode: 'cloud' | 'local') => Promise<void>
  /** Whether provider selections are loading */
  providersLoading: boolean
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
  selectedProviders: {},
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [wizardState, setWizardState] = useState<WizardState>(() => {
    // Try to load from localStorage
    const saved = localStorage.getItem('ushadow-wizard-state')
    return saved ? { ...initialState, ...JSON.parse(saved) } : initialState
  })
  const [providersLoading, setProvidersLoading] = useState(false)

  // Load provider selections from backend on mount
  useEffect(() => {
    const loadProviders = async () => {
      try {
        const response = await providersApi.getSelected()
        const { wizard_mode, selected_providers } = response.data
        setWizardState(prev => ({
          ...prev,
          mode: wizard_mode || prev.mode,
          selectedProviders: selected_providers || {},
        }))
      } catch (error) {
        console.warn('Failed to load provider selections:', error)
      }
    }
    loadProviders()
  }, [])

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

  /**
   * Select a single provider for a capability.
   * Updates both local state and backend.
   */
  const selectProvider = useCallback(async (capability: string, providerId: string) => {
    setProvidersLoading(true)
    try {
      await providersApi.selectProvider(capability, providerId)
      setWizardState(prev => ({
        ...prev,
        selectedProviders: {
          ...prev.selectedProviders,
          [capability]: providerId,
        },
      }))
    } catch (error) {
      console.error('Failed to select provider:', error)
      throw error
    } finally {
      setProvidersLoading(false)
    }
  }, [])

  /**
   * Update multiple provider selections at once.
   * Updates both local state and backend.
   */
  const updateProviders = useCallback(async (providers: SelectedProviders) => {
    setProvidersLoading(true)
    try {
      const response = await providersApi.updateSelected({
        selected_providers: providers,
      })
      setWizardState(prev => ({
        ...prev,
        selectedProviders: response.data.selected_providers || {},
      }))
    } catch (error) {
      console.error('Failed to update providers:', error)
      throw error
    } finally {
      setProvidersLoading(false)
    }
  }, [])

  /**
   * Apply default providers for a mode (cloud or local).
   * This sets all capabilities to their default provider for the mode.
   */
  const applyDefaultProviders = useCallback(async (mode: 'cloud' | 'local') => {
    setProvidersLoading(true)
    try {
      const response = await providersApi.applyDefaults(mode)
      // Response contains wizard_mode and selected_providers
      setWizardState(prev => ({
        ...prev,
        mode: response.data.wizard_mode || prev.mode,
        selectedProviders: response.data.selected_providers || {},
      }))
    } catch (error) {
      console.error('Failed to apply default providers:', error)
      throw error
    } finally {
      setProvidersLoading(false)
    }
  }, [])

  return (
    <WizardContext.Provider
      value={{
        wizardState,
        setMode,
        markPhaseComplete,
        setCurrentPhase,
        resetWizard,
        isPhaseComplete,
        selectProvider,
        updateProviders,
        applyDefaultProviders,
        providersLoading,
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
