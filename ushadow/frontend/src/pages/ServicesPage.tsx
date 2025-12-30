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
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [changingProvider, setChangingProvider] = useState<string | null>(null)
  // Provider inline editing (like services)
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [providerEditForm, setProviderEditForm] = useState<Record<string, string>>({})
  const [savingProvider, setSavingProvider] = useState(false)

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

  // Get deployments for a specific service (most recent per node only)
  const getServiceDeployments = (serviceId: string) => {
    const serviceDeployments = deployments.filter(d => d.service_id === serviceId)

    // Group by node and keep only the most recent
    const byNode = new Map<string, Deployment>()
    for (const d of serviceDeployments) {
      const existing = byNode.get(d.unode_hostname)
      if (!existing || (d.created_at && existing.created_at && new Date(d.created_at) > new Date(existing.created_at))) {
        byNode.set(d.unode_hostname, d)
      }
    }

    return Array.from(byNode.values())
  }

  // Group services by category
  const servicesByCategory = serviceInstances.reduce((acc, service) => {
    // Get category from ui.category, template (legacy), or first tag
    let category = service.ui?.category
      || (service.template ? service.template.split('.')[0] : null)
      || service.tags?.[0]
      || 'other'

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

      {/* Provider Selection - Card-based UI */}
      {Array.isArray(capabilities) && capabilities.length > 0 && (
        <div className="space-y-6">
          {capabilities.map(cap => {
            // Show installed providers (selected + defaults) and any that are configured
            const installedProviders = cap.providers.filter(p =>
              p.is_selected || p.is_default || p.configured
            )
            const availableProviders = cap.providers.filter(p =>
              !p.is_selected && !p.is_default && !p.configured
            )

            return (
              <div key={cap.id} className="card p-6" data-testid={`provider-section-${cap.id}`}>
                {/* Capability Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 capitalize">
                      {cap.id.replace('_', ' ')} Providers
                    </h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {cap.description}
                    </p>
                  </div>
                  {availableProviders.length > 0 && (
                    <div className="relative group">
                      <button
                        className="btn-ghost text-sm flex items-center gap-1.5"
                        data-testid={`add-provider-${cap.id}`}
                      >
                        <Plus className="h-4 w-4" />
                        Add Provider
                      </button>
                      {/* Dropdown for available providers */}
                      <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                        <div className="p-2 space-y-1">
                          {availableProviders.map(provider => (
                            <button
                              key={provider.id}
                              onClick={() => handleProviderChange(cap.id, provider.id)}
                              className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center justify-between"
                            >
                              <span>{provider.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                provider.mode === 'cloud'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                              }`}>
                                {provider.mode}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Provider Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {installedProviders.map(provider => {
                    const isSelected = provider.id === cap.selected_provider
                    const isChanging = changingProvider === cap.id
                    const providerKey = getProviderKey(cap.id, provider.id)
                    const isExpanded = expandedProviders.has(providerKey)
                    const isEditing = editingProviderId === providerKey
                    // Use API-provided configured/missing status
                    const isConfigured = provider.configured
                    const missingFields = provider.missing || []
                    // Still need credentials for the edit form
                    const editableCreds = (provider.credentials || []).filter(c => c.settings_path)

                    return (
                      <div
                        key={provider.id}
                        data-testid={`provider-card-${cap.id}-${provider.id}`}
                        className={`relative rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500/20'
                            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800'
                        }`}
                      >
                        {/* Card Header - Clickable to expand/collapse */}
                        <div
                          className={`p-4 cursor-pointer ${!isEditing ? 'hover:opacity-80' : ''}`}
                          onClick={() => !isEditing && toggleProviderExpanded(cap.id, provider.id)}
                        >
                          <div className="flex items-start gap-3">
                            {/* Mode Icon */}
                            <div className={`p-2 rounded-lg ${
                              provider.mode === 'cloud'
                                ? 'bg-blue-100 dark:bg-blue-900/30'
                                : 'bg-purple-100 dark:bg-purple-900/30'
                            }`}>
                              {provider.mode === 'cloud' ? (
                                <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                              ) : (
                                <HardDrive className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                                {provider.name}
                              </h3>
                              <span className={`text-xs ${
                                provider.mode === 'cloud'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-purple-600 dark:text-purple-400'
                              }`}>
                                {provider.mode === 'cloud' ? 'Cloud Service' : 'Self-Hosted'}
                              </span>
                            </div>

                            {/* Right side: Status + Select + Expand */}
                            <div className="flex items-center gap-2">
                              {/* Configuration status indicator */}
                              {editableCreds.length > 0 && (
                                isConfigured ? (
                                  <span title="Configured">
                                    <CheckCircle className="h-4 w-4 text-success-500" />
                                  </span>
                                ) : (
                                  <span title={missingFields.length > 0
                                    ? `Missing: ${missingFields.map(f => f.label).join(', ')}`
                                    : 'Not configured'
                                  }>
                                    <AlertCircle className="h-4 w-4 text-warning-500" />
                                  </span>
                                )
                              )}

                              {/* Select/Selected indicator */}
                              {isSelected ? (
                                <span className="text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30 px-2 py-0.5 rounded">
                                  Active
                                </span>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleProviderChange(cap.id, provider.id)
                                  }}
                                  disabled={isChanging}
                                  className="text-xs font-medium text-neutral-600 hover:text-primary-600 dark:text-neutral-400 dark:hover:text-primary-400 px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-600 hover:border-primary-400 transition-colors"
                                >
                                  Select
                                </button>
                              )}

                              {/* Expand chevron */}
                              <div className="text-neutral-400">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Description */}
                          {provider.description && !isExpanded && (
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2 line-clamp-1">
                              {provider.description}
                            </p>
                          )}
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-0 border-t border-neutral-200 dark:border-neutral-700">
                            {/* Description (full) */}
                            {provider.description && (
                              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3 mb-3">
                                {provider.description}
                              </p>
                            )}

                            {/* Missing fields warning */}
                            {!isConfigured && missingFields.length > 0 && !isEditing && (
                              <div
                                data-testid={`missing-fields-${provider.id}`}
                                className="flex items-start gap-2 p-2 rounded-lg bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 mt-3"
                              >
                                <AlertCircle className="h-4 w-4 text-warning-500 mt-0.5 flex-shrink-0" />
                                <div className="text-xs">
                                  <span className="font-medium text-warning-700 dark:text-warning-300">
                                    Missing required fields:
                                  </span>
                                  <span className="text-warning-600 dark:text-warning-400 ml-1">
                                    {missingFields.map(f => f.label).join(', ')}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Credentials */}
                            {editableCreds.length > 0 && (
                              <div className="space-y-3 mt-3">
                                {editableCreds.map(cred => {
                                  const isSecret = cred.type === 'secret'
                                  // Use full capability:provider:cred key to prevent collision
                                  const scopedKey = `${cap.id}:${provider.id}:${cred.key}`

                                  return (
                                    <div key={scopedKey} data-testid={`credential-${scopedKey}`}>
                                      {isEditing ? (
                                        <>
                                          <div className="flex items-center justify-between mb-1">
                                            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                                              {cred.label || cred.key}
                                              {cred.required && <span className="text-error-500 ml-1">*</span>}
                                            </label>
                                            {cred.link && (
                                              <a
                                                href={cred.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-primary-600 hover:underline"
                                              >
                                                Get key →
                                              </a>
                                            )}
                                          </div>
                                          <input
                                            type={isSecret ? 'password' : 'text'}
                                            value={providerEditForm[scopedKey] || ''}
                                            onChange={(e) => setProviderEditForm(prev => ({
                                              ...prev,
                                              [scopedKey]: e.target.value
                                            }))}
                                            placeholder={
                                              isSecret
                                                ? (cred.has_value ? '••••••••' : `Enter ${cred.label || cred.key}`)
                                                : (cred.value || cred.default || `Enter ${cred.label || cred.key}`)
                                            }
                                            className="input w-full text-sm"
                                            data-testid={`credential-input-${scopedKey}`}
                                          />
                                          {cred.has_value && (
                                            <p className="mt-1 text-xs text-success-600 dark:text-success-400">
                                              Currently set (leave blank to keep)
                                            </p>
                                          )}
                                        </>
                                      ) : (
                                        <div className="flex items-baseline gap-2">
                                          <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                                            {cred.label || cred.key}:
                                          </span>
                                          <span className="text-xs font-mono flex-1 truncate">
                                            {isSecret ? (
                                              cred.has_value ? '••••••••' : (
                                                <span className="text-warning-600 dark:text-warning-400">Not set</span>
                                              )
                                            ) : (
                                              cred.value || cred.default || (
                                                <span className="text-warning-600 dark:text-warning-400">Not set</span>
                                              )
                                            )}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={handleCancelProviderEdit}
                                    className="btn-ghost text-xs flex items-center gap-1"
                                  >
                                    <X className="h-4 w-4" />
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleSaveProvider(cap.id, provider)}
                                    disabled={savingProvider}
                                    className="btn-primary text-xs flex items-center gap-1"
                                  >
                                    {savingProvider ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="h-4 w-4" />
                                    )}
                                    {savingProvider ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              ) : (
                                editableCreds.length > 0 && (
                                  <button
                                    onClick={() => handleEditProvider(cap.id, provider)}
                                    className="btn-ghost text-xs flex items-center gap-1"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                    {isConfigured ? 'Edit' : 'Configure'}
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        )}

                        {/* Loading overlay */}
                        {isChanging && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-neutral-800/50 rounded-xl">
                            <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

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
