import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { servicesApi, settingsApi, ComposeService } from '../services/api'
import { PortConflictDialog } from '../components/services/PortConflictDialog'
import type { PortConflict } from '../hooks/useServiceStart'

// ============================================================================
// Types
// ============================================================================

export interface ServiceInstance {
  service_id: string
  name: string
  description: string
  template: string
  mode: 'cloud' | 'local'
  is_default: boolean
  enabled: boolean
  config_schema: ConfigField[]
  tags: string[]
}

export interface ConfigField {
  key: string
  label: string
  type: 'string' | 'boolean' | 'number' | 'secret'
  required?: boolean
  env_var?: string
  default?: any
}

export interface ContainerStatus {
  status: 'running' | 'exited' | 'stopped' | 'not_found'
  container_id?: string
  health?: 'healthy' | 'unhealthy' | 'starting'
}

export interface ServiceMessage {
  type: 'success' | 'error'
  text: string
}

export interface ConfirmDialogState {
  isOpen: boolean
  serviceId: string | null
  serviceName: string | null
}

export interface PortConflictDialogState {
  isOpen: boolean
  serviceId: string | null
  serviceName: string | null
  conflicts: PortConflict[]
}

// ============================================================================
// Context Interface
// ============================================================================

interface ServicesContextType {
  // State
  serviceInstances: ComposeService[]
  serviceConfigs: Record<string, Record<string, any>>
  serviceStatuses: Record<string, ContainerStatus>
  loading: boolean
  saving: boolean
  message: ServiceMessage | null
  confirmDialog: ConfirmDialogState
  portConflictDialog: PortConflictDialogState
  editingService: string | null
  editForm: Record<string, any>
  validationErrors: Record<string, string>
  expandedConfigs: Set<string>
  showAllConfigs: boolean
  startingService: string | null
  togglingEnabled: string | null

  // Actions
  loadData: () => Promise<void>
  startService: (serviceId: string) => Promise<void>
  stopService: (serviceId: string) => void
  confirmStopService: () => Promise<void>
  cancelStopService: () => void
  resolvePortConflict: (envVar: string, newPort: number) => Promise<void>
  dismissPortConflict: () => void
  toggleEnabled: (serviceId: string, currentEnabled: boolean) => Promise<void>
  startEditing: (serviceId: string) => void
  saveConfig: (serviceId: string) => Promise<void>
  cancelEditing: () => void
  setEditFormField: (key: string, value: any) => void
  removeEditFormField: (key: string) => void
  toggleConfigExpanded: (serviceId: string) => void
  setShowAllConfigs: (show: boolean) => void
  setMessage: (msg: ServiceMessage | null) => void
  clearMessage: () => void
}

// ============================================================================
// Context Creation
// ============================================================================

const ServicesContext = createContext<ServicesContextType | undefined>(undefined)

// ============================================================================
// Provider Component
// ============================================================================

