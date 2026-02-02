import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  RefreshCw,
  ChevronUp,
  CheckCircle,
  Loader2,
  Cloud,
  HardDrive,
  Package,
  Pencil,
  Settings,
  Trash2,
  Save,
} from 'lucide-react'
import {
  svcConfigsApi,
  integrationApi,
  settingsApi,
  servicesApi,
  kubernetesApi,
  clusterApi,
  deploymentsApi,
  DeployTarget,
  Template,
  ServiceConfig,
  ServiceConfigSummary,
  Wiring,
  EnvVarInfo,
  EnvVarConfig,
} from '../services/api'
import {
  useServiceConfigData,
  useServiceCatalog,
  useDeploymentActions,
  useWiringActions,
} from '../hooks'
import { useFeatureFlags } from '../contexts/FeatureFlagsContext'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import { SystemOverview, FlatServiceCard } from '../components/wiring'
import DeployModal from '../components/DeployModal'
import EnvVarEditor from '../components/EnvVarEditor'
import {
  StatCard,
  TabNavigation,
  PageHeader,
  MessageBanner,
  DeploymentListItem,
  ServicesTab,
  ProvidersTab,
  DeploymentsTab,
  type TabType,
} from '../components/services'

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
  const navigate = useNavigate()
  const { isEnabled } = useFeatureFlags()

  // Feature flag: hide service configs (custom instances)
  const showServiceConfigs = isEnabled('service_configs')

  // Data hooks (React Query)
  const {
    templates = [],
    instances = [],
    wiring = [],
    serviceStatuses = {},
    deployments = [],
    isLoading: loading,
    refresh: refreshData,
  } = useServiceConfigData()

  // Service catalog hook
  const catalog = useServiceCatalog()

  // Deployment actions hook
  const deploymentActions = useDeploymentActions()

  // Wiring actions hook
  const wiringActions = useWiringActions(wiring, refreshData)

  // Instance details (lazy loaded)
  const [instanceDetails, setServiceConfigDetails] = useState<Record<string, ServiceConfig>>({})

  // Deployments filter
  const [filterCurrentEnvOnly, setFilterCurrentEnvOnly] = useState(true)

  // UI state
  const [activeTab, setActiveTab] = useState<'services' | 'providers' | 'overview' | 'deployments'>('services')
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

  // Inline editing state for Providers tab cards
  const [expandedProviderCard, setExpandedProviderCard] = useState<string | null>(null)
  const [providerCardEnvVars, setProviderCardEnvVars] = useState<EnvVarInfo[]>([])
  const [providerCardEnvConfigs, setProviderCardEnvConfigs] = useState<Record<string, EnvVarConfig>>({})
  const [loadingProviderCard, setLoadingProviderCard] = useState(false)
  const [savingProviderCard, setSavingProviderCard] = useState(false)

  // Unified deploy modal state
  const [deployModalState, setDeployModalState] = useState<{
    isOpen: boolean
    serviceId: string | null
    mode?: 'deploy' | 'create-config'  // Mode: deploy or just create config
    targetId?: string  // Deploy target ID (for when we have a specific target selected)
    infraServices?: Record<string, any>  // Infrastructure data to pass to modal
    configId?: string  // Optional config ID to use for deployment
  }>({
    isOpen: false,
    serviceId: null,
  })
  const [availableTargets, setAvailableTargets] = useState<DeployTarget[]>([])
  const [loadingTargets, setLoadingTargets] = useState(false)

  // Deployment editing state
  const [editingDeployment, setEditingDeployment] = useState<any | null>(null)
  const [deploymentEnvVars, setDeploymentEnvVars] = useState<EnvVarInfo[]>([])
  const [deploymentEnvConfigs, setDeploymentEnvConfigs] = useState<Record<string, EnvVarConfig>>({})

  // ESC key to close modals
  const closeAllModals = useCallback(() => {
    setShowAddProviderModal(false)
    setEditingProvider(null)
    catalog.close()
  }, [catalog])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAllModals()
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [closeAllModals])

  // Log data for debugging
  useEffect(() => {
    if (templates.length > 0) {
      console.log('Templates loaded:', templates)
      console.log('Compose templates (before filter):', templates.filter((t: any) => t.source === 'compose'))
      console.log('Compose templates (after installed filter):', templates.filter((t: any) => t.source === 'compose' && t.installed))
      templates.filter((t: any) => t.source === 'compose').forEach((t: any) => {
        console.log(`  ${t.id}: installed=${t.installed}, requires=${JSON.stringify(t.requires)}`)
      })
    }
    if (deployments.length > 0) {
      console.log('🚀 Deployments loaded:', deployments.length, deployments)
    }
  }, [templates, deployments])

  // Service installation handlers (with error messages)
  const handleInstallService = async (serviceId: string) => {
    try {
      await catalog.install(serviceId)
      setMessage({ type: 'success', text: 'Service installed successfully' })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to install service' })
    }
  }

  const handleUninstallService = async (serviceId: string) => {
    try {
      await catalog.uninstall(serviceId)
      setMessage({ type: 'success', text: 'Service uninstalled successfully' })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to uninstall service' })
    }
  }

  // ServiceConfig actions
  const confirmDeleteServiceConfig = async () => {
    const { instanceId } = confirmDialog
    if (!instanceId) return

    setConfirmDialog({ isOpen: false, instanceId: null })

    try {
      await svcConfigsApi.deleteServiceConfig(instanceId)
      setMessage({ type: 'success', text: 'ServiceConfig deleted' })
      // Refresh all data
      refreshData()
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
      refreshData()
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
      refreshData()
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

  // Lazy load instance details (for overview tab or when editing)
  const loadInstanceDetails = async () => {
    const providerTemplatesList = templates.filter((t) => t.provides && t.source === 'provider')
    const providerServiceConfigs = instances.filter((i) =>
      providerTemplatesList.some((t) => t.id === i.template_id)
    )

    // Only load configs that aren't already loaded
    const unloadedConfigs = providerServiceConfigs.filter((i) => !instanceDetails[i.id])
    if (unloadedConfigs.length === 0) return

    try {
      const detailsPromises = unloadedConfigs.map((i) =>
        svcConfigsApi.getServiceConfig(i.id).catch(() => null)
      )
      const detailsResults = await Promise.all(detailsPromises)

      const newDetails: Record<string, ServiceConfig> = {}
      detailsResults.forEach((res, idx) => {
        if (res?.data) {
          newDetails[unloadedConfigs[idx].id] = res.data
        }
      })
      if (Object.keys(newDetails).length > 0) {
        setServiceConfigDetails((prev) => ({ ...prev, ...newDetails }))
      }
    } catch (error) {
      console.error('Error loading instance details:', error)
    }
  }

  // Handle tab switch - lazy load details for overview tab
  const handleTabChange = async (tab: 'services' | 'providers' | 'overview') => {
    setActiveTab(tab)
    if (tab === 'overview') {
      await loadInstanceDetails()
    }
  }

  // Consumer/Service handlers for WiringBoard
  const handleStartConsumer = async (consumerId: string) => {
    try {
      // Find the consumer to get its templateId (instances have different id vs templateId)
      const consumer = wiringConsumers.find(c => c.id === consumerId)
      const templateId = consumer?.templateId || consumerId
      // Extract service name from template ID (format: "compose_file:service_name")
      const serviceName = templateId.includes(':') ? templateId.split(':').pop()! : templateId
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
      // Find the consumer to get its templateId (instances have different id vs templateId)
      const consumer = wiringConsumers.find(c => c.id === consumerId)
      const templateId = consumer?.templateId || consumerId
      // Extract service name from template ID (format: "compose_file:service_name")
      const serviceName = templateId.includes(':') ? templateId.split(':').pop()! : templateId
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

  const handleDeployConsumer = async (consumerId: string, target: { type: 'local' | 'remote' | 'kubernetes'; id?: string; configId?: string }) => {
    // consumerId can be either an instance ID or a template ID (for templates without instances)
    // Try to find instance first, otherwise treat as template ID
    const consumerInstance = instances.find(inst => inst.id === consumerId)
    const templateId = consumerInstance?.template_id || consumerId
    console.log('[DEBUG handleDeployConsumer]', { consumerId, consumerInstance: consumerInstance?.id, templateId, configId: target.configId })

    // Load ALL available targets (both Docker and K8s) for unified selection
    setLoadingTargets(true)
    try {
      const targetsResponse = await deploymentsApi.listTargets()
      const allTargets = targetsResponse.data
      setAvailableTargets(allTargets)

      console.log(`📍 Loaded ${allTargets.length} deployment targets:`, allTargets.map(t => `${t.name} (${t.type})`))

      // Try to determine a default target based on the button clicked
      let selectedTarget: DeployTarget | undefined

      if (target.type === 'kubernetes') {
        // K8s button clicked - try to select a K8s cluster
        const k8sTargets = allTargets.filter(t => t.type === 'k8s')
        if (k8sTargets.length === 1) {
          selectedTarget = k8sTargets[0]
          console.log(`🎯 Auto-selected single K8s cluster: ${selectedTarget.name}`)
        }
      } else if (target.type === 'local') {
        // Local button clicked - select leader Docker unode
        const dockerTargets = allTargets.filter(t => t.type === 'docker')
        selectedTarget = dockerTargets.find(t => t.is_leader) || dockerTargets[0]
        if (selectedTarget) {
          console.log(`🎯 Auto-selected local Docker target: ${selectedTarget.name}`)
        }
      } else if (target.type === 'remote' && target.id) {
        // Remote button clicked - select specific remote unode
        const dockerTargets = allTargets.filter(t => t.type === 'docker')
        selectedTarget = dockerTargets.find(t => t.identifier === target.id || t.id === target.id)
        if (selectedTarget) {
          console.log(`🎯 Auto-selected remote Docker target: ${selectedTarget.name}`)
        }
      }

      // Open unified modal with optional pre-selected target
      setDeployModalState({
        isOpen: true,
        serviceId: templateId,
        targetId: selectedTarget?.id,
        infraServices: selectedTarget?.infrastructure || {},
        configId: target.configId,
      })
    } catch (err) {
      console.error('Failed to load deployment targets:', err)
      setMessage({ type: 'error', text: 'Failed to load deployment targets' })
    } finally {
      setLoadingTargets(false)
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
          // Convert template_override/instance_override sources to their edit format
          let source = envVar.source || 'default'
          if (source === 'template_override' || source === 'instance_override') {
            // If it has a setting_path, it's a mapping
            source = envVar.setting_path ? 'setting' : 'literal'
          }

          initialEnvConfigs[envVar.name] = {
            name: envVar.name,
            source: source,
            setting_path: envVar.setting_path,
            value: envVar.resolved_value || envVar.value,
            new_setting_path: undefined,
            locked: envVar.locked,
            provider_name: envVar.provider_name,
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

  // Provider and compose templates
  const providerTemplates = templates
    .filter((t) => t.source === 'provider' && t.provides)

  const wiringProviders = [
    // Templates (defaults) - show installed providers (configured or needing setup) OR client/upload/remote mode (no config needed)
    ...providerTemplates
      .filter((t) => t.installed || ['client', 'upload', 'remote', 'relay'].includes(t.mode)) // Show all installed providers
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
          // Local services use running status (from Docker)
          status = t.running ? 'running' : 'stopped'
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
          configured: template.configured, // ServiceConfig inherits template's configured status
        }
      }),
  ]

  // All installed compose templates (exclude providers)
  const composeTemplates = templates.filter((t) => t.installed && t.source === 'compose')

  // Handle inline provider card editing (Providers tab)
  const handleExpandProviderCard = async (providerId: string) => {
    if (expandedProviderCard === providerId) {
      // Collapse
      setExpandedProviderCard(null)
      setProviderCardEnvVars([])
      setProviderCardEnvConfigs({})
      return
    }

    // Expand and load env config
    setExpandedProviderCard(providerId)
    setLoadingProviderCard(true)

    try {
      const response = await svcConfigsApi.getTemplateEnvConfig(providerId)
      const data = response.data

      setProviderCardEnvVars(data)

      // Initialize configs from backend response
      const initial: Record<string, EnvVarConfig> = {}
      for (const ev of data) {
        initial[ev.name] = {
          name: ev.name,
          source: (ev.source as 'setting' | 'literal' | 'default') || 'default',
          setting_path: ev.setting_path,
          value: ev.value,
        }
      }
      setProviderCardEnvConfigs(initial)
    } catch (err) {
      console.error('Failed to load provider env config:', err)
      setMessage({ type: 'error', text: 'Failed to load provider configuration' })
    } finally {
      setLoadingProviderCard(false)
    }
  }

  const handleSaveProviderCard = async (providerId: string) => {
    setSavingProviderCard(true)
    try {
      // Build settings updates from env configs
      const settingsUpdates: Record<string, Record<string, string>> = {}

      for (const [name, cfg] of Object.entries(providerCardEnvConfigs)) {
        if (cfg.source === 'new_setting' && cfg.value && cfg.new_setting_path) {
          const parts = cfg.new_setting_path.split('.')
          if (parts.length === 2) {
            const [section, key] = parts
            if (!settingsUpdates[section]) settingsUpdates[section] = {}
            settingsUpdates[section][key] = cfg.value
          }
        }
      }

      // Save settings if any
      if (Object.keys(settingsUpdates).length > 0) {
        await settingsApi.update(settingsUpdates)
      }

      // Refresh data
      refreshData()

      setMessage({ type: 'success', text: 'Provider configuration saved' })
      setExpandedProviderCard(null)
      setProviderCardEnvVars([])
      setProviderCardEnvConfigs({})
    } catch (err: any) {
      console.error('Failed to save provider config:', err)
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to save configuration' })
    } finally {
      setSavingProviderCard(false)
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
                    // Convert template_override/instance_override sources to their edit format
                    let source = envVar.source || 'default'
                    if (source === 'template_override' || source === 'instance_override') {
                      // If it has a setting_path, it's a mapping
                      source = envVar.setting_path ? 'setting' : 'literal'
                    }

                    // Try resolved_value first, then value, then default_value, then empty string
                    const fallbackValue = envVar.resolved_value || envVar.value || envVar.default_value || ''
                    initialEnvConfigs[envVar.name] = {
                      name: envVar.name,
                      source: source,
                      setting_path: envVar.setting_path,
                      value: fallbackValue,
                      new_setting_path: undefined,
                      locked: envVar.locked,
                      provider_name: envVar.provider_name,
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

  // Handle edit saved config from dropdown
  const handleEditSavedConfig = (configId: string) => {
    // Use existing handler for editing instances
    handleEditProviderFromBoard(configId, false)
  }

  // Handle delete saved config from dropdown
  const handleDeleteSavedConfig = async (configId: string) => {
    try {
      await svcConfigsApi.deleteServiceConfig(configId)
      refreshData()
      setMessage({ type: 'success', text: 'Configuration deleted' })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to delete configuration',
      })
    }
  }

  // Handle update saved config from dropdown submenu
  const handleUpdateSavedConfig = async (configId: string, configValues: Record<string, any>) => {
    try {
      await svcConfigsApi.updateServiceConfig(configId, { config: configValues })
      refreshData()
      setMessage({ type: 'success', text: 'Configuration updated' })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to update configuration',
      })
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
          const envVarConfigs = Object.values(envConfigs).filter((config) => {
            // Include configs that have actual values to save
            if (config.source === 'new_setting' && config.value && config.new_setting_path) return true
            if (config.source === 'setting' && config.setting_path) return true
            // Don't save locked literal values (provider-supplied placeholders)
            if (config.source === 'literal' && config.value && !config.locked) return true
            return false
          })

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

        // Refresh all data to get updated values
        refreshData()
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

  // Group templates by source - only show installed services
  const allProviderTemplates = templates.filter((t) => t.source === 'provider')

  // Filter deployments by current environment
  // Use VITE_ENV_NAME from environment variables (e.g., "purple", "orange")
  const currentEnv = import.meta.env.VITE_ENV_NAME || 'ushadow'
  const currentComposeProject = `ushadow-${currentEnv}`

  const filteredDeployments = useMemo(() => {
    console.log(`🔍 Filtering deployments: filterCurrentEnvOnly=${filterCurrentEnvOnly}, currentEnv=${currentEnv}, currentComposeProject=${currentComposeProject}`)
    const filtered = filterCurrentEnvOnly
      ? deployments.filter((d) => {
          // Match deployments from the current environment only
          // Check if the deployment's hostname matches this environment's compose project or env name
          const matches = d.unode_hostname && (
            d.unode_hostname === currentEnv ||
            d.unode_hostname === currentComposeProject ||
            d.unode_hostname.startsWith(`${currentComposeProject}.`)
          )
          if (!matches && d.unode_hostname) {
            console.log(`  ⏭️ Filtered out deployment ${d.id}: hostname=${d.unode_hostname}`)
          }
          return matches
        })
      : deployments
    console.log(`✅ Filtered deployments: ${filtered.length} of ${deployments.length}`, filtered)
    return filtered
  }, [deployments, filterCurrentEnvOnly, currentEnv, currentComposeProject])

  // Providers in "Add" menu: not installed yet
  const availableToAdd = allProviderTemplates.filter(
    (t) => !t.installed && !addedProviderIds.has(t.id)
  )

  const handleAddProvider = (templateId: string) => {
    setAddedProviderIds((prev) => new Set(prev).add(templateId))
    setShowAddProviderModal(false)
  }

  // Deployment action handlers
  const handleStopDeployment = async (deploymentId: string) => {
    try {
      await deploymentActions.stopDeployment(deploymentId)
      refreshData()
      setMessage({ type: 'success', text: 'Deployment stopped' })
    } catch (error: any) {
      console.error('Failed to stop deployment:', error)
      setMessage({ type: 'error', text: 'Failed to stop deployment' })
    }
  }

  const handleRestartDeployment = async (deploymentId: string) => {
    try {
      await deploymentActions.restartDeployment(deploymentId)
      refreshData()
      setMessage({ type: 'success', text: 'Deployment restarted' })
    } catch (error: any) {
      console.error('Failed to restart deployment:', error)
      setMessage({ type: 'error', text: 'Failed to restart deployment' })
    }
  }

  const handleRemoveDeployment = async (deploymentId: string, serviceName: string) => {
    if (!confirm(`Remove deployment ${serviceName}?`)) return

    try {
      await deploymentActions.removeDeployment(deploymentId)
      refreshData()
      setMessage({ type: 'success', text: 'Deployment removed' })
    } catch (error: any) {
      console.error('Failed to remove deployment:', error)
      setMessage({ type: 'error', text: 'Failed to remove deployment' })
    }
  }

  const handleEditDeployment = async (deployment: any) => {
    const template = templates.find((t) => t.id === deployment.service_id)
    if (!template) return

    try {
      setLoadingEnvConfig(true)

      // Load environment variable configuration for this service
      // Pass deployment target to get properly resolved values
      const deployTarget = deployment.unode_hostname || deployment.backend_metadata?.cluster_id
      const envResponse = await servicesApi.getEnvConfig(template.id, deployTarget)
      const envData = envResponse.data

      const allEnvVars = [...envData.required_env_vars, ...envData.optional_env_vars]
      setDeploymentEnvVars(allEnvVars)

      // Initialize env configs from deployment's current config
      const initialEnvConfigs: Record<string, any> = {}
      const deployedEnv = deployment.deployed_config?.environment || {}

      allEnvVars.forEach((envVar) => {
        // Determine value and source
        let value: string
        let source: string

        // Check if this value is overridden in the deployed config
        if (deployedEnv[envVar.name] !== undefined) {
          // Value is explicitly set in deployment - this is an override
          value = deployedEnv[envVar.name]
          source = 'literal'
        } else if (envVar.setting_path && envVar.resolved_value) {
          // Value comes from a setting
          value = envVar.resolved_value
          source = 'setting'
        } else if (envVar.default_value) {
          // Using default value
          value = envVar.default_value
          source = 'default'
        } else {
          // No value
          value = ''
          source = 'default'
        }

        initialEnvConfigs[envVar.name] = {
          name: envVar.name,
          source: source as any,
          value: value,
          setting_path: envVar.setting_path,
          new_setting_path: undefined,
        }
      })

      setDeploymentEnvConfigs(initialEnvConfigs)
      setEditingDeployment(deployment)
    } catch (error) {
      console.error('Failed to load deployment config:', error)
      setMessage({ type: 'error', text: 'Failed to load deployment configuration' })
    } finally {
      setLoadingEnvConfig(false)
    }
  }

  // Services tab handlers
  const handleWiringChange = async (consumerId: string, capability: string, sourceConfigId: string) => {
    try {
      await svcConfigsApi.createWiring({
        source_config_id: sourceConfigId,
        source_capability: capability,
        target_config_id: consumerId,
        target_capability: capability,
      })
      refreshData() // Refresh data from React Query
      setMessage({ type: 'success', text: `${capability} provider connected` })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to connect provider',
      })
    }
  }

  const handleWiringClear = async (consumerId: string, capability: string) => {
    const wire = wiring.find(
      (w) => w.target_config_id === consumerId && w.target_capability === capability
    )
    if (!wire) return
    try {
      await svcConfigsApi.deleteWiring(wire.id)
      refreshData() // Refresh data from React Query
      setMessage({ type: 'success', text: `${capability} provider disconnected` })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to disconnect provider',
      })
    }
  }

  const handleConfigCreate = async (templateId: string, name: string, configValues: any) => {
    // Generate valid ID from name (lowercase, alphanumeric + hyphens)
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `config-${Date.now()}`
    try {
      await svcConfigsApi.createServiceConfig({
        id,
        template_id: templateId,
        name,
        config: configValues,
      })
      refreshData() // Refresh data from React Query
      setMessage({ type: 'success', text: `Configuration "${name}" created` })
      return id
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to create configuration',
      })
      throw error  // Re-throw so caller knows it failed
    }
  }

  const handleAddConfig = (serviceId: string) => {
    setDeployModalState({
      isOpen: true,
      serviceId,
      mode: 'create-config',
    })
  }

  const handleStartService = async (serviceId: string) => {
    await handleDeployConsumer(serviceId, { type: 'local' })
  }

  const handleStopService = async (serviceId: string) => {
    await handleStopConsumer(serviceId)
  }

  const handleEditService = (serviceId: string) => {
    handleEditConsumer(serviceId)
  }

  const handleDeployService = (serviceId: string, target: DeployTarget) => {
    handleDeployConsumer(serviceId, target)
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
      <PageHeader
        onOpenCatalog={catalog.open}
        onRefresh={refreshData}
        showAddProvider={availableToAdd.length > 0}
        onAddProvider={() => setShowAddProviderModal(true)}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Templates" value={templates.length} variant="default" />
        <StatCard label="Services" value={instances.length} variant="primary" />
        <StatCard label="Running" value={instances.filter((i) => i.status === 'running').length} variant="success" />
        <StatCard label="Wiring" value={wiring.length} variant="info" />
      </div>

      {/* Message */}
      {message && (
        <MessageBanner
          type={message.type}
          message={message.text}
          onDismiss={() => setMessage(null)}
          testId="instances-message"
        />
      )}

      {/* Tab Navigation */}
      <TabNavigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
        deploymentCount={filteredDeployments.length}
      />

      {/* Tab Content */}
      {activeTab === 'services' ? (
        <ServicesTab
          composeTemplates={composeTemplates}
          instances={showServiceConfigs ? instances : []}
          wiring={wiring}
          providerTemplates={providerTemplates}
          serviceStatuses={serviceStatuses}
          deployments={filteredDeployments}
          splitServicesEnabled={isEnabled('split_services')}
          onAddConfig={showServiceConfigs ? handleAddConfig : () => {}}
          onWiringChange={handleWiringChange}
          onWiringClear={handleWiringClear}
          onConfigCreate={showServiceConfigs ? handleConfigCreate : async () => ''}
          onEditConfig={showServiceConfigs ? handleEditSavedConfig : () => {}}
          onDeleteConfig={showServiceConfigs ? handleDeleteSavedConfig : () => {}}
          onUpdateConfig={showServiceConfigs ? handleUpdateSavedConfig : () => {}}
          onStart={handleStartService}
          onStop={handleStopService}
          onEdit={handleEditService}
          onDeploy={handleDeployService}
          onStopDeployment={handleStopDeployment}
          onRestartDeployment={handleRestartDeployment}
          onRemoveDeployment={handleRemoveDeployment}
          onEditDeployment={handleEditDeployment}
        />
      ) : activeTab === 'providers' ? (
        <ProvidersTab
          providers={providerTemplates}
          expandedProviderId={expandedProviderCard}
          onToggleExpand={handleExpandProviderCard}
          envVars={providerCardEnvVars}
          envConfigs={providerCardEnvConfigs}
          onEnvConfigChange={(envVarName, updates) => {
            setProviderCardEnvConfigs((prev) => ({
              ...prev,
              [envVarName]: { ...prev[envVarName], ...updates } as EnvVarConfig,
            }))
          }}
          onCancel={() => {
            setExpandedProviderCard(null)
            setProviderCardEnvVars([])
            setProviderCardEnvConfigs({})
          }}
          onSave={handleSaveProviderCard}
          isLoading={loadingProviderCard}
          isSaving={savingProviderCard}
        />
      ) : activeTab === 'overview' ? (
        /* System Overview - Read-only Visualization */
        <SystemOverview
          templates={templates}
          configs={instances}
          wiring={wiring}
        />
      ) : activeTab === 'deployments' ? (
        <DeploymentsTab
          deployments={filteredDeployments}
          templates={templates}
          filterCurrentEnvOnly={filterCurrentEnvOnly}
          onFilterChange={setFilterCurrentEnvOnly}
          onStopDeployment={handleStopDeployment}
          onRestartDeployment={handleRestartDeployment}
          onEditDeployment={handleEditDeployment}
          onRemoveDeployment={handleRemoveDeployment}
        />
      ) : null}
      {/* Edit Provider/ServiceConfig Modal */}
      <Modal
        isOpen={!!editingProvider}
        onClose={() => setEditingProvider(null)}
        title={editingProvider?.isTemplate ? 'Edit Provider' : 'Edit ServiceConfig'}
        titleIcon={<Settings className="h-5 w-5 text-primary-600" />}
        maxWidth="4xl"
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
                        <EnvVarEditor
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

      {/* Edit Deployment Modal */}
      <Modal
        isOpen={!!editingDeployment}
        onClose={() => {
          setEditingDeployment(null)
          setDeploymentEnvVars([])
          setDeploymentEnvConfigs({})
        }}
        title="Edit Deployment"
        titleIcon={<Settings className="h-5 w-5 text-primary-600" />}
        maxWidth="4xl"
        testId="edit-deployment-modal"
      >
        {editingDeployment && (
          <div className="space-y-4">
            {/* Deployment info */}
            <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
              <p className="font-medium text-neutral-900 dark:text-neutral-100">
                {templates.find(t => t.id === editingDeployment.service_id)?.name || editingDeployment.service_id}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-neutral-500">
                  {editingDeployment.unode_hostname}
                </span>
                {editingDeployment.exposed_port && (
                  <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-mono">
                    :{editingDeployment.exposed_port}
                  </span>
                )}
              </div>
            </div>

            {/* Environment variables */}
            {loadingEnvConfig ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
                <span className="ml-2 text-sm text-neutral-600">Loading configuration...</span>
              </div>
            ) : deploymentEnvVars.length > 0 ? (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Environment Variables
                </label>
                <div className="max-h-96 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                  {deploymentEnvVars.map((envVar) => {
                    const config = deploymentEnvConfigs[envVar.name] || {
                      name: envVar.name,
                      source: 'default',
                      value: undefined,
                      setting_path: undefined,
                      new_setting_path: undefined,
                    }

                    return (
                      <EnvVarEditor
                        key={envVar.name}
                        envVar={envVar}
                        config={config}
                        onChange={(updates) => {
                          setDeploymentEnvConfigs((prev) => ({
                            ...prev,
                            [envVar.name]: { ...prev[envVar.name], ...updates },
                          }))
                        }}
                        for_deploy={true}
                      />
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No environment variables to configure</p>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={() => {
                  setEditingDeployment(null)
                  setDeploymentEnvVars([])
                  setDeploymentEnvConfigs({})
                }}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!editingDeployment) return

                  try {
                    // Build env vars object from all configs
                    // Backend will filter to only save actual overrides
                    const envVars: Record<string, string> = {}
                    Object.entries(deploymentEnvConfigs).forEach(([name, config]) => {
                      if (config.value) {
                        envVars[name] = config.value
                      }
                    })

                    // Update deployment with new env vars
                    await deploymentsApi.updateDeployment(editingDeployment.id, envVars)

                    setMessage({ type: 'success', text: 'Deployment updated and redeployed successfully' })
                    setEditingDeployment(null)
                    setDeploymentEnvVars([])
                    setDeploymentEnvConfigs({})

                    // Refresh deployments list
                    await refreshDeployments()
                  } catch (error: any) {
                    console.error('Failed to update deployment:', error)
                    setMessage({
                      type: 'error',
                      text: error.response?.data?.detail || 'Failed to update deployment'
                    })
                  }
                }}
                className="btn-primary"
                data-testid="save-deployment-changes"
              >
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

      {/* Unified Deploy Modal (K8s and Docker) */}
      {deployModalState.isOpen && (
        <DeployModal
          isOpen={true}
          onClose={() => setDeployModalState({ isOpen: false, serviceId: null })}
          onSuccess={async () => {
            // Refresh all data after deployment
            refreshData()
          }}
          mode={deployModalState.mode || 'deploy'}
          target={deployModalState.targetId ? availableTargets.find((t) => t.id === deployModalState.targetId) : undefined}
          availableTargets={availableTargets}
          infraServices={deployModalState.infraServices || {}}
          preselectedServiceId={deployModalState.serviceId || undefined}
          preselectedConfigId={deployModalState.configId}
        />
      )}

      {/* Service Catalog Modal */}
      <Modal
        isOpen={catalog.isOpen}
        onClose={catalog.close}
        title="Service Catalog"
        maxWidth="2xl"
        testId="catalog-modal"
      >
        {catalog.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {catalog.services.map(service => (
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
                        disabled={catalog.installingServiceId === service.service_id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-danger-300 text-danger-600 hover:bg-danger-50 dark:border-danger-700 dark:text-danger-400 dark:hover:bg-danger-900/20 disabled:opacity-50"
                      >
                        {catalog.installingServiceId === service.service_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Uninstall
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInstallService(service.service_id)}
                        disabled={catalog.installingServiceId === service.service_id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {catalog.installingServiceId === service.service_id ? (
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

            {catalog.services.length === 0 && (
              <div className="text-center py-12 text-neutral-500">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No services found in the catalog</p>
              </div>
            )}
          </div>
        )}
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
