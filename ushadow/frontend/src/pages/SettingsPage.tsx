import { Settings, Save, Server, Key, Database, CheckCircle, XCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { settingsApi, dockerApi } from '../services/api'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('services')
  const [config, setConfig] = useState<any>(null)
  const [memoryStatus, setMemoryStatus] = useState<any>(null)
  
  useEffect(() => {
    loadConfig()
    loadMemoryStatus()
  }, [])
  
  const loadConfig = async () => {
    try {
      // Load both core config and service configs
      const [configResponse, serviceConfigsResponse] = await Promise.all([
        settingsApi.getConfig(),
        settingsApi.getAllServiceConfigs()
      ])
      
      setConfig({
        ...configResponse.data,
        service_configs: serviceConfigsResponse.data
      })
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }
  
  const loadMemoryStatus = async () => {
    // Check if any memory service is configured
    const memoryProvider = config?.memory_provider
    if (!memoryProvider) return
    
    try {
      // Check if mem0 container is running (for openmemory)
      if (memoryProvider === 'openmemory') {
        const response = await dockerApi.getServiceInfo('mem0')
        setMemoryStatus(response.data)
      }
    } catch (error) {
      console.error('Failed to load memory status:', error)
    }
  }
  
  useEffect(() => {
    if (config?.memory_provider) {
      loadMemoryStatus()
    }
  }, [config])

  const tabs = [
    { id: 'services', label: 'Services', icon: Server },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'database', label: 'Database', icon: Database },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2">
          <Settings className="h-8 w-8 text-neutral-600 dark:text-neutral-400" />
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Settings</h1>
        </div>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Configure your ushadow platform
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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

      {/* Services Tab */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          {/* Memory Provider Status */}
          {config?.memory_provider && (
            <div className="card p-6 border-l-4 border-primary-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Memory Provider
                </h3>
                {memoryStatus?.status === 'running' ? (
                  <div className="flex items-center space-x-2 text-success-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-neutral-500">
                    <XCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">Not Running</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-neutral-600 dark:text-neutral-400">Provider:</span>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100 mt-1">
                    {config.memory_provider === 'openmemory' ? 'OpenMemory' : config.memory_provider}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-600 dark:text-neutral-400">Server URL:</span>
                  <p className="font-mono text-sm text-neutral-900 dark:text-neutral-100 mt-1">
                    {config.service_configs?.openmemory?.server_url || 'Not configured'}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-600 dark:text-neutral-400">Graph Memory:</span>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100 mt-1">
                    {config.service_configs?.openmemory?.enable_graph ? 'Enabled (Neo4j)' : 'Disabled'}
                  </p>
                </div>
                {memoryStatus && (
                  <div>
                    <span className="text-neutral-600 dark:text-neutral-400">Container:</span>
                    <p className="font-mono text-sm text-neutral-900 dark:text-neutral-100 mt-1">
                      {memoryStatus.container_id || 'Not started'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Chronicle Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Chronicle URL
                </label>
                <input
                  type="url"
                  className="input"
                  placeholder="http://localhost:8000"
                  defaultValue="http://localhost:8000"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="chronicle-enabled" className="rounded" />
                <label htmlFor="chronicle-enabled" className="text-sm text-neutral-700 dark:text-neutral-300">
                  Enable Chronicle Integration
                </label>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              MCP Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  MCP Server URL
                </label>
                <input
                  type="url"
                  className="input"
                  placeholder="http://localhost:8765"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="mcp-enabled" className="rounded" />
                <label htmlFor="mcp-enabled" className="text-sm text-neutral-700 dark:text-neutral-300">
                  Enable MCP Integration
                </label>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Agent Zero Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Agent Zero URL
                </label>
                <input
                  type="url"
                  className="input"
                  placeholder="http://localhost:9000"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="agent-enabled" className="rounded" />
                <label htmlFor="agent-enabled" className="text-sm text-neutral-700 dark:text-neutral-300">
                  Enable Agent Zero Integration
                </label>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              n8n Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  n8n URL
                </label>
                <input
                  type="url"
                  className="input"
                  placeholder="http://localhost:5678"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="n8n-enabled" className="rounded" />
                <label htmlFor="n8n-enabled" className="text-sm text-neutral-700 dark:text-neutral-300">
                  Enable n8n Integration
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button className="btn-primary flex items-center space-x-2">
              <Save className="h-5 w-5" />
              <span>Save Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === 'api-keys' && (
        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              API Keys
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Shared API keys from api_keys namespace
            </p>

            {config?.api_keys && Object.entries(config.api_keys).some(([_, v]) => v) ? (
              <div className="space-y-4">
                {Object.entries(config.api_keys).map(([keyName, keyValue]: [string, any]) => {
                  if (!keyValue) return null  // Skip null/empty keys

                  return (
                    <div key={keyName} className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                            {keyName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </h4>
                          <code className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-xs font-mono text-neutral-500">
                            ●●●●●●●●{keyValue.slice(-4)}
                          </code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-5 w-5 text-success-600" />
                          <span className="text-sm text-success-600">Configured</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                No API keys configured yet. Complete the setup wizard to add services.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Database Tab (keeping original) */}
      {activeTab === 'database' && (
        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Database Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Anthropic API Key
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="sk-ant-..."
                />
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button className="btn-primary flex items-center space-x-2">
                <Save className="h-5 w-5" />
                <span>Save API Keys</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Database Tab */}
      {activeTab === 'database' && (
        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Database Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  MongoDB URI
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="mongodb://localhost:27017"
                  defaultValue="mongodb://mongo:27017"
                  disabled
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Configure via environment variables
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Redis URL
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="redis://localhost:6379"
                  defaultValue="redis://redis:6379/0"
                  disabled
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Configure via environment variables
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
