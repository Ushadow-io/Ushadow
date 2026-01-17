import { useState, useEffect, useCallback } from 'react'
import {
  Layers,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  X,
  Loader2,
  Cloud,
  HardDrive,
  Package,
  Pencil,
  Plug,
  Settings,
  Trash2,
  PlayCircle,
  ArrowRight,
  Activity,
  Database,
  Zap,
  Clock,
} from 'lucide-react'
import {
  instancesApi,
  integrationApi,
  settingsApi,
  servicesApi,
  Template,
  Instance,
  InstanceSummary,
  Wiring,
  InstanceCreateRequest,
} from '../services/api'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import { WiringBoard } from '../components/wiring'

/**
 * Extract error message from FastAPI response.
 * Handles both string detail and validation error arrays.
 */
function getErrorMessage(error: any, fallback: string): string {
  const detail = error.response?.data?.detail

  // Handle validation errors (array of error objects)
  if (Array.isArray(detail)) {
    return detail.map((err: any) => err.msg || String(err)).join(', ')
  }

  // Handle string detail
  if (typeof detail === 'string') {
    return detail
  }

  // Fallback
  return fallback
}

export default function InstancesPage() {
  // Templates state
  const [templates, setTemplates] = useState<Template[]>([])
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set())

  // Instances state
  const [instances, setInstances] = useState<InstanceSummary[]>([])
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set())
  const [instanceDetails, setInstanceDetails] = useState<Record<string, Instance>>({})

  // Wiring state (per-service connections)
  const [wiring, setWiring] = useState<Wiring[]>([])

  // Service status state for consumers
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, any>>({})

  // UI state
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    instanceId: string | null
  }>({ isOpen: false, instanceId: null })
  const [showAddProviderModal, setShowAddProviderModal] = useState(false)
  // Track providers user has added (even if not yet configured)
  const [addedProviderIds, setAddedProviderIds] = useState<Set<string>>(new Set())

  // Unified instance creation state (used by both + button and drag-drop)
  const [createInstanceState, setCreateInstanceState] = useState<{
    isOpen: boolean
    template: Template | null
    form: {
      id: string
      name: string
      deployment_target: string
      config: Record<string, string>
    }
    wiring?: {
      capability: string
      consumerId: string
      consumerName: string
    }
  }>({
    isOpen: false,
    template: null,
    form: {
      id: '',
      name: '',
      deployment_target: 'local',
      config: {},
    },
  })

  // Edit modal state - for editing provider templates or instances from wiring board
  const [editingProvider, setEditingProvider] = useState<{
    id: string
    name: string
    isTemplate: boolean
    template: Template | null
    config: Record<string, string>
  } | null>(null)
  const [editConfig, setEditConfig] = useState<Record<string, string>>({})
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // ESC key to close modals
  const closeAllModals = useCallback(() => {
    setCreateInstanceState({
      isOpen: false,
      template: null,
      form: { id: '', name: '', deployment_target: 'local', config: {} },
    })
    setShowAddProviderModal(false)
    setEditingProvider(null)
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAllModals()
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [closeAllModals])

  // Load initial data
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [templatesRes, instancesRes, wiringRes, statusesRes] = await Promise.all([
        instancesApi.getTemplates(),
        instancesApi.getInstances(),
        instancesApi.getWiring(),
        servicesApi.getAllStatuses().catch(() => ({ data: {} })),
      ])

      setTemplates(templatesRes.data)
      setInstances(instancesRes.data)
      setWiring(wiringRes.data)
      setServiceStatuses(statusesRes.data || {})

      // Load details for provider instances (instances that provide capabilities)
      // This enables the wiring board to show config overrides
      const providerTemplates = templatesRes.data.filter((t) => t.provides && t.source === 'provider')
      const providerInstances = instancesRes.data.filter((i) =>
        providerTemplates.some((t) => t.id === i.template_id)
      )

      if (providerInstances.length > 0) {
        const detailsPromises = providerInstances.map((i) =>
          instancesApi.getInstance(i.id).catch(() => null)
        )
        const detailsResults = await Promise.all(detailsPromises)

        const newDetails: Record<string, Instance> = {}
        detailsResults.forEach((res, idx) => {
          if (res?.data) {
            newDetails[providerInstances[idx].id] = res.data
          }
        })
        setInstanceDetails((prev) => ({ ...prev, ...newDetails }))
      }
    } catch (error) {
      console.error('Error loading data:', error)
      setMessage({ type: 'error', text: 'Failed to load instances data' })
    } finally {
      setLoading(false)
    }
  }

  // Template actions
  const toggleTemplate = (templateId: string) => {
    setExpandedTemplates((prev) => {
      const next = new Set(prev)
      if (next.has(templateId)) {
        next.delete(templateId)
      } else {
        next.add(templateId)
      }
      return next
    })
  }

  // Generate next available instance ID for a template
  const generateInstanceId = (templateId: string): string => {
    // Find all existing instances that start with this template ID
    const existingIds = instances
      .map((i) => i.id)
      .filter((id) => id.startsWith(`${templateId}-`))

    // Extract numbers from existing IDs
    const numbers = existingIds
      .map((id) => {
        const match = id.match(new RegExp(`^${templateId}-(\\d+)$`))
        return match ? parseInt(match[1], 10) : 0
      })
      .filter((n) => n > 0)

    // Find next available number
    const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
    return `${templateId}-${nextNum}`
  }

  /**
   * Open create instance modal - unified for both + button and drag-drop
   * @param template - The template to create instance from
   * @param wiring - Optional wiring info (for drag-drop path)
   */
  const openCreateInstanceModal = (
    template: Template,
    wiring?: { capability: string; consumerId: string; consumerName: string }
  ) => {
    // Generate unique incremental ID
    const generatedId = generateInstanceId(template.id)

    // Start with EMPTY config - defaults are shown in UI but not stored
    // Only user-entered values should be in form state
    setCreateInstanceState({
      isOpen: true,
      template,
      form: {
        id: generatedId,
        name: generatedId, // Default name to the generated ID
        deployment_target: template.mode === 'cloud' ? 'cloud' : 'local',
        config: {}, // Empty - only store actual overrides
      },
      wiring, // Optional - only present for drag-drop path
    })
  }

  /**
   * Unified handler for creating instances (both + button and drag-drop)
   * If wiring info is present, also creates the wiring connection
   */
  const handleCreateInstance = async () => {
    if (!createInstanceState.template) return

    setCreating(createInstanceState.template.id)
    try {
      // Filter out empty values - only send actual overrides
      const filteredConfig = Object.fromEntries(
        Object.entries(createInstanceState.form.config).filter(([, v]) => v && v.trim() !== '')
      )

      const data: InstanceCreateRequest = {
        id: createInstanceState.form.id,
        template_id: createInstanceState.template.id,
        name: createInstanceState.form.name,
        deployment_target: createInstanceState.form.deployment_target,
        config: filteredConfig,
      }

      // Step 1: Create the instance
      await instancesApi.createInstance(data)

      // Step 2: If wiring info exists, create the wiring connection (drag-drop path)
      if (createInstanceState.wiring) {
        const newWiring = await instancesApi.createWiring({
          source_instance_id: createInstanceState.form.id,
          source_capability: createInstanceState.wiring.capability,
          target_instance_id: createInstanceState.wiring.consumerId,
          target_capability: createInstanceState.wiring.capability,
        })

        // Update wiring state
        setWiring((prev) => {
          const existing = prev.findIndex(
            (w) =>
              w.target_instance_id === createInstanceState.wiring!.consumerId &&
              w.target_capability === createInstanceState.wiring!.capability
          )
          if (existing >= 0) {
            const updated = [...prev]
            updated[existing] = newWiring.data
            return updated
          }
          return [...prev, newWiring.data]
        })

        setMessage({
          type: 'success',
          text: `Created ${createInstanceState.form.name} and connected to ${createInstanceState.wiring.consumerName}`,
        })
      } else {
        setMessage({ type: 'success', text: `Instance "${createInstanceState.form.name}" created` })
      }

      // Close modal and reload instances
      setCreateInstanceState({
        isOpen: false,
        template: null,
        form: { id: '', name: '', deployment_target: 'local', config: {} },
      })

      const instancesRes = await instancesApi.getInstances()
      setInstances(instancesRes.data)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to create instance'),
      })
    } finally {
      setCreating(null)
    }
  }

  // Instance actions
  const toggleInstance = async (instanceId: string) => {
    if (expandedInstances.has(instanceId)) {
      setExpandedInstances((prev) => {
        const next = new Set(prev)
        next.delete(instanceId)
        return next
      })
    } else {
      // Load full instance details
      if (!instanceDetails[instanceId]) {
        try {
          const res = await instancesApi.getInstance(instanceId)
          setInstanceDetails((prev) => ({
            ...prev,
            [instanceId]: res.data,
          }))
        } catch (error) {
          console.error('Failed to load instance details:', error)
        }
      }
      setExpandedInstances((prev) => new Set(prev).add(instanceId))
    }
  }

  const handleDeleteInstance = (instanceId: string) => {
    setConfirmDialog({ isOpen: true, instanceId })
  }

  const confirmDeleteInstance = async () => {
    const { instanceId } = confirmDialog
    if (!instanceId) return

    setConfirmDialog({ isOpen: false, instanceId: null })

    try {
      await instancesApi.deleteInstance(instanceId)
      setMessage({ type: 'success', text: 'Instance deleted' })

      // Reload instances
      const instancesRes = await instancesApi.getInstances()
      setInstances(instancesRes.data)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to delete instance',
      })
    }
  }

  // Deploy/undeploy actions
  const [deployingInstance, setDeployingInstance] = useState<string | null>(null)

  // Integration sync state
  const [syncingInstance, setSyncingInstance] = useState<string | null>(null)
  const [testingConnection, setTestingConnection] = useState<string | null>(null)
  const [togglingAutoSync, setTogglingAutoSync] = useState<string | null>(null)

  const handleDeployInstance = async (instanceId: string) => {
    setDeployingInstance(instanceId)
    try {
      await instancesApi.deployInstance(instanceId)
      setMessage({ type: 'success', text: 'Instance started' })
      // Reload instances
      const instancesRes = await instancesApi.getInstances()
      setInstances(instancesRes.data)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to start instance',
      })
    } finally {
      setDeployingInstance(null)
    }
  }

  const handleUndeployInstance = async (instanceId: string) => {
    setDeployingInstance(instanceId)
    try {
      await instancesApi.undeployInstance(instanceId)
      setMessage({ type: 'success', text: 'Instance stopped' })
      // Reload instances
      const instancesRes = await instancesApi.getInstances()
      setInstances(instancesRes.data)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to stop instance',
      })
    } finally {
      setDeployingInstance(null)
    }
  }

  // Integration actions
  const handleTestConnection = async (instanceId: string) => {
    setTestingConnection(instanceId)
    try {
      const response = await integrationApi.testConnection(instanceId)
      setMessage({
        type: response.data.success ? 'success' : 'error',
        text: response.data.message,
      })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to test connection'),
      })
    } finally {
      setTestingConnection(null)
    }
  }

  const handleSyncNow = async (instanceId: string) => {
    setSyncingInstance(instanceId)
    try {
      const response = await integrationApi.syncNow(instanceId)
      if (response.data.success) {
        setMessage({
          type: 'success',
          text: `Synced ${response.data.items_synced} items`,
        })
        // Reload instance details to show updated sync status
        const res = await instancesApi.getInstance(instanceId)
        setInstanceDetails((prev) => ({ ...prev, [instanceId]: res.data }))
      } else {
        setMessage({
          type: 'error',
          text: response.data.error || 'Sync failed',
        })
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to sync'),
      })
    } finally {
      setSyncingInstance(null)
    }
  }

  const handleToggleAutoSync = async (instanceId: string, enable: boolean) => {
    setTogglingAutoSync(instanceId)
    try {
      const response = enable
        ? await integrationApi.enableAutoSync(instanceId)
        : await integrationApi.disableAutoSync(instanceId)

      setMessage({
        type: response.data.success ? 'success' : 'error',
        text: response.data.message,
      })

      // Reload instance details to show updated auto-sync status
      const res = await instancesApi.getInstance(instanceId)
      setInstanceDetails((prev) => ({ ...prev, [instanceId]: res.data }))
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to toggle auto-sync'),
      })
    } finally {
      setTogglingAutoSync(null)
    }
  }

  // Consumer/Service handlers for WiringBoard
  const handleStartConsumer = async (consumerId: string) => {
    try {
      // Extract service name from template ID (format: "compose_file:service_name")
      const serviceName = consumerId.includes(':') ? consumerId.split(':').pop()! : consumerId
      await servicesApi.startService(serviceName)
      setMessage({ type: 'success', text: `${consumerId} started` })
      // Reload service statuses
      const statusesRes = await servicesApi.getAllStatuses()
      setServiceStatuses(statusesRes.data || {})
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || `Failed to start ${consumerId}`,
      })
    }
  }

  const handleStopConsumer = async (consumerId: string) => {
    try {
      // Extract service name from template ID (format: "compose_file:service_name")
      const serviceName = consumerId.includes(':') ? consumerId.split(':').pop()! : consumerId
      await servicesApi.stopService(serviceName)
      setMessage({ type: 'success', text: `${consumerId} stopped` })
      // Reload service statuses
      const statusesRes = await servicesApi.getAllStatuses()
      setServiceStatuses(statusesRes.data || {})
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || `Failed to stop ${consumerId}`,
      })
    }
  }

  const handleEditConsumer = (consumerId: string) => {
    // Navigate to services page with the service pre-selected for editing
    // For now, just expand the template to show settings
    const template = templates.find((t) => t.id === consumerId)
    if (template) {
      setSelectedTemplate(template)
      setShowCreateModal(true)
    }
  }

  // Transform data for WiringBoard
  // Providers: provider templates (both configured and unconfigured) + custom instances
  const providerTemplates = templates
    .filter((t) => t.source === 'provider' && t.provides)

  const wiringProviders = [
    // Templates (defaults) - only show configured ones
    ...providerTemplates
      .filter((t) => t.configured) // Only show providers that have been set up
      .map((t) => {
        // Extract config vars from schema - include all fields with required indicator
        const configVars: Array<{ key: string; label: string; value: string; isSecret: boolean; required?: boolean }> =
          t.config_schema
            ?.map((field: any) => {
              const isSecret = field.type === 'secret'
              const hasValue = field.has_value || !!field.value
              let displayValue = ''
              if (hasValue) {
                if (isSecret) {
                  displayValue = '••••••'
                } else if (field.value) {
                  displayValue = String(field.value)
                } else if (field.has_value) {
                  // Has a value but we can't display it - show brief indicator
                  displayValue = '(set)'
                }
              }
              return {
                key: field.key,
                label: field.label || field.key,
                value: displayValue,
                isSecret,
                required: field.required,
              }
            }) || []

        // Cloud services: status is based on configuration, not Docker
        // Local services: status is based on Docker availability
        let status: string
        if (t.mode === 'cloud') {
          // Cloud services are either configured or need setup
          status = t.configured ? 'configured' : 'needs_setup'
        } else {
          // Local services use availability (from Docker)
          status = t.available ? 'running' : 'stopped'
        }

        // For LLM providers, append model to name for clarity
        let displayName = t.name
        if (t.provides === 'llm') {
          const modelVar = configVars.find(v => v.key === 'model')
          if (modelVar && modelVar.value && modelVar.value !== '(set)') {
            displayName = `${t.name}-${modelVar.value}`
          }
        }

        return {
          id: t.id,
          name: displayName,
          capability: t.provides!,
          status,
          mode: t.mode,
          isTemplate: true,
          templateId: t.id,
          configVars,
          configured: t.configured,
        }
      }),
    // Custom instances from provider templates
    ...instances
      .filter((i) => {
        const template = providerTemplates.find((t) => t.id === i.template_id)
        return template && template.provides
      })
      .map((i) => {
        const template = providerTemplates.find((t) => t.id === i.template_id)!
        // Get instance config from instanceDetails if loaded
        const details = instanceDetails[i.id]
        const schema = template.config_schema || []
        const configVars: Array<{ key: string; label: string; value: string; isSecret: boolean; required?: boolean }> = []

        // Build config vars from schema, merging with instance overrides
        schema.forEach((field: any) => {
          const overrideValue = details?.config?.values?.[field.key]
          const isSecret = field.type === 'secret'
          let displayValue = ''
          if (overrideValue) {
            // Instance has an override value
            displayValue = isSecret ? '••••••' : String(overrideValue)
          } else if (field.value) {
            // Inherited from template - show the actual value
            displayValue = isSecret ? '••••••' : String(field.value)
          } else if (field.has_value) {
            // Template has a value but we can't display it
            displayValue = isSecret ? '••••••' : '(set)'
          }
          configVars.push({
            key: field.key,
            label: field.label || field.key,
            value: displayValue,
            isSecret,
            required: field.required,
          })
        })

        // Determine status based on mode
        let instanceStatus: string
        if (template.mode === 'cloud') {
          // Cloud instances use config-based status
          // Check if all required fields have values
          const hasAllRequired = schema.every((field: any) => {
            if (!field.required) return true
            const overrideValue = details?.config?.values?.[field.key]
            return !!(overrideValue || field.has_value || field.value)
          })
          instanceStatus = hasAllRequired ? 'configured' : 'needs_setup'
        } else {
          // Local instances use Docker status
          instanceStatus = i.status === 'running' ? 'running' : i.status
        }

        // For LLM providers, append model to name for clarity
        let displayName = i.name
        if (template.provides === 'llm') {
          const modelVar = configVars.find(v => v.key === 'model')
          if (modelVar && modelVar.value && modelVar.value !== '(set)') {
            displayName = `${i.name}-${modelVar.value}`
          }
        }

        return {
          id: i.id,
          name: displayName,
          capability: template.provides!,
          status: instanceStatus,
          mode: template.mode,
          isTemplate: false,
          templateId: i.template_id,
          configVars,
          configured: template.configured, // Instance inherits template's configured status
        }
      }),
  ]

  // Consumers: compose services that require capabilities
  const wiringConsumers = templates
    .filter((t) => t.source === 'compose' && t.requires && t.requires.length > 0)
    .map((t) => {
      // Get actual status from Docker
      // Extract service name from template ID (format: "compose_file:service_name")
      const serviceName = t.id.includes(':') ? t.id.split(':').pop()! : t.id
      const dockerStatus = serviceStatuses[serviceName]
      const status = dockerStatus?.status || 'not_running'

      // Build config vars from schema
      const configVars = (t.config_schema || []).map((field: any) => {
        const isSecret = field.type === 'secret'
        let displayValue = ''
        if (field.has_value) {
          displayValue = isSecret ? '••••••' : (field.value ? String(field.value) : '(default)')
        } else if (field.value) {
          displayValue = isSecret ? '••••••' : String(field.value)
        }
        return {
          key: field.key,
          label: field.label || field.key,
          value: displayValue,
          isSecret,
          required: field.required,
        }
      })

      return {
        id: t.id,
        name: t.name,
        requires: t.requires!,
        status,
        mode: t.mode || 'local',
        configVars,
        configured: t.configured,
        description: t.description,
      }
    })

  // Handle provider drop - show modal for templates, direct wire for instances
  const handleProviderDrop = async (dropInfo: {
    provider: { id: string; name: string; capability: string; isTemplate: boolean; templateId: string }
    consumerId: string
    capability: string
  }) => {
    const consumer = wiringConsumers.find((c) => c.id === dropInfo.consumerId)

    // If it's an instance (not a template), wire directly without showing modal
    if (!dropInfo.provider.isTemplate) {
      try {
        const newWiring = await instancesApi.createWiring({
          source_instance_id: dropInfo.provider.id,
          source_capability: dropInfo.capability,
          target_instance_id: dropInfo.consumerId,
          target_capability: dropInfo.capability,
        })
        setWiring((prev) => {
          const existing = prev.findIndex(
            (w) => w.target_instance_id === dropInfo.consumerId &&
                   w.target_capability === dropInfo.capability
          )
          if (existing >= 0) {
            const updated = [...prev]
            updated[existing] = newWiring.data
            return updated
          }
          return [...prev, newWiring.data]
        })
      } catch (err) {
        console.error('Failed to create wiring:', err)
      }
      return
    }

    // For templates, open the create instance modal with wiring info
    const template = templates.find((t) => t.id === dropInfo.provider.id)
    if (template) {
      openCreateInstanceModal(template, {
        capability: dropInfo.capability,
        consumerId: dropInfo.consumerId,
        consumerName: consumer?.name || dropInfo.consumerId,
      })
    }
  }

  const handleDeleteWiringFromBoard = async (consumerId: string, capability: string) => {
    // Find the wiring to delete
    const wire = wiring.find(
      (w) => w.target_instance_id === consumerId && w.target_capability === capability
    )
    if (!wire) return

    try {
      await instancesApi.deleteWiring(wire.id)
      setWiring((prev) => prev.filter((w) => w.id !== wire.id))
      setMessage({ type: 'success', text: `${capability} disconnected` })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to clear provider',
      })
      throw error
    }
  }

  // Handle edit provider/instance from wiring board
  const handleEditProviderFromBoard = async (providerId: string, isTemplate: boolean) => {
    if (isTemplate) {
      // Edit template - open modal with template config
      const template = templates.find((t) => t.id === providerId)
      if (template) {
        // Pre-populate config from template values
        const initialConfig: Record<string, string> = {}
        template.config_schema?.forEach((field: any) => {
          if (field.value) {
            initialConfig[field.key] = field.value
          }
        })

        setEditingProvider({
          id: providerId,
          name: template.name,
          isTemplate: true,
          template,
          config: initialConfig,
        })
        setEditConfig(initialConfig)
      }
    } else {
      // Edit instance - fetch details and open modal
      try {
        let details = instanceDetails[providerId]
        if (!details) {
          const res = await instancesApi.getInstance(providerId)
          details = res.data
          setInstanceDetails((prev) => ({ ...prev, [providerId]: details }))
        }

        const instance = instances.find((i) => i.id === providerId)
        const template = templates.find((t) => t.id === instance?.template_id)

        if (details && template) {
          const initialConfig = details.config?.values || {}
          setEditingProvider({
            id: providerId,
            name: details.name,
            isTemplate: false,
            template,
            config: initialConfig as Record<string, string>,
          })
          setEditConfig(initialConfig as Record<string, string>)
        }
      } catch (err) {
        console.error('Failed to load instance details:', err)
        setMessage({ type: 'error', text: 'Failed to load instance details' })
      }
    }
  }

  // Handle save edit from modal
  const handleSaveEdit = async () => {
    if (!editingProvider) return

    setIsSavingEdit(true)
    try {
      if (editingProvider.isTemplate) {
        // Templates store values in settings store via settings_path
        // Build a nested update object from the config schema
        const updates: Record<string, Record<string, string>> = {}
        const schema = editingProvider.template?.config_schema || []

        for (const field of schema) {
          const newValue = editConfig[field.key]
          // Only update if user provided a new value (not empty for existing secrets)
          if (newValue && newValue.trim()) {
            if (field.settings_path) {
              // Parse path like "api_keys.openai_api_key" into nested object
              const parts = field.settings_path.split('.')
              if (parts.length === 2) {
                const [section, key] = parts
                if (!updates[section]) updates[section] = {}
                updates[section][key] = newValue
              }
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          await settingsApi.update(updates)
        }

        // Refresh templates to get updated values
        const templatesRes = await instancesApi.getTemplates()
        setTemplates(templatesRes.data)
        setMessage({ type: 'success', text: `${editingProvider.name} settings updated` })
      } else {
        // Update instance config - filter out empty values before saving
        const filteredConfig = Object.fromEntries(
          Object.entries(editConfig).filter(([, v]) => v && v.trim() !== '')
        )
        await instancesApi.updateInstance(editingProvider.id, { config: filteredConfig })
        // Refresh instance details
        const res = await instancesApi.getInstance(editingProvider.id)
        setInstanceDetails((prev) => ({ ...prev, [editingProvider.id]: res.data }))
        setMessage({ type: 'success', text: `${editingProvider.name} updated` })
      }
      setEditingProvider(null)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to save changes',
      })
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Handle create instance from wiring board (via "+" button)
  const handleCreateInstanceFromBoard = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId)
    if (template) {
      openCreateInstanceModal(template)
    }
  }

  // Group templates by source
  const composeTemplates = templates.filter((t) => t.source === 'compose')
  const allProviderTemplates = templates.filter((t) => t.source === 'provider')

  // Providers shown in grid: configured OR user has added them
  const visibleProviders = allProviderTemplates.filter(
    (t) => (t.configured && t.available) || addedProviderIds.has(t.id)
  )
  // Providers in "Add" menu: not configured and not yet added
  const availableToAdd = allProviderTemplates.filter(
    (t) => (!t.configured || !t.available) && !addedProviderIds.has(t.id)
  )

  const handleAddProvider = (templateId: string) => {
    setAddedProviderIds((prev) => new Set(prev).add(templateId))
    setShowAddProviderModal(false)
  }

  // Get status badge for instance
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300">
            <CheckCircle className="h-3 w-3" />
            Running
          </span>
        )
      case 'deploying':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            Starting
          </span>
        )
      case 'pending':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300">
            <HardDrive className="h-3 w-3" />
            Pending
          </span>
        )
      case 'stopped':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
            Stopped
          </span>
        )
      case 'error':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-300">
            <AlertCircle className="h-3 w-3" />
            Error
          </span>
        )
      case 'n/a':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            <Cloud className="h-3 w-3" />
            Cloud
          </span>
        )
      case 'not_found':
      case 'not_running':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
            <AlertCircle className="h-3 w-3" />
            Not Running
          </span>
        )
      default:
        return (
          <span className="px-2 py-0.5 text-xs rounded-full bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300">
            {status}
          </span>
        )
    }
  }

  // Render
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" data-testid="instances-loading">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-neutral-400 mx-auto mb-4 animate-spin" />
          <p className="text-neutral-600 dark:text-neutral-400">Loading instances...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="instances-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="h-8 w-8 text-neutral-600 dark:text-neutral-400" />
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Instances</h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Create and manage service instances from templates
          </p>
        </div>
        <div className="flex items-center gap-2">
          {availableToAdd.length > 0 && (
            <button
              onClick={() => setShowAddProviderModal(true)}
              className="btn-primary flex items-center gap-2"
              data-testid="add-provider-button"
            >
              <Plus className="h-4 w-4" />
              Add Provider
            </button>
          )}
          <button
            onClick={loadData}
            className="btn-ghost p-2"
            title="Refresh"
            data-testid="instances-refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Templates</p>
          <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {templates.length}
          </p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Instances</p>
          <p className="mt-2 text-2xl font-bold text-primary-600 dark:text-primary-400">
            {instances.length}
          </p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Running</p>
          <p className="mt-2 text-2xl font-bold text-success-600 dark:text-success-400">
            {instances.filter((i) => i.status === 'running').length}
          </p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Wiring</p>
          <p className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {wiring.length}
          </p>
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
          data-testid="instances-message"
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

      {/* Instances - Compact list style */}
      {instances.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Active Instances
          </h2>
          <div className="card divide-y divide-neutral-200 dark:divide-neutral-700">
            {instances.map((instance) => {
              const isExpanded = expandedInstances.has(instance.id)
              const details = instanceDetails[instance.id]

              return (
                <div
                  key={instance.id}
                  data-testid={`instance-card-${instance.id}`}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  <div
                    className="px-4 py-3 cursor-pointer flex items-center justify-between"
                    onClick={() => toggleInstance(instance.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {getStatusBadge(instance.status)}
                      <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                        {instance.name}
                      </span>
                      <span className="text-xs text-neutral-400 hidden sm:inline">
                        {instance.template_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {instance.provides && (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 capitalize hidden md:inline">
                          {instance.provides}
                        </span>
                      )}
                      {/* Start/Stop/Setup buttons for deployable instances (not cloud) */}
                      {instance.status !== 'n/a' && (() => {
                        const instanceTemplate = templates.find((t) => t.id === instance.template_id)
                        const needsSetup = instanceTemplate && !instanceTemplate.configured
                        const canStart = instance.status === 'stopped' || instance.status === 'pending' || instance.status === 'error'
                        const canStop = instance.status === 'running' || instance.status === 'deploying'

                        return (
                          <>
                            {/* Setup button - when template is not configured */}
                            {needsSetup && canStart && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  // Expand and open edit modal
                                  if (!expandedInstances.has(instance.id)) {
                                    toggleInstance(instance.id)
                                  }
                                  setEditingProvider({
                                    id: instance.id,
                                    name: instance.name,
                                    isTemplate: false,
                                    template: instanceTemplate,
                                    config: (instanceDetails[instance.id]?.config.values || {}) as Record<string, string>,
                                  })
                                  setEditConfig((instanceDetails[instance.id]?.config.values || {}) as Record<string, string>)
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300 hover:bg-warning-200 dark:hover:bg-warning-900/50"
                                title="Configure required settings"
                                data-testid={`setup-instance-${instance.id}`}
                              >
                                <Settings className="h-3 w-3" />
                                <span className="hidden sm:inline">Setup</span>
                              </button>
                            )}
                            {/* Start button - when configured */}
                            {!needsSetup && canStart && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeployInstance(instance.id)
                                }}
                                disabled={deployingInstance === instance.id}
                                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300 hover:bg-success-200 dark:hover:bg-success-900/50 disabled:opacity-50"
                                title="Start"
                                data-testid={`start-instance-${instance.id}`}
                              >
                                {deployingInstance === instance.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <PlayCircle className="h-3 w-3" />
                                )}
                                <span className="hidden sm:inline">Start</span>
                              </button>
                            )}
                            {/* Stop button */}
                            {canStop && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleUndeployInstance(instance.id)
                                }}
                                disabled={deployingInstance === instance.id}
                                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600 disabled:opacity-50"
                                title="Stop"
                                data-testid={`stop-instance-${instance.id}`}
                              >
                                {deployingInstance === instance.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                                <span className="hidden sm:inline">Stop</span>
                              </button>
                            )}
                          </>
                        )
                      })()}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteInstance(instance.id)
                        }}
                        className="p-1 text-neutral-400 hover:text-error-600 dark:hover:text-error-400 rounded"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-neutral-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-neutral-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && details && (() => {
                    const template = templates.find((t) => t.id === instance.template_id)
                    const configSchema = template?.config_schema || []
                    const hasConfigSchema = configSchema.length > 0
                    const configValues = details.config.values || {}

                    return (
                      <div className="px-4 pb-3 pt-1 bg-neutral-50 dark:bg-neutral-800/30 text-xs space-y-3">
                        {/* Config Schema with required indicators */}
                        {hasConfigSchema && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                                Configuration
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  // Open edit modal for this instance
                                  setEditingProvider({
                                    id: instance.id,
                                    name: instance.name,
                                    isTemplate: false,
                                    template: template || null,
                                    config: configValues as Record<string, string>,
                                  })
                                  setEditConfig(configValues as Record<string, string>)
                                }}
                                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                                data-testid={`edit-instance-config-${instance.id}`}
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </button>
                            </div>
                            {configSchema.map((field) => {
                              const overrideValue = configValues[field.key]
                              const displayValue = overrideValue || field.value || field.default || ''
                              const isSecret = field.type === 'secret'
                              const isRequired = field.required
                              const hasValue = field.has_value || !!field.default || !!overrideValue
                              const needsValue = isRequired && !hasValue

                              return (
                                <div
                                  key={field.key}
                                  className="flex items-baseline gap-2 py-1 border-b border-neutral-100 dark:border-neutral-700 last:border-0"
                                >
                                  <span className="text-neutral-500 dark:text-neutral-400 w-28 truncate flex-shrink-0">
                                    {isRequired && <span className="text-error-500 mr-0.5">*</span>}
                                    {field.label || field.key}:
                                  </span>
                                  <span className="font-mono text-neutral-900 dark:text-neutral-100 flex-1 truncate">
                                    {needsValue ? (
                                      <span className="text-warning-600 dark:text-warning-400">Not set</span>
                                    ) : isSecret ? (
                                      '••••••••'
                                    ) : (
                                      displayValue || <span className="text-neutral-400">—</span>
                                    )}
                                  </span>
                                  {overrideValue && (
                                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex-shrink-0">
                                      override
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Legacy: Show override values if no schema (shouldn't happen, but fallback) */}
                        {!hasConfigSchema && Object.entries(configValues).length > 0 && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {Object.entries(configValues).map(([key, value]) => (
                              <div key={key} className="flex items-baseline gap-1">
                                <span className="text-neutral-400">{key}:</span>
                                <span className="font-mono text-neutral-700 dark:text-neutral-300">
                                  {String(value).length > 30
                                    ? String(value).slice(0, 30) + '...'
                                    : String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Integration Sync UI - only shown for integrations */}
                        {details.integration_type && (
                          <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                                <Database className="h-3 w-3" />
                                Integration Sync
                              </span>
                              <span className="text-[10px] text-neutral-400 capitalize">
                                {details.integration_type}
                              </span>
                            </div>

                            {/* Sync Status */}
                            <div className="flex items-center gap-2 py-1">
                              <span className="text-neutral-500 dark:text-neutral-400 w-28 text-xs">
                                Status:
                              </span>
                              <div className="flex-1 flex items-center gap-2">
                                {details.last_sync_status === 'success' && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300">
                                    <CheckCircle className="h-3 w-3" />
                                    Success
                                  </span>
                                )}
                                {details.last_sync_status === 'error' && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-300">
                                    <AlertCircle className="h-3 w-3" />
                                    Error
                                  </span>
                                )}
                                {details.last_sync_status === 'in_progress' && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Syncing
                                  </span>
                                )}
                                {details.last_sync_status === 'never' && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">
                                    Never synced
                                  </span>
                                )}
                                {details.last_sync_at && (
                                  <span className="text-xs text-neutral-500">
                                    {new Date(details.last_sync_at).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Last Sync Items Count */}
                            {details.last_sync_items_count !== null && details.last_sync_items_count !== undefined && (
                              <div className="flex items-center gap-2 py-1">
                                <span className="text-neutral-500 dark:text-neutral-400 w-28 text-xs">
                                  Items Synced:
                                </span>
                                <span className="text-xs text-neutral-700 dark:text-neutral-300">
                                  {details.last_sync_items_count}
                                </span>
                              </div>
                            )}

                            {/* Auto-Sync Status */}
                            <div className="flex items-center gap-2 py-1">
                              <span className="text-neutral-500 dark:text-neutral-400 w-28 text-xs">
                                Auto-Sync:
                              </span>
                              <div className="flex-1 flex items-center gap-2">
                                {details.sync_enabled ? (
                                  <>
                                    <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                                      <Zap className="h-3 w-3" />
                                      Enabled
                                    </span>
                                    {details.next_sync_at && (
                                      <span className="text-xs text-neutral-500 flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        Next: {new Date(details.next_sync_at).toLocaleString()}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-neutral-500">Disabled</span>
                                )}
                              </div>
                            </div>

                            {/* Sync Error */}
                            {details.last_sync_error && (
                              <div className="p-2 rounded bg-error-50 dark:bg-error-900/20 text-error-700 dark:text-error-300 text-xs">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                                  <span>{details.last_sync_error}</span>
                                </div>
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 pt-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleTestConnection(instance.id)
                                }}
                                disabled={testingConnection === instance.id}
                                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600 disabled:opacity-50"
                                data-testid={`test-connection-${instance.id}`}
                              >
                                {testingConnection === instance.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Activity className="h-3 w-3" />
                                )}
                                <span>Test Connection</span>
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSyncNow(instance.id)
                                }}
                                disabled={syncingInstance === instance.id || details.last_sync_status === 'in_progress'}
                                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50 disabled:opacity-50"
                                data-testid={`sync-now-${instance.id}`}
                              >
                                {syncingInstance === instance.id || details.last_sync_status === 'in_progress' ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                <span>Sync Now</span>
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggleAutoSync(instance.id, !details.sync_enabled)
                                }}
                                disabled={togglingAutoSync === instance.id}
                                className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
                                  details.sync_enabled
                                    ? 'bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300 hover:bg-warning-200 dark:hover:bg-warning-900/50'
                                    : 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300 hover:bg-success-200 dark:hover:bg-success-900/50'
                                } disabled:opacity-50`}
                                data-testid={`toggle-auto-sync-${instance.id}`}
                              >
                                {togglingAutoSync === instance.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Zap className="h-3 w-3" />
                                )}
                                <span>{details.sync_enabled ? 'Disable' : 'Enable'} Auto-Sync</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Access URL */}
                        {details.outputs?.access_url && (
                          <a
                            href={details.outputs.access_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 hover:underline inline-block"
                          >
                            {details.outputs.access_url}
                          </a>
                        )}

                        {/* Error */}
                        {details.error && (
                          <div className="p-2 rounded bg-error-50 dark:bg-error-900/20 text-error-700 dark:text-error-300">
                            {details.error}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Templates - Compose */}
      {composeTemplates.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Package className="h-5 w-5" />
            Compose Services
          </h2>
          <div className="card p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {composeTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isExpanded={expandedTemplates.has(template.id)}
                  onToggle={() => toggleTemplate(template.id)}
                  onCreate={() => openCreateInstanceModal(template)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Templates - Providers */}
      {(visibleProviders.length > 0 || availableToAdd.length > 0) && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Providers
          </h2>
          <div className="card p-6">
            {visibleProviders.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleProviders.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isExpanded={expandedTemplates.has(template.id)}
                    onToggle={() => toggleTemplate(template.id)}
                    onCreate={() => openCreateInstanceModal(template)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Cloud className="h-12 w-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                <p className="text-neutral-500 dark:text-neutral-400 mb-4">
                  No providers added yet
                </p>
                <button
                  onClick={() => setShowAddProviderModal(true)}
                  className="btn-primary flex items-center gap-2 mx-auto"
                >
                  <Plus className="h-4 w-4" />
                  Add Provider
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Wiring Board - Drag and Drop Interface */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Wiring
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Drag providers to connect them to service capability slots
          </p>
        </div>

        <div className="card p-6">
          <WiringBoard
            providers={wiringProviders}
            consumers={wiringConsumers}
            wiring={wiring}
            onProviderDrop={handleProviderDrop}
            onDeleteWiring={handleDeleteWiringFromBoard}
            onEditProvider={handleEditProviderFromBoard}
            onCreateInstance={handleCreateInstanceFromBoard}
            onDeleteInstance={handleDeleteInstance}
            onStartProvider={async (providerId, isTemplate) => {
              if (isTemplate) {
                // For templates, we can't deploy them directly - need to create instance first
                // This case shouldn't happen as templates don't have start buttons in current UI
                return
              }
              await handleDeployInstance(providerId)
            }}
            onStopProvider={async (providerId, isTemplate) => {
              if (isTemplate) {
                return
              }
              await handleUndeployInstance(providerId)
            }}
            onEditConsumer={handleEditConsumer}
            onStartConsumer={handleStartConsumer}
            onStopConsumer={handleStopConsumer}
          />
        </div>
      </div>

      {/* Unified Create Instance Modal (used by both + button and drag-drop) */}
      <Modal
        isOpen={createInstanceState.isOpen}
        onClose={() => setCreateInstanceState({ ...createInstanceState, isOpen: false })}
        title={createInstanceState.wiring ? 'Connect Provider' : 'Create Instance'}
        titleIcon={createInstanceState.wiring ? <Plug className="h-5 w-5 text-primary-600" /> : <Plus className="h-5 w-5 text-primary-600" />}
        maxWidth="lg"
        testId="create-instance-modal"
      >
        {createInstanceState.template && (
          <div className="space-y-4">
            {/* Wiring connection visual (only shown for drag-drop path) */}
            {createInstanceState.wiring && (
              <div className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                <div className="flex-1 text-right">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {createInstanceState.template.name}
                  </p>
                  <p className="text-xs text-neutral-500">{createInstanceState.wiring.capability}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-primary-500" />
                <div className="flex-1">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {createInstanceState.wiring.consumerName}
                  </p>
                  <p className="text-xs text-neutral-500">{createInstanceState.wiring.capability} slot</p>
                </div>
              </div>
            )}

            {/* Template info (only shown for + button path) */}
            {!createInstanceState.wiring && (
              <div className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {createInstanceState.template.source === 'compose' ? (
                      <HardDrive className="h-4 w-4 text-purple-600" />
                    ) : (
                      <Cloud className="h-4 w-4 text-blue-600" />
                    )}
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">
                      {createInstanceState.template.name}
                    </p>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">{createInstanceState.template.description}</p>
                </div>
              </div>
            )}

            {/* Instance Name */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Instance Name
              </label>
              <input
                type="text"
                value={createInstanceState.form.name}
                onChange={(e) =>
                  setCreateInstanceState((prev) => ({
                    ...prev,
                    form: { ...prev.form, name: e.target.value },
                  }))
                }
                className="input w-full text-sm"
                placeholder={createInstanceState.form.id}
                data-testid="create-instance-name"
              />
            </div>

            {/* Config fields using ConfigFieldRow */}
            {createInstanceState.template.config_schema && createInstanceState.template.config_schema.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Provider Settings
                </label>
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                  {createInstanceState.template.config_schema.map((field: any) => (
                    <ConfigFieldRow
                      key={field.key}
                      field={field}
                      value={createInstanceState.form.config[field.key] || ''}
                      onChange={(value) =>
                        setCreateInstanceState((prev) => ({
                          ...prev,
                          form: {
                            ...prev.form,
                            config: { ...prev.form.config, [field.key]: value },
                          },
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Help text */}
            <p className="text-xs text-neutral-500">
              {createInstanceState.wiring
                ? 'Instance will be created and connected to the service slot.'
                : 'Leave fields blank to use default settings. Only modified values will be stored.'}
            </p>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => setCreateInstanceState({ ...createInstanceState, isOpen: false })}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateInstance}
                disabled={!createInstanceState.form.name || creating === createInstanceState.template.id}
                className="btn-primary flex items-center gap-2"
                data-testid="create-instance-submit"
              >
                {creating === createInstanceState.template.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {createInstanceState.wiring ? 'Create & Connect' : 'Create Instance'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Provider/Instance Modal */}
      <Modal
        isOpen={!!editingProvider}
        onClose={() => setEditingProvider(null)}
        title={editingProvider?.isTemplate ? 'Edit Provider' : 'Edit Instance'}
        titleIcon={<Settings className="h-5 w-5 text-primary-600" />}
        maxWidth="lg"
        testId="edit-provider-modal"
      >
        {editingProvider && editingProvider.template && (
          <div className="space-y-4">
            {/* Provider/Instance name */}
            <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
              <p className="font-medium text-neutral-900 dark:text-neutral-100">
                {editingProvider.name}
              </p>
              <p className="text-xs text-neutral-500">
                {editingProvider.isTemplate ? 'Default provider' : 'Custom instance'}
              </p>
            </div>

            {/* Config fields */}
            {editingProvider.template.config_schema && editingProvider.template.config_schema.length > 0 && (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                {editingProvider.template.config_schema.map((field: any) => (
                  <ConfigFieldRow
                    key={field.key}
                    field={field}
                    value={editConfig[field.key] || ''}
                    onChange={(value) =>
                      setEditConfig((prev) => ({
                        ...prev,
                        [field.key]: value,
                      }))
                    }
                  />
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <button onClick={() => setEditingProvider(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="btn-primary flex items-center gap-2"
                data-testid="edit-save"
              >
                {isSavingEdit ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Provider Modal */}
      <Modal
        isOpen={showAddProviderModal}
        onClose={() => setShowAddProviderModal(false)}
        title="Add Provider"
        maxWidth="md"
        testId="add-provider-modal"
      >
        <div className="space-y-2">
          {availableToAdd.map((template) => (
            <button
              key={template.id}
              onClick={() => handleAddProvider(template.id)}
              className="w-full p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors text-left flex items-center justify-between"
              data-testid={`add-provider-${template.id}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${template.mode === 'local' ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                  {template.mode === 'local' ? (
                    <HardDrive className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  ) : (
                    <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
                <div>
                  <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                    {template.name}
                  </h4>
                  <p className="text-xs text-neutral-500 capitalize">
                    {template.provides}
                  </p>
                </div>
              </div>
              <Plus className="h-4 w-4 text-neutral-400" />
            </button>
          ))}
        </div>

        <div className="flex justify-end pt-4 border-t border-neutral-200 dark:border-neutral-700 mt-4">
          <button
            onClick={() => setShowAddProviderModal(false)}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </Modal>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Delete Instance"
        message={`Are you sure you want to delete this instance?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={confirmDeleteInstance}
        onCancel={() => setConfirmDialog({ isOpen: false, instanceId: null })}
      />
    </div>
  )
}

// =============================================================================
// Config Field Row Component (matches ServicesPage EnvVarEditor style)
// =============================================================================

interface ConfigFieldRowProps {
  field: {
    key: string
    label?: string
    type?: string
    required?: boolean
    has_value?: boolean
    value?: string
    default?: string
    settings_path?: string
  }
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
}

function ConfigFieldRow({ field, value, onChange, readOnly: _readOnly = false }: ConfigFieldRowProps) {
  const [editing, setEditing] = useState(false)
  const [showMapping, setShowMapping] = useState(false)

  const isSecret = field.type === 'secret'
  const isRequired = field.required
  const hasDefault = field.has_value || field.default
  const defaultValue = field.value || field.default || ''
  const hasOverride = value && value.trim() !== ''
  const isUsingDefault = hasDefault && !hasOverride
  const needsValue = isRequired && !hasDefault && !hasOverride

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100 dark:border-neutral-700 last:border-0 bg-white dark:bg-neutral-800">
      {/* Label with required indicator */}
      <span
        className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-32 truncate flex-shrink-0"
        title={field.key}
      >
        {isRequired && <span className="text-error-500 mr-0.5">*</span>}
        {field.label || field.key}
        {needsValue && (
          <span className="ml-1 text-warning-500 text-[10px]">(missing)</span>
        )}
      </span>

      {/* Map button */}
      {field.settings_path && (
        <button
          onClick={() => setShowMapping(!showMapping)}
          className={`px-2 py-1 text-xs rounded transition-colors flex-shrink-0 ${
            showMapping
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300'
              : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
          }`}
          title={showMapping ? 'Enter value' : 'Map to setting'}
        >
          Map
        </button>
      )}

      {/* Input area */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {showMapping && field.settings_path ? (
          // Mapping mode - show setting path
          <span className="flex-1 px-2 py-1.5 text-xs font-mono rounded bg-neutral-100 dark:bg-neutral-700/50 text-neutral-600 dark:text-neutral-300 truncate">
            {field.settings_path}
          </span>
        ) : isUsingDefault && !editing ? (
          // Default value display
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 flex-shrink-0"
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {isSecret ? '••••••••' : defaultValue}
            </span>
            <span className="ml-auto px-1.5 py-0.5 text-[10px] rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 flex-shrink-0">
              default
            </span>
          </>
        ) : (
          // Value input
          <>
            <input
              type={isSecret ? 'password' : 'text'}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={isSecret ? '••••••••' : defaultValue || 'enter value'}
              className="flex-1 px-2 py-1.5 text-xs rounded border-0 bg-neutral-100 dark:bg-neutral-700/50 text-neutral-900 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              autoFocus={editing}
              onBlur={() => {
                if (!value && hasDefault) setEditing(false)
              }}
              data-testid={`config-field-${field.key}`}
            />
            {hasOverride && (
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300 flex-shrink-0">
                override
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Template Card Component
// =============================================================================

interface TemplateCardProps {
  template: Template
  isExpanded: boolean
  onToggle: () => void
  onCreate: () => void
  onRemove?: () => void
}

function TemplateCard({ template, isExpanded, onToggle, onCreate, onRemove }: TemplateCardProps) {
  const isCloud = template.mode === 'cloud'
  // Integrations provide "memory_source" capability and config is per-instance
  const isIntegration = template.provides === 'memory_source'
  // Integrations are always "ready" - config is per-instance
  const isReady = isIntegration ? true : (template.configured && template.available)
  const needsConfig = isIntegration ? false : !template.configured
  const notRunning = isIntegration ? false : (template.configured && !template.available)

  return (
    <div
      data-testid={`template-card-${template.id}`}
      className={`rounded-lg border transition-all ${
        isReady
          ? 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-primary-300 dark:hover:border-primary-600'
          : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50'
      }`}
    >
      <div className="p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-lg ${
              isCloud
                ? 'bg-blue-100 dark:bg-blue-900/30'
                : 'bg-purple-100 dark:bg-purple-900/30'
            }`}
          >
            {isCloud ? (
              <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <HardDrive className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold truncate ${isReady ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-400'}`}>
              {template.name}
            </h3>
            <span className="text-xs text-neutral-500">{isCloud ? 'Cloud' : 'Self-Hosted'}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Status badge */}
            {needsConfig && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300">
                <AlertCircle className="h-3 w-3" />
                Configure
              </span>
            )}
            {notRunning && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">
                <HardDrive className="h-3 w-3" />
                Not Running
              </span>
            )}
            {isReady && template.provides && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 capitalize">
                {template.provides}
              </span>
            )}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-neutral-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-neutral-400" />
            )}
          </div>
        </div>

        {!isExpanded && template.description && (
          <p className="mt-2 text-xs text-neutral-500 line-clamp-2">{template.description}</p>
        )}
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-neutral-200 dark:border-neutral-700">
          <div className="mt-3 space-y-2">
            {template.description && (
              <p className="text-xs text-neutral-500">{template.description}</p>
            )}

            {/* Requires */}
            {template.requires && template.requires.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">Requires:</span>
                <div className="flex flex-wrap gap-1">
                  {template.requires.map((req) => (
                    <span
                      key={req}
                      className="px-1.5 py-0.5 text-xs rounded bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300 capitalize"
                    >
                      {req}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Config schema preview */}
            {template.config_schema && template.config_schema.length > 0 && (
              <div className="flex items-center gap-2">
                <Settings className="h-3 w-3 text-neutral-400" />
                <span className="text-xs text-neutral-500">
                  {template.config_schema.length} config field
                  {template.config_schema.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
            <div className="flex gap-2">
              {needsConfig ? (
                <a
                  href="/services"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300 hover:bg-warning-200 dark:hover:bg-warning-900/50"
                  data-testid={`configure-template-${template.id}`}
                >
                  <Settings className="h-3 w-3" />
                  Configure Settings
                </a>
              ) : notRunning ? (
                <span className="text-xs text-neutral-500">
                  Start the service to create an instance
                </span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCreate()
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                  data-testid={`create-from-template-${template.id}`}
                >
                  <Plus className="h-3 w-3" />
                  Create Instance
                </button>
              )}
            </div>
            {onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove()
                }}
                className="p-1.5 text-neutral-400 hover:text-error-600 dark:hover:text-error-400 rounded"
                title="Remove"
                data-testid={`remove-template-${template.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
