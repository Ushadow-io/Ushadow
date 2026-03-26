import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useCasdoorAuth } from '../../contexts/CasdoorAuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

export default function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useCasdoorAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  console.log('[ProtectedRoute] Auth check:', {
    pathname: location.pathname,
    isAuthenticated,
    willRedirect: !isAuthenticated
  })

  if (!isAuthenticated) {
    console.log('[ProtectedRoute] Not authenticated, redirecting to login from:', location.pathname)
    // Preserve the intended destination so login can redirect back
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  // TODO: Implement role-based admin check if needed
  if (adminOnly) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="card p-8 text-center animate-fade-in">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
            Access Denied
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Admin-only feature (role check not yet implemented)
          </p>
        </div>
      </div>
    )
  }

  // Note: First-time user wizard redirect logic has been moved to Layout component
  // where WizardProvider context is available

  return <>{children}</>
}
