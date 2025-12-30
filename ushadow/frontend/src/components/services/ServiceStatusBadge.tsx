import { Loader2, PlayCircle, StopCircle, LucideIcon } from 'lucide-react'
import type { ServiceStatusResult } from '../../hooks/useServiceStatus'
import type { ServiceInstance } from '../../contexts/ServicesContext'

// ============================================================================
// Types
// ============================================================================

interface ServiceStatusBadgeProps {
  /** The service instance */
  service: ServiceInstance
  /** Computed status from useServiceStatus hook */
  status: ServiceStatusResult
  /** Whether service is currently starting */
  isStarting: boolean
  /** Callback when Start button is clicked */
  onStart: () => void
  /** Callback when Stop button is clicked */
  onStop: () => void
}

// ============================================================================
// Color/Style Mappings
// ============================================================================

const colorClasses = {
  success: 'text-success-700 dark:text-success-300',
  error: 'text-error-700 dark:text-error-300',
  neutral: 'text-neutral-600 dark:text-neutral-400',
  warning: 'text-warning-700 dark:text-warning-300',
} as const

const bgClasses = {
  success: 'bg-success-100 dark:bg-success-900/30',
  error: 'bg-error-100 dark:bg-error-900/30',
  neutral: 'bg-neutral-100 dark:bg-neutral-800',
  warning: 'bg-warning-100 dark:bg-warning-900/30',
} as const

// ============================================================================
// Component
// ============================================================================

/**
 * Actionable status badge for services.
 *
 * For local services that can be started/stopped, renders a clickable button.
 * For cloud services or non-actionable states, renders a static badge.
 *
 * @example
 * <ServiceStatusBadge
 *   service={service}
 *   status={status}
 *   isStarting={startingService === service.service_id}
 *   onStart={() => startService(service.service_id)}
 *   onStop={() => stopService(service.service_id)}
 * />
 */
export function ServiceStatusBadge({
  service,
  status,
  isStarting,
  onStart,
  onStop,
}: ServiceStatusBadgeProps) {
  const Icon = status.icon as LucideIcon

  // Only make clickable for enabled local services with start/stop capability
  const isClickable = service.enabled && service.mode === 'local' && (status.canStart || status.canStop)

  const handleClick = () => {
    if (status.canStart) {
      onStart()
    } else if (status.canStop) {
      onStop()
    }
  }

  // Render clickable Start/Stop button
  if (isClickable) {
    const isStopButton = status.canStop

    return (
      <button
        id={`status-badge-${service.service_id}`}
        onClick={handleClick}
        disabled={isStarting}
        aria-label={status.canStart ? `Start ${service.name}` : `Stop ${service.name}`}
        className="group focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
      >
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all group-hover:ring-2 ${
            isStopButton
              ? 'bg-error-100 dark:bg-error-900/30 group-hover:ring-error-400 group-hover:bg-error-200 dark:group-hover:bg-error-800'
              : 'bg-success-100 dark:bg-success-900/30 group-hover:ring-success-400 group-hover:bg-success-200 dark:group-hover:bg-success-800'
          }`}
        >
          {isStarting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-success-700 dark:text-success-300" />
          ) : status.canStart ? (
            <PlayCircle className="h-3.5 w-3.5 text-success-700 dark:text-success-300" />
          ) : (
            <StopCircle className="h-3.5 w-3.5 text-error-700 dark:text-error-300" />
          )}
          <span
            className={`text-xs font-medium ${
              isStopButton
                ? 'text-error-700 dark:text-error-300'
                : 'text-success-700 dark:text-success-300'
            }`}
          >
            {status.canStart ? 'Start' : 'Stop'}
          </span>
        </div>
      </button>
    )
  }

  // Render static badge for non-actionable states
  return (
    <div
      id={`status-badge-${service.service_id}`}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${bgClasses[status.color]}`}
    >
      <Icon className={`h-4 w-4 ${colorClasses[status.color]}`} />
      <span className={`text-xs font-medium ${colorClasses[status.color]}`}>
        {status.label}
      </span>
    </div>
  )
}

export default ServiceStatusBadge
