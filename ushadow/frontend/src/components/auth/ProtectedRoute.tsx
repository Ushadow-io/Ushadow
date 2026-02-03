import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useKeycloakAuth } from '../../contexts/KeycloakAuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

export default function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { user, token, isLoading: authLoading, isAdmin, setupRequired } = useAuth()
  const { isAuthenticated: kcAuthenticated, isLoading: kcLoading } = useKeycloakAuth()
  const location = useLocation()

  // Combined loading state - wait for both auth systems to check
  const isLoading = authLoading || kcLoading

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // Redirect to registration if required
  if (setupRequired === true) {
    return <Navigate to="/register" replace />
  }

  // Check if user is authenticated via either method:
  // 1. Legacy JWT (token + user from AuthContext)
  // 2. Keycloak OAuth (isAuthenticated from KeycloakAuthContext)
  const isAuthenticated = (token && user) || kcAuthenticated

  console.log('[ProtectedRoute] Auth check:', {
    pathname: location.pathname,
    hasToken: !!token,
    hasUser: !!user,
    kcAuthenticated,
    isAuthenticated,
    willRedirect: !isAuthenticated
  })

  if (!isAuthenticated) {
    console.log('[ProtectedRoute] Not authenticated, redirecting to login from:', location.pathname)
    // Preserve the intended destination so login can redirect back
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (adminOnly && !isAdmin) {
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

  // Note: First-time user wizard redirect logic has been moved to Layout component
  // where WizardProvider context is available

  return <>{children}</>
}
