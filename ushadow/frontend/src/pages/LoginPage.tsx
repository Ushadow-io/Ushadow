import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext'
import AuthHeader from '../components/auth/AuthHeader'
import { LogIn } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading, login, register } = useKeycloakAuth()

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
    // Redirect to Keycloak login page
    login(from)
  }

  const handleRegister = () => {
    // Redirect to Keycloak registration page
    register(from)
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
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold" style={{ color: '#ffffff' }}>
                Welcome to Ushadow
              </h2>
              <p className="text-sm" style={{ color: '#a1a1aa' }}>
                Secure authentication powered by Keycloak
              </p>
            </div>

            {/* Sign in with Keycloak Button */}
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
              <span>Sign in with Keycloak</span>
            </button>

            <div className="text-center">
              <p className="text-xs" style={{ color: '#71717a' }}>
                You'll be redirected to Keycloak for secure authentication
              </p>
            </div>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: '#27272a' }}></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span style={{ backgroundColor: '#1a1a1a', color: '#71717a', padding: '0 8px' }}>
                  Or
                </span>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm" style={{ color: '#a1a1aa' }}>
                Don't have an account?{' '}
                <button
                  onClick={handleRegister}
                  className="font-medium hover:underline transition-colors"
                  style={{ color: '#3b82f6' }}
                  data-testid="register-link"
                >
                  Create one now
                </button>
              </p>
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
