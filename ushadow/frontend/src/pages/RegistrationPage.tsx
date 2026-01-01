import React, { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { setupApi } from '../services/api'
import { Layers, Eye, EyeOff } from 'lucide-react'
import { getStorageKey } from '../utils/storage'

export default function RegistrationPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const { setupRequired, user, isLoading: authLoading } = useAuth()

  // After successful registration, redirect to dashboard
  useEffect(() => {
    if (user) {
      console.log('Registration successful, redirecting to dashboard...')
      navigate('/', { replace: true })
    }
  }, [user, navigate])

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

  // Redirect to login if registration already completed
  // IMPORTANT: This must be after all hooks to follow Rules of Hooks
  if (setupRequired === false) {
    return <Navigate to="/login" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    // Validate password confirmation
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    // Validate password length
    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      setIsLoading(false)
      return
    }

    try {
      const response = await setupApi.createAdmin({
        display_name: displayName,
        email,
        password,
        confirm_password: confirmPassword,
      })

      // Store the token and reload auth context
      const { access_token } = response.data
      localStorage.setItem(getStorageKey('token'), access_token)

      // Reload the page to refresh auth context
      window.location.href = '/'
    } catch (error: any) {
      console.error('Registration failed:', error)

      // Parse error response
      let errorMessage = 'Registration failed. Please try again.'
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = 'Unable to connect to server. Please check your connection and try again.'
      }

      setError(errorMessage)
      setIsLoading(false)
    }
  }

  return (
    <div
      className="flex-1 flex flex-col relative overflow-hidden"
      style={{ backgroundColor: 'var(--surface-900)' }}
      data-testid="registration-page"
    >
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        {/* Decorative background blur circles - brand green and purple */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
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
              Create your admin account to get started
            </p>
          </div>

          {/* Registration Form */}
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
                  htmlFor="displayName"
                  className="block text-sm font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Display Name
                </label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  autoComplete="name"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="appearance-none block w-full px-4 py-3 rounded-lg transition-all sm:text-sm focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'var(--surface-700)',
                    border: '1px solid var(--surface-400)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="Enter your name"
                  data-testid="register-name-input"
                />
              </div>
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
                  data-testid="register-email-input"
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
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 pr-12 rounded-lg transition-all sm:text-sm focus:outline-none focus:ring-1"
                    style={{
                      backgroundColor: 'var(--surface-700)',
                      border: '1px solid var(--surface-400)',
                      color: 'var(--text-primary)',
                    }}
                    placeholder="Min 8 characters"
                    data-testid="register-password-input"
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
              <div className="space-y-2">
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 pr-12 rounded-lg transition-all sm:text-sm focus:outline-none focus:ring-1"
                    style={{
                      backgroundColor: 'var(--surface-700)',
                      border: '1px solid var(--surface-400)',
                      color: 'var(--text-primary)',
                    }}
                    placeholder="Re-enter password"
                    data-testid="register-confirm-password-input"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-4 flex items-center transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    data-testid="toggle-confirm-password-visibility"
                  >
                    {showConfirmPassword ? (
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
                  data-testid="register-error"
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
                    backgroundImage: 'linear-gradient(135deg, #4ade80 0%, #a855f7 100%)',
                    color: 'var(--surface-900)',
                    boxShadow: '0 0 20px rgba(74, 222, 128, 0.2), 0 0 40px rgba(168, 85, 247, 0.2)',
                  }}
                  data-testid="register-submit-button"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div
                        className="animate-spin rounded-full h-5 w-5 border-2 border-t-transparent"
                        style={{ borderColor: 'var(--surface-900)' }}
                      ></div>
                      <span>Creating account...</span>
                    </div>
                  ) : (
                    'Create Admin Account'
                  )}
                </button>
              </div>
            </form>

            <p
              className="text-center text-xs pt-2"
              style={{ color: 'var(--text-muted)' }}
            >
              ushadow Dashboard v0.1.0
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
