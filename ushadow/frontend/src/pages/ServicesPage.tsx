import { useState, useEffect } from 'react'
import {
  Server,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Edit2,
  Save,
  X,
  Plus,
  RefreshCw,
  Circle,
  PlayCircle,
  StopCircle,
  Loader2,
  Cloud,
  HardDrive,
  ToggleLeft,
  ToggleRight
} from 'lucide-react'
import { servicesApi, settingsApi, dockerApi } from '../services/api'
import ConfirmDialog from '../components/ConfirmDialog'
import AddServiceModal from '../components/AddServiceModal'

interface ServiceInstance {
  service_id: string
  name: string
  description: string
  template: string
  mode: 'cloud' | 'local'
  is_default: boolean
  enabled: boolean
  config_schema: any[]
  tags: string[]
}

export default function ServicesPage() {
  const [serviceInstances, setServiceInstances] = useState<ServiceInstance[]>([])
  const [serviceConfigs, setServiceConfigs] = useState<any>({})
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, any>>({})
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['memory', 'llm', 'transcription']))
  const [editingService, setEditingService] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [startingService, setStartingService] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    serviceId: string | null
    serviceName: string | null
  }>({ isOpen: false, serviceId: null, serviceName: null })
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [expandedConfigs, setExpandedConfigs] = useState<Set<string>>(new Set())
  const [showAllConfigs, setShowAllConfigs] = useState(false)
  const [togglingEnabled, setTogglingEnabled] = useState<string | null>(null)
  const [showAddServiceModal, setShowAddServiceModal] = useState(false)

  // Load initial data once on mount
  useEffect(() => {
    loadData()
  }, [])

  // Set up SSE connection once on mount (separate from data loading)
  useEffect(() => {
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8100'
    const eventSource = new EventSource(`${backendUrl}/api/docker/events`, {
      withCredentials: true
    })

    eventSource.addEventListener('container', (event) => {
      const data = JSON.parse(event.data)
      console.log('🐳 Docker event:', data.action, data.container_name)

      // Refresh status when containers start/stop/die/restart
      if (['start', 'stop', 'die', 'restart'].includes(data.action)) {
        // Reload all service statuses (they'll use current serviceInstances from state)
        setServiceStatuses(prevStatuses => {
          // Trigger a refresh by reloading data
          loadData()
          return prevStatuses
        })

        // Clear starting spinner and show success message
        if (data.action === 'start') {
          setStartingService(null)
          setMessage({ type: 'success', text: 'Service is now running' })
        }
      }
    })

    eventSource.addEventListener('error', (error) => {
      console.error('SSE connection error:', error)
      // Don't close - let it auto-reconnect
    })

    return () => {
      eventSource.close()
    }
  }, [])  // Empty deps - only run once on mount

  const loadData = async () => {
    try {
      setLoading(true)
      const [instancesResponse, configResponse] = await Promise.all([
        servicesApi.getInstalled(),  // Use installed services (default + user-added)
        settingsApi.getConfig()  // Load FULL merged config (api_keys + service_preferences + defaults)
      ])

      const instances = instancesResponse.data
      const mergedConfig = configResponse.data

      // Build effective config per service (merge api_keys + service_preferences)
      const effectiveConfigs: any = {}
      instances.forEach((service: any) => {
        effectiveConfigs[service.service_id] = {}

        service.config_schema?.forEach((field: any) => {
          if (field.env_var) {
            // Check api_keys namespace
            const keyName = field.env_var.toLowerCase()
            const value = mergedConfig?.api_keys?.[keyName]
            if (value !== undefined && value !== null) {
              effectiveConfigs[service.service_id][field.key] = value
            }
          } else {
            // Check service_preferences namespace
            const value = mergedConfig?.service_preferences?.[service.service_id]?.[field.key]
            if (value !== undefined && value !== null) {
              effectiveConfigs[service.service_id][field.key] = value
            }
          }
        })
      })

      setServiceInstances(instances)
      setServiceConfigs(effectiveConfigs)  // Use effective merged config, not just preferences

      // Load status for local services (check if containers running)
      await loadServiceStatuses(instances)
    } catch (error) {
      console.error('Error loading services:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadServiceStatuses = async (services: any[]) => {
    const statuses: Record<string, any> = {}

    for (const service of services) {
      if (service.mode === 'local') {
        // Check Docker container status
        try {
          const response = await dockerApi.getServiceInfo(service.service_id)
          statuses[service.service_id] = {
            status: response.data.status,
            container_id: response.data.container_id,
            health: response.data.health
          }
        } catch (error) {
          statuses[service.service_id] = { status: 'not_found' }
        }
      } else {
        // Cloud service - "running" if configured
        const isConfigured = serviceConfigs[service.service_id] &&
                            Object.keys(serviceConfigs[service.service_id]).length > 0
        statuses[service.service_id] = {
          status: isConfigured ? 'configured' : 'not_configured'
        }
      }
    }

    setServiceStatuses(statuses)
  }

  const handleStartService = async (serviceId: string) => {
    setStartingService(serviceId)
    try {
      await dockerApi.startService(serviceId)
      setMessage({ type: 'success', text: 'Service starting...' })
      // Status will update automatically via SSE when container starts
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to start service' })
      setStartingService(null)
    }
  }

  const handleStopService = (serviceId: string) => {
    const service = serviceInstances.find(s => s.service_id === serviceId)
    setConfirmDialog({
      isOpen: true,
      serviceId,
      serviceName: service?.name || serviceId
    })
  }

  const confirmStopService = async () => {
    const { serviceId } = confirmDialog
    if (!serviceId) return

    setConfirmDialog({ isOpen: false, serviceId: null, serviceName: null })

    try {
      await dockerApi.stopService(serviceId)
      setMessage({ type: 'success', text: 'Service stopped' })
      await loadData()  // Refresh status
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to stop service' })
    }
  }

  const handleToggleEnabled = async (serviceId: string, currentEnabled: boolean) => {
    setTogglingEnabled(serviceId)
    try {
      const newEnabled = !currentEnabled
      await servicesApi.setEnabled(serviceId, newEnabled)

      // Update local state immediately
      setServiceInstances(prev =>
        prev.map(s => s.service_id === serviceId ? { ...s, enabled: newEnabled } : s)
      )

      const action = newEnabled ? 'enabled' : 'disabled'
      setMessage({ type: 'success', text: `Service ${action}` })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to toggle service' })
    } finally {
      setTogglingEnabled(null)
    }
  }

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId)
      } else {
        newSet.add(categoryId)
      }
      return newSet
    })
  }

  const handleEditService = (serviceId: string) => {
    const currentConfig = serviceConfigs[serviceId] || {}
    setEditForm({ ...currentConfig })
    setEditingService(serviceId)
  }

  const handleSaveService = async (serviceId: string) => {
    const service = serviceInstances.find(s => s.service_id === serviceId)
    if (!service) return

    // Clear previous validation errors
    setValidationErrors({})

    // Validate required fields
    const errors: Record<string, string> = {}
    service.config_schema
      ?.filter(f => f.required)
      .forEach(field => {
        const value = editForm[field.key]
        if (!value || value === '') {
          errors[field.key] = `${field.label} is required`
        }
      })

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      setMessage({ type: 'error', text: 'Please fill in all required fields' })
      return
    }

    setSaving(true)
    try {
      await settingsApi.updateServiceConfig(serviceId, editForm)
      setServiceConfigs((prev: Record<string, any>) => ({
        ...prev,
        [serviceId]: editForm
      }))
      setMessage({ type: 'success', text: 'Configuration saved' })
      setEditingService(null)
      setValidationErrors({})
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingService(null)
    setEditForm({})
    setValidationErrors({})
  }

  const maskValue = (value: string) => {
    if (value && value.length > 4) {
      return '●●●●●●' + value.slice(-4)
    }
    return '●●●●●●'
  }

  const getServiceStatus = (service: any, config: any) => {
    // Rule 1: Check if service has required configuration
    const hasRequiredConfig = () => {
      if (!service.config_schema || service.config_schema.length === 0) {
        // No config needed (like mem0-ui) - always "configured"
        return true
      }

      // Get list of required fields
      const requiredFields = service.config_schema.filter((f: any) => f.required)

      // If no required fields, service is always configured
      if (requiredFields.length === 0) {
        return true
      }

      // If no config saved at all, not configured
      if (!config || Object.keys(config).length === 0) {
        return false
      }

      // Check all required fields have non-null values
      return requiredFields.every((f: any) => {
        const value = config[f.key]
        // Field is filled if it has a value (including defaults)
        return value !== undefined && value !== null && value !== ''
      })
    }

    const isConfigured = hasRequiredConfig()

    // Rule 2: Not configured services - RED with alert icon
    if (!isConfigured) {
      return {
        state: 'not_configured',
        label: 'Missing Config',
        color: 'error',
        icon: AlertCircle,
        canConfigure: true
      }
    }

    // Rule 3: Cloud services - configured means active (no containers to manage)
    if (service.mode === 'cloud') {
      // TODO: Add pause functionality later
      return {
        state: 'active',
        label: 'Active',
        color: 'success',
        icon: CheckCircle,
        canEdit: true,
        canPause: false  // Future feature
      }
    }

    // Rule 4: Local services - check container status for started/stopped
    const containerStatus = serviceStatuses[service.service_id]

    if (!containerStatus || containerStatus.status === 'not_found') {
      // Configured but container doesn't exist/not started yet - GRAY
      return {
        state: 'stopped',
        label: 'Stopped',
        color: 'neutral',
        icon: Circle,
        canStart: true,
        canEdit: true
      }
    }

    if (containerStatus.status === 'running') {
      // Container running - GREEN with play icon
      const isHealthy = containerStatus.health === 'healthy'
      return {
        state: 'running',
        label: isHealthy ? 'Running' : 'Starting',
        color: 'success',
        icon: PlayCircle,
        canStop: true,
        canEdit: true
      }
    }

    if (containerStatus.status === 'exited' || containerStatus.status === 'stopped') {
      // Container exists but stopped - GRAY
      return {
        state: 'stopped',
        label: 'Stopped',
        color: 'neutral',
        icon: Circle,
        canStart: true,
        canEdit: true
      }
    }

    // Unknown state - show as error
    return {
      state: 'error',
      label: 'Error',
      color: 'error',
      icon: AlertCircle,
      canEdit: true
    }
  }

  const shouldShowField = (fieldKey: string, config: any): boolean => {
    // Neo4j password only shown if graph memory enabled
    if (fieldKey === 'neo4j_password') {
      return config.enable_graph === true
    }
    // Add other conditional logic here
    return true
  }

  const renderFieldValue = (key: string, value: any, isEditing: boolean, serviceId?: string) => {
    const isSecret = key.includes('password') || key.includes('key')
    const fieldId = serviceId ? `field-${serviceId}-${key}` : undefined
    const hasError = validationErrors[key]

    if (isEditing) {
      if (typeof value === 'boolean') {
        return (
          <input
            id={fieldId}
            type="checkbox"
            checked={editForm[key] === true}
            onChange={(e) => setEditForm({ ...editForm, [key]: e.target.checked })}
            className="rounded"
          />
        )
      }
      return (
        <div>
          <input
            id={fieldId}
            type={isSecret ? 'password' : 'text'}
            value={editForm[key] || ''}
            onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
            className={`input text-xs ${hasError ? 'border-error-500 focus:ring-error-500' : ''}`}
            placeholder={isSecret ? '●●●●●●' : ''}
            aria-invalid={hasError ? 'true' : 'false'}
            aria-describedby={hasError ? `error-${serviceId}-${key}` : undefined}
          />
          {hasError && (
            <p
              id={`error-${serviceId}-${key}`}
              className="text-xs text-error-600 dark:text-error-400 mt-1"
              role="alert"
            >
              {hasError}
            </p>
          )}
        </div>
      )
    }

    // Display mode
    if (isSecret) {
      return <span className="font-mono text-xs">{value ? maskValue(String(value)) : 'Not set'}</span>
    }
    if (typeof value === 'boolean') {
      return (
        <span className={`text-xs font-medium ${value ? 'text-success-600' : 'text-neutral-500'}`}>
          {value ? 'Enabled' : 'Disabled'}
        </span>
      )
    }
    return <span className="font-mono text-xs">{String(value).substring(0, 30)}</span>
  }

  // Group services by category
  const servicesByCategory = serviceInstances.reduce((acc, service) => {
    const category = service.template.split('.')[0]
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(service)
    return acc
  }, {} as Record<string, ServiceInstance[]>)

  const categories = [
    { id: 'memory', name: 'Memory', description: 'Knowledge storage and retrieval' },
    { id: 'llm', name: 'Language Models', description: 'AI language model providers' },
    { id: 'transcription', name: 'Transcription', description: 'Speech-to-text services' },
  ]

  // Calculate stats
  const totalServices = serviceInstances.length
  const activeServices = Object.keys(serviceConfigs).length

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
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Services</h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Manage service providers and integrations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Available Services</p>
          <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{totalServices}</p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Configured</p>
          <p className="mt-2 text-2xl font-bold text-success-600 dark:text-success-400">{activeServices}</p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Categories</p>
          <p className="mt-2 text-2xl font-bold text-primary-600 dark:text-primary-400">{categories.length}</p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div 
          role="alert"
          aria-live="polite"
          aria-atomic="true"
          className={`card p-4 border ${
          message.type === 'success'
            ? 'bg-success-50 dark:bg-success-900/20 border-success-200 text-success-700'
            : 'bg-error-50 dark:bg-error-900/20 border-error-200 text-error-700'
        }`}>
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5" />
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* Service Categories */}
      <div className="space-y-4">
        {categories.map(category => {
          const categoryServices = servicesByCategory[category.id] || []
          if (categoryServices.length === 0) return null

          const isExpanded = expandedCategories.has(category.id)

          return (
            <div key={category.id} className="card">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full p-6 flex items-center space-x-4 hover:opacity-70 transition-opacity text-left"
                aria-expanded={isExpanded}
                aria-controls={`category-${category.id}-content`}
              >
                {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                <div>
                  <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                    {category.name}
                  </h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {category.description}
                  </p>
                </div>
              </button>

              {/* Category Services */}
              {isExpanded && (
                <div 
                  id={`category-${category.id}-content`}
                  className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {categoryServices.map(service => {
                    const isConfigured = serviceConfigs[service.service_id] &&
                                        Object.keys(serviceConfigs[service.service_id]).length > 0
                    const isEditing = editingService === service.service_id
                    const config = serviceConfigs[service.service_id] || {}
                    const status = getServiceStatus(service, config)

                    // Border and background based on status - cards should pop from page
                    const getBorderClasses = () => {
                      // Disabled services get grayed out appearance
                      if (!service.enabled) {
                        return 'border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800/50 shadow-sm opacity-60'
                      }
                      if (status.state === 'running') {
                        // Subtle green border, neutral background for better button contrast
                        return 'border-success-400 dark:border-success-600 bg-white dark:bg-neutral-900 shadow-sm'
                      }
                      if (status.state === 'active' || status.state === 'stopped') {
                        return 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm'
                      }
                      if (status.state === 'not_configured' || status.state === 'error') {
                        return 'border-warning-200 dark:border-warning-800 bg-warning-50/30 dark:bg-warning-950/20 shadow-sm'
                      }
                      return 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm'
                    }

                    const isExpanded = showAllConfigs || expandedConfigs.has(service.service_id)

                    const toggleConfig = (e: React.MouseEvent) => {
                      // Don't expand if clicking on a button
                      if ((e.target as HTMLElement).closest('button')) {
                        return
                      }

                      setExpandedConfigs(prev => {
                        const next = new Set(prev)
                        if (next.has(service.service_id)) {
                          next.delete(service.service_id)
                        } else {
                          next.add(service.service_id)
                        }
                        return next
                      })
                    }

                    return (
                      <div
                        key={service.service_id}
                        className={`border rounded-lg transition-all ${getBorderClasses()} ${!isEditing ? 'cursor-pointer' : ''}`}
                        onClick={!isEditing ? toggleConfig : undefined}
                      >
                        <div className="p-4">
                          {/* Service Header - Colored highlight box with everything inline */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3 flex-1">
                            {/* Service name with colored icon box */}
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
                            {(() => {
                              const status = getServiceStatus(service, config)
                              if (status.state === 'not_configured') {
                                return (
                                  <span className="inline-flex items-center gap-1 text-xs text-warning-700 dark:text-warning-300">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    Setup Required
                                  </span>
                                )
                              }
                              return null
                            })()}
                          </div>

                          <div className="flex items-center gap-2">
                          
                          {/* Actionable Status Badge */}
                          {!isEditing && (() => {
                            const status = getServiceStatus(service, config)
                            const Icon = status.icon

                            const colorClasses = {
                              success: 'text-success-700 dark:text-success-300',
                              error: 'text-error-700 dark:text-error-300',
                              neutral: 'text-neutral-600 dark:text-neutral-400',
                              warning: 'text-warning-700 dark:text-warning-300'
                            }

                            const bgClasses = {
                              success: 'bg-success-100 dark:bg-success-900/30',
                              error: 'bg-error-100 dark:bg-error-900/30',
                              neutral: 'bg-neutral-100 dark:bg-neutral-800',
                              warning: 'bg-warning-100 dark:bg-warning-900/30'
                            }

                            // Make status badge clickable for local services (only if enabled)
                            const isClickable = service.enabled && service.mode === 'local' && (status.canStart || status.canStop)
                            const handleStatusClick = () => {
                              if (status.canStart) {
                                handleStartService(service.service_id)
                              } else if (status.canStop) {
                                handleStopService(service.service_id)
                              }
                            }

                            if (isClickable) {
                              // Different color schemes for Start vs Stop
                              const isStopButton = status.canStop

                              return (
                                <button
                                  onClick={handleStatusClick}
                                  disabled={startingService === service.service_id}
                                  aria-label={status.canStart ? `Start ${service.name}` : `Stop ${service.name}`}
                                  className="group focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
                                >
                                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all group-hover:ring-2 ${
                                    isStopButton
                                      ? 'bg-error-100 dark:bg-error-900/30 group-hover:ring-error-400 group-hover:bg-error-200 dark:group-hover:bg-error-800'
                                      : 'bg-success-100 dark:bg-success-900/30 group-hover:ring-success-400 group-hover:bg-success-200 dark:group-hover:bg-success-800'
                                  }`}>
                                    {startingService === service.service_id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-success-700 dark:text-success-300" />
                                    ) : status.canStart ? (
                                      <PlayCircle className="h-3.5 w-3.5 text-success-700 dark:text-success-300" />
                                    ) : (
                                      <StopCircle className="h-3.5 w-3.5 text-error-700 dark:text-error-300" />
                                    )}
                                    <span className={`text-xs font-medium ${
                                      isStopButton
                                        ? 'text-error-700 dark:text-error-300'
                                        : 'text-success-700 dark:text-success-300'
                                    }`}>
                                      {status.canStart ? 'Start' : 'Stop'}
                                    </span>
                                  </div>
                                </button>
                              )
                            }

                            return (
                              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${bgClasses[status.color as keyof typeof bgClasses]}`}>
                                <Icon className={`h-4 w-4 ${colorClasses[status.color as keyof typeof colorClasses]}`} />
                                <span className={`text-xs font-medium ${colorClasses[status.color as keyof typeof colorClasses]}`}>
                                  {status.label}
                                </span>
                              </div>
                            )
                          })()}

                            {/* Enable/Disable Toggle */}
                            {!isEditing && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggleEnabled(service.service_id, service.enabled)
                                }}
                                disabled={togglingEnabled === service.service_id}
                                aria-label={service.enabled ? `Disable ${service.name}` : `Enable ${service.name}`}
                                data-testid={`toggle-enabled-${service.service_id}`}
                                className="flex items-center gap-1 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                                title={service.enabled ? 'Click to disable' : 'Click to enable'}
                              >
                                {togglingEnabled === service.service_id ? (
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

                        {/* Edit Mode Actions */}
                        {isEditing && (
                          <div className="flex items-center justify-end gap-2 mb-3">
                            <button
                              onClick={handleCancelEdit}
                              className="btn-ghost text-xs flex items-center gap-1"
                            >
                              <X className="h-4 w-4" />
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveService(service.service_id)}
                              disabled={saving}
                              className="btn-primary text-xs flex items-center gap-1"
                            >
                              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        )}

                        {/* Service Configuration - Collapsible */}
                        {(isConfigured || isEditing) && service.config_schema && service.config_schema.length > 0 && (
                          <>
                            {/* Config Fields - Show if editing OR expanded */}
                            {(isEditing || isExpanded) && (
                              <div className={`space-y-2 px-4 pb-4 pt-3 border-t border-neutral-200 dark:border-neutral-700 ${isEditing ? 'mt-0' : 'mt-0'}`}>
                                {service.config_schema
                                  .filter((f: any) => {
                                    // In edit mode, show all fields
                                    if (isEditing) return true
                                    // In view mode, only show if configured AND should be visible
                                    if (config[f.key] === undefined) return false
                                    return shouldShowField(f.key, config)
                                  })
                                  .map((field: any) => (
                                    <div key={field.key} className={isEditing ? '' : 'flex items-baseline gap-2'}>
                                      {isEditing ? (
                                        <>
                                          <label
                                            htmlFor={`field-${service.service_id}-${field.key}`}
                                            className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 block"
                                          >
                                            {field.label}
                                            {field.required && <span className="text-error-600 ml-1">*</span>}
                                          </label>
                                          <div className="text-xs">
                                            {renderFieldValue(field.key, config[field.key], isEditing, service.service_id)}
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                                            {field.label}:
                                          </span>
                                          <div className="text-xs flex-1 truncate">
                                            {renderFieldValue(field.key, config[field.key], isEditing, service.service_id)}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  ))}

                                {/* Edit Button - Inside expanded section */}
                                {!isEditing && (
                                  <div className="pt-3 mt-3 border-t border-neutral-200 dark:border-neutral-700">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleEditService(service.service_id)
                                      }}
                                      className="btn-ghost text-xs flex items-center gap-1"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                      {(() => {
                                        const status = getServiceStatus(service, config)
                                        return status.canConfigure ? 'Setup' : 'Edit'
                                      })()}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}

                        {/* Only show "Not configured" text if service is truly not configured */}
                        {(() => {
                          const status = getServiceStatus(service, config)
                          return status.state === 'not_configured' && !isEditing && !isExpanded && (
                            <div className="px-4 pb-4">
                              <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
                                Click to setup
                              </p>
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {Object.keys(serviceConfigs).length === 0 && (
        <div className="card p-12 text-center">
          <Server className="h-16 w-16 text-neutral-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            No services configured
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">
            Complete the setup wizard to configure your default services
          </p>
          <button
            onClick={() => window.location.href = '/wizard/start'}
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
        confirmText="Stop Service"
        cancelText="Cancel"
        variant="warning"
        onConfirm={confirmStopService}
        onCancel={() => setConfirmDialog({ isOpen: false, serviceId: null, serviceName: null })}
      />

      {/* Live region for screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {message?.text}
      </div>

      {/* Add Service Modal */}
      <AddServiceModal
        isOpen={showAddServiceModal}
        onClose={() => setShowAddServiceModal(false)}
        onServiceInstalled={() => {
          loadData()  // Refresh services list
          setMessage({ type: 'success', text: 'Service installed successfully' })
        }}
      />
    </div>
  )
}
