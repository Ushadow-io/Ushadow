/**
 * OAuth Callback Handler
 *
 * Handles the redirect from Keycloak after login.
 * Exchanges authorization code for tokens and redirects to original page.
 */

import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext'
import { TokenManager } from './TokenManager'

export default function OAuthCallback() {
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(true)
  const navigate = useNavigate()
  const { handleCallback } = useKeycloakAuth()
  const hasProcessed = useRef(false)

  useEffect(() => {
    // Prevent duplicate processing (React StrictMode runs effects twice in dev)
    if (hasProcessed.current) {
      return
    }
    hasProcessed.current = true

    async function processCallback() {
      try {
        // Extract code and state from URL
        const { code, error: oauthError, error_description, state } =
          TokenManager.extractTokensFromCallback(window.location.href)

        // Check for OAuth errors
        if (oauthError) {
          throw new Error(error_description || oauthError)
        }

        // Ensure we have a code
        if (!code) {
          throw new Error('Missing authorization code')
        }

        // Ensure we have state (required for CSRF protection)
        if (!state) {
          throw new Error('Missing state parameter')
        }

        console.log('[OAuthCallback] 📝 Code extracted, clearing URL to prevent reuse...')
        // CRITICAL: Clear the URL params immediately to prevent the code from being reused
        // if this component remounts (which can happen in React StrictMode or during navigation)
        window.history.replaceState({}, document.title, window.location.pathname)

        // Exchange code for tokens (includes state verification)
        await handleCallback(code, state)

        // Get return URL or default to dashboard
        const returnUrl = sessionStorage.getItem('login_return_url') || '/'
        sessionStorage.removeItem('login_return_url')

        console.log('[OAuthCallback] ✅ Success! Redirecting to:', returnUrl)


        // Small delay to ensure auth state propagates through React context
        await new Promise(resolve => setTimeout(resolve, 100))

        // Redirect to original page
        navigate(returnUrl, { replace: true })
      } catch (err) {
        console.error('OAuth callback error:', err)
        setError(err instanceof Error ? err.message : 'Authentication failed')
        setProcessing(false)
      }
    }

    processCallback()
  }, [handleCallback, navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-900">
        <div className="bg-surface-800 p-8 rounded-lg border border-red-500 max-w-md">
          <h2 className="text-xl font-bold text-red-400 mb-4">
            Authentication Error
          </h2>
          <p className="text-text-primary mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full px-4 py-2 bg-surface-700 hover:bg-surface-600 text-text-primary rounded transition"
          >
            Return Home
          </button>
        </div>
      </div>
    )
  }

  if (processing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Completing sign-in...</p>
        </div>
      </div>
    )
  }

  return null
}
