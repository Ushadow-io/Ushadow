import { useState } from 'react'
import {
  X,
  ArrowRight,
  ArrowLeft,
  Server,
  Database,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { wizardApi, servicesApi } from '../services/api'

type OpenMemoryStep = 'deployment' | 'graph_config' | 'neo4j_credentials' | 'complete'

interface OpenMemoryConfig {
  deployment_type: 'existing' | 'new'
  server_url: string
  enable_graph_memory: boolean
  neo4j_username: string
  neo4j_password: string
  neo4j_confirm_password: string
}

interface Message {
  type: 'success' | 'error' | 'info'
  text: string
}

interface OpenMemoryWizardProps {
  onComplete: (config: OpenMemoryConfig) => void
  onCancel: () => void
  userName: string
  environmentName: string
}

export default function OpenMemoryWizard({
  onComplete,
  onCancel,
  userName,
  environmentName,
}: OpenMemoryWizardProps) {
  const [currentStep, setCurrentStep] = useState<OpenMemoryStep>('deployment')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  const [config, setConfig] = useState<OpenMemoryConfig>({
    deployment_type: 'new',
    server_url: 'http://openmemory:8765',
    enable_graph_memory: false,
    neo4j_username: 'neo4j',
    neo4j_password: '',
    neo4j_confirm_password: '',
  })

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text })
    // Auto-dismiss success/info after 5s, but keep errors until manually dismissed
    if (type !== 'error') {
      setTimeout(() => setMessage(null), 5000)
    }
  }

  const handleNext = async () => {
    if (currentStep === 'deployment') {
      if (config.deployment_type === 'existing') {
        // Skip to completion if using existing deployment
        setCurrentStep('complete')
      } else {
        // New deployment - ask about graph memory
        setCurrentStep('graph_config')
      }
    } else if (currentStep === 'graph_config') {
      if (config.enable_graph_memory) {
        // Need Neo4j credentials
        setCurrentStep('neo4j_credentials')
      } else {
        // No graph memory - complete
        await handleComplete()
      }
    } else if (currentStep === 'neo4j_credentials') {
      // Validate passwords match
      if (config.neo4j_password !== config.neo4j_confirm_password) {
        showMessage('error', 'Passwords do not match')
        return
      }
      if (config.neo4j_password.length < 8) {
        showMessage('error', 'Password must be at least 8 characters')
        return
      }
      await handleComplete()
    }
  }

  const handleComplete = async () => {
    setLoading(true)
    try {
      // Save OpenMemory configuration to settings
      await wizardApi.updateProviders({
        memory_provider: 'openmemory_mcp',
        openmemory_server_url: config.server_url,
        openmemory_enable_graph: config.enable_graph_memory,
        openmemory_neo4j_password: config.neo4j_password || undefined,
      })

      // Start containers if new deployment
      if (config.deployment_type === 'new') {
        // Start Neo4j if graph memory enabled
        if (config.enable_graph_memory) {
          showMessage('info', 'Starting Neo4j container...')
          await servicesApi.startService('neo4j')
        }

        // Start OpenMemory containers
        try {
          showMessage('info', 'Starting OpenMemory (mem0) server...')
          await servicesApi.startService('mem0')
        } catch (error: any) {
          const errorDetail = error.response?.data?.detail
          const errorMessage = typeof errorDetail === 'string'
            ? errorDetail
            : errorDetail?.error || errorDetail?.message || error.message
          throw new Error(`Failed to start mem0: ${errorMessage}`)
        }

        try {
          showMessage('info', 'Starting OpenMemory UI...')
          await servicesApi.startService('mem0-ui')
        } catch (error: any) {
          const errorDetail = error.response?.data?.detail
          const errorMessage = typeof errorDetail === 'string'
            ? errorDetail
            : errorDetail?.error || errorDetail?.message || error.message
          throw new Error(`Failed to start mem0-ui: ${errorMessage}`)
        }
      }

      showMessage('success', 'OpenMemory configured successfully!')

      // Call parent completion handler with config
      setTimeout(() => onComplete(config), 1000)
    } catch (error: any) {
      // Error message is already formatted with service name from inner catches
      const errorMessage = error.message || 'Failed to complete setup'
      showMessage('error', errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (currentStep === 'graph_config') {
      setCurrentStep('deployment')
    } else if (currentStep === 'neo4j_credentials') {
      setCurrentStep('graph_config')
    }
  }

  const canProceed = () => {
    if (currentStep === 'deployment') {
      if (config.deployment_type === 'existing') {
        return config.server_url.trim().length > 0
      }
      return true
    }
    if (currentStep === 'graph_config') return true
    if (currentStep === 'neo4j_credentials') {
      return config.neo4j_password.length >= 8 &&
             config.neo4j_password === config.neo4j_confirm_password
    }
    return false
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              OpenMemory Setup
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Configure OpenMemory for user: {userName} | Environment: {environmentName}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`p-4 mx-6 mt-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400'
              : message.type === 'error'
              ? 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400'
              : 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400'
          }`}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1">{message.text}</span>
            {message.type === 'error' && (
              <button
                onClick={() => setMessage(null)}
                className="text-red-800 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                aria-label="Dismiss error"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-6 min-h-[300px]">
          {/* Deployment Type Step */}
          {currentStep === 'deployment' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  OpenMemory Deployment
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Use an existing OpenMemory server or create a new one.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, deployment_type: 'new' }))}
                  className={`p-6 rounded-lg border-2 transition-all text-left ${
                    config.deployment_type === 'new'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Server className={`w-6 h-6 ${config.deployment_type === 'new' ? 'text-blue-600' : 'text-gray-500'}`} />
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Create New
                    </h4>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Set up OpenMemory automatically with Docker containers
                  </p>
                </button>

                <button
                  onClick={() => setConfig(prev => ({ ...prev, deployment_type: 'existing' }))}
                  className={`p-6 rounded-lg border-2 transition-all text-left ${
                    config.deployment_type === 'existing'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Server className={`w-6 h-6 ${config.deployment_type === 'existing' ? 'text-blue-600' : 'text-gray-500'}`} />
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Use Existing
                    </h4>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Connect to an existing OpenMemory server
                  </p>
                </button>
              </div>

              {config.deployment_type === 'existing' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    OpenMemory Server URL
                  </label>
                  <input
                    type="text"
                    value={config.server_url}
                    onChange={(e) => setConfig(prev => ({ ...prev, server_url: e.target.value }))}
                    placeholder="http://openmemory:8765"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    URL of your existing OpenMemory MCP server
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Graph Memory Configuration Step */}
          {currentStep === 'graph_config' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Graph Memory Configuration
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Enable graph-based memory for enhanced relationship tracking.
                </p>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                  What is Graph Memory?
                </h4>
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  Graph memory uses Neo4j to store relationships between memories, enabling more complex queries and connections. This requires additional resources.
                </p>
              </div>

              <div className="space-y-4">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, enable_graph_memory: true }))}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    config.enable_graph_memory
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Database className={`w-6 h-6 ${config.enable_graph_memory ? 'text-blue-600' : 'text-gray-500'}`} />
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        Enable Graph Memory
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Use Neo4j for advanced memory relationships
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setConfig(prev => ({ ...prev, enable_graph_memory: false }))}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    !config.enable_graph_memory
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Server className={`w-6 h-6 ${!config.enable_graph_memory ? 'text-blue-600' : 'text-gray-500'}`} />
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        Standard Memory Only
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Use vector-based memory without graph relationships
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Neo4j Credentials Step */}
          {currentStep === 'neo4j_credentials' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Neo4j Credentials
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Set up credentials for your Neo4j database.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={config.neo4j_username}
                    onChange={(e) => setConfig(prev => ({ ...prev, neo4j_username: e.target.value }))}
                    placeholder="neo4j"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Default username is "neo4j"
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={config.neo4j_password}
                    onChange={(e) => setConfig(prev => ({ ...prev, neo4j_password: e.target.value }))}
                    placeholder="Minimum 8 characters"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    value={config.neo4j_confirm_password}
                    onChange={(e) => setConfig(prev => ({ ...prev, neo4j_confirm_password: e.target.value }))}
                    placeholder="Re-enter password"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          <button
            onClick={handleBack}
            disabled={currentStep === 'deployment' || loading}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          <button
            onClick={handleNext}
            disabled={!canProceed() || loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                {currentStep === 'neo4j_credentials' || (currentStep === 'deployment' && config.deployment_type === 'existing') || (currentStep === 'graph_config' && !config.enable_graph_memory) ? 'Complete' : 'Next'}
                {(currentStep !== 'neo4j_credentials' && !(currentStep === 'deployment' && config.deployment_type === 'existing') && !(currentStep === 'graph_config' && !config.enable_graph_memory)) && <ArrowRight className="w-5 h-5" />}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
