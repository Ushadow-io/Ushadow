import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { settingsApi } from '../services/api'
import { updateKeycloakConfig } from '../auth/config'

interface SettingsContextType {
  settings: Record<string, any> | null
  isLoading: boolean
  refreshSettings: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Record<string, any> | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchSettings = async () => {
    try {
      const response = await settingsApi.getConfig()
      setSettings(response.data)

      // Update Keycloak config with backend settings
      updateKeycloakConfig(response.data)

      console.log('[SettingsContext] Settings loaded and Keycloak config updated')
    } catch (error) {
      console.error('[SettingsContext] Failed to load settings:', error)
      // Don't block app initialization if settings fail
      setSettings({})
    } finally {
      setIsLoading(false)
    }
  }

  const refreshSettings = async () => {
    setIsLoading(true)
    await fetchSettings()
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, isLoading, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
