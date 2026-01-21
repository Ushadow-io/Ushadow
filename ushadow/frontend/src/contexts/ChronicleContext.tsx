import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { chronicleAuthApi } from '../services/chronicleApi'
import { useWebRecording, WebRecordingReturn } from '../hooks/useWebRecording'

interface ChronicleContextType {
  // Connection state
  isConnected: boolean
  isCheckingConnection: boolean
  connectionError: string | null

  // Connection actions
  checkConnection: () => Promise<boolean>
  disconnect: () => void

  // Recording (lifted to context level for global access)
  recording: WebRecordingReturn
}

const ChronicleContext = createContext<ChronicleContextType | undefined>(undefined)

export function ChronicleProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [isCheckingConnection, setIsCheckingConnection] = useState(false)  // Start false - only true during explicit check
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Lift recording hook to context level
  const recording = useWebRecording()

  // Check if Chronicle is connected (has valid auth token)
  const checkConnection = useCallback(async (): Promise<boolean> => {
    setIsCheckingConnection(true)
    setConnectionError(null)

    try {
      // Auth is now handled automatically via ushadow proxy
      // Just try to reach Chronicle - if it works, we're connected
      await chronicleAuthApi.getMe()
      setIsConnected(true)
      return true
    } catch (error: any) {
      console.log('Chronicle connection check failed:', error)
      setIsConnected(false)

      if (error.response?.status === 401) {
        // Auth failed - this is a ushadow auth issue, not Chronicle
        setConnectionError('Authentication required')
      } else if (!error.response) {
        setConnectionError('Chronicle backend unreachable')
      } else {
        setConnectionError('Connection failed')
      }

      return false
    } finally {
      setIsCheckingConnection(false)
    }
  }, [])

  // Disconnect from Chronicle
  const disconnect = useCallback(() => {
    // Stop any active recording first
    if (recording.isRecording) {
      recording.stopRecording()
    }

    chronicleAuthApi.logout()
    setIsConnected(false)
    setConnectionError(null)
  }, [recording])

  // Don't auto-check on mount - let Chronicle pages explicitly call checkConnection()
  // This avoids unnecessary requests when user is on non-Chronicle pages

  // Re-check connection periodically (every 5 minutes) if connected
  useEffect(() => {
    if (!isConnected) return

    const interval = setInterval(() => {
      checkConnection()
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [isConnected, checkConnection])

  return (
    <ChronicleContext.Provider
      value={{
        isConnected,
        isCheckingConnection,
        connectionError,
        checkConnection,
        disconnect,
        recording
      }}
    >
      {children}
    </ChronicleContext.Provider>
  )
}

export function useChronicle() {
  const context = useContext(ChronicleContext)
  if (context === undefined) {
    throw new Error('useChronicle must be used within a ChronicleProvider')
  }
  return context
}
