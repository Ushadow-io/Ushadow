import {
  Cloud,
  HardDrive,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
  Loader2,
} from 'lucide-react'
import { useServiceStatus } from '../../hooks/useServiceStatus'
import type { ServiceInstance, ContainerStatus } from '../../contexts/ServicesContext'
import { ServiceStatusBadge } from './ServiceStatusBadge'
import { ServiceConfigForm } from './ServiceConfigForm'

// ============================================================================
// Types
// ============================================================================

interface ServiceCardProps {
  /** The service instance */
  service: ServiceInstance
  /** Current saved config for this service */
  config: Record<string, any>
  /** Container status for this service (local services only) */
  containerStatus: ContainerStatus | undefined
  /** Whether this card's config is expanded */
  isExpanded: boolean
  /** Whether this service is being edited */
  isEditing: boolean
  /** Current form values (only used in edit mode) */
  editForm: Record<string, any>
  /** Validation errors by field key */
  validationErrors: Record<string, string>
  /** Whether save is in progress */
  isSaving: boolean
  /** Whether this service is starting */
  isStarting: boolean
  /** Whether enabled toggle is in progress */
  isTogglingEnabled: boolean
  /** Callback when card is clicked (to expand/collapse) */
  onToggleExpand: () => void
  /** Callback to start the service */
  onStart: () => void
  /** Callback to stop the service */
  onStop: () => void
  /** Callback to toggle enabled state */
  onToggleEnabled: () => void
  /** Callback to enter edit mode */
  onStartEdit: () => void
  /** Callback to save configuration */
  onSave: () => void
  /** Callback to cancel editing */
  onCancelEdit: () => void
  /** Callback when a form field changes */
  onFieldChange: (key: string, value: any) => void
}

// ============================================================================
// Helper Functions
// ============================================================================

function getBorderClasses(service: ServiceInstance, state: string): string {
  // Disabled services get grayed out appearance
  if (!service.enabled) {
    return 'border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800/50 shadow-sm opacity-60'
  }
  if (state === 'running') {
    return 'border-success-400 dark:border-success-600 bg-white dark:bg-neutral-900 shadow-sm'
  }
  if (state === 'active' || state === 'stopped') {
    return 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm'
  }
  if (state === 'not_configured' || state === 'error') {
    return 'border-warning-200 dark:border-warning-800 bg-warning-50/30 dark:bg-warning-950/20 shadow-sm'
  }
  return 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm'
}

// ============================================================================
// Component
// ============================================================================

/**
 * Individual service card displaying name, status, toggle, and configuration.
 *
 * Renders cloud/local mode icon, actionable status badge, enable/disable toggle,
 * and expandable configuration form.
 *
 * @example
 * <ServiceCard
 *   service={service}
 *   config={serviceConfigs[service.service_id]}
 *   containerStatus={serviceStatuses[service.service_id]}
 *   isExpanded={expandedConfigs.has(service.service_id)}
 *   isEditing={editingService === service.service_id}
 *   editForm={editForm}
 *   validationErrors={validationErrors}
 *   isSaving={saving}
 *   isStarting={startingService === service.service_id}
 *   isTogglingEnabled={togglingEnabled === service.service_id}
 *   onToggleExpand={() => toggleConfigExpanded(service.service_id)}
 *   onStart={() => startService(service.service_id)}
 *   onStop={() => stopService(service.service_id)}
 *   onToggleEnabled={() => toggleEnabled(service.service_id, service.enabled)}
 *   onStartEdit={() => startEditing(service.service_id)}
 *   onSave={() => saveConfig(service.service_id)}
 *   onCancelEdit={cancelEditing}
 *   onFieldChange={setEditFormField}
 * />
 */
export function ServiceCard({
  service,
  config,
  containerStatus,
  isExpanded,
  isEditing,
  editForm,
  validationErrors,
  isSaving,
  isStarting,
  isTogglingEnabled,
  onToggleExpand,
  onStart,
  onStop,
  onToggleEnabled,
  onStartEdit,
  onSave,
  onCancelEdit,
  onFieldChange,
}: ServiceCardProps) {
  const status = useServiceStatus(service, config, containerStatus)
  const isConfigured = config && Object.keys(config).length > 0
  const borderClasses = getBorderClasses(service, status.state)

  const handleCardClick = () => {
    // Don't toggle if editing
    if (!isEditing) {
      onToggleExpand()
    }
  }

  return (
    <div
      id={`service-card-${service.service_id}`}
      className={`border rounded-lg transition-all ${borderClasses} ${!isEditing ? 'cursor-pointer' : ''}`}
      onClick={handleCardClick}
    >
      <div className="p-4">
        {/* Service Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-1">
            {/* Service name with mode icon */}
            {service.mode === 'cloud' ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                  {service.name}
                </h3>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800">
                <HardDrive className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <h3 className="font-semibold text-purple-900 dark:text-purple-100">
                  {service.name}
                </h3>
              </div>
            )}

            {/* Setup warning */}
            {status.state === 'not_configured' && (
              <span className="inline-flex items-center gap-1 text-xs text-warning-700 dark:text-warning-300">
                <AlertCircle className="h-3.5 w-3.5" />
                Setup Required
              </span>
            )}
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {/* Status Badge */}
            {!isEditing && (
              <ServiceStatusBadge
                service={service}
                status={status}
                isStarting={isStarting}
                onStart={onStart}
                onStop={onStop}
              />
            )}

            {/* Enable/Disable Toggle */}
            {!isEditing && (
              <button
                id={`toggle-enabled-${service.service_id}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleEnabled()
                }}
                disabled={isTogglingEnabled}
                aria-label={service.enabled ? `Disable ${service.name}` : `Enable ${service.name}`}
                className="flex items-center gap-1 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                title={service.enabled ? 'Click to disable' : 'Click to enable'}
              >
                {isTogglingEnabled ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : service.enabled ? (
                  <ToggleRight className="h-5 w-5 text-success-600 dark:text-success-400" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-neutral-400" />
                )}
              </button>
            )}

            {/* Expand indicator */}
            {!isEditing && (
              <div className="flex items-center text-neutral-400">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
          {service.description}
        </p>
      </div>

      {/* Configuration Section - Collapsible */}
      {(isConfigured || isEditing) && service.config_schema && service.config_schema.length > 0 && (
        <>
          {(isEditing || isExpanded) && (
            <ServiceConfigForm
              service={service}
              config={config}
              isEditing={isEditing}
              editForm={editForm}
              validationErrors={validationErrors}
              isSaving={isSaving}
              canConfigure={status.canConfigure || false}
              onFieldChange={onFieldChange}
              onStartEdit={onStartEdit}
              onSave={onSave}
              onCancel={onCancelEdit}
            />
          )}
        </>
      )}

      {/* "Click to setup" text for unconfigured services */}
      {status.state === 'not_configured' && !isEditing && !isExpanded && (
        <div className="px-4 pb-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
            Click to setup
          </p>
        </div>
      )}
    </div>
  )
}

export default ServiceCard
