import { Settings, Save, Server, Key, Database, Shield, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('services')
  const navigate = useNavigate()

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

          <div className="card p-6 border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                  <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                    Tailscale Secure Access
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                    Set up secure HTTPS access to ushadow from anywhere without port forwarding or firewall configuration.
                  </p>
                  <ul className="text-sm text-neutral-700 dark:text-neutral-300 space-y-1 mb-4">
                    <li className="flex items-center gap-2">
                      <span className="text-green-600 dark:text-green-400">✓</span>
                      <span>Encrypted VPN mesh network</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-600 dark:text-green-400">✓</span>
                      <span>Automatic HTTPS with valid SSL certificates</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-600 dark:text-green-400">✓</span>
                      <span>Access from any device (phone, laptop, tablet)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-600 dark:text-green-400">✓</span>
                      <span>No network configuration required</span>
                    </li>
                  </ul>
                  <button
                    id="tailscale-wizard-button"
                    onClick={() => navigate('/wizard/tailscale')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <span>Launch Setup Wizard</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
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
              Configure API keys for external services and AI models.
            </p>
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
