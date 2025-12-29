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
import { servicesApi, settingsApi, dockerApi, providersApi, Capability, ProviderWithStatus } from '../services/api'
import ConfirmDialog from '../components/ConfirmDialog'
import AddServiceModal from '../components/AddServiceModal'

interface ServiceInstance {
  service_id: string
  name: string
  description: string
  template?: string | null  // Legacy - may be null in new architecture
  mode: 'cloud' | 'local'
  is_default: boolean
  enabled: boolean
  config_schema: any[]
  tags: string[]
  ui?: {
    category?: string
    icon?: string
    is_default?: boolean
    tags?: string[]
  }
}

export default function ServicesPage() {
  const [serviceInstances, setServiceInstances] = useState<ServiceInstance[]>([])
  const [serviceConfigs, setServiceConfigs] = useState<any>({})
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, any>>({})
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['conversation_engine', 'memory', 'llm', 'transcription']))
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
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [changingProvider, setChangingProvider] = useState<string | null>(null)
  // Provider inline editing (like services)
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [providerEditForm, setProviderEditForm] = useState<Record<string, string>>({})
  const [savingProvider, setSavingProvider] = useState(false)

  // Load initial data once on mount
  useEffect(() => {
    loadData()
  }, [])

  // When a service is starting, poll until it's running or failed
  useEffect(() => {
    if (!startingService) return

    let pollCount = 0
    const maxPolls = 30 // 60 seconds max

    const pollInterval = setInterval(async () => {
      pollCount++
      try {
        // Use thin status endpoint for polling (keyed by service_id)
        const response = await dockerApi.getServicesStatus()
        const containerStatus = response.data[startingService]

        // Update status in-place without full reload
        setServiceStatuses(prev => ({
          ...prev,
          [startingService]: containerStatus || { status: 'not_found' }
        }))

        if (containerStatus?.status === 'running') {
          setStartingService(null)
          setMessage({ type: 'success', text: 'Service is now running' })
          return
        }

        // Stop polling on failure states
        if (containerStatus?.status === 'exited' || containerStatus?.status === 'dead') {
          setStartingService(null)
          setMessage({ type: 'error', text: 'Service failed to start' })
          return
        }

        // After 10 seconds, if still not_found, the start failed
        if (pollCount > 5 && containerStatus?.status === 'not_found') {
          setStartingService(null)
          setMessage({ type: 'error', text: 'Service failed to start - check logs' })
          return
        }

        // Timeout after max polls
        if (pollCount >= maxPolls) {
          setStartingService(null)
          setMessage({ type: 'error', text: 'Service start timed out' })
        }
      } catch {
        // Docker API error, keep polling (might be temporary)
      }
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [startingService])

  const loadData = async () => {
    try {
      setLoading(true)
      const [instancesResponse, configResponse, capabilitiesResponse] = await Promise.all([
        servicesApi.getInstalled(),  // Use installed services (default + user-added)
        settingsApi.getConfig(),  // Load FULL merged config (api_keys + service_preferences + defaults)
        providersApi.getCapabilities()  // Load capabilities with providers
      ])

      const instances = instancesResponse.data
      const mergedConfig = configResponse.data
      const caps = capabilitiesResponse.data

      setCapabilities(caps)

      // Build effective config per service using settings_path from schema
      const effectiveConfigs: any = {}

      // Helper to get nested value from config using dot notation path
      const getNestedValue = (obj: any, path: string): any => {
        if (!path || !obj) return undefined
        return path.split('.').reduce((curr, key) => curr?.[key], obj)
      }

      instances.forEach((service: any) => {
        effectiveConfigs[service.service_id] = {}

        service.config_schema?.forEach((field: any) => {
          // Use settings_path to look up value in merged config
          if (field.settings_path) {
            const value = getNestedValue(mergedConfig, field.settings_path)
            if (value !== undefined && value !== null) {
              effectiveConfigs[service.service_id][field.key] = value
            }
          }
          // Fallback: use default if no value found
          if (effectiveConfigs[service.service_id][field.key] === undefined && field.default !== undefined) {
            effectiveConfigs[service.service_id][field.key] = field.default
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

    // Fetch all Docker container statuses using thin endpoint
    let dockerStatuses: Record<string, any> = {}
    try {
      const response = await dockerApi.getServicesStatus()
      dockerStatuses = response.data  // Already in {name: {status, health}} format
    } catch (error) {
      console.error('Failed to fetch Docker statuses:', error)
    }

    // Map service configs to their Docker status
    // Note: thin endpoint returns data keyed by service_id, not container name
    for (const service of services) {
      if (service.mode === 'local') {
        const dockerStatus = dockerStatuses[service.service_id]
        statuses[service.service_id] = dockerStatus || { status: 'not_found' }
      } else {
        // Cloud service - check if configured
        const isConfigured = serviceConfigs[service.service_id] &&
                            Object.keys(serviceConfigs[service.service_id]).length > 0
        statuses[service.service_id] = {
          status: isConfigured ? 'configured' : 'not_configured'
        }
      }
    }

    setServiceStatuses(statuses)
  }

  // Refresh only the status of services without full page reload
  // TODO: Wire up to a "refresh statuses" button in the UI
  /* const refreshStatuses = async () => {
    try {
      const response = await dockerApi.getServicesStatus()
      const dockerStatuses = response.data

      setServiceStatuses(prev => {
        const updated = { ...prev }
        for (const service of serviceInstances) {
          if (service.mode === 'local') {
            updated[service.service_id] = dockerStatuses[service.service_id] || { status: 'not_found' }
          }
        }
        return updated
      })
    } catch (error) {
      console.error('Failed to refresh statuses:', error)
    }
  } */

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
      // Update status in-place without full reload
      setServiceStatuses(prev => ({
        ...prev,
        [serviceId]: { status: 'not_found' }
      }))
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

  const handleProviderChange = async (capabilityId: string, providerId: string) => {
    setChangingProvider(capabilityId)
    try {
      await providersApi.selectProvider(capabilityId, providerId)
      // Refresh capabilities to get updated selection
      const response = await providersApi.getCapabilities()
      setCapabilities(response.data)
      setMessage({ type: 'success', text: `Provider changed to ${providerId}` })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to change provider' })
    } finally {
      setChangingProvider(null)
    }
  }

  // Provider key for tracking state (capability + provider)
  const getProviderKey = (capId: string, providerId: string) => `${capId}:${providerId}`

  const toggleProviderExpanded = (capId: string, providerId: string) => {
    const key = getProviderKey(capId, providerId)
    setExpandedProviders(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleEditProvider = (capId: string, provider: ProviderWithStatus) => {
    const key = getProviderKey(capId, provider.id)
    // Initialize form with current values for non-secrets, empty for secrets
    const initialForm: Record<string, string> = {}
    ;(provider.credentials || []).forEach(cred => {
      if (cred.type === 'secret') {
        // Secrets must be re-entered (we don't have the value)
        initialForm[cred.key] = ''
      } else {
        // Non-secrets: use current value or default
        initialForm[cred.key] = cred.value || cred.default || ''
      }
    })
    setProviderEditForm(initialForm)
    setEditingProviderId(key)
    // Make sure it's expanded
    setExpandedProviders(prev => new Set(prev).add(key))
  }

  const handleSaveProvider = async (_capId: string, provider: ProviderWithStatus) => {
    setSavingProvider(true)
    try {
      // Build updates object using settings_path from each credential
      const updates: Record<string, string> = {}

      ;(provider.credentials || []).forEach(cred => {
        const value = providerEditForm[cred.key]
        // Only update if there's a value and a settings_path
        if (value && value.trim() && cred.settings_path) {
          updates[cred.settings_path] = value.trim()
        }
      })

      if (Object.keys(updates).length === 0) {
        setMessage({ type: 'error', text: 'No changes to save' })
        setSavingProvider(false)
        return
      }

      await settingsApi.update(updates)

      // Refresh capabilities to get updated credential status
      const response = await providersApi.getCapabilities()
      setCapabilities(response.data)

      setMessage({ type: 'success', text: `${provider.name} credentials saved` })
      setEditingProviderId(null)
      setProviderEditForm({})
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to save credentials' })
    } finally {
      setSavingProvider(false)
    }
  }

  const handleCancelProviderEdit = () => {
    setEditingProviderId(null)
    setProviderEditForm({})
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
      // Show "Running" regardless of health check (health checks can be misconfigured)
      return {
        state: 'running',
        label: 'Running',
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

    if (containerStatus.status === 'created') {
      // Container exists but was never started - treat as stopped
      return {
        state: 'stopped',
        label: 'Stopped',
        color: 'neutral',
        icon: Circle,
        canStart: true,
        canEdit: true
      }
    }

    if (containerStatus.status === 'restarting') {
      // Container is actively restarting - YELLOW/WARNING
      return {
        state: 'starting',
        label: 'Restarting',
        color: 'warning',
        icon: PlayCircle,
        canEdit: false  // Don't allow edits while restarting
      }
    }

    // Unknown state - show as error
    return {
      state: 'error',
      label: containerStatus.status || 'Error',
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
  }, {} as Record<string, ServiceInstance[]>)

  const categories = [
    { id: 'conversation_engine', name: 'Conversation Engine', description: 'Audio processing with AI analysis' },
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

      {/* Provider Selection - Card-based UI */}
      {capabilities.length > 0 && (
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

                                  return (
                                    <div key={cred.key}>
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
                                            value={providerEditForm[cred.key] || ''}
                                            onChange={(e) => setProviderEditForm(prev => ({
                                              ...prev,
                                              [cred.key]: e.target.value
                                            }))}
                                            placeholder={
                                              isSecret
                                                ? (cred.has_value ? '••••••••' : `Enter ${cred.label || cred.key}`)
                                                : (cred.value || cred.default || `Enter ${cred.label || cred.key}`)
                                            }
                                            className="input w-full text-sm"
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

                            // Show Cancel button if this service is starting
                            const isStarting = startingService === service.service_id
                            if (isStarting) {
                              return (
                                <button
                                  onClick={() => setStartingService(null)}
                                  aria-label={`Cancel starting ${service.name}`}
                                  className="group focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
                                >
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all group-hover:ring-2 bg-warning-100 dark:bg-warning-900/30 group-hover:ring-warning-400 group-hover:bg-warning-200 dark:group-hover:bg-warning-800">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-warning-700 dark:text-warning-300" />
                                    <span className="text-xs font-medium text-warning-700 dark:text-warning-300">
                                      Cancel
                                    </span>
                                  </div>
                                </button>
                              )
                            }

                            if (isClickable) {
                              // Different color schemes for Start vs Stop
                              const isStopButton = status.canStop

                              return (
                                <button
                                  onClick={handleStatusClick}
                                  aria-label={status.canStart ? `Start ${service.name}` : `Stop ${service.name}`}
                                  className="group focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
                                >
                                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all group-hover:ring-2 ${
                                    isStopButton
                                      ? 'bg-error-100 dark:bg-error-900/30 group-hover:ring-error-400 group-hover:bg-error-200 dark:group-hover:bg-error-800'
                                      : 'bg-success-100 dark:bg-success-900/30 group-hover:ring-success-400 group-hover:bg-success-200 dark:group-hover:bg-success-800'
                                  }`}>
                                    {status.canStart ? (
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

                        {/* Service Configuration - Always show if there are fields to configure */}
                        {service.config_schema && service.config_schema.length > 0 && (
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
        confirmLabel="Stop Service"
        cancelLabel="Cancel"
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
