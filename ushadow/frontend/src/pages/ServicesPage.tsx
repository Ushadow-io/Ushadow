import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
  Server,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Edit2,
  Save,
  X,
  RefreshCw,
  PlayCircle,
  StopCircle,
  Loader2,
  Cloud,
  HardDrive,
  Pencil,
  Plus,
  Package,
  Trash2,
  BookOpen,
  Download
} from 'lucide-react'
import {
  settingsApi,
  servicesApi,
  providersApi,
  Capability,
  ProviderWithStatus,
  ComposeService,
  EnvVarInfo,
  EnvVarConfig
} from '../services/api'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import { PortConflictDialog } from '../components/services'
import ImportFromGitHubModal from '../components/ImportFromGitHubModal'
import { StatusBadge } from '../components/StatusBadge'

export default function ServicesPage() {
  const navigate = useNavigate()

  // Compose services state
  const [services, setServices] = useState<ComposeService[]>([])
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, any>>({})
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set())
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [envConfigs, setEnvConfigs] = useState<Record<string, {
    required_env_vars: EnvVarInfo[]
    optional_env_vars: EnvVarInfo[]
  }>>({})
  const [envEditForms, setEnvEditForms] = useState<Record<string, Record<string, EnvVarConfig>>>({})
  const [customEnvVars, setCustomEnvVars] = useState<Record<string, Array<{ name: string; value: string }>>>({})

  // Provider state
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [providerEditForm, setProviderEditForm] = useState<Record<string, string>>({})
  const [changingProvider, setChangingProvider] = useState<string | null>(null)
  const [savingProvider, setSavingProvider] = useState(false)

  // General state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [startingService, setStartingService] = useState<string | null>(null)
  const [loadingEnvConfig, setLoadingEnvConfig] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [serviceErrors, setServiceErrors] = useState<Record<string, string>>({})
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    serviceName: string | null
  }>({ isOpen: false, serviceName: null })

  // Port conflict dialog state
  const [portConflictDialog, setPortConflictDialog] = useState<{
    isOpen: boolean
    serviceId: string | null
    serviceName: string | null
    conflicts: Array<{
      port: number
      envVar: string | null
      usedBy: string
      suggestedPort: number
    }>
  }>({ isOpen: false, serviceId: null, serviceName: null, conflicts: [] })

  // Port edit dialog state
  const [portEditDialog, setPortEditDialog] = useState<{
    isOpen: boolean
    serviceId: string | null
    serviceName: string | null
    currentPort: number | null
    envVar: string | null
    newPort: string
  }>({ isOpen: false, serviceId: null, serviceName: null, currentPort: null, envVar: null, newPort: '' })

  // Catalog modal state
  const [showCatalog, setShowCatalog] = useState(false)
  const [catalogServices, setCatalogServices] = useState<ComposeService[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [installingService, setInstallingService] = useState<string | null>(null)

  // GitHub import modal state
  const [showGitHubImport, setShowGitHubImport] = useState(false)

  // Load initial data
  useEffect(() => {
    loadData()
  }, [])

  // Poll for service status when starting
  useEffect(() => {
    if (!startingService) return

    let pollCount = 0
    const maxPolls = 30
    const serviceName = startingService

    const pollInterval = setInterval(async () => {
      pollCount++
      try {
        const response = await servicesApi.getAllStatuses()
        const status = response.data[serviceName]

        setServiceStatuses(prev => ({
          ...prev,
          [serviceName]: status || { status: 'not_found' }
        }))

        if (status?.status === 'running') {
          setStartingService(null)
          // Clear any error for this service
          setServiceErrors(prev => {
            const next = { ...prev }
            delete next[serviceName]
            return next
          })
          return
        }

        if (status?.status === 'exited' || status?.status === 'dead') {
          setStartingService(null)
          setServiceErrors(prev => ({
            ...prev,
            [serviceName]: 'Service failed to start. Check container logs for details.'
          }))
          return
        }

        if (pollCount >= maxPolls) {
          setStartingService(null)
          setServiceErrors(prev => ({
            ...prev,
            [serviceName]: 'Service start timed out'
          }))
        }
      } catch {
        // Keep polling
      }
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [startingService])

  const loadData = async () => {
    try {
      setLoading(true)
      const [servicesResponse, capsResponse] = await Promise.all([
        servicesApi.getInstalled(),
        providersApi.getCapabilities()
      ])

      setServices(servicesResponse.data)
      setCapabilities(capsResponse.data)

      // Load Docker statuses
      await loadServiceStatuses(servicesResponse.data)
    } catch (error) {
      console.error('Error loading data:', error)
      setMessage({ type: 'error', text: 'Failed to load services' })
    } finally {
      setLoading(false)
    }
  }

  const loadServiceStatuses = async (serviceList: ComposeService[]) => {
    try {
      const response = await servicesApi.getAllStatuses()
      const statuses: Record<string, any> = {}

      console.log('Docker status response:', response.data)
      console.log('Service list:', serviceList.map(s => s.service_name))

      for (const service of serviceList) {
        statuses[service.service_name] = response.data[service.service_name] || { status: 'not_found' }
      }

      console.log('Mapped statuses:', statuses)
      setServiceStatuses(statuses)
    } catch (error) {
      console.error('Failed to fetch Docker statuses:', error)
      // Set fallback statuses so buttons still work
      const fallbackStatuses: Record<string, any> = {}
      for (const service of serviceList) {
        fallbackStatuses[service.service_name] = { status: 'not_found' }
      }
      setServiceStatuses(fallbackStatuses)
    }
  }

  // ==========================================================================
  // Service Actions
  // ==========================================================================

  const handleStartService = async (serviceName: string) => {
    setStartingService(serviceName)
    // Clear any previous error for this service
    setServiceErrors(prev => {
      const next = { ...prev }
      delete next[serviceName]
      return next
    })
    try {
      // First, run preflight check for port conflicts
      const preflightResponse = await servicesApi.preflightCheck(serviceName)
      const preflight = preflightResponse.data

      if (!preflight.can_start && preflight.port_conflicts.length > 0) {
        // Port conflicts detected - show dialog
        setPortConflictDialog({
          isOpen: true,
          serviceId: serviceName,
          serviceName: serviceName,
          conflicts: preflight.port_conflicts.map(c => ({
            port: c.port,
            envVar: c.env_var,
            usedBy: c.used_by,
            suggestedPort: c.suggested_port
          }))
        })
        setStartingService(null)
        return
      }

      // No conflicts - proceed with start
      const response = await servicesApi.startService(serviceName)
      // Check for success: false in response body (API returns 200 even on failure)
      if (response.data && response.data.success === false) {
        const errorMsg = response.data.message || 'Failed to start service'
        setServiceErrors(prev => ({ ...prev, [serviceName]: errorMsg }))
        setStartingService(null)
      }
      // Otherwise success - status will update via polling
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.message || 'Failed to start service'
      setServiceErrors(prev => ({ ...prev, [serviceName]: errorMsg }))
      setStartingService(null)
    }
  }

  const handleResolvePortConflict = async (envVar: string, newPort: number) => {
    const { serviceId } = portConflictDialog
    if (!serviceId) return

    setPortConflictDialog({ isOpen: false, serviceId: null, serviceName: null, conflicts: [] })
    setStartingService(serviceId)

    try {
      // Apply the port override
      await servicesApi.setPortOverride(serviceId, envVar, newPort)

      // Now start the service
      const response = await servicesApi.startService(serviceId)
      if (response.data && response.data.success === false) {
        const errorMsg = response.data.message || 'Failed to start service'
        setServiceErrors(prev => ({ ...prev, [serviceId]: errorMsg }))
        setStartingService(null)
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.message || 'Failed to apply port override'
      setServiceErrors(prev => ({ ...prev, [serviceId]: errorMsg }))
      setStartingService(null)
    }
  }

  const handleStopService = (serviceName: string) => {
    setConfirmDialog({ isOpen: true, serviceName })
  }

  const confirmStopService = async () => {
    const { serviceName } = confirmDialog
    if (!serviceName) return

    setConfirmDialog({ isOpen: false, serviceName: null })

    try {
      await servicesApi.stopService(serviceName)
      setMessage({ type: 'success', text: 'Service stopped' })
      setServiceStatuses(prev => ({
        ...prev,
        [serviceName]: { status: 'not_found' }
      }))
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to stop service' })
    }
  }

  const handleSavePortEdit = async () => {
    const { serviceId, envVar, newPort } = portEditDialog
    if (!serviceId || !envVar || !newPort) return

    const port = parseInt(newPort, 10)
    if (isNaN(port) || port < 1 || port > 65535) {
      setMessage({ type: 'error', text: 'Invalid port number' })
      return
    }

    try {
      await servicesApi.setPortOverride(serviceId, envVar, port)
      setPortEditDialog({ isOpen: false, serviceId: null, serviceName: null, currentPort: null, envVar: null, newPort: '' })
      setMessage({ type: 'success', text: `Port updated to ${port}` })
      // Reload services to get updated port
      await loadData()
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to update port' })
    }
  }

  // ==========================================================================
  // Catalog Actions
  // ==========================================================================

  const openCatalog = async () => {
    setShowCatalog(true)
    setCatalogLoading(true)
    try {
      const response = await servicesApi.getCatalog()
      setCatalogServices(response.data)
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Failed to load service catalog' })
    } finally {
      setCatalogLoading(false)
    }
  }

  const handleInstallService = async (serviceId: string) => {
    setInstallingService(serviceId)
    try {
      await servicesApi.install(serviceId)
      // Reload both catalog and services
      const [catalogRes, servicesRes] = await Promise.all([
        servicesApi.getCatalog(),
        servicesApi.getInstalled()
      ])
      setCatalogServices(catalogRes.data)
      setServices(servicesRes.data)
      await loadServiceStatuses(servicesRes.data)
      setMessage({ type: 'success', text: 'Service installed' })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to install service' })
    } finally {
      setInstallingService(null)
    }
  }

  const handleUninstallService = async (serviceId: string) => {
    setInstallingService(serviceId)
    try {
      await servicesApi.uninstall(serviceId)
      // Reload both catalog and services
      const [catalogRes, servicesRes] = await Promise.all([
        servicesApi.getCatalog(),
        servicesApi.getInstalled()
      ])
      setCatalogServices(catalogRes.data)
      setServices(servicesRes.data)
      await loadServiceStatuses(servicesRes.data)
      setMessage({ type: 'success', text: 'Service uninstalled' })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to uninstall service' })
    } finally {
      setInstallingService(null)
    }
  }

  // ==========================================================================
  // Env Var Configuration
  // ==========================================================================

  const handleSaveEnvVars = async (serviceId: string) => {
    setSaving(true)
    try {
      const serviceEnvEditForm = envEditForms[serviceId] || {}
      const serviceCustomEnvVars = customEnvVars[serviceId] || []
      // Combine standard env vars with custom ones
      const envVars: EnvVarConfig[] = [
        ...Object.values(serviceEnvEditForm),
        // Add custom env vars as new settings
        ...serviceCustomEnvVars
          .filter(ev => ev.name.trim() && ev.value.trim())
          .map(ev => ({
            name: ev.name.trim().toUpperCase(),
            source: 'new_setting' as const,
            new_setting_path: `custom_env.${ev.name.trim().toLowerCase()}`,
            value: ev.value.trim()
          }))
      ]
      console.log('Saving env vars:', envVars)
      const result = await servicesApi.updateEnvConfig(serviceId, envVars)
      console.log('Save result:', result)
      const newSettingsCount = (result.data as any)?.new_settings_created || 0
      const customCount = serviceCustomEnvVars.filter(ev => ev.name.trim() && ev.value.trim()).length
      let msg = 'Environment configuration saved'
      if (newSettingsCount > 0 || customCount > 0) {
        const total = newSettingsCount + customCount
        msg = `Configuration saved (${total} new setting${total > 1 ? 's' : ''} created)`
      }
      setMessage({ type: 'success', text: msg })
      setEditingServiceId(null)
      // Clear this service's config
      setEnvConfigs(prev => {
        const next = { ...prev }
        delete next[serviceId]
        return next
      })
      setEnvEditForms(prev => {
        const next = { ...prev }
        delete next[serviceId]
        return next
      })
      setCustomEnvVars(prev => {
        const next = { ...prev }
        delete next[serviceId]
        return next
      })
      // Reload services to update needs_setup status
      const servicesRes = await servicesApi.getInstalled()
      setServices(servicesRes.data)
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to save configuration' })
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEnvEdit = () => {
    if (editingServiceId) {
      // Clear only the editing service's config
      setEnvConfigs(prev => {
        const next = { ...prev }
        delete next[editingServiceId]
        return next
      })
      setEnvEditForms(prev => {
        const next = { ...prev }
        delete next[editingServiceId]
        return next
      })
      setCustomEnvVars(prev => {
        const next = { ...prev }
        delete next[editingServiceId]
        return next
      })
    }
    setEditingServiceId(null)
  }

  const handleExpandService = async (serviceId: string) => {
    // Load env config when expanding
    console.log('[ServicesPage] Loading env config for:', serviceId)
    setLoadingEnvConfig(serviceId)
    setExpandedServices(prev => new Set(prev).add(serviceId))
    try {
      const response = await servicesApi.getEnvConfig(serviceId)
      console.log('[ServicesPage] Env config loaded for:', serviceId)
      const data = response.data

      // Initialize edit form with current config
      const formData: Record<string, EnvVarConfig> = {}
      ;[...data.required_env_vars, ...data.optional_env_vars].forEach(ev => {
        formData[ev.name] = {
          name: ev.name,
          source: (ev.source as 'setting' | 'literal' | 'default') || 'default',
          setting_path: ev.setting_path,
          value: ev.value
        }
      })

      setEnvConfigs(prev => ({ ...prev, [serviceId]: data }))
      setEnvEditForms(prev => ({ ...prev, [serviceId]: formData }))
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Failed to load env configuration' })
    } finally {
      setLoadingEnvConfig(null)
    }
  }

  const handleCollapseService = (serviceId: string) => {
    setExpandedServices(prev => {
      const next = new Set(prev)
      next.delete(serviceId)
      return next
    })
    // Clear edit state if collapsing
    if (editingServiceId === serviceId) {
      setEditingServiceId(null)
      setEnvConfigs(prev => {
        const next = { ...prev }
        delete next[serviceId]
        return next
      })
      setEnvEditForms(prev => {
        const next = { ...prev }
        delete next[serviceId]
        return next
      })
      setCustomEnvVars(prev => {
        const next = { ...prev }
        delete next[serviceId]
        return next
      })
    }
  }

  const updateEnvVar = (serviceId: string, name: string, updates: Partial<EnvVarConfig>) => {
    setEnvEditForms(prev => ({
      ...prev,
      [serviceId]: {
        ...(prev[serviceId] || {}),
        [name]: { ...(prev[serviceId]?.[name] || {}), ...updates }
      }
    }))
  }

  // ==========================================================================
  // Provider Actions
  // ==========================================================================

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

  const handleProviderChange = async (capabilityId: string, providerId: string) => {
    setChangingProvider(capabilityId)
    try {
      await providersApi.selectProvider(capabilityId, providerId)
      const response = await providersApi.getCapabilities()
      setCapabilities(response.data)
      setMessage({ type: 'success', text: `Provider changed to ${providerId}` })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to change provider' })
    } finally {
      setChangingProvider(null)
    }
  }

  const handleEditProvider = (capId: string, provider: ProviderWithStatus) => {
    const key = getProviderKey(capId, provider.id)
    const initialForm: Record<string, string> = {}
    ;(provider.credentials || []).forEach(cred => {
      if (cred.type === 'secret') {
        initialForm[cred.key] = ''
      } else {
        initialForm[cred.key] = cred.value || cred.default || ''
      }
    })
    setProviderEditForm(initialForm)
    setEditingProviderId(key)
    setExpandedProviders(prev => new Set(prev).add(key))
  }

  const handleSaveProvider = async (_capId: string, provider: ProviderWithStatus) => {
    setSavingProvider(true)
    try {
      const updates: Record<string, string> = {}
      ;(provider.credentials || []).forEach(cred => {
        const value = providerEditForm[cred.key]
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

  // ==========================================================================
  // Status Helpers
  // ==========================================================================

  const getServiceStatus = (serviceName: string) => {
    const status = serviceStatuses[serviceName]

    if (!status || status.status === 'not_found') {
      return { state: 'stopped', label: 'Stopped', canStart: true, canStop: false }
    }

    // Docker container statuses: created, restarting, running, removing, paused, exited, dead
    switch (status.status) {
      case 'running':
        return { state: 'running', label: 'Running', canStart: false, canStop: true }
      case 'exited':
      case 'stopped':
      case 'dead':
        return { state: 'stopped', label: 'Stopped', canStart: true, canStop: false }
      case 'created':
        return { state: 'stopped', label: 'Created', canStart: true, canStop: false }
      case 'restarting':
        return { state: 'restarting', label: 'Restarting', canStart: false, canStop: true }
      case 'paused':
        return { state: 'paused', label: 'Paused', canStart: true, canStop: true }
      case 'removing':
        return { state: 'removing', label: 'Removing...', canStart: false, canStop: false }
      default:
        // Unknown status - allow stop in case it's stuck
        return { state: 'unknown', label: status.status || 'Unknown', canStart: true, canStop: true }
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================

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
            Configure providers and compose services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded">
              BETA
            </span>
            <button
              onClick={() => setShowGitHubImport(true)}
              data-testid="import-service-button"
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Import Service
            </button>
          </div>
          <button
            onClick={openCatalog}
            data-testid="add-service-button"
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Service
          </button>
          <button
            onClick={loadData}
            className="btn-ghost p-2"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Compose Services</p>
          <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{services.length}</p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Running</p>
          <p className="mt-2 text-2xl font-bold text-success-600 dark:text-success-400">
            {Object.values(serviceStatuses).filter(s => s.status === 'running').length}
          </p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Providers</p>
          <p className="mt-2 text-2xl font-bold text-primary-600 dark:text-primary-400">{capabilities.length}</p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          role="alert"
          className={`card p-4 border ${
            message.type === 'success'
              ? 'bg-success-50 dark:bg-success-900/20 border-success-200 text-success-700'
              : 'bg-error-50 dark:bg-error-900/20 border-error-200 text-error-700'
          }`}
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5" />
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="ml-auto">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Provider Selection */}
      {capabilities.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Providers
          </h2>
          {capabilities.map(cap => {
            const installedProviders = cap.providers.filter(p =>
              p.is_selected || p.is_default || p.configured
            )

            return (
              <div key={cap.id} className="card p-6" data-testid={`provider-section-${cap.id}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 capitalize">
                      {cap.id.replace('_', ' ')}
                    </h3>
                    <p className="text-sm text-neutral-500">{cap.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {installedProviders.map(provider => {
                    const isSelected = provider.id === cap.selected_provider
                    const providerKey = getProviderKey(cap.id, provider.id)
                    const isExpanded = expandedProviders.has(providerKey)
                    const isEditing = editingProviderId === providerKey
                    const editableCreds = (provider.credentials || []).filter(c => c.settings_path)

                    return (
                      <div
                        key={provider.id}
                        data-testid={`provider-card-${cap.id}-${provider.id}`}
                        className={`relative rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800'
                        }`}
                      >
                        <div
                          className="p-4 cursor-pointer"
                          onClick={() => !isEditing && toggleProviderExpanded(cap.id, provider.id)}
                        >
                          <div className="flex items-start gap-3">
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
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                                  {provider.name}
                                </h4>
                                {(provider.id === 'ollama' || provider.id === 'parakeet') && (
                                  <StatusBadge variant="beta" testId={`badge-provider-${provider.id}`} />
                                )}
                              </div>
                              <span className="text-xs text-neutral-500">
                                {provider.mode === 'cloud' ? 'Cloud' : 'Self-Hosted'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Config status icon */}
                              {provider.configured ? (
                                <CheckCircle className="h-4 w-4 text-success-500" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-warning-500" />
                              )}

                              {/* Selection status */}
                              {isSelected ? (
                                provider.configured ? (
                                  <span className="text-xs font-medium text-success-600 bg-success-100 dark:bg-success-900/30 px-2 py-0.5 rounded">
                                    Active
                                  </span>
                                ) : (
                                  <span className="text-xs font-medium text-warning-600 bg-warning-100 dark:bg-warning-900/30 px-2 py-0.5 rounded">
                                    Incomplete
                                  </span>
                                )
                              ) : provider.configured ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleProviderChange(cap.id, provider.id)
                                  }}
                                  disabled={changingProvider === cap.id}
                                  className="text-xs px-2 py-0.5 rounded border border-primary-400 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                                >
                                  Select
                                </button>
                              ) : (
                                <span className="text-xs text-neutral-400">Configure first</span>
                              )}

                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-0 border-t border-neutral-200 dark:border-neutral-700">
                            {editableCreds.length > 0 && (
                              <div className="space-y-3 mt-3">
                                {editableCreds.map(cred => (
                                  <div key={cred.key}>
                                    {isEditing ? (
                                      <>
                                        <div className="flex items-center justify-between mb-1">
                                          <label className="text-xs font-medium text-neutral-600">
                                            {cred.label || cred.key}
                                            {cred.required && <span className="text-error-500 ml-1">*</span>}
                                          </label>
                                          {cred.link && (
                                            <a href={cred.link} target="_blank" rel="noopener noreferrer"
                                               className="text-xs text-primary-600 hover:underline">
                                              Get key →
                                            </a>
                                          )}
                                        </div>
                                        <input
                                          type={cred.type === 'secret' ? 'password' : 'text'}
                                          value={providerEditForm[cred.key] || ''}
                                          onChange={(e) => setProviderEditForm(prev => ({
                                            ...prev, [cred.key]: e.target.value
                                          }))}
                                          placeholder={cred.type === 'secret' ? '••••••••' : ''}
                                          className="input w-full text-sm"
                                        />
                                      </>
                                    ) : (
                                      <div className="flex items-baseline gap-2 text-xs">
                                        <span className="text-neutral-500">
                                          {cred.required && <span className="text-error-500 mr-0.5">*</span>}
                                          {cred.label || cred.key}:
                                        </span>
                                        <span className="font-mono">
                                          {cred.type === 'secret' ? (
                                            cred.has_value ? '••••••••' : <span className="text-warning-600">Not set</span>
                                          ) : (
                                            cred.value || cred.default || <span className="text-warning-600">Not set</span>
                                          )}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <button onClick={handleCancelProviderEdit} className="btn-ghost text-xs">
                                    <X className="h-4 w-4 mr-1" /> Cancel
                                  </button>
                                  <button
                                    onClick={() => handleSaveProvider(cap.id, provider)}
                                    disabled={savingProvider}
                                    className="btn-primary text-xs"
                                  >
                                    {savingProvider ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                                    Save
                                  </button>
                                </div>
                              ) : editableCreds.length > 0 && (
                                <button
                                  onClick={() => handleEditProvider(cap.id, provider)}
                                  className="btn-ghost text-xs"
                                >
                                  <Edit2 className="h-4 w-4 mr-1" />
                                  {provider.configured ? 'Edit' : 'Configure'}
                                </button>
                              )}
                            </div>
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

      {/* Compose Services */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Compose Services
        </h2>

        <div className="card p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {services.map(service => {
              const status = getServiceStatus(service.service_name)
              const isExpanded = expandedServices.has(service.service_id)
              const isEditing = editingServiceId === service.service_id
              const isStarting = startingService === service.service_name
              const isLoadingConfig = loadingEnvConfig === service.service_id
              const envConfig = envConfigs[service.service_id]
              const envEditForm = envEditForms[service.service_id] || {}
              const serviceCustomEnvVars = customEnvVars[service.service_id] || []

              // Debug logging
              if (isExpanded || isLoadingConfig) {
                console.log(`[ServicesPage] ${service.service_name}: isExpanded=${isExpanded}, isLoadingConfig=${isLoadingConfig}, hasEnvConfig=${!!envConfig}`)
              }

              // Card styling based on status
              const getCardClasses = () => {
                if (status.state === 'running') {
                  return 'border-success-400 dark:border-success-600 bg-white dark:bg-neutral-900'
                }
                return 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900'
              }

              const handleCardClick = (e: React.MouseEvent) => {
                // Don't expand if clicking on a button
                if ((e.target as HTMLElement).closest('button')) {
                  return
                }
                if (!isExpanded) {
                  handleExpandService(service.service_id)
                } else if (!isEditing) {
                  handleCollapseService(service.service_id)
                }
              }

              return (
                <div
                  key={service.service_id}
                  data-testid={`service-card-${service.service_name}`}
                  className={`rounded-lg border transition-all shadow-sm ${getCardClasses()} ${!isEditing ? 'cursor-pointer' : ''}`}
                  onClick={!isEditing ? handleCardClick : undefined}
                >
                  <div className="p-4">
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3 flex-1">
                        {/* Service Name Badge - Purple for local/self-hosted */}
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800">
                          <HardDrive className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <h3 className="font-semibold text-purple-900 dark:text-purple-100">
                            {service.service_name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                          </h3>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {/* Start/Stop/Setup Button */}
                        {isStarting ? (
                          <button
                            onClick={() => setStartingService(null)}
                            className="group focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
                          >
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all group-hover:ring-2 bg-warning-100 dark:bg-warning-900/30 group-hover:ring-warning-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-warning-700 dark:text-warning-300" />
                              <span className="text-xs font-medium text-warning-700 dark:text-warning-300">Cancel</span>
                            </div>
                          </button>
                        ) : service.needs_setup ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              // If service has a wizard, navigate to it
                              if (service.wizard) {
                                navigate(`/wizard/${service.wizard}`)
                              } else {
                                // Otherwise, open env var editing pane
                                if (!isExpanded) {
                                  handleExpandService(service.service_id)
                                }
                                setEditingServiceId(service.service_id)
                              }
                            }}
                            className="group focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
                          >
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all group-hover:ring-2 bg-warning-100 dark:bg-warning-900/30 group-hover:ring-warning-400 group-hover:bg-warning-200 dark:group-hover:bg-warning-800">
                              <Edit2 className="h-3.5 w-3.5 text-warning-700 dark:text-warning-300" />
                              <span className="text-xs font-medium text-warning-700 dark:text-warning-300">Setup</span>
                            </div>
                          </button>
                        ) : status.canStart ? (
                          <button
                            onClick={() => handleStartService(service.service_name)}
                            className="group focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
                          >
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all group-hover:ring-2 bg-success-100 dark:bg-success-900/30 group-hover:ring-success-400 group-hover:bg-success-200 dark:group-hover:bg-success-800">
                              <PlayCircle className="h-3.5 w-3.5 text-success-700 dark:text-success-300" />
                              <span className="text-xs font-medium text-success-700 dark:text-success-300">Start</span>
                            </div>
                          </button>
                        ) : status.canStop ? (
                          <button
                            onClick={() => handleStopService(service.service_name)}
                            className="group focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
                          >
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all group-hover:ring-2 bg-error-100 dark:bg-error-900/30 group-hover:ring-error-400 group-hover:bg-error-200 dark:group-hover:bg-error-800">
                              <StopCircle className="h-3.5 w-3.5 text-error-700 dark:text-error-300" />
                              <span className="text-xs font-medium text-error-700 dark:text-error-300">Stop</span>
                            </div>
                          </button>
                        ) : null}

                        {/* Swagger Docs Button */}
                        {status.state === 'running' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              // Get connection info to find the service's port
                              servicesApi.getConnectionInfo(service.service_name).then(info => {
                                if (info.data.port) {
                                  window.open(`http://localhost:${info.data.port}/docs`, '_blank')
                                } else {
                                  alert('Service port not available')
                                }
                              }).catch(err => {
                                console.error('Failed to get service port:', err)
                                alert('Failed to get service connection info')
                              })
                            }}
                            className="group focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
                            title="View API Documentation"
                            data-testid={`swagger-docs-${service.service_name}`}
                          >
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all group-hover:ring-2 bg-primary-100 dark:bg-primary-900/30 group-hover:ring-primary-400 group-hover:bg-primary-200 dark:group-hover:bg-primary-800">
                              <BookOpen className="h-3.5 w-3.5 text-primary-700 dark:text-primary-300" />
                              <span className="text-xs font-medium text-primary-700 dark:text-primary-300">API</span>
                            </div>
                          </button>
                        )}

                        {/* Expand/Collapse */}
                        <div className="flex items-center text-neutral-400">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                      {service.description || service.image || `Docker service from ${service.compose_file.split('/').pop()}`}
                    </p>

                    {/* Service Error */}
                    {serviceErrors[service.service_name] && (
                      <div className="mb-2 p-2 rounded-md bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-error-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-error-700 dark:text-error-300">
                              {serviceErrors[service.service_name]}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setServiceErrors(prev => {
                                const next = { ...prev }
                                delete next[service.service_name]
                                return next
                              })
                            }}
                            className="text-error-400 hover:text-error-600 dark:hover:text-error-200"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Collapsed card info */}
                    {!isExpanded && (
                      <div className="flex items-center justify-between text-xs">
                        {/* Left: Capabilities & env var count */}
                        <div className="flex items-center gap-2">
                          {service.requires && service.requires.length > 0 && (
                            <div className="flex items-center gap-1">
                              {service.requires.map(cap => (
                                <span
                                  key={cap}
                                  className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 capitalize"
                                >
                                  {cap}
                                </span>
                              ))}
                            </div>
                          )}
                          <span className="text-neutral-400">
                            {service.required_env_count + service.optional_env_count} env vars
                          </span>
                        </div>

                        {/* Right: Port display with edit */}
                        <div className="flex items-center gap-2">
                          {service.ports && service.ports.length > 0 && service.ports[0].host && (
                            <div className="flex items-center gap-1">
                              {status.state === 'running' ? (
                                <a
                                  href={`http://localhost:${service.ports[0].host}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:underline"
                                  data-testid={`service-port-${service.service_id}`}
                                >
                                  :{service.ports[0].host}
                                </a>
                              ) : (
                                <span className="text-neutral-500" data-testid={`service-port-${service.service_id}`}>
                                  :{service.ports[0].host}
                                </span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setPortEditDialog({
                                    isOpen: true,
                                    serviceId: service.service_id,
                                    serviceName: service.service_name,
                                    currentPort: parseInt(service.ports[0].host || '0', 10),
                                    envVar: service.ports[0].env_var || null,
                                    newPort: service.ports[0].host || ''
                                  })
                                }}
                                className="p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                                title="Edit port"
                                data-testid={`edit-port-${service.service_id}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          {service.needs_setup && (
                            <span className="text-warning-600 dark:text-warning-400">Needs Setup</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-neutral-200 dark:border-neutral-700">
                      {/* Loading state */}
                      {isLoadingConfig && (
                        <div className="mt-3 flex items-center justify-center py-4" data-testid={`loading-config-${service.service_name}`}>
                          <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
                          <span className="ml-2 text-sm text-neutral-500">Loading configuration...</span>
                        </div>
                      )}
                      {/* View Mode: Show resolved env vars */}
                      {!isEditing && envConfig && !isLoadingConfig && (
                        <div className="mt-3 space-y-1.5">
                          {[...envConfig.required_env_vars, ...envConfig.optional_env_vars].map(ev => (
                            <div key={ev.name} className="flex items-baseline gap-2 text-sm">
                              <span className="text-neutral-500 dark:text-neutral-400">
                                {ev.is_required && <span className="text-error-500 mr-0.5">*</span>}
                                {ev.name}:
                              </span>
                              <span className="font-mono text-neutral-900 dark:text-neutral-100">
                                {ev.name.includes('KEY') || ev.name.includes('SECRET') || ev.name.includes('PASSWORD')
                                  ? (ev.resolved_value ? '••••••' + ev.resolved_value.slice(-4) : <span className="text-warning-600">Not set</span>)
                                  : (ev.resolved_value || ev.default_value || <span className="text-warning-600">Not set</span>)
                                }
                              </span>
                            </div>
                          ))}

                          {/* Edit Button */}
                          <div className="pt-3 mt-2 border-t border-neutral-200 dark:border-neutral-700">
                            <button
                              onClick={() => setEditingServiceId(service.service_id)}
                              className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                            >
                              <Edit2 className="h-4 w-4" />
                              Edit
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Edit Mode */}
                      {isEditing && envConfig && !isLoadingConfig && (
                        <div className="mt-3">
                          {[...envConfig.required_env_vars, ...envConfig.optional_env_vars].map(ev => (
                            <EnvVarEditor
                              key={ev.name}
                              envVar={ev}
                              config={envEditForm[ev.name]}
                              onChange={(updates) => updateEnvVar(service.service_id, ev.name, updates)}
                            />
                          ))}

                          {/* Custom Env Vars Section */}
                          {serviceCustomEnvVars.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-dashed border-neutral-200 dark:border-neutral-700">
                              <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2">
                                Custom Environment Variables
                              </p>
                              {serviceCustomEnvVars.map((ev, idx) => (
                                <div key={idx} className="flex items-center gap-2 py-2 border-b border-neutral-100 dark:border-neutral-700 last:border-0">
                                  <input
                                    type="text"
                                    value={ev.name}
                                    onChange={(e) => {
                                      const updated = [...serviceCustomEnvVars]
                                      updated[idx] = { ...ev, name: e.target.value.toUpperCase() }
                                      setCustomEnvVars(prev => ({ ...prev, [service.service_id]: updated }))
                                    }}
                                    placeholder="VAR_NAME"
                                    className="w-40 px-2 py-1.5 text-xs font-mono rounded border-0 bg-neutral-700/50 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-neutral-500"
                                    data-testid={`custom-env-name-${idx}`}
                                  />
                                  <span className="text-neutral-500">=</span>
                                  <input
                                    type="text"
                                    value={ev.value}
                                    onChange={(e) => {
                                      const updated = [...serviceCustomEnvVars]
                                      updated[idx] = { ...ev, value: e.target.value }
                                      setCustomEnvVars(prev => ({ ...prev, [service.service_id]: updated }))
                                    }}
                                    placeholder="value"
                                    className="flex-1 px-2 py-1.5 text-xs rounded border-0 bg-neutral-700/50 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-neutral-500"
                                    data-testid={`custom-env-value-${idx}`}
                                  />
                                  <button
                                    onClick={() => {
                                      setCustomEnvVars(prev => ({
                                        ...prev,
                                        [service.service_id]: serviceCustomEnvVars.filter((_, i) => i !== idx)
                                      }))
                                    }}
                                    className="p-1 text-neutral-400 hover:text-error-500 transition-colors"
                                    title="Remove"
                                    data-testid={`custom-env-remove-${idx}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add Custom Env Var Button */}
                          <div className="mt-3">
                            <button
                              onClick={() => setCustomEnvVars(prev => ({
                                ...prev,
                                [service.service_id]: [...serviceCustomEnvVars, { name: '', value: '' }]
                              }))}
                              className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                              data-testid="add-custom-env-btn"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add Custom Env Var
                            </button>
                          </div>

                          {/* Actions */}
                          <div className="pt-2 mt-2 flex items-center gap-2">
                            <button onClick={handleCancelEnvEdit} className="btn-ghost text-xs">
                              <X className="h-3 w-3 mr-1" /> Cancel
                            </button>
                            <button
                              onClick={() => handleSaveEnvVars(service.service_id)}
                              disabled={saving}
                              className="btn-primary text-xs"
                            >
                              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                              Save
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Service Catalog Modal */}
      {showCatalog && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          data-testid="catalog-modal"
          onClick={() => setShowCatalog(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal Content */}
          <div
            className="relative bg-white dark:bg-neutral-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary-600" />
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  Service Catalog
                </h2>
              </div>
              <button
                onClick={() => setShowCatalog(false)}
                className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {catalogLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
                </div>
              ) : (
                <div className="space-y-3">
                  {catalogServices.map(service => (
                    <div
                      key={service.service_id}
                      data-testid={`catalog-item-${service.service_name}`}
                      className={`p-4 rounded-lg border transition-all ${
                        service.installed
                          ? 'border-success-300 dark:border-success-700 bg-success-50 dark:bg-success-900/20'
                          : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                            <HardDrive className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                              {service.service_name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </h4>
                            <p className="text-xs text-neutral-500">
                              {service.description || service.image || 'Docker service'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Capabilities */}
                          {service.requires && service.requires.length > 0 && (
                            <div className="flex items-center gap-1">
                              {service.requires.map(cap => (
                                <span
                                  key={cap}
                                  className="px-1.5 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 capitalize"
                                >
                                  {cap}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Install/Uninstall Button */}
                          {service.installed ? (
                            <button
                              onClick={() => handleUninstallService(service.service_id)}
                              disabled={installingService === service.service_id}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-error-300 text-error-600 hover:bg-error-50 dark:border-error-700 dark:text-error-400 dark:hover:bg-error-900/20 disabled:opacity-50"
                            >
                              {installingService === service.service_id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                              Remove
                            </button>
                          ) : (
                            <button
                              onClick={() => handleInstallService(service.service_id)}
                              disabled={installingService === service.service_id}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                            >
                              {installingService === service.service_id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                              Install
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {catalogServices.length === 0 && (
                    <div className="text-center py-12 text-neutral-500">
                      <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>No services found in the catalog</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 flex justify-end">
              <button
                onClick={() => setShowCatalog(false)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Stop Service"
        message={`Are you sure you want to stop ${confirmDialog.serviceName}?`}
        confirmLabel="Stop Service"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={confirmStopService}
        onCancel={() => setConfirmDialog({ isOpen: false, serviceName: null })}
      />

      {/* Port Conflict Dialog */}
      <PortConflictDialog
        isOpen={portConflictDialog.isOpen}
        serviceName={portConflictDialog.serviceName || ''}
        conflicts={portConflictDialog.conflicts}
        onResolve={handleResolvePortConflict}
        onDismiss={() => setPortConflictDialog({ isOpen: false, serviceId: null, serviceName: null, conflicts: [] })}
      />

      {/* Port Edit Dialog */}
      <Modal
        isOpen={portEditDialog.isOpen}
        onClose={() => setPortEditDialog({ isOpen: false, serviceId: null, serviceName: null, currentPort: null, envVar: null, newPort: '' })}
        title={`Edit Port for ${portEditDialog.serviceName}`}
        maxWidth="sm"
        testId="port-edit-modal"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Port Number
            </label>
            <input
              type="number"
              value={portEditDialog.newPort}
              onChange={(e) => setPortEditDialog(prev => ({ ...prev, newPort: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
              placeholder="e.g., 8080"
              min="1"
              max="65535"
              data-testid="port-edit-input"
            />
            {portEditDialog.envVar && (
              <p className="mt-1 text-xs text-neutral-500">
                Environment variable: {portEditDialog.envVar}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPortEditDialog({ isOpen: false, serviceId: null, serviceName: null, currentPort: null, envVar: null, newPort: '' })}
              className="px-4 py-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSavePortEdit}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              data-testid="port-edit-save"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      {/* GitHub Import Modal */}
      <ImportFromGitHubModal
        isOpen={showGitHubImport}
        onClose={() => setShowGitHubImport(false)}
        onServiceImported={() => {
          setShowGitHubImport(false)
          loadData()
        }}
      />
    </div>
  )
}

// ==========================================================================
// Env Var Editor Component
// ==========================================================================

interface EnvVarEditorProps {
  envVar: EnvVarInfo
  config: EnvVarConfig
  onChange: (updates: Partial<EnvVarConfig>) => void
}

function EnvVarEditor({ envVar, config, onChange }: EnvVarEditorProps) {
  const [editing, setEditing] = useState(false)
  const [showMapping, setShowMapping] = useState(config.source === 'setting')

  const isSecret = envVar.name.includes('KEY') || envVar.name.includes('SECRET') || envVar.name.includes('PASSWORD')
  const hasDefault = envVar.has_default && envVar.default_value
  const isUsingDefault = config.source === 'default' || (!config.value && !config.setting_path && hasDefault)

  // Generate setting path from env var name for auto-creating settings
  // Keep the full key name to match conventions like api_keys.openai_api_key
  const autoSettingPath = () => {
    const name = envVar.name.toLowerCase()
    if (name.includes('api_key') || name.includes('key') || name.includes('secret') || name.includes('token')) {
      return `api_keys.${name}`
    }
    return `settings.${name}`
  }

  // Handle value input - auto-create setting
  const handleValueChange = (value: string) => {
    if (value) {
      onChange({ source: 'new_setting', new_setting_path: autoSettingPath(), value, setting_path: undefined })
    } else {
      onChange({ source: 'default', value: undefined, setting_path: undefined, new_setting_path: undefined })
    }
  }

  // Check if there's a matching suggestion for auto-mapping
  const matchingSuggestion = envVar.suggestions.find(s => {
    const envName = envVar.name.toLowerCase()
    const pathParts = s.path.toLowerCase().split('.')
    const lastPart = pathParts[pathParts.length - 1]
    return envName.includes(lastPart) || lastPart.includes(envName.replace(/_/g, ''))
  })

  // Auto-map if matching and not yet configured
  const effectiveSettingPath = config.setting_path || (matchingSuggestion?.has_value ? matchingSuggestion.path : undefined)

  return (
    <div className="flex items-center gap-2 py-2 border-b border-neutral-100 dark:border-neutral-700 last:border-0">
      {/* Label */}
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-40 truncate flex-shrink-0" title={envVar.name}>
        {envVar.name}
        {envVar.is_required && <span className="text-error-500 ml-0.5">*</span>}
      </span>

      {/* Map button - LEFT of input */}
      <button
        onClick={() => setShowMapping(!showMapping)}
        className={`px-2 py-1 text-xs rounded transition-colors flex-shrink-0 ${
          showMapping
            ? 'bg-primary-900/30 text-primary-300'
            : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700'
        }`}
        title={showMapping ? 'Enter value' : 'Map to setting'}
      >
        Map
      </button>

      {/* Input area */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {showMapping ? (
          // Mapping mode - styled dropdown
          <select
            value={effectiveSettingPath || ''}
            onChange={(e) => {
              if (e.target.value) {
                onChange({ source: 'setting', setting_path: e.target.value, value: undefined, new_setting_path: undefined })
              }
            }}
            className="flex-1 px-2 py-1.5 text-xs font-mono rounded border-0 bg-neutral-700/50 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer"
          >
            <option value="">select...</option>
            {envVar.suggestions.map(s => (
              <option key={s.path} value={s.path}>
                {s.path}{s.value ? ` → ${s.value}` : ''}
              </option>
            ))}
          </select>
        ) : hasDefault && isUsingDefault && !editing ? (
          // Default value display
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-neutral-500 hover:text-neutral-300 flex-shrink-0"
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <span className="text-xs text-neutral-400 truncate">{envVar.default_value}</span>
            <span className="ml-auto px-1.5 py-0.5 text-[10px] rounded bg-neutral-700 text-neutral-400 flex-shrink-0">default</span>
          </>
        ) : (
          // Value input
          <input
            type={isSecret ? 'password' : 'text'}
            value={config.source === 'setting' ? '' : (config.value || '')}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="enter value"
            className="flex-1 px-2 py-1.5 text-xs rounded border-0 bg-neutral-700/50 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-neutral-500"
            autoFocus={editing}
            onBlur={() => {
              if (!config.value && hasDefault) setEditing(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
