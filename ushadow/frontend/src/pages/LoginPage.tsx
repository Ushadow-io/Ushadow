import React, { useState, useEffect } from 'react'
import React, { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Layers, Eye, EyeOff } from 'lucide-react'
import EnvironmentBanner from '../components/layout/EnvironmentBanner'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const { user, login, setupRequired, isLoading: authLoading } = useAuth()

  // After successful login, redirect to dashboard
  useEffect(() => {
    if (user) {
      console.log('Login successful, redirecting to dashboard...')
      navigate('/', { replace: true })
    }
  }, [user, navigate])

  // Show loading while checking setup status
  if (setupRequired === null || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-blue-50/30 to-neutral-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 flex flex-col">
        <EnvironmentBanner />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="text-neutral-600 dark:text-neutral-400">Checking setup status...</span>
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
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-blue-50/30 to-neutral-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 flex flex-col relative overflow-hidden">
      <EnvironmentBanner />
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        {/* Decorative background blur circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-300/20 dark:bg-blue-600/10 rounded-full blur-3xl"></div>
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
            <div className="hidden h-32 w-32 mx-auto bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl items-center justify-center shadow-lg">
              <Layers className="h-16 w-16 text-white" />
            </div>
          </div>
          <h2 className="text-6xl font-bold bg-gradient-to-r from-blue-600 via-primary-600 to-blue-800 dark:from-blue-400 dark:via-primary-400 dark:to-blue-600 bg-clip-text text-transparent tracking-tight mb-1">
            Ushadow
          </h2>
          <p className="mt-3 text-base text-neutral-600 dark:text-neutral-400 font-medium tracking-wide">
            AI Orchestration Platform
          </p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-500">
            Sign in to your account
          </p>
        </div>

        {/* Login Form */}
        <div className="card shadow-xl backdrop-blur-sm bg-white/90 dark:bg-neutral-800/90 p-8 space-y-6 animate-slide-up">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
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
                className="appearance-none relative block w-full px-4 py-3 border border-neutral-300 dark:border-neutral-600 placeholder-neutral-500 dark:placeholder-neutral-400 text-neutral-900 dark:text-neutral-100 rounded-lg bg-white dark:bg-neutral-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm"
                placeholder="your@email.com"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
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
                  className="appearance-none relative block w-full px-4 py-3 pr-12 border border-neutral-300 dark:border-neutral-600 placeholder-neutral-500 dark:placeholder-neutral-400 text-neutral-900 dark:text-neutral-100 rounded-lg bg-white dark:bg-neutral-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
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
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 border border-transparent text-base font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>
          </form>

          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400 pt-2">
            Ushadow Dashboard v0.1.0
          </p>
        </div>
      </div>
      </div>
    </div>
  )
}
