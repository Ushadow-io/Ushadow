/**
 * Casdoor Authentication Context
 *
 * Provides OIDC authentication using Casdoor as the sole auth provider.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { TokenManager } from '../auth/TokenManager'
import { casdoorConfig, backendConfig } from '../auth/config'
import { authApi } from '../services/api'
import type { User } from '../types/user'

export interface CasdoorAuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  userInfo: any | null
  user: User | null  // MongoDB user data from /api/auth/me
  login: (redirectUri?: string) => void
  register: (redirectUri?: string) => void
  logout: (redirectUri?: string) => void
  getAccessToken: () => Promise<string | null>
  handleCallback: (code: string, state: string) => Promise<void>
}

export const CasdoorAuthContext = createContext<CasdoorAuthContextType | undefined>(undefined)

export function CasdoorAuthProvider({ children }: { children: ReactNode }) {
  // Initialize auth state synchronously to prevent flash of unauthenticated state
  const initialAuthState = TokenManager.isAuthenticated()
  const initialUserInfo = initialAuthState ? TokenManager.getUserInfo() : null

  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthState)
  const [isLoading, setIsLoading] = useState(initialAuthState) // Loading if authenticated (need to fetch user data)
  const [userInfo, setUserInfo] = useState<any | null>(initialUserInfo)
  const [user, setUser] = useState<User | null>(null)  // MongoDB user data
  const [refreshTimeoutId, setRefreshTimeoutId] = useState<NodeJS.Timeout | null>(null)

  // Function to fetch MongoDB user data
  const fetchUserData = async () => {
    setIsLoading(true)
    try {
      console.log('[CASDOOR-AUTH] Fetching user data from /api/auth/me...')
      const response = await authApi.getMe()
      console.log('[CASDOOR-AUTH] User data received:', response.data)
      console.log('[CASDOOR-AUTH] display_name:', response.data.display_name)
      setUser(response.data)
    } catch (error) {
      console.error('[CASDOOR-AUTH] Failed to fetch user data:', error)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Function to set up automatic token refresh
  const setupTokenRefresh = () => {
    try {
      // Clear any existing refresh timeout
      if (refreshTimeoutId) {
        console.log('[CASDOOR-AUTH] Clearing existing token refresh timeout')
        clearTimeout(refreshTimeoutId)
        setRefreshTimeoutId(null)
      }

      const token = TokenManager.getAccessTokenSync()
      const refreshToken = TokenManager.getRefreshToken()

      if (!token || !refreshToken) {
        console.log('[CASDOOR-AUTH] No token or refresh token found, skipping refresh setup')
        return
      }

      // Check if refresh token has expired
      const refreshExpiry = TokenManager.getRefreshTokenExpiry()
      if (refreshExpiry && refreshExpiry.expiresIn <= 0) {
        console.warn('[CASDOOR-AUTH] Refresh token expired, cannot set up refresh')
        setIsAuthenticated(false)
        setUserInfo(null)
        setUser(null)
        TokenManager.clearTokens()
        return
      }

      // Use OAuth2 standard: get expiry from stored expires_in (not JWT decode)
      const expiry = TokenManager.getTokenExpiry()
      if (!expiry) {
        console.log('[CASDOOR-AUTH] No expiry info stored, skipping refresh setup')
        return
      }

      const { expiresAt, expiresIn } = expiry

      // If token is already expired or expires in less than 0 seconds, clear it
      if (expiresIn <= 0) {
        console.warn('[CASDOOR-AUTH] Token already expired, clearing tokens...')
        setIsAuthenticated(false)
        setUserInfo(null)
        setUser(null)
        TokenManager.clearTokens()
        return
      }

      // Refresh well before SSO session idle timeout (30min = 1800s)
      // Refresh at 25 minutes (1500s) or 60s before token expiry, whichever is sooner
      const refreshAt = Math.max(0, Math.min(expiresIn - 60, 1500))

      console.log('[CASDOOR-AUTH] Setting up token refresh (OAuth2 standard):', {
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        expiresIn: `${Math.floor(expiresIn / 60)}m ${expiresIn % 60}s`,
        refreshIn: `${Math.floor(refreshAt / 60)}m ${refreshAt % 60}s`
      })

      const timeoutId = setTimeout(async () => {
        try {
          console.log('[CASDOOR-AUTH] Refreshing token...')

          // Check if we have a refresh token
          const refreshToken = TokenManager.getRefreshToken()
          if (!refreshToken) {
            throw new Error('No refresh token available')
          }

          // Refresh via backend (handles Casdoor communication)
          const response = await fetch(`${backendConfig.url}/api/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              refresh_token: refreshToken,
            }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Token refresh failed: ${response.status} ${errorText}`)
          }

          const newTokens = await response.json()
          TokenManager.storeTokens(newTokens)
          console.log('[CASDOOR-AUTH] ✅ Token refreshed successfully')

          // Update context state
          setIsAuthenticated(true)
          const info = TokenManager.getUserInfo()
          setUserInfo(info)

          // Fetch fresh user data
          await fetchUserData()

          // Schedule next refresh
          setupTokenRefresh()
        } catch (error) {
          console.error('[CASDOOR-AUTH] ❌ Token refresh failed:', error)
          // Token refresh failed - clear auth state (will trigger redirect to login)
          setIsAuthenticated(false)
          setUserInfo(null)
          setUser(null)
          TokenManager.clearTokens()
        }
      }, refreshAt * 1000)

      setRefreshTimeoutId(timeoutId)
      console.log('[CASDOOR-AUTH] ✅ Token refresh scheduled')
    } catch (error) {
      console.error('[CASDOOR-AUTH] Error setting up token refresh:', error)
    }
  }

  useEffect(() => {
    // Clean up any stale "null" or "undefined" string values in sessionStorage
    TokenManager.cleanupStaleTokens()

    // Check auth state with launcher support (async)
    const checkAuth = async () => {
      console.log('[CASDOOR-AUTH] Checking authentication (launcher-aware)...')
      const authenticated = await TokenManager.isAuthenticatedAsync()
      console.log('[CASDOOR-AUTH] Authentication result:', authenticated)

      if (authenticated !== isAuthenticated) {
        setIsAuthenticated(authenticated)
        if (authenticated) {
          const info = TokenManager.getUserInfo()
          setUserInfo(info)
          // Fetch MongoDB user data
          fetchUserData()
          // Set up token refresh
          setupTokenRefresh()
        } else {
          setUserInfo(null)
          setUser(null)
          setIsLoading(false)
        }
      } else if (authenticated && !user) {
        // If already authenticated but no user data, fetch it
        fetchUserData()
        // Set up token refresh if not already set
        if (!refreshTimeoutId) {
          setupTokenRefresh()
        }
      } else if (!authenticated) {
        setIsLoading(false)
      }
    }

    checkAuth()

    // Listen for token updates from launcher
    const handleMessage = (event: MessageEvent) => {
      console.log('[CASDOOR-AUTH] Received postMessage:', event.data.type)
      if (event.data.type === 'CASDOOR_TOKENS_UPDATED') {
        console.log('[CASDOOR-AUTH] Token update notification received from launcher!')
        console.log('[CASDOOR-AUTH] Re-checking authentication...')
        checkAuth()
      }
    }

    window.addEventListener('message', handleMessage)
    console.log('[CASDOOR-AUTH] ✓ Message listener registered')

    // Clean up on unmount
    return () => {
      window.removeEventListener('message', handleMessage)
      if (refreshTimeoutId) {
        console.log('[CASDOOR-AUTH] Cleaning up token refresh timeout on unmount')
        clearTimeout(refreshTimeoutId)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (redirectUri?: string) => {
    // Save current location for return after login
    const returnUrl = redirectUri || window.location.pathname + window.location.search
    sessionStorage.setItem('login_return_url', returnUrl)

    // Generate CSRF state
    const state = generateState()
    sessionStorage.setItem('oauth_state', state)

    // Build Casdoor login URL (async because of PKCE SHA-256)
    const loginUrl = await TokenManager.buildLoginUrl({
      baseUrl: casdoorConfig.url,
      clientId: casdoorConfig.clientId,
      authEndpoint: casdoorConfig.authEndpoint,
      redirectUri: `${window.location.origin}/oauth/callback`,
      state,
    })

    // Redirect to Casdoor
    window.location.href = loginUrl
  }

  const register = async (redirectUri?: string) => {
    // Save current location for return after registration
    const returnUrl = redirectUri || window.location.pathname + window.location.search
    sessionStorage.setItem('login_return_url', returnUrl)

    // Generate CSRF state
    const state = generateState()
    sessionStorage.setItem('oauth_state', state)

    const signupUrl = await TokenManager.buildLoginUrl({
      baseUrl: casdoorConfig.url,
      clientId: casdoorConfig.clientId,
      authEndpoint: casdoorConfig.signupEndpoint,
      redirectUri: `${window.location.origin}/oauth/callback`,
      state,
    })

    window.location.href = signupUrl
  }

  const logout = (redirectUri?: string) => {
    // Build logout URL FIRST (needs id_token from storage)
    const defaultRedirectUri = `${window.location.origin}/`
    const logoutUrl = TokenManager.buildLogoutUrl({
      baseUrl: casdoorConfig.url,
      logoutEndpoint: casdoorConfig.logoutEndpoint,
      redirectUri: redirectUri || defaultRedirectUri,
    })

    // THEN clear tokens (after we've read id_token for logout URL)
    TokenManager.clearTokens()
    setIsAuthenticated(false)
    setUserInfo(null)
    setUser(null)

    // Redirect to Casdoor logout
    window.location.href = logoutUrl
  }

  const handleCallback = async (code: string, state: string) => {
    // Verify state (CSRF protection)
    const savedState = sessionStorage.getItem('oauth_state')
    if (state !== savedState) {
      throw new Error('Invalid state parameter - possible CSRF attack')
    }

    // Exchange code for tokens via backend
    const tokens = await TokenManager.exchangeCodeForTokens(code, backendConfig.url)
    console.log('[CASDOOR-AUTH] Received tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      hasIdToken: !!tokens.id_token,
      tokenPreview: tokens.access_token?.substring(0, 30) + '...'
    })

    // Store tokens
    TokenManager.storeTokens(tokens)
    console.log('[CASDOOR-AUTH] Tokens stored in localStorage')

    // Verify storage worked
    const storedToken = localStorage.getItem('kc_access_token')
    console.log('[CASDOOR-AUTH] Verified storage:', {
      hasStoredToken: !!storedToken,
      storedTokenPreview: storedToken?.substring(0, 30) + '...'
    })

    // Update auth state
    setIsAuthenticated(true)
    const info = TokenManager.getUserInfo()
    setUserInfo(info)

    // Fetch MongoDB user data
    await fetchUserData()

    // Set up automatic token refresh
    setupTokenRefresh()

    // Clean up
    sessionStorage.removeItem('oauth_state')
  }

  const getAccessToken = async () => {
    return await TokenManager.getAccessToken()
  }

  return (
    <CasdoorAuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        userInfo,
        user,  // MongoDB user data
        login,
        register,
        logout,
        getAccessToken,
        handleCallback,
      }}
    >
      {children}
    </CasdoorAuthContext.Provider>
  )
}

export function useCasdoorAuth() {
  const context = useContext(CasdoorAuthContext)
  if (context === undefined) {
    throw new Error('useCasdoorAuth must be used within a CasdoorAuthProvider')
  }
  return context
}

// Helper function
function generateState(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15)
}
