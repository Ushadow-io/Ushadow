import { Navigate } from 'react-router-dom'
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext'

interface FeatureRouteProps {
  featureFlag: string
  children: React.ReactNode
}

/**
 * Route wrapper that redirects to dashboard if the required feature flag is disabled.
 * This prevents direct URL access to feature-flagged pages when the feature is off.
 */
export default function FeatureRoute({ featureFlag, children }: FeatureRouteProps) {
  const { isEnabled, loading } = useFeatureFlags()

  // While loading, show nothing to prevent flash
  if (loading) {
    return null
  }

  // If feature is disabled, redirect to dashboard
  if (!isEnabled(featureFlag)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