export function ServicesProvider({ children }: { children: ReactNode }) {
  // Core state
  const [serviceInstances, setServiceInstances] = useState<ComposeService[]>([])
  const [serviceConfigs, setServiceConfigs] = useState<Record<string, Record<string, any>>>({})
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, ContainerStatus>>({})

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<ServiceMessage | null>(null)
  const [startingService, setStartingService] = useState<string | null>(null)
  const [togglingEnabled, setTogglingEnabled] = useState<string | null>(null)

  // Edit state
  const [editingService, setEditingService] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Expansion state
  const [expandedConfigs, setExpandedConfigs] = useState<Set<string>>(new Set())
  const [showAllConfigs, setShowAllConfigs] = useState(false)

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    serviceId: null,
    serviceName: null,
  })

  // Port conflict dialog state
  const [portConflictDialog, setPortConflictDialog] = useState<PortConflictDialogState>({
    isOpen: false,
    serviceId: null,
    serviceName: null,
    conflicts: [],
  })

  // --------------------------------------------------------------------------
  // Data Loading
  // --------------------------------------------------------------------------

  const loadServiceStatuses = useCallback(async (services: ComposeService[], configs: Record<string, any>) => {
    const statuses: Record<string, ContainerStatus> = {}

    for (const service of services) {
      // Services with compose_file are local/docker-managed
      if (service.compose_file) {
        try {
          const response = await servicesApi.getDockerDetails(service.service_id)
          statuses[service.service_id] = {
            status: response.data.status,
            container_id: response.data.container_id,
            health: response.data.health,
          }
        } catch {
          statuses[service.service_id] = { status: 'not_found' }
        }
      } else {
        // Cloud services - check if configured
        const isConfigured = configs[service.service_id] &&
                            Object.keys(configs[service.service_id]).length > 0
        statuses[service.service_id] = {
          status: isConfigured ? 'running' : 'not_found',
        }
      }
    }

    setServiceStatuses(statuses)
  }, [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [instancesResponse, configResponse] = await Promise.all([
        servicesApi.getInstalled(),
        settingsApi.getConfig(),
      ])

      const instances = instancesResponse.data
      const mergedConfig = configResponse.data

      // Build effective config per service
      const effectiveConfigs: Record<string, Record<string, any>> = {}
      instances.forEach((service) => {
        effectiveConfigs[service.service_id] = {}

        // Note: config_schema is available on ServiceInstance (legacy), not ComposeService
        const configSchema = (service as any).config_schema as ConfigField[] | undefined
        configSchema?.forEach((field: ConfigField) => {
          if (field.env_var) {
            const keyName = field.env_var.toLowerCase()
            const value = mergedConfig?.api_keys?.[keyName]
            if (value !== undefined && value !== null) {
              effectiveConfigs[service.service_id][field.key] = value
            }
          } else {
            const value = mergedConfig?.service_preferences?.[service.service_id]?.[field.key]
            if (value !== undefined && value !== null) {
              effectiveConfigs[service.service_id][field.key] = value
            }
          }
        })
      })

      setServiceInstances(instances)
      setServiceConfigs(effectiveConfigs)
      await loadServiceStatuses(instances, effectiveConfigs)
    } catch (error) {
      console.error('Error loading services:', error)
    } finally {
      setLoading(false)
    }
  }, [loadServiceStatuses])

  // --------------------------------------------------------------------------
  // Service Actions
  // --------------------------------------------------------------------------

  const startService = useCallback(async (serviceId: string) => {
    const service = serviceInstances.find(s => s.service_id === serviceId)
    setStartingService(serviceId)

    try {
      // First, run preflight check for port conflicts
      const preflightResponse = await servicesApi.preflightCheck(serviceId)
      const preflight = preflightResponse.data

      if (!preflight.can_start && preflight.port_conflicts.length > 0) {
        // Port conflicts detected - show dialog
        setPortConflictDialog({
          isOpen: true,
          serviceId,
          serviceName: service?.service_name || serviceId,
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
      await servicesApi.startService(serviceId)
      setMessage({ type: 'success', text: 'Service starting...' })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to start service' })
      setStartingService(null)
    }
  }, [serviceInstances])

  const stopService = useCallback((serviceId: string) => {
    const service = serviceInstances.find(s => s.service_id === serviceId)
    setConfirmDialog({
      isOpen: true,
      serviceId,
      serviceName: service?.service_name || serviceId,
    })
  }, [serviceInstances])

  const confirmStopService = useCallback(async () => {
    const { serviceId } = confirmDialog
    if (!serviceId) return

    setConfirmDialog({ isOpen: false, serviceId: null, serviceName: null })

    try {
      await servicesApi.stopService(serviceId)
      setMessage({ type: 'success', text: 'Service stopped' })
      await loadData()
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to stop service' })
    }
  }, [confirmDialog, loadData])

  const cancelStopService = useCallback(() => {
    setConfirmDialog({ isOpen: false, serviceId: null, serviceName: null })
  }, [])

  const resolvePortConflict = useCallback(async (envVar: string, newPort: number) => {
    const { serviceId, serviceName } = portConflictDialog
    if (!serviceId) return

    setStartingService(serviceId)

    try {
      // Set the port override
      await servicesApi.setPortOverride(serviceId, envVar, newPort)

      // Close the dialog
      setPortConflictDialog({
        isOpen: false,
        serviceId: null,
        serviceName: null,
        conflicts: [],
      })

      // Retry the start
      await servicesApi.startService(serviceId)
      setMessage({ type: 'success', text: `Service starting on port ${newPort}...` })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to resolve port conflict' })
      setStartingService(null)
    }
  }, [portConflictDialog])

  const dismissPortConflict = useCallback(() => {
    setPortConflictDialog({
      isOpen: false,
      serviceId: null,
      serviceName: null,
      conflicts: [],
    })
    setStartingService(null)
  }, [])

  const toggleEnabled = useCallback(async (serviceId: string, currentEnabled: boolean) => {
    setTogglingEnabled(serviceId)
    try {
      const newEnabled = !currentEnabled
      await servicesApi.setEnabled(serviceId, newEnabled)

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
  }, [])

  // --------------------------------------------------------------------------
  // Config Editing
  // --------------------------------------------------------------------------

  const startEditing = useCallback((serviceId: string) => {
    const currentConfig = serviceConfigs[serviceId] || {}
    setEditForm({ ...currentConfig })
    setEditingService(serviceId)
    setValidationErrors({})
  }, [serviceConfigs])

  const saveConfig = useCallback(async (serviceId: string) => {
    const service = serviceInstances.find(s => s.service_id === serviceId)
    if (!service) return

    setValidationErrors({})

    // Validate required fields
    const errors: Record<string, string> = {}
    const configSchema = (service as any).config_schema as ConfigField[] | undefined
    configSchema
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
      setServiceConfigs(prev => ({
        ...prev,
        [serviceId]: editForm,
      }))
      setMessage({ type: 'success', text: 'Configuration saved' })
      setEditingService(null)
      setValidationErrors({})
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }, [serviceInstances, editForm])

  const cancelEditing = useCallback(() => {
    setEditingService(null)
    setEditForm({})
    setValidationErrors({})
  }, [])

  const setEditFormField = useCallback((key: string, value: any) => {
    setEditForm(prev => ({ ...prev, [key]: value }))
  }, [])

  const removeEditFormField = useCallback((key: string) => {
    setEditForm(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  // --------------------------------------------------------------------------
  // UI Actions
  // --------------------------------------------------------------------------

  const toggleConfigExpanded = useCallback((serviceId: string) => {
    setExpandedConfigs(prev => {
      const next = new Set(prev)
      if (next.has(serviceId)) {
        next.delete(serviceId)
      } else {
        next.add(serviceId)
      }
      return next
    })
  }, [])

  const clearMessage = useCallback(() => {
    setMessage(null)
  }, [])

  // --------------------------------------------------------------------------
  // Context Value
  // --------------------------------------------------------------------------

  const value: ServicesContextType = {
    // State
    serviceInstances,
    serviceConfigs,
    serviceStatuses,
    loading,
    saving,
    message,
    confirmDialog,
    portConflictDialog,
    editingService,
    editForm,
    validationErrors,
    expandedConfigs,
    showAllConfigs,
    startingService,
    togglingEnabled,

    // Actions
    loadData,
    startService,
    stopService,
    confirmStopService,
    cancelStopService,
    resolvePortConflict,
    dismissPortConflict,
    toggleEnabled,
    startEditing,
    saveConfig,
    cancelEditing,
    setEditFormField,
    removeEditFormField,
    toggleConfigExpanded,
    setShowAllConfigs,
    setMessage,
    clearMessage,
  }

  return (
    <ServicesContext.Provider value={value}>
      {/* Port Conflict Dialog */}
      <PortConflictDialog
        isOpen={portConflictDialog.isOpen}
        serviceName={portConflictDialog.serviceName || ''}
        conflicts={portConflictDialog.conflicts}
        onResolve={resolvePortConflict}
        onDismiss={dismissPortConflict}
        isResolving={!!startingService}
      />
      {children}
    </ServicesContext.Provider>
  )
}

// ============================================================================
// Hook
// ============================================================================

export function useServices() {
  const context = useContext(ServicesContext)
  if (context === undefined) {
    throw new Error('useServices must be used within a ServicesProvider')
  }
  return context
}
