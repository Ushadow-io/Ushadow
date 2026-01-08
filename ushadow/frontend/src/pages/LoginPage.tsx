import React, { useState, useEffect } from 'react'
import { useNavigate, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Layers, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  const { user, login, setupRequired, isLoading: authLoading } = useAuth()

  // Get the intended destination from router state (set by ProtectedRoute)
  const from = (location.state as { from?: string })?.from || '/'

  // After successful login, redirect to intended destination
  useEffect(() => {
    if (user) {
      console.log('Login successful, redirecting to:', from)
      navigate(from, { replace: true, state: { fromAuth: true } })
    }
  }, [user, navigate, from])

  // Show loading while checking setup status
  if (setupRequired === null || authLoading) {
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
            <span style={{ color: 'var(--text-secondary)' }}>Checking setup status...</span>
          </div>
        </div>
      </div>
    )
  }

  // Redirect to registration if required
  // IMPORTANT: This must be after all hooks to follow Rules of Hooks
  if (setupRequired === true) {
    return <Navigate to="/register" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    const result = await login(email, password)
    if (!result.success) {
      // Show specific error message based on error type
      if (result.errorType === 'connection_failure') {
        setError('Unable to connect to server. Please check your connection and try again.')
      } else if (result.errorType === 'authentication_failure') {
        setError('Invalid email or password')
      } else {
        setError(result.error || 'Login failed. Please try again.')
      }
    }
    setIsLoading(false)
  }

  return (
    <div
      className="flex-1 flex flex-col relative overflow-hidden"
      style={{ backgroundColor: 'var(--surface-900)' }}
      data-testid="login-page"
    >
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        {/* Decorative background blur circles - brand green and purple */}
        {/* Using fixed positioning so glows extend to viewport edges, not container edges */}
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

        <div className="max-w-md w-full space-y-8 relative z-10">
          {/* Powered by Chronicle badge */}
          <div className="text-center mb-6">
            <a
              href="https://github.com/chronicler-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'rgba(168, 85, 247, 0.15)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                color: 'var(--accent-300, #c4b5fd)',
              }}
              data-testid="chronicle-badge"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
              Powered with Chronicle
            </a>
          </div>

          {/* Logo & Header */}
          <div className="text-center animate-fade-in">
            <div className="mx-auto mb-8 transform transition-transform hover:scale-105">
              <img
                src="/logo.png"
                alt="uShadow Logo"
                className="h-72 w-72 mx-auto object-contain drop-shadow-2xl"
                onError={(e) => {
                  // Fallback to icon if logo doesn't load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <div
                className="hidden h-32 w-32 mx-auto rounded-2xl items-center justify-center shadow-lg"
                style={{ background: 'linear-gradient(135deg, #4ade80 0%, #a855f7 100%)' }}
              >
                <Layers className="h-16 w-16 text-white" />
              </div>
            </div>
            <h2
              className="text-6xl font-bold tracking-tight mb-1"
              style={{
                background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 50%, #a855f7 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Ushadow
            </h2>
            <p
              className="mt-3 text-base font-medium tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              AI Orchestration Platform
            </p>
            <p
              className="mt-1 text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              Sign in to your account
            </p>
          </div>

          {/* Login Form */}
          <div
            className="rounded-xl shadow-xl backdrop-blur-sm p-8 space-y-6 animate-slide-up"
            style={{
              backgroundColor: 'var(--surface-800)',
              border: '1px solid var(--surface-500)',
            }}
          >
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-4 py-3 rounded-lg transition-all sm:text-sm focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--surface-700)',
                    border: '1px solid var(--surface-400)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="your@email.com"
                  data-testid="login-email-input"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 pr-12 rounded-lg transition-all sm:text-sm focus:outline-none focus:ring-1"
                    style={{
                      backgroundColor: 'var(--surface-700)',
                      border: '1px solid var(--surface-400)',
                      color: 'var(--text-primary)',
                    }}
                    placeholder="Enter your password"
                    data-testid="login-password-input"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-4 flex items-center transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="toggle-password-visibility"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  className="rounded-lg p-4"
                  style={{
                    backgroundColor: 'rgba(248, 113, 113, 0.1)',
                    border: '1px solid rgba(248, 113, 113, 0.3)',
                  }}
                  data-testid="login-error"
                >
                  <p className="text-sm" style={{ color: 'var(--error-400)' }}>{error}</p>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 text-base font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    backgroundColor: '#4ade80',
                    color: 'var(--surface-900)',
                    boxShadow: '0 0 20px rgba(74, 222, 128, 0.2)',
                  }}
                  data-testid="login-submit-button"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div
                        className="animate-spin rounded-full h-5 w-5 border-2 border-t-transparent"
                        style={{ borderColor: 'var(--surface-900)' }}
                      ></div>
                      <span>Signing in...</span>
                    </div>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </div>
            </form>

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
