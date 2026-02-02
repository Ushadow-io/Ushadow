import { useState, useEffect } from 'react'
import {
  Server,
  Cloud,
  Layers,
  AlertCircle,
  X,
  RefreshCw,
} from 'lucide-react'
import {
  providersApi,
  servicesApi,
  svcConfigsApi,
  Capability,
  ComposeService,
  ServiceConfigSummary,
} from '../services/api'

type TabId = 'providers' | 'services' | 'deployed'

export default function InterfacesPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('providers')

  // Data state
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [services, setServices] = useState<ComposeService[]>([])
  const [deployedInstances, setDeployedInstances] = useState<ServiceConfigSummary[]>([])

  // General state
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

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
    } catch (error) {
      console.error('Error loading data:', error)
      setMessage({ type: 'error', text: 'Failed to load services' })
    } finally {
      setLoading(false)
    }
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
