import { useState, useEffect } from 'react'
import {
  Server,
  Cloud,
  Layers,
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
  HardDrive,
  Pencil,
  Plus,
  Package,
  Trash2,
  BookOpen,
} from 'lucide-react'
import {
  providersApi,
  servicesApi,
  svcConfigsApi,
  settingsApi,
  Capability,
  ProviderWithStatus,
  ComposeService,
  EnvVarInfo,
  EnvVarConfig,
  ServiceConfig,
  ServiceConfigSummary,
} from '../services/api'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import { PortConflictDialog } from '../components/services'

type TabId = 'providers' | 'services' | 'deployed'

export default function InterfacesPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('providers')

  // Providers state
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [providerEditForm, setProviderEditForm] = useState<Record<string, string>>({})
  const [changingProvider, setChangingProvider] = useState<string | null>(null)
  const [savingProvider, setSavingProvider] = useState(false)

  // Services state
  const [services, setServices] = useState<ComposeService[]>([])
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, any>>({})
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set())
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [envConfig, setEnvConfig] = useState<{
    required_env_vars: EnvVarInfo[]
    optional_env_vars: EnvVarInfo[]
  } | null>(null)
  const [envEditForm, setEnvEditForm] = useState<Record<string, EnvVarConfig>>({})
  const [customEnvVars, setCustomEnvVars] = useState<Array<{ name: string; value: string }>>([])
  const [startingService, setStartingService] = useState<string | null>(null)
  const [loadingEnvConfig, setLoadingEnvConfig] = useState<string | null>(null)

  // Deployed instances state
  const [deployedInstances, setDeployedInstances] = useState<ServiceConfigSummary[]>([])
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set())
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null)
  const [instanceDetails, setInstanceDetails] = useState<Record<string, ServiceConfig>>({})

  // General state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [serviceErrors, setServiceErrors] = useState<Record<string, string>>({})

  // Dialog states
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    serviceName: string | null
  }>({ isOpen: false, serviceName: null })

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

  const [portEditDialog, setPortEditDialog] = useState<{
    isOpen: boolean
    serviceId: string | null
    serviceName: string | null
    currentPort: number | null
    envVar: string | null
    newPort: string
  }>({ isOpen: false, serviceId: null, serviceName: null, currentPort: null, envVar: null, newPort: '' })

  const [showCatalog, setShowCatalog] = useState(false)
  const [catalogServices, setCatalogServices] = useState<ComposeService[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [installingService, setInstallingService] = useState<string | null>(null)

  // Tab definitions
  const tabs = [
    { id: 'providers' as TabId, label: 'Providers', icon: Cloud },
    { id: 'services' as TabId, label: 'Services', icon: Server },
    { id: 'deployed' as TabId, label: 'Deployed', icon: Layers },
  ]

  // Load initial data
  useEffect(() => {
    loadData()
  }, [])

  // Deep linking - support hash-based tab navigation
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (['providers', 'services', 'deployed'].includes(hash)) {
      setActiveTab(hash as TabId)
    }
  }, [])

  // Update hash when tab changes
  useEffect(() => {
    window.location.hash = activeTab
  }, [activeTab])

  const loadData = async () => {
    try {
      setLoading(true)
      const [capsResponse, servicesResponse, instancesResponse] = await Promise.all([
        providersApi.getCapabilities(),
        servicesApi.getInstalled(),
        svcConfigsApi.getServiceConfigs(),
      ])

      setCapabilities(capsResponse.data)
      setServices(servicesResponse.data)
      setDeployedInstances(instancesResponse.data)

      // Load Docker statuses for services
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

      for (const service of serviceList) {
        statuses[service.service_name] = response.data[service.service_name] || { status: 'not_found' }
      }

      setServiceStatuses(statuses)
    } catch (error) {
      console.error('Failed to fetch Docker statuses:', error)
      // Set fallback statuses
      const fallbackStatuses: Record<string, any> = {}
      for (const service of serviceList) {
        fallbackStatuses[service.service_name] = { status: 'not_found' }
      }
      setServiceStatuses(fallbackStatuses)
    }
  }

  // Provider actions
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

  // Service actions - these will be implemented as needed
  // For now, just placeholder implementations
  const handleStartService = async (serviceName: string) => {
    setMessage({ type: 'error', text: 'Service start not yet implemented' })
  }

  const handleStopService = (serviceName: string) => {
    setMessage({ type: 'error', text: 'Service stop not yet implemented' })
  }

  // Deployed instance actions - placeholders for now
  const handleExpandInstance = async (instanceId: string) => {
    setExpandedInstances(prev => new Set(prev).add(instanceId))
  }

  const handleCollapseInstance = (instanceId: string) => {
    setExpandedInstances(prev => {
      const next = new Set(prev)
      next.delete(instanceId)
      return next
    })
  }

  const handleDeployInstance = async (instanceId: string) => {
    setMessage({ type: 'error', text: 'Deploy not yet implemented' })
  }

  const handleUndeployInstance = async (instanceId: string) => {
    setMessage({ type: 'error', text: 'Undeploy not yet implemented' })
  }

  const handleDeleteInstance = async (instanceId: string) => {
    setMessage({ type: 'error', text: 'Delete not yet implemented' })
  }

  // Render
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-neutral-400 mx-auto mb-4 animate-spin" />
          <p className="text-neutral-600 dark:text-neutral-400">Loading interfaces...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="interfaces-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Server className="h-8 w-8 text-neutral-600 dark:text-neutral-400" />
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Interfaces</h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Manage providers, services, and deployments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="btn-ghost p-2"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
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

      {/* Tabs */}
      <div className="border-b border-neutral-200 dark:border-neutral-700" data-testid="interfaces-tabs">
        <div className="flex space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
              className={`
                flex items-center space-x-2 px-4 py-3 font-medium transition-all
                ${activeTab === tab.id
                  ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                }
              `}
            >
              <tab.icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content - Providers */}
      {activeTab === 'providers' && (
        <div className="space-y-6" data-testid="providers-content">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Capability Providers
          </h2>
          <div className="text-neutral-600 dark:text-neutral-400">
            Providers tab content - showing {capabilities.length} capabilities
          </div>
        </div>
      )}

      {/* Tab Content - Services */}
      {activeTab === 'services' && (
        <div className="space-y-6" data-testid="services-content">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Compose Services
          </h2>
          <div className="text-neutral-600 dark:text-neutral-400">
            Services tab content - showing {services.length} services
          </div>
        </div>
      )}

      {/* Tab Content - Deployed */}
      {activeTab === 'deployed' && (
        <div className="space-y-6" data-testid="deployed-content">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Deployed Service Instances
          </h2>
          <div className="text-neutral-600 dark:text-neutral-400">
            Deployed tab content - showing {deployedInstances.length} instances
          </div>
        </div>
      )}
    </div>
  )
}
