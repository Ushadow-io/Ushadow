import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useWizard } from '../../contexts/WizardContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

export default function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { user, token, isLoading, isAdmin, setupRequired } = useAuth()
  const { isFirstTimeUser, getSetupLabel } = useWizard()
  const location = useLocation()

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

  if (!token || !user) {
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
