import { Settings, Key, Database, Server, Eye, EyeOff, CheckCircle, Trash2, RefreshCw, AlertTriangle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { settingsApi } from '../services/api'
import { JsonTreeViewer } from '../components/JsonTreeViewer'
import { StatusBadge } from '../components/StatusBadge'

interface ApiKey {
  name: string
  value: string
  hasValue: boolean
}

interface ServiceEnvConfig {
  serviceId: string
  serviceName: string
  envVars: {
    name: string
    source: string
    settingPath?: string
    value?: string
  }[]
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('api-keys')
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [resetting, setResetting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await settingsApi.getConfig()
      setConfig(response.data)
    } catch (err) {
      console.error('Failed to load config:', err)
      setError('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      // First, tell backend to reload YAML files from disk
      await settingsApi.refresh()
      // Then reload the config into the UI
      await loadConfig()
    } catch (err) {
      console.error('Failed to refresh config:', err)
      setError('Failed to refresh configuration')
    } finally {
      setRefreshing(false)
    }
  }

  const toggleKeyVisibility = (keyName: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev)
      if (next.has(keyName)) {
        next.delete(keyName)
      } else {
        next.add(keyName)
      }
      return next
    })
  }

  const handleReset = async () => {
    setResetting(true)
    setError(null)
    try {
      await settingsApi.reset()
      setShowResetConfirm(false)
      await loadConfig()
    } catch (err) {
      console.error('Failed to reset config:', err)
      setError('Failed to reset configuration')
    } finally {
      setResetting(false)
    }
  }

  const tabs = [
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'providers', label: 'Providers', icon: Server },
    { id: 'service-config', label: 'Service Config', icon: Database },
  ]

  // Extract API keys with values
  const apiKeys: ApiKey[] = config?.api_keys
    ? Object.entries(config.api_keys)
        .filter(([_, value]) => value && String(value).trim() !== '')
        .map(([name, value]) => ({
          name,
          value: String(value),
          hasValue: true,
        }))
    : []

  // Extract selected providers
  const selectedProviders = config?.selected_providers || {}

  // Extract service env configs
  const serviceEnvConfigs: ServiceEnvConfig[] = config?.service_env_config
    ? Object.entries(config.service_env_config).map(([serviceKey, envConfig]: [string, any]) => ({
        serviceId: serviceKey.replace('_', ':'),
        serviceName: serviceKey.split('_').pop() || serviceKey,
        envVars: Object.entries(envConfig || {}).map(([name, conf]: [string, any]) => ({
          name,
          source: conf?.source || 'unknown',
          settingPath: conf?.setting_path,
          value: conf?.value,
        })),
      }))
    : []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="settings-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Settings className="h-8 w-8 text-neutral-600 dark:text-neutral-400" />
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Settings</h1>
            <StatusBadge variant="needs-updating" testId="badge-settings-page" />
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            View saved configuration
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary flex items-center space-x-2"
            data-testid="refresh-settings"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="btn-secondary flex items-center space-x-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
            data-testid="reset-settings"
          >
            <Trash2 className="h-4 w-4" />
            <span>Reset to Defaults</span>
          </button>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center space-x-3 text-red-600 mb-4">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold">Reset Configuration?</h3>
            </div>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6">
              This will delete all saved settings from the database and revert to file-based defaults.
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="btn-secondary"
                disabled={resetting}
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="btn-primary bg-red-600 hover:bg-red-700"
                disabled={resetting}
              >
                {resetting ? 'Resetting...' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-neutral-200 dark:border-neutral-700">
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

      {/* API Keys Tab */}
      {activeTab === 'api-keys' && (
        <div className="space-y-4" data-testid="api-keys-tab">
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Saved API Keys
            </h3>

            {apiKeys.length > 0 ? (
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div
                    key={key.name}
                    className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg"
                    data-testid={`api-key-${key.name}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <Key className="h-4 w-4 text-neutral-500" />
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {key.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </div>
                      <div className="mt-1 ml-7">
                        <code className="text-sm font-mono text-neutral-600 dark:text-neutral-400">
                          {visibleKeys.has(key.name) ? key.value : key.value.replace(/./g, '•').slice(0, 20) + (key.value.length > 20 ? '...' : '')}
                        </code>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => toggleKeyVisibility(key.name)}
                        className="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                        data-testid={`toggle-visibility-${key.name}`}
                      >
                        {visibleKeys.has(key.name) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-neutral-500">
                <Key className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No API keys saved yet</p>
                <p className="text-sm mt-1">Configure services on the Services page to add API keys</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Providers Tab */}
      {activeTab === 'providers' && (
        <div className="space-y-4" data-testid="providers-tab">
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Selected Providers by Capability
            </h3>

            {Object.keys(selectedProviders).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(selectedProviders).map(([capability, providerId]) => (
                  <div
                    key={capability}
                    className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg"
                    data-testid={`provider-${capability}`}
                  >
                    <div className="flex items-center space-x-3">
                      <Server className="h-4 w-4 text-neutral-500" />
                      <div>
                        <span className="font-medium text-neutral-900 dark:text-neutral-100 capitalize">
                          {capability}
                        </span>
                        <p className="text-sm text-neutral-500">Capability</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-sm text-neutral-700 dark:text-neutral-300">
                        {String(providerId)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-neutral-500">
                <Server className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No providers selected</p>
                <p className="text-sm mt-1">Providers are selected when configuring services</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Service Config Tab */}
      {activeTab === 'service-config' && (
        <div className="space-y-4" data-testid="service-config-tab">
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Service Environment Configurations
            </h3>

            {serviceEnvConfigs.length > 0 ? (
              <div className="space-y-6">
                {serviceEnvConfigs.map((svc) => (
                  <div
                    key={svc.serviceId}
                    className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden"
                    data-testid={`service-config-${svc.serviceId}`}
                  >
                    <div className="bg-neutral-100 dark:bg-neutral-800 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
                      <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                        {svc.serviceName}
                      </h4>
                      <p className="text-xs text-neutral-500 font-mono">{svc.serviceId}</p>
                    </div>
                    <div className="p-4 space-y-2">
                      {svc.envVars.map((env) => (
                        <div
                          key={env.name}
                          className="flex items-center justify-between py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                        >
                          <code className="text-sm font-mono text-neutral-700 dark:text-neutral-300">
                            {env.name}
                          </code>
                          <div className="flex items-center space-x-2">
                            {env.source === 'setting' && (
                              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                                → {env.settingPath}
                              </span>
                            )}
                            {env.source === 'literal' && (
                              <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                                literal
                              </span>
                            )}
                            {env.source === 'default' && (
                              <span className="text-xs bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 px-2 py-1 rounded">
                                default
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-neutral-500">
                <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No service configurations saved</p>
                <p className="text-sm mt-1">Configure services on the Services page to see their env var mappings here</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Debug: Raw Config */}
      {import.meta.env.DEV && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-400">
            Debug: Raw Config
          </summary>
          <div className="mt-2 max-h-[500px] overflow-auto">
            <JsonTreeViewer data={config} initialExpandDepth={2} />
          </div>
        </details>
      )}
    </div>
  )
}
