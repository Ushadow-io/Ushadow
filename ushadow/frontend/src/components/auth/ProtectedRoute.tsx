import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

export default function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { user, token, isLoading, isAdmin, setupRequired } = useAuth()

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
    return <Navigate to="/login" replace />
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

  // Note: We no longer force first-time users to the wizard.
  // The dashboard/nav can show prompts, but users should always be able to navigate freely.

  return <>{children}</>
}
