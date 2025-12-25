import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '../services/api'

interface FeatureFlag {
  enabled: boolean
  description: string
  type: string
}

interface FeatureFlagsContextType {
  flags: Record<string, FeatureFlag>
  loading: boolean
  error: string | null
  isEnabled: (flagName: string) => boolean
  refresh: () => Promise<void>
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType | undefined>(undefined)

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFlags = async () => {
    try {
      const response = await api.get('/api/feature-flags/status')
      setFlags(response.data.flags || {})
      setError(null)
    } catch (err) {
      console.error('Failed to fetch feature flags:', err)
      setError(err instanceof Error ? err.message : 'Failed to load feature flags')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Fetch flags once on mount
    fetchFlags()
  }, [])

  const isEnabled = (flagName: string): boolean => {
    return flags[flagName]?.enabled || false
  }

  return (
    <FeatureFlagsContext.Provider value={{ flags, loading, error, isEnabled, refresh: fetchFlags }}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext)
  if (context === undefined) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider')
  }
  return context
}
