import { createContext, useContext, useState, ReactNode } from 'react'

export type WizardMode = 'quickstart' | 'local' | 'custom' | null

export type WizardPhase = 'memory' | 'chronicle' | 'speaker' | 'advanced'

export interface WizardState {
  mode: WizardMode
  completedPhases: WizardPhase[]
  currentPhase: WizardPhase | null
}

interface WizardContextType {
  wizardState: WizardState
  setMode: (mode: WizardMode) => void
  markPhaseComplete: (phase: WizardPhase) => void
  setCurrentPhase: (phase: WizardPhase | null) => void
  resetWizard: () => void
  isPhaseComplete: (phase: WizardPhase) => boolean
}

const WizardContext = createContext<WizardContextType | undefined>(undefined)

const initialState: WizardState = {
  mode: null,
  completedPhases: [],
  currentPhase: null,
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [wizardState, setWizardState] = useState<WizardState>(() => {
    // Try to load from localStorage
    const saved = localStorage.getItem('ushadow-wizard-state')
    return saved ? JSON.parse(saved) : initialState
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

  return (
    <WizardContext.Provider
      value={{
        wizardState,
        setMode,
        markPhaseComplete,
        setCurrentPhase,
        resetWizard,
        isPhaseComplete,
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
