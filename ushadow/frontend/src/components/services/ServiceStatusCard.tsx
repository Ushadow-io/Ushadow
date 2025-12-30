import { CheckCircle, XCircle, Loader2, Play } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

export type ServiceStatus = 'running' | 'starting' | 'stopped' | 'error'

export interface ServiceStatusCardProps {
  /** Unique identifier for the service (used for element IDs) */
  id: string
  /** Display name shown in the card */
  name: string
  /** Current status of the service */
  status: ServiceStatus
  /** Optional error message to display */
  error?: string
  /** Callback when start button is clicked */
  onStart: () => void
  /** Optional prefix for element IDs (default: 'service') */
  idPrefix?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusColor(status: ServiceStatus): string {
  switch (status) {
    case 'running':
      return 'bg-success-100 dark:bg-success-900/30 border-success-300 dark:border-success-700'
    case 'starting':
      return 'bg-warning-100 dark:bg-warning-900/30 border-warning-300 dark:border-warning-700'
    case 'error':
      return 'bg-error-100 dark:bg-error-900/30 border-error-300 dark:border-error-700'
    default:
      return 'bg-neutral-100 dark:bg-neutral-700/30 border-neutral-300 dark:border-neutral-600'
  }
}

function getStatusIcon(status: ServiceStatus): React.ReactNode {
  switch (status) {
    case 'running':
      return <CheckCircle className="w-5 h-5 text-success-600 dark:text-success-400" />
    case 'starting':
      return <Loader2 className="w-5 h-5 text-warning-600 dark:text-warning-400 animate-spin" />
    case 'error':
      return <XCircle className="w-5 h-5 text-error-600 dark:text-error-400" />
    default:
      return <div className="w-5 h-5 rounded-full border-2 border-neutral-400" />
  }
}

function getStatusLabel(status: ServiceStatus): string {
  switch (status) {
    case 'running':
      return 'Running'
    case 'starting':
      return 'Starting...'
    case 'error':
      return 'Error'
    default:
      return 'Stopped'
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * Minimal service status card for displaying service state with start action.
 *
 * Use this for simple service status display (e.g., in wizards) where full
 * configuration editing is not needed. For full-featured service management,
 * use ServiceCard instead.
 *
 * @example
 * <ServiceStatusCard
 *   id="chronicle"
 *   name="Chronicle"
 *   status="stopped"
 *   onStart={() => startService('chronicle')}
 *   idPrefix="quickstart"
 * />
 */
export function ServiceStatusCard({
  id,
  name,
  status,
  error,
  onStart,
  idPrefix = 'service',
}: ServiceStatusCardProps) {
  const canStart = status !== 'running' && status !== 'starting'

  return (
    <div
      id={`${idPrefix}-status-${id}`}
      className={`p-4 rounded-lg border-2 ${getStatusColor(status)} transition-colors`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon(status)}
          <div>
            <h3 className="font-medium text-neutral-900 dark:text-white">{name}</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {getStatusLabel(status)}
            </p>
          </div>
        </div>

        {canStart && (
          <button
            id={`${idPrefix}-start-${id}`}
            onClick={onStart}
            className="btn-primary flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Start
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-error-600 dark:text-error-400">{error}</p>
      )}
    </div>
  )
}

export default ServiceStatusCard
