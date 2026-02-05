import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext'
import AuthHeader from '../components/auth/AuthHeader'
import { LogIn, ExternalLink, User, Lock, AlertCircle } from 'lucide-react'
import { backendConfig } from '../auth/config'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading, login, register } = useKeycloakAuth()

  // Check if running in launcher mode (embedded iframe)
  const searchParams = new URLSearchParams(window.location.search)
  const isLauncherMode = searchParams.get('launcher') === 'true'

  // Native login state
  const [nativeEmail, setNativeEmail] = useState('')
  const [nativePassword, setNativePassword] = useState('')
  const [nativeLoading, setNativeLoading] = useState(false)
  const [nativeError, setNativeError] = useState<string | null>(null)

  // Get the intended destination from router state (set by ProtectedRoute)
  const from = (location.state as { from?: string })?.from || '/'

  // After successful login, redirect to intended destination
  // Note: Don't redirect if we're on the callback page - that's handled by OAuthCallback component
  React.useEffect(() => {
    if (isAuthenticated && location.pathname !== '/oauth/callback') {
      navigate(from, { replace: true, state: { fromAuth: true } })
    }
  }, [isAuthenticated, navigate, from, location.pathname])

  const handleLogin = () => {
    // If in launcher mode, open in external browser
    if (isLauncherMode) {
      // Remove launcher param and open in browser
      const url = new URL(window.location.href)
      url.searchParams.delete('launcher')
      window.open(url.toString(), '_blank')
      return
    }

    // Redirect to Keycloak login page
    login(from)
  }

  const handleRegister = () => {
    // If in launcher mode, open in external browser
    if (isLauncherMode) {
      const url = new URL(window.location.href)
      url.searchParams.delete('launcher')
      url.searchParams.set('register', 'true')
      window.open(url.toString(), '_blank')
      return
    }

    // Redirect to Keycloak registration page
    register(from)
  }

  const handleOpenInBrowser = () => {
    // Remove launcher param and open in browser
    const url = new URL(window.location.href)
    url.searchParams.delete('launcher')
    window.open(url.toString(), '_blank')
  }

  const handleNativeLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setNativeError(null)
    setNativeLoading(true)

    try {
      const response = await fetch(`${backendConfig.url}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: nativeEmail,
          password: nativePassword,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'Login failed')
      }

      const data = await response.json()

      // Store token in localStorage (persists across sessions)
      localStorage.setItem('ushadow_access_token', data.access_token)
      localStorage.setItem('ushadow_user', JSON.stringify(data.user))

      console.log('[NativeLogin] ✓ Login successful, navigating to:', from)

      // Navigate to intended destination
      navigate(from, { replace: true })
    } catch (err) {
      console.error('[NativeLogin] Login error:', err)
      setNativeError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setNativeLoading(false)
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
        <div className="max-w-md w-full space-y-6">
          <AuthHeader subtitle="Sign in with your account" />

          {/* Login Card */}
          <div
            className="rounded-lg shadow-xl p-8 space-y-6 animate-slide-up"
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
              <h2 className="text-xl font-semibold" style={{ color: '#ffffff' }}>
                Welcome to Ushadow
              </h2>
              <p className="text-sm" style={{ color: '#a1a1aa' }}>
                {isLauncherMode
                  ? 'Sign in with your credentials'
                  : 'Secure authentication powered by Keycloak'}
              </p>
            </div>

            {/* Native Login Form (Primary for launcher) */}
            {(isLauncherMode || true) && (
              <form onSubmit={handleNativeLogin} className="space-y-4">
                {nativeError && (
                  <div
                    className="rounded-lg p-3 flex items-start space-x-2"
                    style={{
                      backgroundColor: '#7f1d1d',
                      border: '1px solid #991b1b',
                    }}
                  >
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#fca5a5' }} />
                    <p className="text-sm" style={{ color: '#fecaca' }}>
                      {nativeError}
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium"
                    style={{ color: '#e4e4e7' }}
                  >
                    Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5" style={{ color: '#71717a' }} />
                    </div>
                    <input
                      id="email"
                      type="email"
                      value={nativeEmail}
                      onChange={(e) => setNativeEmail(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: '#27272a',
                        border: '1px solid #3f3f46',
                        color: '#ffffff',
                      }}
                      placeholder="you@example.com"
                      data-testid="native-email-input"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium"
                    style={{ color: '#e4e4e7' }}
                  >
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5" style={{ color: '#71717a' }} />
                    </div>
                    <input
                      id="password"
                      type="password"
                      value={nativePassword}
                      onChange={(e) => setNativePassword(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: '#27272a',
                        border: '1px solid #3f3f46',
                        color: '#ffffff',
                      }}
                      placeholder="••••••••"
                      data-testid="native-password-input"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={nativeLoading}
                  className="w-full flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
                  style={{
                    backgroundColor: '#22c55e',
                    color: '#ffffff',
                    border: 'none',
                  }}
                  data-testid="native-login-button"
                >
                  {nativeLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="h-5 w-5" />
                      <span>Sign In</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Divider */}
            {!isLauncherMode && (
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" style={{ borderColor: '#27272a' }}></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span style={{ backgroundColor: '#1a1a1a', color: '#71717a', padding: '0 8px' }}>
                    Or use SSO
                  </span>
                </div>
              </div>
            )}

            {/* Sign in with Keycloak Button */}
            {!isLauncherMode && (
              <>
                <button
                  onClick={handleLogin}
                  className="w-full flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
                  style={{
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                  }}
                  data-testid="login-button-keycloak"
                >
                  <LogIn className="h-5 w-5" />
                  <span>Sign in with Keycloak SSO</span>
                </button>

                <div className="text-center">
                  <p className="text-xs" style={{ color: '#71717a' }}>
                    You'll be redirected to Keycloak for SSO
                  </p>
                </div>
              </>
            )}
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
