/**
 * Keycloak Authentication Context
 *
 * Provides OIDC authentication using Keycloak for federated auth
 * (voice message sharing, external user access)
 *
 * Works alongside the existing AuthContext (legacy email/password)
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { TokenManager } from '../auth/TokenManager'
import { keycloakConfig, backendConfig } from '../auth/config'
import { authApi } from '../services/api'
import type { User } from '../types/user'

interface KeycloakAuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  userInfo: any | null
  user: User | null  // MongoDB user data from /api/auth/me
  login: (redirectUri?: string) => void
  register: (redirectUri?: string) => void
  logout: (redirectUri?: string) => void
  getAccessToken: () => string | null
  handleCallback: (code: string, state: string) => Promise<void>
}

const KeycloakAuthContext = createContext<KeycloakAuthContextType | undefined>(undefined)

export function KeycloakAuthProvider({ children }: { children: ReactNode }) {
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
      console.log('[KC-AUTH] Fetching user data from /api/auth/me...')
      const response = await authApi.getMe()
      console.log('[KC-AUTH] User data received:', response.data)
      console.log('[KC-AUTH] display_name:', response.data.display_name)
      setUser(response.data)
    } catch (error) {
      console.error('[KC-AUTH] Failed to fetch user data:', error)
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
        console.log('[KC-AUTH] Clearing existing token refresh timeout')
        clearTimeout(refreshTimeoutId)
        setRefreshTimeoutId(null)
      }

      const token = TokenManager.getAccessToken()
      if (!token) {
        console.log('[KC-AUTH] No token found, skipping refresh setup')
        return
      }

      // Use OAuth2 standard: get expiry from stored expires_in (not JWT decode)
      const expiry = TokenManager.getTokenExpiry()
      if (!expiry) {
        console.log('[KC-AUTH] No expiry info stored, skipping refresh setup')
        return
      }

      const { expiresAt, expiresIn } = expiry

      // If token is already expired or expires in less than 0 seconds, don't set up refresh
      if (expiresIn <= 0) {
        console.warn('[KC-AUTH] Token already expired, skipping refresh setup')
        setIsAuthenticated(false)
        setUserInfo(null)
        setUser(null)
        return
      }

      const refreshAt = Math.max(0, expiresIn - 60) // Refresh 60s before expiry

      console.log('[KC-AUTH] Setting up token refresh (OAuth2 standard):', {
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        expiresIn: `${Math.floor(expiresIn / 60)}m ${expiresIn % 60}s`,
        refreshIn: `${Math.floor(refreshAt / 60)}m ${refreshAt % 60}s`
      })

      const timeoutId = setTimeout(async () => {
        try {
          console.log('[KC-AUTH] Refreshing token...')
          if (!backendConfig?.url) {
            throw new Error('Backend URL not configured')
          }
          const newTokens = await TokenManager.refreshAccessToken(backendConfig.url)
          TokenManager.storeTokens(newTokens)
          console.log('[KC-AUTH] ✅ Token refreshed successfully')

          // Update context state
          setIsAuthenticated(true)
          const info = TokenManager.getUserInfo()
          setUserInfo(info)

          // Fetch fresh user data
          await fetchUserData()

          // Schedule next refresh
          setupTokenRefresh()
        } catch (error) {
          console.error('[KC-AUTH] ❌ Token refresh failed:', error)
          // Token refresh failed - clear auth state (will trigger redirect to login)
          setIsAuthenticated(false)
          setUserInfo(null)
          setUser(null)
          TokenManager.clearTokens()
        }
      }, refreshAt * 1000)

      setRefreshTimeoutId(timeoutId)
      console.log('[KC-AUTH] ✅ Token refresh scheduled')
    } catch (error) {
      console.error('[KC-AUTH] Error setting up token refresh:', error)
    }
  }

  useEffect(() => {
    // Re-check auth state on mount (in case token expired between initial check and mount)
    const authenticated = TokenManager.isAuthenticated()
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
      }
    } else if (authenticated && !user) {
      // If already authenticated but no user data, fetch it
      fetchUserData()
      // Set up token refresh if not already set
      if (!refreshTimeoutId) {
        setupTokenRefresh()
      }
    }

    // Clean up on unmount
    return () => {
      if (refreshTimeoutId) {
        console.log('[KC-AUTH] Cleaning up token refresh timeout on unmount')
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

    // Build Keycloak login URL (async because of PKCE SHA-256)
    const loginUrl = await TokenManager.buildLoginUrl({
      keycloakUrl: keycloakConfig.url,
      realm: keycloakConfig.realm,
      clientId: keycloakConfig.clientId,
      redirectUri: `${window.location.origin}/oauth/callback`,
      state,
    })

    // Redirect to Keycloak
    window.location.href = loginUrl
  }

  const register = async (redirectUri?: string) => {
    // Save current location for return after registration
    const returnUrl = redirectUri || window.location.pathname + window.location.search
    sessionStorage.setItem('login_return_url', returnUrl)

    // Generate CSRF state
    const state = generateState()
    sessionStorage.setItem('oauth_state', state)

    // Build Keycloak registration URL - uses /registrations endpoint instead of /auth
    const registrationUrl = await TokenManager.buildLoginUrl({
      keycloakUrl: keycloakConfig.url,
      realm: keycloakConfig.realm,
      clientId: keycloakConfig.clientId,
      redirectUri: `${window.location.origin}/oauth/callback`,
      state,
    })

    // Replace /auth with /registrations to trigger Keycloak registration screen
    const registrationEndpoint = registrationUrl.replace('/protocol/openid-connect/auth', '/protocol/openid-connect/registrations')

    // Redirect to Keycloak registration
    window.location.href = registrationEndpoint
  }

  const logout = (redirectUri?: string) => {
    // Build logout URL FIRST (needs id_token from storage)
    // Important: Keycloak requires exact match, so add trailing slash to origin
    const defaultRedirectUri = `${window.location.origin}/`
    const logoutUrl = TokenManager.buildLogoutUrl({
      keycloakUrl: keycloakConfig.url,
      realm: keycloakConfig.realm,
      redirectUri: redirectUri || defaultRedirectUri,
    })

    // THEN clear tokens (after we've read id_token for logout URL)
    TokenManager.clearTokens()
    setIsAuthenticated(false)
    setUserInfo(null)
    setUser(null)

    // Redirect to Keycloak logout
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
    console.log('[KC-AUTH] Received tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      hasIdToken: !!tokens.id_token,
      tokenPreview: tokens.access_token?.substring(0, 30) + '...'
    })

    // Store tokens
    TokenManager.storeTokens(tokens)
    console.log('[KC-AUTH] Tokens stored in sessionStorage')

    // Verify storage worked
    const storedToken = sessionStorage.getItem('kc_access_token')
    console.log('[KC-AUTH] Verified storage:', {
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

  const getAccessToken = () => {
    return TokenManager.getAccessToken()
  }

  return (
    <KeycloakAuthContext.Provider
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
    </KeycloakAuthContext.Provider>
  )
}

export function useKeycloakAuth() {
  const context = useContext(KeycloakAuthContext)
  if (context === undefined) {
    throw new Error('useKeycloakAuth must be used within a KeycloakAuthProvider')
  }
  return context
}

// Helper function
function generateState(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15)
}
