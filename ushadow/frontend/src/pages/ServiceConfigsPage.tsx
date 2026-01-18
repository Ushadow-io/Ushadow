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
  Lock,
} from 'lucide-react'
import {
  svcConfigsApi,
  integrationApi,
  settingsApi,
  servicesApi,
  kubernetesApi,
  clusterApi,
  deploymentsApi,
  Template,
  ServiceConfig,
  ServiceConfigSummary,
  Wiring,
  ServiceConfigCreateRequest,
  EnvVarInfo,
  EnvVarConfig,
} from '../services/api'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import { WiringBoard } from '../components/wiring'
import DeployToK8sModal from '../components/DeployToK8sModal'

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

export default function ServiceConfigsPage() {
  // Templates state
  const [templates, setTemplates] = useState<Template[]>([])
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set())

  // ServiceConfigs state
  const [instances, setServiceConfigs] = useState<ServiceConfigSummary[]>([])
  const [expandedServiceConfigs, setExpandedServiceConfigs] = useState<Set<string>>(new Set())
  const [instanceDetails, setServiceConfigDetails] = useState<Record<string, ServiceConfig>>({})

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

  // Environment variable configuration state (for instance editing)
  const [envVars, setEnvVars] = useState<EnvVarInfo[]>([])
  const [envConfigs, setEnvConfigs] = useState<Record<string, EnvVarConfig>>({})
  const [loadingEnvConfig, setLoadingEnvConfig] = useState(false)

  // Deploy modal state
  const [deployModalState, setDeployModalState] = useState<{
    isOpen: boolean
    serviceId: string | null
    targetType: 'local' | 'remote' | 'kubernetes' | null
    selectedClusterId?: string
    infraServices?: Record<string, any>  // Infrastructure data to pass to modal
  }>({
    isOpen: false,
    serviceId: null,
    targetType: null,
  })

  // Simple deploy confirmation modal (for local/remote)
  const [simpleDeployModal, setSimpleDeployModal] = useState<{
    isOpen: boolean
    serviceId: string | null
    targetType: 'local' | 'remote' | null
    targetId?: string
  }>({
    isOpen: false,
    serviceId: null,
    targetType: null,
  })
  const [deployEnvVars, setDeployEnvVars] = useState<EnvVarInfo[]>([])
  const [deployEnvConfigs, setDeployEnvConfigs] = useState<Record<string, EnvVarConfig>>({})
  const [loadingDeployEnv, setLoadingDeployEnv] = useState(false)
  const [kubernetesClusters, setKubernetesClusters] = useState<any[]>([])
  const [loadingClusters, setLoadingClusters] = useState(false)

  // Service catalog state
  const [showCatalog, setShowCatalog] = useState(false)
  const [catalogServices, setCatalogServices] = useState<any[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [installingService, setInstallingService] = useState<string | null>(null)

  // ESC key to close modals
  const closeAllModals = useCallback(() => {
    setShowAddProviderModal(false)
    setEditingProvider(null)
    setShowCatalog(false)
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
        svcConfigsApi.getTemplates(),
        svcConfigsApi.getServiceConfigs(),
        svcConfigsApi.getWiring(),
        servicesApi.getAllStatuses().catch(() => ({ data: {} })),
      ])

      console.log('Templates loaded:', templatesRes.data)
      console.log('Compose templates (before filter):', templatesRes.data.filter((t: any) => t.source === 'compose'))
      console.log('Compose templates (after installed filter):', templatesRes.data.filter((t: any) => t.source === 'compose' && t.installed))

      setTemplates(templatesRes.data)
      setServiceConfigs(instancesRes.data)
      setWiring(wiringRes.data)
      setServiceStatuses(statusesRes.data || {})

      // Load details for provider instances (instances that provide capabilities)
      // This enables the wiring board to show config overrides
      const providerTemplates = templatesRes.data.filter((t) => t.provides && t.source === 'provider')
      const providerServiceConfigs = instancesRes.data.filter((i) =>
        providerTemplates.some((t) => t.id === i.template_id)
      )

      if (providerServiceConfigs.length > 0) {
        const detailsPromises = providerServiceConfigs.map((i) =>
          svcConfigsApi.getServiceConfig(i.id).catch(() => null)
        )
        const detailsResults = await Promise.all(detailsPromises)

        const newDetails: Record<string, ServiceConfig> = {}
        detailsResults.forEach((res, idx) => {
          if (res?.data) {
            newDetails[providerServiceConfigs[idx].id] = res.data
          }
        })
        setServiceConfigDetails((prev) => ({ ...prev, ...newDetails }))
      }
    } catch (error) {
      console.error('Error loading data:', error)
      setMessage({ type: 'error', text: 'Failed to load instances data' })
    } finally {
      setLoading(false)
    }
  }

  // Service catalog functions
  const openCatalog = async () => {
    console.log('Opening catalog...')
    setShowCatalog(true)
    setCatalogLoading(true)
    try {
      const response = await servicesApi.getCatalog()
      console.log('Catalog response:', response.data)
      setCatalogServices(response.data)
    } catch (error: any) {
      console.error('Catalog error:', error)
      setMessage({ type: 'error', text: 'Failed to load service catalog' })
    } finally {
      setCatalogLoading(false)
    }
  }

  const handleInstallService = async (serviceId: string) => {
    setInstallingService(serviceId)
    try {
      await servicesApi.install(serviceId)
      // Reload templates and catalog
      const [templatesRes, catalogRes] = await Promise.all([
        svcConfigsApi.getTemplates(),
        servicesApi.getCatalog()
      ])
      setTemplates(templatesRes.data)
      setCatalogServices(catalogRes.data)
      setMessage({ type: 'success', text: 'Service installed successfully' })
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
      // Reload templates and catalog
      const [templatesRes, catalogRes] = await Promise.all([
        svcConfigsApi.getTemplates(),
        servicesApi.getCatalog()
      ])
      setTemplates(templatesRes.data)
      setCatalogServices(catalogRes.data)
      setMessage({ type: 'success', text: 'Service uninstalled successfully' })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to uninstall service' })
    } finally {
      setInstallingService(null)
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
  const generateServiceConfigId = (templateId: string): string => {
    // Extract clean name from template ID (remove compose file prefix)
    // For compose services: "chronicle-compose:chronicle-webui" -> "chronicle-webui"
    // For providers: "openai" -> "openai"
    const baseName = templateId.includes(':')
      ? templateId.split(':').pop()!
      : templateId

    // Find all existing instances that start with this base name
    const existingIds = instances
      .map((i) => i.id)
      .filter((id) => id.startsWith(`${baseName}-`))

    // Extract numbers from existing IDs
    const numbers = existingIds
      .map((id) => {
        const match = id.match(new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`))
        return match ? parseInt(match[1], 10) : 0
      })
      .filter((n) => n > 0)

    // Find next available number
    const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
    return `${baseName}-${nextNum}`
  }

  /**
   * Create service config directly - unified for both + button and drag-drop
   * @param template - The template to create instance from
   * @param wiring - Optional wiring info (for drag-drop path)
   */
  const createServiceConfigDirectly = async (
    template: Template,
    wiring?: { capability: string; consumerId: string; consumerName: string }
  ) => {
    // Generate unique incremental ID (already uses clean name without compose prefix)
    const generatedId = generateServiceConfigId(template.id)

    setCreating(template.id)
    try {
      const data: ServiceConfigCreateRequest = {
        id: generatedId,
        template_id: template.id,
        name: generatedId,
        deployment_target: template.mode === 'cloud' ? 'cloud' : 'local',
        config: {}, // Empty config - will be set during deployment
      }

      // Step 1: Create the service config
      await svcConfigsApi.createServiceConfig(data)

      // Step 2: If wiring info exists, create the wiring connection (drag-drop path)
      if (wiring) {
        const newWiring = await svcConfigsApi.createWiring({
          source_config_id: generatedId,
          source_capability: wiring.capability,
          target_config_id: wiring.consumerId,
          target_capability: wiring.capability,
        })

        // Update wiring state
        setWiring((prev) => {
          const existing = prev.findIndex(
            (w) =>
              w.target_config_id === wiring.consumerId &&
              w.target_capability === wiring.capability
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
          text: `Created ${generatedId} and connected to ${wiring.consumerName}`,
        })
      } else {
        setMessage({ type: 'success', text: `Instance "${generatedId}" created` })
      }

      // Reload instances
      const instancesRes = await svcConfigsApi.getServiceConfigs()
      setServiceConfigs(instancesRes.data)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to create instance',
      })
    } finally {
      setCreating(null)
    }
  }

  // ServiceConfig actions
  const toggleServiceConfig = async (instanceId: string) => {
    if (expandedServiceConfigs.has(instanceId)) {
      setExpandedServiceConfigs((prev) => {
        const next = new Set(prev)
        next.delete(instanceId)
        return next
      })
    } else {
      // Load full instance details
      if (!instanceDetails[instanceId]) {
        try {
          const res = await svcConfigsApi.getServiceConfig(instanceId)
          setServiceConfigDetails((prev) => ({
            ...prev,
            [instanceId]: res.data,
          }))
        } catch (error) {
          console.error('Failed to load instance details:', error)
        }
      }
      setExpandedServiceConfigs((prev) => new Set(prev).add(instanceId))
    }
  }

  const handleDeleteServiceConfig = (instanceId: string) => {
    setConfirmDialog({ isOpen: true, instanceId })
  }

  const confirmDeleteServiceConfig = async () => {
    const { instanceId } = confirmDialog
    if (!instanceId) return

    setConfirmDialog({ isOpen: false, instanceId: null })

    try {
      await svcConfigsApi.deleteServiceConfig(instanceId)
      setMessage({ type: 'success', text: 'ServiceConfig deleted' })

      // Reload instances
      const instancesRes = await svcConfigsApi.getServiceConfigs()
      setServiceConfigs(instancesRes.data)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to delete instance',
      })
    }
  }

  // Deploy/undeploy actions
  const [deployingServiceConfig, setDeployingServiceConfig] = useState<string | null>(null)

  // Integration sync state
  const [syncingServiceConfig, setSyncingServiceConfig] = useState<string | null>(null)
  const [testingConnection, setTestingConnection] = useState<string | null>(null)
  const [togglingAutoSync, setTogglingAutoSync] = useState<string | null>(null)

  const handleDeployServiceConfig = async (instanceId: string) => {
    setDeployingServiceConfig(instanceId)
    try {
      await svcConfigsApi.deployServiceConfig(instanceId)
      setMessage({ type: 'success', text: 'ServiceConfig started' })
      // Reload instances
      const instancesRes = await svcConfigsApi.getServiceConfigs()
      setServiceConfigs(instancesRes.data)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to start instance',
      })
    } finally {
      setDeployingServiceConfig(null)
    }
  }

  const handleUndeployServiceConfig = async (instanceId: string) => {
    setDeployingServiceConfig(instanceId)
    try {
      await svcConfigsApi.undeployServiceConfig(instanceId)
      setMessage({ type: 'success', text: 'ServiceConfig stopped' })
      // Reload instances
      const instancesRes = await svcConfigsApi.getServiceConfigs()
      setServiceConfigs(instancesRes.data)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to stop instance',
      })
    } finally {
      setDeployingServiceConfig(null)
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
    setSyncingServiceConfig(instanceId)
    try {
      const response = await integrationApi.syncNow(instanceId)
      if (response.data.success) {
        setMessage({
          type: 'success',
          text: `Synced ${response.data.items_synced} items`,
        })
        // Reload instance details to show updated sync status
        const res = await svcConfigsApi.getServiceConfig(instanceId)
        setServiceConfigDetails((prev) => ({ ...prev, [instanceId]: res.data }))
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
      setSyncingServiceConfig(null)
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
      const res = await svcConfigsApi.getServiceConfig(instanceId)
      setServiceConfigDetails((prev) => ({ ...prev, [instanceId]: res.data }))
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

  const handleDeployConsumer = async (consumerId: string, target: { type: 'local' | 'remote' | 'kubernetes'; id?: string }) => {
    // Get the consumer instance to find its template_id
    const consumerInstance = instances.find(inst => inst.id === consumerId)
    if (!consumerInstance) {
      setMessage({ type: 'error', text: `Service instance ${consumerId} not found` })
      return
    }

    // For Kubernetes, load available clusters first
    if (target.type === 'kubernetes') {
      setLoadingClusters(true)
      try {
        const clustersResponse = await kubernetesApi.listClusters()
        setKubernetesClusters(clustersResponse.data)

        // If there's only one cluster, auto-select it and use its cached infrastructure scan
        if (clustersResponse.data.length === 1) {
          const cluster = clustersResponse.data[0]

          // Use cached infrastructure scan results from cluster
          // Infrastructure is cluster-wide, so use any available namespace scan
          let infraData = {}
          if (cluster.infra_scans && Object.keys(cluster.infra_scans).length > 0) {
            // Use the first available scan (infra is typically accessible cluster-wide)
            const firstNamespace = Object.keys(cluster.infra_scans)[0]
            infraData = cluster.infra_scans[firstNamespace] || {}
            console.log(`🏗️ Using cached K8s infrastructure from namespace '${firstNamespace}':`, infraData)
          } else {
            console.warn('No cached infrastructure scan found for cluster')
          }

          // Pass template_id as serviceId so the modal loads the right env vars
          setDeployModalState({
            isOpen: true,
            serviceId: consumerInstance.template_id,
            targetType: target.type,
            selectedClusterId: cluster.cluster_id,
            infraServices: infraData,
          })
        } else {
          // Multiple clusters - need to show cluster selection
          // Infrastructure will be loaded when cluster is selected in modal
          setDeployModalState({
            isOpen: true,
            serviceId: consumerInstance.template_id,
            targetType: target.type,
          })
        }
      } catch (err) {
        console.error('Failed to load K8s clusters:', err)
        setMessage({ type: 'error', text: 'Failed to load Kubernetes clusters' })
      } finally {
        setLoadingClusters(false)
      }
    } else if (target.type === 'local' || target.type === 'remote') {
      // Show deploy confirmation modal with env vars
      setSimpleDeployModal({
        isOpen: true,
        serviceId: consumerId,
        targetType: target.type,
        targetId: target.id,
      })

      // Load env config
      setLoadingDeployEnv(true)
      try {
        const response = await servicesApi.getEnvConfig(consumerId)
        const allVars = [...response.data.required_env_vars, ...response.data.optional_env_vars]
        setDeployEnvVars(allVars)

        // Initialize env configs
        const formData: Record<string, EnvVarConfig> = {}
        allVars.forEach(ev => {
          formData[ev.name] = {
            name: ev.name,
            source: (ev.source as 'setting' | 'literal' | 'default') || 'default',
            setting_path: ev.setting_path,
            value: ev.value
          }
        })
        setDeployEnvConfigs(formData)
      } catch (error) {
        console.error('Failed to load env config:', error)
      } finally {
        setLoadingDeployEnv(false)
      }
    }
  }

  const handleConfirmDeploy = async () => {
    if (!simpleDeployModal.serviceId || !simpleDeployModal.targetType) return

    const consumerId = simpleDeployModal.serviceId
    const targetType = simpleDeployModal.targetType

    setCreating(`deploy-${consumerId}`)
    setSimpleDeployModal({ isOpen: false, serviceId: null, targetType: null })

    try {
      let targetHostname: string

      if (targetType === 'local') {
        const leaderResponse = await clusterApi.getLeaderInfo()
        targetHostname = leaderResponse.data.hostname
      } else {
        // Remote
        if (!simpleDeployModal.targetId) {
          setMessage({ type: 'error', text: 'Remote unode deployment requires selecting a target unode.' })
          setCreating(null)
          return
        }
        targetHostname = simpleDeployModal.targetId
      }

      console.log(`🚀 Deploying ${consumerId} to ${targetType} unode: ${targetHostname}`)

      // Generate unique instance ID for this deployment
      const template = templates.find(t => t.id === consumerId)
      const sanitizedServiceId = consumerId.replace(/[^a-z0-9-]/g, '-')
      const timestamp = Date.now()
      const instanceId = `${sanitizedServiceId}-unode-${timestamp}`

      // Build config from env var settings
      const config: Record<string, any> = {}
      Object.entries(deployEnvConfigs).forEach(([name, envConfig]) => {
        if (envConfig.source === 'setting' && envConfig.setting_path) {
          config[name] = { _from_setting: envConfig.setting_path }
        } else if (envConfig.source === 'new_setting' && envConfig.value) {
          config[name] = envConfig.value
          if (envConfig.new_setting_path) {
            config[`_save_${name}`] = envConfig.new_setting_path
          }
        } else if (envConfig.value) {
          config[name] = envConfig.value
        }
      })

      // Step 1: Create instance with deployment target and config
      await svcConfigsApi.createServiceConfig({
        id: instanceId,
        template_id: consumerId,
        name: `${template?.name || consumerId} (${targetHostname})`,
        description: `uNode deployment to ${targetHostname}`,
        config,
        deployment_target: targetHostname
      })

      // Step 2: Deploy the service config
      await svcConfigsApi.deployServiceConfig(instanceId)

      console.log('✅ Deployment successful')
      setMessage({ type: 'success', text: `Successfully deployed ${template?.name || consumerId} to ${targetType} unode` })

      // Refresh instances and service statuses
      const [instancesRes, statusesRes] = await Promise.all([
        svcConfigsApi.getServiceConfigs(),
        servicesApi.getAllStatuses()
      ])
      setServiceConfigs(instancesRes.data)
      setServiceStatuses(statusesRes.data || {})

    } catch (err: any) {
      console.error(`Failed to deploy to ${targetType} unode:`, err)
      const errorMsg = getErrorMessage(err, `Failed to deploy to ${targetType} unode`)
      setMessage({ type: 'error', text: errorMsg })
    } finally {
      setCreating(null)
    }
  }

  const handleEditConsumer = async (consumerId: string) => {
    // Edit a consumer service - load its env config and show in modal
    const template = templates.find((t) => t.id === consumerId)
    if (!template) return

    try {
      setLoadingEnvConfig(true)

      // Load environment variable configuration for this service
      const envResponse = await servicesApi.getEnvConfig(template.id)
      const envData = envResponse.data

      const allEnvVars = [...envData.required_env_vars, ...envData.optional_env_vars]
      setEnvVars(allEnvVars)

      // Load wiring connections for this service to get provider-supplied values
      const wiringConnections = wiring.filter((w) => w.target_config_id === consumerId)
      const providerSuppliedValues: Record<string, { value: string; provider: string; locked: boolean }> = {}

      // For each wiring connection, determine which env vars it supplies
      for (const conn of wiringConnections) {
        const provider = [...templates, ...instances].find((p) => p.id === conn.source_config_id)
        if (provider) {
          // Get the capability mapping (e.g., "mongodb" -> MONGODB_URL, MONGODB_NAME)
          const capability = conn.source_capability

          // Map capability to env var names based on common patterns
          if (capability === 'mongodb') {
            providerSuppliedValues['MONGODB_URL'] = {
              value: `Provider: ${provider.name}`,
              provider: provider.name,
              locked: true,
            }
            providerSuppliedValues['MONGODB_NAME'] = {
              value: `Provider: ${provider.name}`,
              provider: provider.name,
              locked: true,
            }
          } else if (capability === 'memory') {
            providerSuppliedValues['MEMORY_URL'] = {
              value: `Provider: ${provider.name}`,
              provider: provider.name,
              locked: true,
            }
          } else if (capability === 'vector_db') {
            providerSuppliedValues['QDRANT_URL'] = {
              value: `Provider: ${provider.name}`,
              provider: provider.name,
              locked: true,
            }
          } else if (capability === 'redis') {
            providerSuppliedValues['REDIS_URL'] = {
              value: `Provider: ${provider.name}`,
              provider: provider.name,
              locked: true,
            }
          } else if (capability === 'llm') {
            providerSuppliedValues['OPENAI_API_KEY'] = {
              value: `Provider: ${provider.name}`,
              provider: provider.name,
              locked: true,
            }
          }
        }
      }

      // Initialize env configs from API response, overriding with provider values
      const initialEnvConfigs: Record<string, EnvVarConfig> = {}
      allEnvVars.forEach((envVar) => {
        const providerValue = providerSuppliedValues[envVar.name]

        if (providerValue) {
          // This value comes from a wired provider - mark as locked
          initialEnvConfigs[envVar.name] = {
            name: envVar.name,
            source: 'literal',
            value: providerValue.value,
            setting_path: undefined,
            new_setting_path: undefined,
            locked: true,
            provider_name: providerValue.provider,
          }
        } else {
          // Use API response data (setting mapping or default)
          initialEnvConfigs[envVar.name] = {
            name: envVar.name,
            source: (envVar.source as 'setting' | 'new_setting' | 'literal' | 'default') || 'default',
            setting_path: envVar.setting_path,
            value: envVar.value,
            new_setting_path: undefined,
          }
        }
      })

      setEnvConfigs(initialEnvConfigs)

      // Open edit modal with service template
      setEditingProvider({
        id: template.id,
        name: template.name,
        isTemplate: true,
        template,
        config: {},
      })
      setEditConfig({})
    } catch (err) {
      console.error('Failed to load service env config:', err)
      setMessage({ type: 'error', text: 'Failed to load service configuration' })
    } finally {
      setLoadingEnvConfig(false)
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
                  displayValue = '(configured)'
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

        return {
          id: t.id,
          name: t.name,
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
            displayValue = isSecret ? '••••••' : String(overrideValue)
          } else if (field.has_value) {
            displayValue = isSecret ? '••••••' : '(default)'
          } else if (field.value) {
            displayValue = isSecret ? '••••••' : String(field.value)
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

        return {
          id: i.id,
          name: i.name,
          capability: template.provides!,
          status: instanceStatus,
          mode: template.mode,
          isTemplate: false,
          templateId: i.template_id,
          configVars,
          configured: template.configured, // ServiceConfig inherits template's configured status
        }
      }),
  ]

  // Consumers: compose service templates
  const composeTemplates = templates.filter((t) => t.source === 'compose' && t.installed)

  const wiringConsumers = [
    // Templates
    ...composeTemplates.map((t) => {
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
        isTemplate: true,
        templateId: t.id,
      }
    }),
    // ServiceConfig instances from compose templates
    ...instances
      .filter((i) => {
        const template = composeTemplates.find((t) => t.id === i.template_id)
        return template && template.requires
      })
      .map((i) => {
        const template = composeTemplates.find((t) => t.id === i.template_id)!
        const details = instanceDetails[i.id]

        // Build config vars from instance details if available
        const configVars = details?.config?.values
          ? Object.entries(details.config.values).map(([key, value]) => ({
              key,
              label: key,
              value: String(value),
              isSecret: false,
              required: false,
            }))
          : []

        return {
          id: i.id,
          name: i.name,
          requires: template.requires!,
          status: i.status,
          mode: i.deployment_target === 'kubernetes' ? 'cloud' : 'local',
          configVars,
          configured: true,
          description: template.description,
          isTemplate: false,
          templateId: i.template_id,
        }
      }),
  ]

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
        const newWiring = await svcConfigsApi.createWiring({
          source_config_id: dropInfo.provider.id,
          source_capability: dropInfo.capability,
          target_config_id: dropInfo.consumerId,
          target_capability: dropInfo.capability,
        })
        setWiring((prev) => {
          const existing = prev.findIndex(
            (w) => w.target_config_id === dropInfo.consumerId &&
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

    // For templates, create instance directly with wiring info
    const template = templates.find((t) => t.id === dropInfo.provider.id)
    if (template) {
      await createServiceConfigDirectly(template, {
        capability: dropInfo.capability,
        consumerId: dropInfo.consumerId,
        consumerName: consumer?.name || dropInfo.consumerId,
      })
    }
  }

  const handleDeleteWiringFromBoard = async (consumerId: string, capability: string) => {
    // Find the wiring to delete
    const wire = wiring.find(
      (w) => w.target_config_id === consumerId && w.target_capability === capability
    )
    if (!wire) return

    try {
      await svcConfigsApi.deleteWiring(wire.id)
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
        setEnvVars([])
        setEnvConfigs({})
      }
    } else {
      // Edit instance - fetch details and load environment configuration
      try {
        let details = instanceDetails[providerId]
        if (!details) {
          const res = await svcConfigsApi.getServiceConfig(providerId)
          details = res.data
          setServiceConfigDetails((prev) => ({ ...prev, [providerId]: details }))
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

          // Load environment variable configuration for compose services
          if (template.source === 'compose') {
            setLoadingEnvConfig(true)
            try {
              const envResponse = await servicesApi.getEnvConfig(template.id)
              const envData = envResponse.data

              const allEnvVars = [...envData.required_env_vars, ...envData.optional_env_vars]
              setEnvVars(allEnvVars)

              // Load wiring connections for this instance to get provider-supplied values
              const wiringConnections = wiring.filter((w) => w.target_config_id === providerId)
              const providerSuppliedValues: Record<string, { value: string; provider: string; locked: boolean }> = {}

              // For each wiring connection, determine which env vars it supplies
              for (const conn of wiringConnections) {
                const provider = [...templates, ...instances].find((p) => p.id === conn.source_config_id)
                if (provider) {
                  const capability = conn.source_capability

                  // Map capability to env var names
                  if (capability === 'mongodb') {
                    providerSuppliedValues['MONGODB_URL'] = { value: `Provider: ${provider.name}`, provider: provider.name, locked: true }
                    providerSuppliedValues['MONGODB_NAME'] = { value: `Provider: ${provider.name}`, provider: provider.name, locked: true }
                  } else if (capability === 'memory') {
                    providerSuppliedValues['MEMORY_URL'] = { value: `Provider: ${provider.name}`, provider: provider.name, locked: true }
                  } else if (capability === 'vector_db') {
                    providerSuppliedValues['QDRANT_URL'] = { value: `Provider: ${provider.name}`, provider: provider.name, locked: true }
                  } else if (capability === 'redis') {
                    providerSuppliedValues['REDIS_URL'] = { value: `Provider: ${provider.name}`, provider: provider.name, locked: true }
                  } else if (capability === 'llm') {
                    providerSuppliedValues['OPENAI_API_KEY'] = { value: `Provider: ${provider.name}`, provider: provider.name, locked: true }
                  }
                }
              }

              // Initialize env configs from API response, checking for provider overrides
              const initialEnvConfigs: Record<string, EnvVarConfig> = {}
              allEnvVars.forEach((envVar) => {
                const providerValue = providerSuppliedValues[envVar.name]

                if (providerValue) {
                  // This value comes from a wired provider - mark as locked
                  initialEnvConfigs[envVar.name] = {
                    name: envVar.name,
                    source: 'literal',
                    value: providerValue.value,
                    setting_path: undefined,
                    new_setting_path: undefined,
                    locked: true,
                    provider_name: providerValue.provider,
                  }
                } else {
                  // Check if instance has an override for this var
                  const instanceValue = initialConfig[envVar.name]

                  if (instanceValue !== undefined) {
                    // ServiceConfig has an override
                    initialEnvConfigs[envVar.name] = {
                      name: envVar.name,
                      source: 'new_setting',
                      value: instanceValue,
                      setting_path: undefined,
                      new_setting_path: undefined,
                    }
                  } else {
                    // Use service default configuration
                    initialEnvConfigs[envVar.name] = {
                      name: envVar.name,
                      source: (envVar.source as 'setting' | 'new_setting' | 'literal' | 'default') || 'default',
                      setting_path: envVar.setting_path,
                      value: envVar.value,
                      new_setting_path: undefined,
                    }
                  }
                }
              })

              setEnvConfigs(initialEnvConfigs)
            } catch (err) {
              console.error('Failed to load env config:', err)
              setEnvVars([])
              setEnvConfigs({})
            } finally {
              setLoadingEnvConfig(false)
            }
          } else {
            // Provider templates use config_schema, not env config
            setEnvVars([])
            setEnvConfigs({})
          }
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
        // For templates, check if we have env config (compose services) or config schema (providers)
        if (envVars.length > 0) {
          // Compose service template - save env configs to settings store
          const envVarConfigs = Object.values(envConfigs).filter(
            (config) => config.source === 'new_setting' && config.value && config.new_setting_path
          )

          if (envVarConfigs.length > 0) {
            // Call the service API to update env config
            await servicesApi.updateEnvConfig(editingProvider.template!.id, envVarConfigs)
            setMessage({ type: 'success', text: `${editingProvider.name} configuration updated` })
          }
        } else {
          // Provider template - store values in settings store via settings_path
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

          setMessage({ type: 'success', text: `${editingProvider.name} settings updated` })
        }

        // Refresh templates to get updated values
        const templatesRes = await svcConfigsApi.getTemplates()
        setTemplates(templatesRes.data)
      } else {
        // Update instance config
        let configToSave: Record<string, any> = {}

        // For compose services with env config, convert envConfigs to instance config format
        if (envVars.length > 0) {
          Object.entries(envConfigs).forEach(([name, config]) => {
            if (config.source === 'setting' && config.setting_path) {
              configToSave[name] = { _from_setting: config.setting_path }
            } else if (config.source === 'new_setting' && config.value) {
              configToSave[name] = config.value
              if (config.new_setting_path) {
                configToSave[`_save_${name}`] = config.new_setting_path
              }
            } else if (config.value) {
              configToSave[name] = config.value
            }
          })
        } else {
          // For provider templates, use the simple config format
          configToSave = Object.fromEntries(
            Object.entries(editConfig).filter(([, v]) => v && v.trim() !== '')
          )
        }

        await svcConfigsApi.updateServiceConfig(editingProvider.id, { config: configToSave })
        // Refresh instance details
        const res = await svcConfigsApi.getServiceConfig(editingProvider.id)
        setServiceConfigDetails((prev) => ({ ...prev, [editingProvider.id]: res.data }))
        setMessage({ type: 'success', text: `${editingProvider.name} updated` })
      }
      setEditingProvider(null)
      setEnvVars([])
      setEnvConfigs({})
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to save changes',
      })
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Handle update template config vars from wiring board inline editor
  const handleUpdateTemplateConfigVars = async (
    templateId: string,
    configVars: Array<{ key: string; label: string; value: string; isSecret: boolean; required?: boolean }>
  ) => {
    const template = templates.find((t) => t.id === templateId)
    if (!template) return

    try {
      // Check if this is a compose service template (has env vars) or provider template
      if (template.source === 'compose') {
        // Compose service template - save env configs
        const envVarConfigs = configVars
          .filter((v) => v.value && v.value.trim())
          .map((v) => ({
            source: 'new_setting' as const,
            value: v.value,
            new_setting_path: `service_env.${template.id}.${v.key}`,
          }))

        if (envVarConfigs.length > 0) {
          await servicesApi.updateEnvConfig(template.id, envVarConfigs)
          setMessage({ type: 'success', text: `${template.name} configuration updated` })
        }
      } else {
        // Provider template - update settings via settings_path
        const updates: Record<string, Record<string, string>> = {}
        const schema = template.config_schema || []

        for (const configVar of configVars) {
          const schemaField = schema.find((f: any) => f.key === configVar.key)
          if (schemaField?.settings_path && configVar.value && configVar.value.trim()) {
            const parts = schemaField.settings_path.split('.')
            if (parts.length === 2) {
              const [section, key] = parts
              if (!updates[section]) updates[section] = {}
              updates[section][key] = configVar.value
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          await settingsApi.update(updates)
          setMessage({ type: 'success', text: `${template.name} settings updated` })
        }
      }

      // Refresh templates to get updated values
      const templatesRes = await svcConfigsApi.getTemplates()
      setTemplates(templatesRes.data)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to update configuration',
      })
      throw error
    }
  }

  // Handle create instance from wiring board (via "+" button)
  const handleCreateServiceConfigFromBoard = async (templateId: string) => {
    const template = templates.find((t) => t.id === templateId)
    if (template) {
      await createServiceConfigDirectly(template)
    }
  }

  // Group templates by source - only show installed services
  const allProviderTemplates = templates.filter((t) => t.source === 'provider')

  // Group instances by their template_id for hierarchical display
  const instancesByTemplate = instances.reduce((acc, instance) => {
    if (!acc[instance.template_id]) {
      acc[instance.template_id] = []
    }
    acc[instance.template_id].push(instance)
    return acc
  }, {} as Record<string, typeof instances>)

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
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">ServiceConfigs</h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Create and manage service instances from templates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCatalog}
            className="btn-primary flex items-center gap-2"
            data-testid="browse-services-button"
          >
            <Package className="h-4 w-4" />
            Browse Services
          </button>
          {availableToAdd.length > 0 && (
            <button
              onClick={() => setShowAddProviderModal(true)}
              className="btn-secondary flex items-center gap-2"
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
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">ServiceConfigs</p>
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
            onCreateServiceConfig={handleCreateServiceConfigFromBoard}
            onUpdateTemplateConfigVars={handleUpdateTemplateConfigVars}
            onDeleteServiceConfig={handleDeleteServiceConfig}
            onStartProvider={async (providerId, isTemplate) => {
              if (isTemplate) {
                // For templates, we can't deploy them directly - need to create instance first
                // This case shouldn't happen as templates don't have start buttons in current UI
                return
              }
              await handleDeployServiceConfig(providerId)
            }}
            onStopProvider={async (providerId, isTemplate) => {
              if (isTemplate) {
                return
              }
              await handleUndeployServiceConfig(providerId)
            }}
            onEditConsumer={handleEditConsumer}
            onStartConsumer={handleStartConsumer}
            onStopConsumer={handleStopConsumer}
            onDeployConsumer={handleDeployConsumer}
          />
        </div>
      </div>
      {/* Edit Provider/ServiceConfig Modal */}
      <Modal
        isOpen={!!editingProvider}
        onClose={() => setEditingProvider(null)}
        title={editingProvider?.isTemplate ? 'Edit Provider' : 'Edit ServiceConfig'}
        titleIcon={<Settings className="h-5 w-5 text-primary-600" />}
        maxWidth="lg"
        testId="edit-provider-modal"
      >
        {editingProvider && editingProvider.template && (
          <div className="space-y-4">
            {/* Provider/ServiceConfig name */}
            <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
              <p className="font-medium text-neutral-900 dark:text-neutral-100">
                {editingProvider.name}
              </p>
              <p className="text-xs text-neutral-500">
                {editingProvider.isTemplate ? 'Default provider' : 'Custom instance'}
              </p>
            </div>

            {/* Config fields - providers use config_schema */}
            {editingProvider.template.source === 'provider' &&
              editingProvider.template.config_schema &&
              editingProvider.template.config_schema.length > 0 && (
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

            {/* Environment variables - compose services (both templates and instances) */}
            {editingProvider.template.source === 'compose' &&
              (loadingEnvConfig ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
                  <span className="ml-2 text-sm text-neutral-600">Loading configuration...</span>
                </div>
              ) : envVars.length > 0 ? (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Environment Variables
                  </label>
                  <div className="max-h-96 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                    {envVars.map((envVar) => {
                      const config = envConfigs[envVar.name] || {
                        name: envVar.name,
                        source: 'default',
                        value: undefined,
                        setting_path: undefined,
                        new_setting_path: undefined,
                      }

                      return (
                        <EnvVarRow
                          key={envVar.name}
                          envVar={envVar}
                          config={config}
                          onChange={(updates) => {
                            setEnvConfigs((prev) => ({
                              ...prev,
                              [envVar.name]: { ...prev[envVar.name], ...updates } as EnvVarConfig,
                            }))
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              ) : null)}

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
        title="Delete ServiceConfig"
        message={`Are you sure you want to delete this instance?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={confirmDeleteServiceConfig}
        onCancel={() => setConfirmDialog({ isOpen: false, instanceId: null })}
      />

      {/* Deploy to Kubernetes Modal */}
      {deployModalState.isOpen && deployModalState.targetType === 'kubernetes' && (
        <DeployToK8sModal
          isOpen={true}
          onClose={() => setDeployModalState({ isOpen: false, serviceId: null, targetType: null })}
          cluster={deployModalState.selectedClusterId ? kubernetesClusters.find((c) => c.cluster_id === deployModalState.selectedClusterId) : undefined}
          availableClusters={kubernetesClusters}
          infraServices={deployModalState.infraServices || {}}
          preselectedServiceId={deployModalState.serviceId || undefined}
        />
      )}

      {/* Service Catalog Modal */}
      <Modal
        isOpen={showCatalog}
        onClose={() => setShowCatalog(false)}
        title="Service Catalog"
        maxWidth="2xl"
        testId="catalog-modal"
      >
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
                        {service.service_name.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
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
                        {service.requires.map((cap: string) => (
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
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-danger-300 text-danger-600 hover:bg-danger-50 dark:border-danger-700 dark:text-danger-400 dark:hover:bg-danger-900/20 disabled:opacity-50"
                      >
                        {installingService === service.service_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Uninstall
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
      </Modal>

      {/* Simple Deploy Modal (for local/remote with env vars) */}
      <Modal
        isOpen={simpleDeployModal.isOpen}
        onClose={() => setSimpleDeployModal({ isOpen: false, serviceId: null, targetType: null })}
        title={`Deploy to ${simpleDeployModal.targetType === 'local' ? 'Local' : 'Remote'} uNode`}
        maxWidth="lg"
        testId="simple-deploy-modal"
      >
        <div className="space-y-4">
          {loadingDeployEnv && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
              <span className="ml-2 text-sm text-neutral-500">Loading configuration...</span>
            </div>
          )}

          {!loadingDeployEnv && deployEnvVars.length > 0 && (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Configure environment variables for this deployment:
              </p>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 max-h-96 overflow-y-auto">
                {deployEnvVars.map((ev) => (
                  <EnvVarRow
                    key={ev.name}
                    envVar={ev}
                    config={deployEnvConfigs[ev.name]}
                    onChange={(updates) => {
                      setDeployEnvConfigs((prev) => ({
                        ...prev,
                        [ev.name]: { ...prev[ev.name], ...updates },
                      }))
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {!loadingDeployEnv && deployEnvVars.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
              No environment variables to configure.
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
            <button
              onClick={() => setSimpleDeployModal({ isOpen: false, serviceId: null, targetType: null })}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDeploy}
              disabled={loadingDeployEnv || creating !== null}
              className="btn-primary flex items-center gap-2"
              data-testid="confirm-deploy"
            >
              {creating !== null ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Deploy
            </button>
          </div>
        </div>
      </Modal>
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
                  Create ServiceConfig
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

// =============================================================================
// Env Var Row Component (matches ServicesPage env var editor)
// =============================================================================

interface EnvVarRowProps {
  envVar: EnvVarInfo
  config: EnvVarConfig
  onChange: (updates: Partial<EnvVarConfig>) => void
}

function EnvVarRow({ envVar, config, onChange }: EnvVarRowProps) {
  const [editing, setEditing] = useState(false)
  const [showMapping, setShowMapping] = useState(config.source === 'setting' && !config.locked)

  const isSecret = envVar.name.includes('KEY') || envVar.name.includes('SECRET') || envVar.name.includes('PASSWORD')
  const hasDefault = envVar.has_default && envVar.default_value
  const isUsingDefault = config.source === 'default' || (!config.value && !config.setting_path && hasDefault)
  const isLocked = config.locked || false

  // Generate setting path from env var name for auto-creating settings
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
  const matchingSuggestion = envVar.suggestions.find((s) => {
    const envName = envVar.name.toLowerCase()
    const pathParts = s.path.toLowerCase().split('.')
    const lastPart = pathParts[pathParts.length - 1]
    return envName.includes(lastPart) || lastPart.includes(envVar.name.replace(/_/g, ''))
  })

  // Auto-map if matching and not yet configured
  const effectiveSettingPath = config.setting_path || (matchingSuggestion?.has_value ? matchingSuggestion.path : undefined)

  // Locked fields - provided by wired providers or infrastructure
  if (isLocked) {
    const displayValue = config.value || ''
    const isMaskedSecret = isSecret && displayValue.length > 0
    const maskedValue = isMaskedSecret ? '•'.repeat(Math.min(displayValue.length, 20)) : displayValue

    return (
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100 dark:border-neutral-700 last:border-0 bg-blue-50 dark:bg-blue-900/10"
        data-testid={`env-var-editor-${envVar.name}`}
      >
        {/* Label */}
        <span
          className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-40 truncate flex-shrink-0"
          title={envVar.name}
        >
          {envVar.name}
          {envVar.is_required && <span className="text-error-500 ml-0.5">*</span>}
        </span>

        {/* Padlock icon */}
        <div className="flex-shrink-0" title="Locked - provided by infrastructure or provider">
          <Lock className="w-3 h-3 text-blue-600 dark:text-blue-400" />
        </div>

        {/* Value display */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-xs text-neutral-700 dark:text-neutral-300 truncate font-mono" title={displayValue}>
            {maskedValue}
          </span>
          <span className="ml-auto px-1.5 py-0.5 text-[10px] rounded bg-blue-600/20 text-blue-700 dark:text-blue-300 flex-shrink-0">
            {config.provider_name || 'infrastructure'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100 dark:border-neutral-700 last:border-0 bg-white dark:bg-neutral-800">
      {/* Label */}
      <span
        className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-40 truncate flex-shrink-0"
        title={envVar.name}
      >
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
        data-testid={`map-button-${envVar.name}`}
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
                onChange({
                  source: 'setting',
                  setting_path: e.target.value,
                  value: undefined,
                  new_setting_path: undefined,
                })
              }
            }}
            className="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono rounded border-0 bg-neutral-700/50 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer overflow-hidden text-ellipsis"
            data-testid={`map-select-${envVar.name}`}
          >
            <option value="">select...</option>
            {envVar.suggestions.map((s) => {
              const displayValue = s.value && s.value.length > 30 ? s.value.substring(0, 30) + '...' : s.value
              return (
                <option key={s.path} value={s.path}>
                  {s.path}
                  {displayValue ? ` → ${displayValue}` : ''}
                </option>
              )
            })}
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
            <span className="ml-auto px-1.5 py-0.5 text-[10px] rounded bg-neutral-700 text-neutral-400 flex-shrink-0">
              default
            </span>
          </>
        ) : (
          // Value input
          <input
            type={isSecret ? 'password' : 'text'}
            value={config.source === 'setting' ? '' : config.value || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="enter value"
            className="flex-1 px-2 py-1.5 text-xs rounded border-0 bg-neutral-700/50 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-neutral-500"
            autoFocus={editing}
            onBlur={() => {
              if (!config.value && hasDefault) setEditing(false)
            }}
            data-testid={`value-input-${envVar.name}`}
          />
        )}
      </div>
    </div>
  )
}
