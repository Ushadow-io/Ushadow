import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useKeycloakAuth } from '../../contexts/KeycloakAuthContext'
import { useWizard } from '../../contexts/WizardContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

export default function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { user, token, isLoading, isAdmin, setupRequired } = useAuth()
  const { isAuthenticated: isKeycloakAuthenticated, isLoading: isKeycloakLoading } = useKeycloakAuth()
  const { isFirstTimeUser, getSetupLabel } = useWizard()
  const location = useLocation()

  // Show loading if either auth system is still loading
  if (isLoading || isKeycloakLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // Accept authentication from EITHER legacy auth OR Keycloak
  const isAuthenticatedViaEither = (token && user) || isKeycloakAuthenticated

  if (!isAuthenticatedViaEither) {
    // Preserve the intended destination so login can redirect back
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  // Admin-only routes require legacy auth (Keycloak users don't have admin permissions yet)
  if (adminOnly) {
    if (isKeycloakAuthenticated && !user) {
      // Keycloak user trying to access admin route
      return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
          <div className="card p-8 text-center animate-fade-in">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
              Access Denied
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Admin features require a local Ushadow account.
            </p>
          </div>
        </div>
      )
    }
    if (!isAdmin) {
      return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
          <div className="card p-8 text-center animate-fade-in">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
              Access Denied
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              You don't have permission to access this page.
            </p>
          </div>
        </div>
      )
    }
  }

  // Redirect first-time users to wizard ONLY if they just came from login/register
  // This prevents redirect loops when accessing the app directly
  // Check sessionStorage for registration hard-reload case (cleared after reading)
  const sessionFromAuth = sessionStorage.getItem('fromAuth') === 'true'
  if (sessionFromAuth) {
    sessionStorage.removeItem('fromAuth')
  }
  const fromAuth = location.state?.from === '/login' ||
                   location.state?.from === '/register' ||
                   location.state?.fromAuth === true ||
                   sessionFromAuth
  if (isFirstTimeUser() && fromAuth && !location.pathname.startsWith('/wizard')) {
    const { path } = getSetupLabel()
    return <Navigate to={path} replace />
  }

  return <>{children}</>
}
