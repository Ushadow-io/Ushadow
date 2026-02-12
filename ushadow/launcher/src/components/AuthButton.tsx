import { useState, useEffect } from 'react'
import { LogIn, LogOut, User, Loader2 } from 'lucide-react'
import { tauri, type UshadowEnvironment } from '../hooks/useTauri'
import { TokenManager } from '../services/tokenManager'
import { generateCodeVerifier, generateCodeChallenge, generateState } from '../utils/pkce'

interface AuthButtonProps {
  // Optional: Pass specific environment to auth against
  // If not provided, will use first running environment
  environment?: UshadowEnvironment | null
  // Show as large button in center of page (for login prompt)
  variant?: 'header' | 'centered'
}

export function AuthButton({ environment, variant = 'header' }: AuthButtonProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check auth status when environment changes
  useEffect(() => {
    if (!environment) {
      setIsLoading(false)
      return
    }

    checkAuthStatus()
  }, [environment])

  const checkAuthStatus = () => {
    if (TokenManager.isAuthenticated()) {
      const userInfo = TokenManager.getUserInfo()
      setIsAuthenticated(true)
      setUsername(userInfo?.preferred_username || userInfo?.email || 'User')
    } else {
      setIsAuthenticated(false)
    }
    setIsLoading(false)
  }

  const handleLogin = async () => {
    if (!environment) {
      alert('No environment selected. Please start an environment first.')
      return
    }

    setIsLoading(true)

    try {
      console.log('[AuthButton] Starting OAuth flow with HTTP callback server...')

      // Get backend URL from environment
      const backendUrl = `http://localhost:${environment.backend_port}`

      // Fetch Keycloak config from backend
      console.log('[AuthButton] Fetching Keycloak config from backend...')
      const configResponse = await fetch(`${backendUrl}/api/settings/config`)
      if (!configResponse.ok) {
        throw new Error('Failed to fetch config from backend')
      }
      const config = await configResponse.json()
      const keycloakUrl = config.keycloak?.public_url || 'http://localhost:8081'
      console.log('[AuthButton] Using Keycloak URL:', keycloakUrl)

      // Start OAuth callback server
      console.log('[AuthButton] Starting OAuth callback server...')
      const [port, callbackUrl] = await tauri.startOAuthServer()
      console.log('[AuthButton] ✓ Callback server running on port:', port)
      console.log('[AuthButton] Callback URL:', callbackUrl)

      // Register callback URL with Keycloak
      console.log('[AuthButton] Registering callback URL with Keycloak...')
      const registerResponse = await fetch(`${backendUrl}/api/auth/register-redirect-uri`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          redirect_uri: callbackUrl,
        }),
      })

      if (!registerResponse.ok) {
        const error = await registerResponse.text()
        throw new Error(`Failed to register callback URL: ${error}`)
      }
      console.log('[AuthButton] ✓ Callback URL registered')

      // Generate PKCE parameters
      const codeVerifier = generateCodeVerifier()
      const codeChallenge = await generateCodeChallenge(codeVerifier)
      const state = generateState()

      // Store for callback validation
      localStorage.setItem('pkce_code_verifier', codeVerifier)
      localStorage.setItem('oauth_state', state)
      localStorage.setItem('oauth_backend_url', backendUrl)

      // Build Keycloak login URL
      const authUrl = new URL(`${keycloakUrl}/realms/ushadow/protocol/openid-connect/auth`)
      authUrl.searchParams.set('client_id', 'ushadow-frontend')
      authUrl.searchParams.set('redirect_uri', callbackUrl)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', 'openid profile email')
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('code_challenge', codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')

      // Open system browser
      console.log('[AuthButton] Opening system browser...')
      await tauri.openBrowser(authUrl.toString())
      console.log('[AuthButton] ✓ Browser opened, waiting for callback...')

      // Wait for OAuth callback (this will block until callback or timeout)
      const result = await tauri.waitForOAuthCallback(port)

      if (!result.success || !result.code || !result.state) {
        throw new Error(result.error || 'Login failed or cancelled')
      }

      console.log('[AuthButton] ✓ Callback received')

      // Validate state (CSRF protection)
      const savedState = localStorage.getItem('oauth_state')
      if (result.state !== savedState) {
        throw new Error('Invalid state parameter - possible CSRF attack')
      }

      // Exchange code for tokens
      const savedCodeVerifier = localStorage.getItem('pkce_code_verifier')
      if (!savedCodeVerifier) {
        throw new Error('Missing PKCE code verifier')
      }

      console.log('[AuthButton] Exchanging code for tokens...')
      const tokenResponse = await fetch(`${backendUrl}/api/auth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: result.code,
          code_verifier: savedCodeVerifier,
          redirect_uri: callbackUrl,
        }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${error}`)
      }

      const tokens = await tokenResponse.json()

      // Store tokens
      TokenManager.storeTokens(tokens)
      console.log('[AuthButton] ✓ Login successful')

      // Clean up
      localStorage.removeItem('oauth_state')
      localStorage.removeItem('pkce_code_verifier')
      localStorage.removeItem('oauth_backend_url')

      // Update UI
      checkAuthStatus()
    } catch (error) {
      console.error('[AuthButton] Login error:', error)
      alert(`Login failed: ${error}`)
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    TokenManager.clearTokens()
    setIsAuthenticated(false)
    setUsername(null)

    // Optionally open Keycloak logout page
    if (environment) {
      try {
        const backendUrl = `http://localhost:${environment.backend_port}`
        const configResponse = await fetch(`${backendUrl}/api/settings/config`)
        if (configResponse.ok) {
          const config = await configResponse.json()
          const keycloakUrl = config.keycloak?.public_url || 'http://localhost:8081'
          const logoutUrl = `${keycloakUrl}/realms/ushadow/protocol/openid-connect/logout`
          await tauri.openBrowser(logoutUrl)
        }
      } catch (error) {
        console.error('[AuthButton] Logout error:', error)
      }
    }
  }

  // Don't show button if no environment
  if (!environment) {
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-800">
        <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
      </div>
    )
  }

  if (isAuthenticated) {
    if (variant === 'centered') {
      return null // Don't show anything when authenticated in centered mode
    }

    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-800">
          <User className="w-4 h-4 text-primary-400" />
          <span className="text-sm text-text-primary">{username}</span>
        </div>
        <button
          onClick={handleLogout}
          className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors text-text-muted hover:text-text-primary"
          title="Logout"
          data-testid="logout-button"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // Centered variant - large button in middle of page
  if (variant === 'centered') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <div className="text-center mb-8 max-w-md">
          <h2 className="text-2xl font-bold mb-4 text-text-primary">Authentication Required</h2>
          <p className="text-text-secondary mb-2">
            You need to log in to access Ushadow environments.
          </p>
          <p className="text-sm text-text-muted">
            Click below to open the login page in your browser.
          </p>
        </div>

        <button
          onClick={handleLogin}
          className="flex items-center gap-3 px-8 py-4 rounded-xl bg-primary-500 hover:bg-primary-600 transition-all text-white font-semibold text-lg hover:shadow-lg hover:shadow-primary-500/20 active:scale-95"
          data-testid="login-button-centered"
        >
          <LogIn className="w-6 h-6" />
          Login with Keycloak
        </button>

        {environment && (
          <p className="text-xs text-text-muted mt-6">
            Environment: <span className="text-text-secondary">{environment.name}</span> •
            Port: <span className="text-text-secondary">{environment.webui_port}</span>
          </p>
        )}
      </div>
    )
  }

  // Header variant - compact button
  return (
    <button
      onClick={handleLogin}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 transition-colors text-white font-medium text-sm"
      data-testid="login-button"
    >
      <LogIn className="w-4 h-4" />
      Login
    </button>
  )
}
