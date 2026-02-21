import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext'
import AuthHeader from '../components/auth/AuthHeader'
import { LogIn, ExternalLink, UserPlus } from 'lucide-react'
import { setupApi } from '../services/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading, login, register } = useKeycloakAuth()
  const [hasUsers, setHasUsers] = React.useState<boolean | null>(null)

  // Parse query parameters once
  const searchParams = new URLSearchParams(location.search)
  const isLauncherMode = searchParams.get('launcher') === 'true'
  const returnTo = searchParams.get('returnTo')

  // Get the intended destination from router state (set by ProtectedRoute) or from query param
  // Default to /cluster instead of / to avoid redirect loop
  const from = (location.state as { from?: string })?.from || returnTo || '/cluster'

  // Check if any users exist in Keycloak — if not, disable Login to force registration
  React.useEffect(() => {
    setupApi.getSetupStatus()
      .then(res => setHasUsers(res.data.keycloak_user_count > 0))
      .catch(() => setHasUsers(true)) // Default to allowing login if check fails
  }, [])

  // After successful login, redirect to intended destination
  // Note: Don't redirect if we're on the callback page - that's handled by OAuthCallback component
  React.useEffect(() => {
    if (isAuthenticated && location.pathname !== '/oauth/callback') {
      console.log('[LoginPage] Already authenticated, redirecting to:', from)
      navigate(from, { replace: true, state: { fromAuth: true } })
    }
  }, [isAuthenticated, navigate, from, location.pathname])

  const handleLogin = async () => {
    console.log('[LoginPage] Login button clicked')

    // If in launcher mode, open in external browser
    if (isLauncherMode) {
      console.log('[LoginPage] Launcher mode detected, opening in browser')
      const url = new URL(window.location.href)
      url.searchParams.delete('launcher')
      window.open(url.toString(), '_blank')
      return
    }

    // Redirect to Keycloak login page
    console.log('[LoginPage] Starting Keycloak SSO login, redirect target:', from)
    try {
      await login(from)
    } catch (error) {
      console.error('[LoginPage] Login failed:', error)
    }
  }

  const handleRegister = async () => {
    console.log('[LoginPage] Register button clicked')

    // If in launcher mode, open in external browser
    if (isLauncherMode) {
      console.log('[LoginPage] Launcher mode detected, opening in browser')
      const url = new URL(window.location.href)
      url.searchParams.delete('launcher')
      url.searchParams.set('register', 'true')
      window.open(url.toString(), '_blank')
      return
    }

    // Redirect to Keycloak registration page
    console.log('[LoginPage] Starting Keycloak SSO registration, redirect target:', from)
    try {
      await register(from)
    } catch (error) {
      console.error('[LoginPage] Registration failed:', error)
    }
  }

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div
        className="flex-1 flex flex-col"
        style={{ backgroundColor: 'var(--surface-900)' }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center space-x-3">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2"
              style={{ borderColor: 'var(--primary-400)' }}
            ></div>
            <span style={{ color: 'var(--text-secondary)' }}>Checking authentication...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex-1 flex flex-col relative overflow-hidden"
      style={{ backgroundColor: '#0a0a0a' }}
      data-testid="login-page"
    >
      {/* Geometric grid background pattern */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }}
      />

      {/* Diagonal cross pattern overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{
          background: `
            linear-gradient(45deg, transparent 48%, rgba(255, 255, 255, 0.01) 49%, rgba(255, 255, 255, 0.01) 51%, transparent 52%),
            linear-gradient(-45deg, transparent 48%, rgba(255, 255, 255, 0.01) 49%, rgba(255, 255, 255, 0.01) 51%, transparent 52%)
          `,
          backgroundSize: '120px 120px',
        }}
      />

      <div className="flex-1 flex items-center justify-center py-4 px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-md w-full space-y-4 sm:space-y-6">
          <AuthHeader subtitle="Sign in with your account" />

          {/* Login Card */}
          <div
            className="rounded-lg shadow-xl p-5 sm:p-8 space-y-4 sm:space-y-6 animate-slide-up"
            style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #27272a',
            }}
          >
            {isLauncherMode && (
              <div
                className="rounded-lg p-4 mb-4"
                style={{
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                }}
              >
                <div className="flex items-start space-x-3">
                  <ExternalLink className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold mb-1">Authentication Required</p>
                    <p className="opacity-90">
                      Authentication must be completed in your browser. Click below to continue.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="text-center space-y-2">
              <h2 className="text-lg sm:text-xl font-semibold" style={{ color: '#ffffff' }}>
                Welcome to Ushadow
              </h2>
              <p className="text-sm" style={{ color: '#a1a1aa' }}>
                Secure authentication powered by Keycloak
              </p>
            </div>

            {/* Sign in with Keycloak Button */}
            <div className="space-y-4">
              {/* Login disabled when no users exist — register first */}
              {hasUsers === false && (
                <p className="text-center text-sm" style={{ color: '#f59e0b' }} data-testid="login-no-users-notice">
                  No users registered yet. Please register to create the first account.
                </p>
              )}
              <button
                onClick={handleLogin}
                disabled={hasUsers === false}
                className="w-full flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                }}
                data-testid="login-button-keycloak"
              >
                <LogIn className="h-5 w-5" />
                <span>Sign in with Keycloak</span>
              </button>

              <button
                onClick={handleRegister}
                className="w-full flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{
                  backgroundColor: '#9333ea',
                  color: '#ffffff',
                  border: 'none',
                }}
                data-testid="register-button-keycloak"
              >
                <UserPlus className="h-5 w-5" />
                <span>Register with Keycloak</span>
              </button>

              <div className="text-center">
                <p className="text-xs" style={{ color: '#71717a' }}>
                  You'll be redirected to Keycloak for authentication
                </p>
              </div>
            </div>
          </div>

          {/* Info Card */}
          <div
            className="rounded-lg p-4 text-sm"
            style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #27272a',
              color: '#a1a1aa',
            }}
          >
            <p className="text-center">
              New to Ushadow? Your administrator will provide you with access credentials.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
