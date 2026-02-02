import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext'
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
        <div className="max-w-md w-full space-y-3">
          <AuthHeader subtitle="Sign in to your account" />

          {/* Login Form Card */}
          <div
            className="rounded-lg shadow-xl p-8 space-y-5 animate-slide-up"
            style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #27272a',
            }}
          >
            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
              {/* Email Field */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-normal mb-1.5"
                  style={{ color: '#ffffff' }}
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@example.com"
                  className="w-full px-3.5 py-2.5 text-base rounded border transition-all focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: '#0f0f0f',
                    color: '#ffffff',
                    borderColor: '#27272a',
                  }}
                  data-testid="login-field-email"
                />
              </div>

              {/* Password Field */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-normal mb-1.5"
                  style={{ color: '#ffffff' }}
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 text-base rounded border transition-all focus:outline-none focus:ring-2 pr-10"
                    style={{
                      backgroundColor: '#0f0f0f',
                      color: '#ffffff',
                      borderColor: '#27272a',
                    }}
                    data-testid="login-field-password"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded"
                    style={{ color: '#71717a' }}
                    aria-label="Toggle password visibility"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Remember me and Forgot password */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    style={{ accentColor: '#3B82F6' }}
                    data-testid="login-remember-me"
                  />
                  <label
                    htmlFor="remember-me"
                    className="ml-2 text-sm"
                    style={{ color: '#ffffff' }}
                  >
                    Remember me
                  </label>
                </div>
                <a
                  href="#"
                  className="text-sm hover:underline"
                  style={{ color: '#60a5fa' }}
                  onClick={(e) => {
                    e.preventDefault()
                    // TODO: Implement forgot password flow
                  }}
                >
                  Forgot Password?
                </a>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                className="w-full py-2.5 px-4 text-base font-medium rounded shadow-md hover:shadow-lg transition-all"
                style={{
                  backgroundColor: '#3B82F6',
                  color: '#ffffff',
                }}
                data-testid="login-submit"
              >
                Sign In
              </button>
            </form>

            {/* Register Link */}
            <div
              className="pt-5 text-center text-sm"
              style={{
                borderTop: '1px solid #27272a',
              }}
            >
              <span style={{ color: '#52525b' }}>New user? </span>
              <button
                onClick={handleRegister}
                className="font-medium hover:underline"
                style={{ color: '#4ade80' }}
                data-testid="login-register-link"
              >
                Register
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
