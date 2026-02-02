import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext'
import { LogIn, UserPlus } from 'lucide-react'
import AuthHeader from '../components/auth/AuthHeader'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading, login } = useKeycloakAuth()

  // Get the intended destination from router state (set by ProtectedRoute)
  const from = (location.state as { from?: string })?.from || '/'

  // After successful login, redirect to intended destination
  React.useEffect(() => {
    if (isAuthenticated) {
      console.log('Login successful, redirecting to:', from)
      navigate(from, { replace: true, state: { fromAuth: true } })
    }
  }, [isAuthenticated, navigate, from])

  const handleLogin = () => {
    // Redirect to Keycloak login page
    login(from)
  }

  const handleRegister = async () => {
    // Save return URL
    sessionStorage.setItem('login_return_url', from)

    // Generate CSRF state
    const state = Math.random().toString(36).substring(2, 15) +
                  Math.random().toString(36).substring(2, 15)
    sessionStorage.setItem('oauth_state', state)

    // Import TokenManager for PKCE support
    const { TokenManager } = await import('../auth/TokenManager')
    const keycloakConfig = {
      url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8081',
      realm: import.meta.env.VITE_KEYCLOAK_REALM || 'ushadow',
      clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'ushadow-frontend',
    }

    // Build login URL with PKCE (includes code_challenge and code_challenge_method)
    const loginUrl = await TokenManager.buildLoginUrl({
      keycloakUrl: keycloakConfig.url,
      realm: keycloakConfig.realm,
      clientId: keycloakConfig.clientId,
      redirectUri: `${window.location.origin}/oauth/callback`,
      state,
    })

    console.log('[REGISTER] Login URL generated:', loginUrl)

    // Keycloak registration: Add kc_action=register parameter to the auth URL
    // This tells Keycloak to show the registration form instead of login
    const registrationUrl = loginUrl + '&kc_action=register'

    console.log('[REGISTER] Registration URL:', registrationUrl)
    console.log('[REGISTER] URL includes code_challenge_method:', registrationUrl.includes('code_challenge_method'))

    // Redirect to Keycloak registration
    window.location.href = registrationUrl
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
      style={{ backgroundColor: 'var(--surface-900)' }}
      data-testid="login-page"
    >
      <div className="flex-1 flex items-center justify-center py-4 px-4 sm:px-6 lg:px-8">
        {/* Decorative background blur circles - brand green and purple */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl"
            style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
          ></div>
          <div
            className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl"
            style={{ backgroundColor: 'rgba(74, 222, 128, 0.15)' }}
          ></div>
        </div>

        <div className="max-w-md w-full space-y-3 relative z-10">
          <AuthHeader subtitle="Sign in to your account" />

          {/* Login/Registration Options */}
          <div
            className="rounded-xl shadow-xl backdrop-blur-sm p-6 space-y-4 animate-slide-up"
            style={{
              backgroundColor: 'var(--surface-800)',
              border: '1px solid var(--surface-500)',
            }}
          >
            <div className="space-y-4">
              {/* Login Button */}
              <button
                onClick={handleLogin}
                className="w-full py-3 px-4 text-base font-semibold rounded-lg shadow-md hover:shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-2"
                style={{
                  backgroundColor: '#4ade80',
                  color: 'var(--surface-900)',
                  boxShadow: '0 0 20px rgba(74, 222, 128, 0.2)',
                }}
                data-testid="login-button"
              >
                <LogIn className="h-5 w-5" />
                <span>Sign In</span>
              </button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" style={{ borderColor: 'var(--surface-500)' }}></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span
                    className="px-2 text-xs"
                    style={{
                      backgroundColor: 'var(--surface-800)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    New to Ushadow?
                  </span>
                </div>
              </div>

              {/* Register Button */}
              <button
                onClick={handleRegister}
                className="w-full py-3 px-4 text-base font-semibold rounded-lg shadow-md hover:shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-2"
                style={{
                  backgroundColor: 'transparent',
                  color: '#a855f7',
                  border: '2px solid #a855f7',
                  boxShadow: '0 0 20px rgba(168, 85, 247, 0.2)',
                }}
                data-testid="register-button"
              >
                <UserPlus className="h-5 w-5" />
                <span>Create Account</span>
              </button>
            </div>

            {/* Info Box */}
            <div
              className="mt-6 p-4 rounded-lg"
              style={{
                backgroundColor: 'var(--surface-700)',
                border: '1px solid var(--surface-500)',
              }}
            >
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Secure Authentication
              </h3>
              <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
                <li>• Enterprise-grade security with Keycloak</li>
                <li>• Works across all Ushadow environments</li>
                <li>• Password reset and account management included</li>
              </ul>
            </div>

            <p
              className="text-center text-xs pt-2"
              style={{ color: 'var(--text-muted)' }}
            >
              Ushadow Dashboard v0.1.0
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
