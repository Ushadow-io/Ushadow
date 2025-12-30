import { Settings, Save, Server, Key, Database, CheckCircle, XCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { settingsApi, dockerApi } from '../services/api'
import { useTheme } from '../contexts/ThemeContext'

export default function SettingsPage() {
  const { isDark } = useTheme()
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
    <div className="space-y-6" data-testid="settings-page">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2">
          <Settings className="h-8 w-8" style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }} />
          <h1
            className="text-3xl font-bold"
            style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
          >
            Settings
          </h1>
        </div>
        <p
          className="mt-2"
          style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
        >
          Configure your ushadow platform
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{ borderBottom: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}` }}
      >
        <div className="flex space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`settings-tab-${tab.id}`}
              className="flex items-center space-x-2 px-4 py-3 font-medium transition-all"
              style={{
                color: activeTab === tab.id
                  ? '#4ade80'
                  : (isDark ? 'var(--text-secondary)' : '#71717a'),
                borderBottom: activeTab === tab.id
                  ? '2px solid #4ade80'
                  : '2px solid transparent',
              }}
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
            <div
              className="rounded-xl p-6"
              style={{
                backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
                border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
                borderLeft: '4px solid #4ade80',
                boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3
                  className="font-semibold"
                  style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                >
                  Memory Provider
                </h3>
                {memoryStatus?.status === 'running' ? (
                  <div className="flex items-center space-x-2" style={{ color: '#4ade80' }}>
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2" style={{ color: isDark ? 'var(--text-muted)' : '#a1a1aa' }}>
                    <XCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">Not Running</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>Provider:</span>
                  <p
                    className="font-medium mt-1"
                    style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                  >
                    {config.memory_provider === 'openmemory' ? 'OpenMemory' : config.memory_provider}
                  </p>
                </div>
                <div>
                  <span style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>Server URL:</span>
                  <p
                    className="font-mono text-sm mt-1"
                    style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                  >
                    {config.service_configs?.openmemory?.server_url || 'Not configured'}
                  </p>
                </div>
                <div>
                  <span style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>Graph Memory:</span>
                  <p
                    className="font-medium mt-1"
                    style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                  >
                    {config.service_configs?.openmemory?.enable_graph ? 'Enabled (Neo4j)' : 'Disabled'}
                  </p>
                </div>
                {memoryStatus && (
                  <div>
                    <span style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>Container:</span>
                    <p
                      className="font-mono text-sm mt-1"
                      style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                    >
                      {memoryStatus.container_id || 'Not started'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chronicle Configuration */}
          <div
            className="rounded-xl p-6"
            style={{
              backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
              border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
              boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3
              className="font-semibold mb-4"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              Chronicle Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                >
                  Chronicle URL
                </label>
                <input
                  type="url"
                  className="w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: isDark ? 'var(--surface-700)' : '#ffffff',
                    border: `1px solid ${isDark ? 'var(--surface-400)' : '#e4e4e7'}`,
                    color: isDark ? 'var(--text-primary)' : '#0f0f13',
                  }}
                  placeholder="http://localhost:8000"
                  defaultValue="http://localhost:8000"
                  data-testid="chronicle-url-input"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="chronicle-enabled" className="rounded" />
                <label
                  htmlFor="chronicle-enabled"
                  className="text-sm"
                  style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                >
                  Enable Chronicle Integration
                </label>
              </div>
            </div>
          </div>

          {/* MCP Configuration */}
          <div
            className="rounded-xl p-6"
            style={{
              backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
              border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
              boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3
              className="font-semibold mb-4"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              MCP Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                >
                  MCP Server URL
                </label>
                <input
                  type="url"
                  className="w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: isDark ? 'var(--surface-700)' : '#ffffff',
                    border: `1px solid ${isDark ? 'var(--surface-400)' : '#e4e4e7'}`,
                    color: isDark ? 'var(--text-primary)' : '#0f0f13',
                  }}
                  placeholder="http://localhost:8765"
                  data-testid="mcp-url-input"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="mcp-enabled" className="rounded" />
                <label
                  htmlFor="mcp-enabled"
                  className="text-sm"
                  style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                >
                  Enable MCP Integration
                </label>
              </div>
            </div>
          </div>

          {/* Agent Zero Configuration */}
          <div
            className="rounded-xl p-6"
            style={{
              backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
              border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
              boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3
              className="font-semibold mb-4"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              Agent Zero Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                >
                  Agent Zero URL
                </label>
                <input
                  type="url"
                  className="w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: isDark ? 'var(--surface-700)' : '#ffffff',
                    border: `1px solid ${isDark ? 'var(--surface-400)' : '#e4e4e7'}`,
                    color: isDark ? 'var(--text-primary)' : '#0f0f13',
                  }}
                  placeholder="http://localhost:9000"
                  data-testid="agent-zero-url-input"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="agent-enabled" className="rounded" />
                <label
                  htmlFor="agent-enabled"
                  className="text-sm"
                  style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                >
                  Enable Agent Zero Integration
                </label>
              </div>
            </div>
          </div>

          {/* n8n Configuration */}
          <div
            className="rounded-xl p-6"
            style={{
              backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
              border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
              boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3
              className="font-semibold mb-4"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              n8n Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                >
                  n8n URL
                </label>
                <input
                  type="url"
                  className="w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: isDark ? 'var(--surface-700)' : '#ffffff',
                    border: `1px solid ${isDark ? 'var(--surface-400)' : '#e4e4e7'}`,
                    color: isDark ? 'var(--text-primary)' : '#0f0f13',
                  }}
                  placeholder="http://localhost:5678"
                  data-testid="n8n-url-input"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="n8n-enabled" className="rounded" />
                <label
                  htmlFor="n8n-enabled"
                  className="text-sm"
                  style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                >
                  Enable n8n Integration
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all hover:scale-[1.02]"
              style={{
                backgroundColor: '#4ade80',
                color: '#0f0f13',
                boxShadow: isDark ? '0 0 20px rgba(74, 222, 128, 0.2)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
              data-testid="save-settings-button"
            >
              <Save className="h-5 w-5" />
              <span>Save Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === 'api-keys' && (
        <div className="space-y-4">
          <div
            className="rounded-xl p-6"
            style={{
              backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
              border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
              boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3
              className="font-semibold mb-4"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              API Keys
            </h3>
            <p
              className="text-sm mb-4"
              style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
            >
              Shared API keys from api_keys namespace
            </p>

            {config?.api_keys && Object.entries(config.api_keys).some(([_, v]) => v) ? (
              <div className="space-y-4">
                {Object.entries(config.api_keys).map(([keyName, keyValue]: [string, any]) => {
                  if (!keyValue) return null  // Skip null/empty keys

                  return (
                    <div
                      key={keyName}
                      className="p-4 rounded-lg"
                      style={{
                        backgroundColor: isDark ? 'var(--surface-700)' : '#fafafa',
                        border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <h4
                            className="font-medium"
                            style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                          >
                            {keyName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </h4>
                          <code
                            className="px-2 py-1 rounded text-xs font-mono"
                            style={{
                              backgroundColor: isDark ? 'var(--surface-600)' : '#f4f4f5',
                              color: isDark ? 'var(--text-muted)' : '#71717a',
                            }}
                          >
                            ●●●●●●●●{keyValue.slice(-4)}
                          </code>
                        </div>
                        <div className="flex items-center space-x-2" style={{ color: '#4ade80' }}>
                          <CheckCircle className="h-5 w-5" />
                          <span className="text-sm">Configured</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p style={{ color: isDark ? 'var(--text-muted)' : '#a1a1aa' }} className="text-sm">
                No API keys configured yet. Complete the setup wizard to add services.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Database Tab */}
      {activeTab === 'database' && (
        <div className="space-y-4">
          <div
            className="rounded-xl p-6"
            style={{
              backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
              border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
              boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3
              className="font-semibold mb-4"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              Database Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                >
                  MongoDB URI
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-1 opacity-60"
                  style={{
                    backgroundColor: isDark ? 'var(--surface-700)' : '#ffffff',
                    border: `1px solid ${isDark ? 'var(--surface-400)' : '#e4e4e7'}`,
                    color: isDark ? 'var(--text-primary)' : '#0f0f13',
                  }}
                  placeholder="mongodb://localhost:27017"
                  defaultValue="mongodb://mongo:27017"
                  disabled
                  data-testid="mongodb-uri-input"
                />
                <p
                  className="mt-1 text-xs"
                  style={{ color: isDark ? 'var(--text-muted)' : '#a1a1aa' }}
                >
                  Configure via environment variables
                </p>
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                >
                  Redis URL
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-1 opacity-60"
                  style={{
                    backgroundColor: isDark ? 'var(--surface-700)' : '#ffffff',
                    border: `1px solid ${isDark ? 'var(--surface-400)' : '#e4e4e7'}`,
                    color: isDark ? 'var(--text-primary)' : '#0f0f13',
                  }}
                  placeholder="redis://localhost:6379"
                  defaultValue="redis://redis:6379/0"
                  disabled
                  data-testid="redis-url-input"
                />
                <p
                  className="mt-1 text-xs"
                  style={{ color: isDark ? 'var(--text-muted)' : '#a1a1aa' }}
                >
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
