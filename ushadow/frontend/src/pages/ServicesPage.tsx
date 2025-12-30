import { useEffect, useState, useCallback } from 'react'
import {
  Server,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { ServicesProvider, useServices } from '../contexts/ServicesContext'
import { useDockerEvents } from '../hooks/useDockerEvents'
import {
  ServiceCard,
  ServiceStatsCards,
  ServiceCategoryList,
  DEFAULT_CATEGORIES,
} from '../components/services'
import ConfirmDialog from '../components/ConfirmDialog'
import AddServiceModal from '../components/AddServiceModal'

// ============================================================================
// Inner Component (uses context)
// ============================================================================

function ServicesPageContent() {
  const {
    serviceInstances,
    serviceConfigs,
    serviceStatuses,
    loading,
    saving,
    message,
    confirmDialog,
    editingService,
    editForm,
    validationErrors,
    expandedConfigs,
    showAllConfigs,
    startingService,
    togglingEnabled,
    loadData,
    startService,
    stopService,
    confirmStopService,
    cancelStopService,
    toggleEnabled,
    startEditing,
    saveConfig,
    cancelEditing,
    setEditFormField,
    toggleConfigExpanded,
    setShowAllConfigs,
    setMessage,
  } = useServices()

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['memory', 'llm', 'transcription'])
  )
  const [showAddServiceModal, setShowAddServiceModal] = useState(false)

  // Load data on mount
  useEffect(() => {
    loadData()
  }, [loadData])

  // Subscribe to Docker events for real-time updates
  const handleDockerEvent = useCallback(
    (action: string) => {
      if (['start', 'stop', 'die', 'restart'].includes(action)) {
        loadData()
      }
    },
    [loadData]
  )
  useDockerEvents(handleDockerEvent)

  // Group services by category
  const servicesByCategory = serviceInstances.reduce((acc, service) => {
    const category = service.template?.split('.')[0] || 'other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(service)
    return acc
  }, {} as Record<string, typeof serviceInstances>)

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-neutral-400 mx-auto mb-4 animate-spin" />
          <p className="text-neutral-600 dark:text-neutral-400">Loading services...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Server className="h-8 w-8 text-neutral-600 dark:text-neutral-400" />
            <h1 id="services-page-title" className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
              Services
            </h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Manage service providers and integrations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            id="toggle-all-configs"
            onClick={() => setShowAllConfigs(!showAllConfigs)}
            className="btn-ghost text-sm flex items-center gap-2"
          >
            {showAllConfigs ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Collapse All Details
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Expand All Details
              </>
            )}
          </button>
          <button
            id="add-service-button"
            className="btn-primary flex items-center space-x-2"
            onClick={() => setShowAddServiceModal(true)}
            data-testid="add-service-button"
          >
            <Plus className="h-5 w-5" />
            <span>Add Service</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <ServiceStatsCards
        totalServices={serviceInstances.length}
        configuredServices={Object.keys(serviceConfigs).length}
        categoryCount={DEFAULT_CATEGORIES.length}
      />

      {/* Message */}
      {message && (
        <div
          id="services-message"
          role="alert"
          aria-live="polite"
          aria-atomic="true"
          className={`card p-4 border ${
            message.type === 'success'
              ? 'bg-success-50 dark:bg-success-900/20 border-success-200 text-success-700'
              : 'bg-error-50 dark:bg-error-900/20 border-error-200 text-error-700'
          }`}
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5" />
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* Service Categories */}
      <ServiceCategoryList
        categories={DEFAULT_CATEGORIES}
        servicesByCategory={servicesByCategory}
        expandedCategories={expandedCategories}
        onToggleCategory={toggleCategory}
        renderServiceCard={(service) => (
          <ServiceCard
            key={service.service_id}
            service={service}
            config={serviceConfigs[service.service_id] || {}}
            containerStatus={serviceStatuses[service.service_id]}
            isExpanded={showAllConfigs || expandedConfigs.has(service.service_id)}
            isEditing={editingService === service.service_id}
            editForm={editForm}
            validationErrors={validationErrors}
            isSaving={saving}
            isStarting={startingService === service.service_id}
            isTogglingEnabled={togglingEnabled === service.service_id}
            onToggleExpand={() => toggleConfigExpanded(service.service_id)}
            onStart={() => startService(service.service_id)}
            onStop={() => stopService(service.service_id)}
            onToggleEnabled={() => toggleEnabled(service.service_id, service.enabled)}
            onStartEdit={() => startEditing(service.service_id)}
            onSave={() => saveConfig(service.service_id)}
            onCancelEdit={cancelEditing}
            onFieldChange={setEditFormField}
          />
        )}
      />

      {/* Empty State */}
      {Object.keys(serviceConfigs).length === 0 && (
        <div id="services-empty-state" className="card p-12 text-center">
          <Server className="h-16 w-16 text-neutral-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            No services configured
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">
            Complete the setup wizard to configure your default services
          </p>
          <button
            id="start-wizard-button"
            onClick={() => (window.location.href = '/wizard/start')}
            className="btn-primary"
          >
            Start Setup Wizard
          </button>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Stop Service"
        message={`Are you sure you want to stop ${confirmDialog.serviceName}? This will shut down the service container.`}
        confirmLabel="Stop Service"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={confirmStopService}
        onCancel={cancelStopService}
      />

      {/* Screen reader announcements */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message?.text}
      </div>

      {/* Add Service Modal */}
      <AddServiceModal
        isOpen={showAddServiceModal}
        onClose={() => setShowAddServiceModal(false)}
        onServiceInstalled={() => {
          loadData()
          setMessage({ type: 'success', text: 'Service installed successfully' })
        }}
      />
    </div>
  )
}

// ============================================================================
// Page Component (provides context)
// ============================================================================

/**
 * Services management page.
 *
 * Wraps content with ServicesProvider to supply state and actions.
 * The inner component handles all rendering and event handling.
 */
export default function ServicesPage() {
  return (
    <ServicesProvider>
      <ServicesPageContent />
    </ServicesProvider>
  )
}
