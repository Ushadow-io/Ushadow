import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi, setupApi } from '../services/api'
import { getStorageKey } from '../utils/storage'
import { User } from '../types/user'

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<{success: boolean, error?: string, errorType?: string}>
  logout: () => void
  isLoading: boolean
  isAdmin: boolean
  setupRequired: boolean | null  // null = checking, true/false = determined
  backendError: string | null  // Backend configuration/startup error
  checkSetupStatus: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem(getStorageKey('token')))
  const [isLoading, setIsLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)
  const [backendError, setBackendError] = useState<string | null>(null)

  // Check if user is admin
  const isAdmin = user?.is_superuser || false

  // Function to check setup status
  const checkSetupStatus = async (): Promise<boolean> => {
    try {
      const response = await setupApi.getSetupStatus()
      const required = response.data.requires_setup
      setSetupRequired(required)
      setBackendError(null)  // Clear any previous errors
      return required
    } catch (error: any) {
      console.error('❌ AuthContext: Failed to check setup status:', error)

      // Check if this is a backend configuration error (500) vs just connection failure
      if (error.response?.status === 500) {
        // Backend started but has configuration errors
        const errorMessage = error.response?.data?.detail || 'Backend configuration error. Please check logs.'
        setBackendError(errorMessage)
        setSetupRequired(null)  // Keep checking state
        return false
      } else if (error.code === 'ERR_NETWORK') {
        // Can't reach backend at all
        setBackendError('Cannot connect to backend. Please ensure the backend is running.')
        setSetupRequired(null)
        return false
      }

      // Other errors - assume setup not required to avoid blocking
      setSetupRequired(false)
      return false
    }
  }

  useEffect(() => {
    const initAuth = async () => {
      console.log('🔐 AuthContext: Initializing authentication...')

      // First, check setup status
      console.log('🔐 AuthContext: Checking setup status...')
      await checkSetupStatus()

      const savedToken = localStorage.getItem(getStorageKey('token'))
      console.log('🔐 AuthContext: Saved token exists:', !!savedToken)

      if (savedToken) {
        try {
          console.log('🔐 AuthContext: Verifying token with API call...')
          // Verify token is still valid by making a request
          const response = await authApi.getMe()
          console.log('🔐 AuthContext: API call successful, user data:', response.data)
          console.log('🔐 AuthContext: display_name:', response.data.display_name)
          console.log('🔐 AuthContext: email:', response.data.email)
          setUser(response.data)
          setToken(savedToken)
        } catch (error) {
          console.error('❌ AuthContext: Token verification failed:', error)
          // Token is invalid, clear it
          localStorage.removeItem(getStorageKey('token'))
          setToken(null)
          setUser(null)
        }
      } else {
        console.log('🔐 AuthContext: No saved token found')
      }
      console.log('🔐 AuthContext: Initialization complete, setting isLoading to false')
      setIsLoading(false)
    }

    initAuth()
  }, [])

  const login = async (email: string, password: string): Promise<{success: boolean, error?: string, errorType?: string}> => {
    try {
      const response = await authApi.login(email, password)

      const { access_token } = response.data
      setToken(access_token)
      localStorage.setItem(getStorageKey('token'), access_token)

      // Get user info
      const userResponse = await authApi.getMe()
      console.log('🔐 AuthContext: Login successful, user data:', userResponse.data)
      console.log('🔐 AuthContext: User display_name:', userResponse.data.display_name)
      setUser(userResponse.data)

      return { success: true }
    } catch (error: any) {
      console.error('Login failed:', error)

      // Parse structured error response from backend
      let errorMessage = 'Login failed. Please try again.'
      let errorType = 'unknown'

      if (error.response?.data) {
        const errorData = error.response.data
        errorMessage = errorData.detail || errorMessage
        errorType = errorData.error_type || errorType
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = 'Unable to connect to server. Please check your connection and try again.'
        errorType = 'connection_failure'
      }

      return {
        success: false,
        error: errorMessage,
        errorType: errorType
      }
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem(getStorageKey('token'))
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading, isAdmin, setupRequired, backendError, checkSetupStatus }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
