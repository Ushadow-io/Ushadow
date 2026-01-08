import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { chronicleAuthApi } from '../services/chronicleApi'
import { useChronicleRecording, ChronicleRecordingReturn } from '../hooks/useChronicleRecording'

interface ChronicleContextType {
  // Connection state
  isConnected: boolean
  isCheckingConnection: boolean
  connectionError: string | null

  // Connection actions
  checkConnection: () => Promise<boolean>
  disconnect: () => void

  // Recording (lifted to context level for global access)
  recording: ChronicleRecordingReturn
}

const ChronicleContext = createContext<ChronicleContextType | undefined>(undefined)

export function ChronicleProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [isCheckingConnection, setIsCheckingConnection] = useState(true)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Lift recording hook to context level
  const recording = useChronicleRecording()

  // Check if Chronicle is connected (has valid auth token)
  const checkConnection = useCallback(async (): Promise<boolean> => {
    setIsCheckingConnection(true)
    setConnectionError(null)

    try {
      if (!chronicleAuthApi.isAuthenticated()) {
        setIsConnected(false)
        return false
      }

      // Verify the token is still valid
      await chronicleAuthApi.getMe()
      setIsConnected(true)
      return true
    } catch (error: any) {
      console.log('Chronicle connection check failed:', error)
      setIsConnected(false)

      if (error.response?.status === 401) {
        // Token expired, clear it
        chronicleAuthApi.logout()
        setConnectionError('Session expired')
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

  // Check connection on mount and when URL changes
  useEffect(() => {
    checkConnection()
  }, [checkConnection])

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
