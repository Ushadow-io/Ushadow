/**
 * Keycloak Authentication Test Page
 *
 * This page demonstrates the Keycloak OIDC flow.
 * Use it to test login, logout, and token management.
 */

import { useNavigate } from 'react-router-dom'
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext'

export default function KeycloakTestPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading, userInfo, login, logout } = useKeycloakAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-400 mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-900">
        <div className="max-w-md w-full bg-surface-800 rounded-xl p-8 border border-surface-500">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Keycloak Authentication Test
            </h1>
            <p className="text-text-secondary text-sm">
              Click below to test the Keycloak OIDC login flow
            </p>
          </div>

          <button
            onClick={() => login()}
            className="w-full px-6 py-3 font-semibold rounded-lg transition-all"
            style={{
              backgroundColor: '#4ade80',
              color: '#0f0f13'
            }}
            data-testid="keycloak-login-button"
          >
            Login with Keycloak
          </button>

          <div className="mt-6 p-4 bg-surface-700 rounded-lg">
            <h3 className="text-sm font-semibold text-text-primary mb-2">What happens next:</h3>
            <ol className="text-xs text-text-secondary space-y-1">
              <li>1. Redirect to Keycloak login page</li>
              <li>2. Enter credentials or use social login</li>
              <li>3. Return to this page authenticated</li>
            </ol>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-900">
      <div className="max-w-2xl w-full bg-surface-800 rounded-xl p-8 border border-surface-500">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-400/10 mb-4">
            <svg
              className="w-8 h-8 text-primary-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-primary-400 mb-2">
            Authentication Successful!
          </h1>
          <p className="text-text-secondary text-sm">
            You are now logged in via Keycloak OIDC
          </p>
        </div>

        {/* User Info */}
        <div className="bg-surface-700 rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4 uppercase tracking-wider">
            User Information
          </h2>
          <div className="space-y-3">
            {userInfo?.email && (
              <div className="flex justify-between">
                <span className="text-text-secondary text-sm">Email:</span>
                <span className="text-text-primary font-mono text-sm">{userInfo.email}</span>
              </div>
            )}
            {userInfo?.name && (
              <div className="flex justify-between">
                <span className="text-text-secondary text-sm">Name:</span>
                <span className="text-text-primary text-sm">{userInfo.name}</span>
              </div>
            )}
            {userInfo?.sub && (
              <div className="flex justify-between">
                <span className="text-text-secondary text-sm">User ID:</span>
                <span className="text-text-primary font-mono text-xs">{userInfo.sub}</span>
              </div>
            )}
            {userInfo?.exp && (
              <div className="flex justify-between">
                <span className="text-text-secondary text-sm">Token Expires:</span>
                <span className="text-text-primary text-sm">
                  {new Date(userInfo.exp * 1000).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => logout()}
            className="flex-1 px-6 py-3 font-semibold rounded-lg transition-all border"
            style={{
              backgroundColor: 'transparent',
              borderColor: '#3d3d4a',
              color: '#f4f4f5'
            }}
            data-testid="keycloak-logout-button"
          >
            Logout
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="flex-1 px-6 py-3 font-semibold rounded-lg transition-all"
            style={{
              backgroundColor: '#a855f7',
              color: '#ffffff'
            }}
          >
            Go to Dashboard
          </button>
        </div>

        {/* Technical Details */}
        <div className="mt-6 p-4 bg-surface-700 rounded-lg">
          <details>
            <summary className="text-xs font-semibold text-text-primary cursor-pointer select-none">
              Technical Details (expand)
            </summary>
            <pre className="mt-3 text-xs text-text-secondary overflow-auto">
              {JSON.stringify(userInfo, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  )
}
