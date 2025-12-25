import { Wand2, CheckCircle, Circle, Key, Database, Server, ArrowRight, AlertCircle, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { wizardApi } from '../services/api'

interface WizardStep {
  id: string
  title: string
  description: string
  completed: boolean
}

interface ApiKeys {
  openai_api_key: string
  deepgram_api_key: string
  mistral_api_key: string
  anthropic_api_key: string
}

export default function WizardPage() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeys>({
    openai_api_key: '',
    deepgram_api_key: '',
    mistral_api_key: '',
    anthropic_api_key: '',
  })

  // Services state
  const [services, setServices] = useState({
    chronicle: true,
    mcp: true,
    agentZero: false,
    n8n: false,
  })

  const [steps, setSteps] = useState<WizardStep[]>([
    {
      id: 'api-keys',
      title: 'Configure API Keys',
      description: 'Set up your AI service API keys',
      completed: false,
    },
    {
      id: 'services',
      title: 'Configure Services',
      description: 'Connect to external services',
      completed: false,
    },
    {
      id: 'database',
      title: 'Database Setup',
      description: 'Verify database connections',
      completed: false,
    },
    {
      id: 'complete',
      title: 'Complete Setup',
      description: 'Finalize your configuration',
      completed: false,
    },
  ])

  // Load existing API keys on mount
  useEffect(() => {
    loadWizardStatus()
    loadApiKeys()
  }, [])

  const loadWizardStatus = async () => {
    try {
      const response = await wizardApi.getStatus()
      const status = response.data

      // Update completed steps based on backend status
      if (status.completed_steps && status.completed_steps.length > 0) {
        const newSteps = [...steps]
        status.completed_steps.forEach((stepId: string) => {
          const stepIndex = newSteps.findIndex(s => s.id === stepId)
          if (stepIndex !== -1) {
            newSteps[stepIndex].completed = true
          }
        })
        setSteps(newSteps)
      }

      // Set current step based on backend
      if (status.current_step) {
        const stepIndex = steps.findIndex(s => s.id === status.current_step)
        if (stepIndex !== -1) {
          setCurrentStep(stepIndex)
        }
      }
    } catch (err) {
      console.error('Failed to load wizard status:', err)
    }
  }

  const loadApiKeys = async () => {
    try {
      const response = await wizardApi.getApiKeys()
      const keys = response.data

      // Only update if keys exist (they come masked from backend)
      setApiKeys({
        openai_api_key: keys.openai_api_key || '',
        deepgram_api_key: keys.deepgram_api_key || '',
        mistral_api_key: keys.mistral_api_key || '',
        anthropic_api_key: keys.anthropic_api_key || '',
      })
    } catch (err) {
      console.error('Failed to load API keys:', err)
    }
  }

  const saveApiKeys = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Only send keys that have been changed (not masked values)
      const keysToUpdate: any = {}

      if (apiKeys.openai_api_key && !apiKeys.openai_api_key.startsWith('***')) {
        keysToUpdate.openai_api_key = apiKeys.openai_api_key
      }
      if (apiKeys.deepgram_api_key && !apiKeys.deepgram_api_key.startsWith('***')) {
        keysToUpdate.deepgram_api_key = apiKeys.deepgram_api_key
      }
      if (apiKeys.mistral_api_key && !apiKeys.mistral_api_key.startsWith('***')) {
        keysToUpdate.mistral_api_key = apiKeys.mistral_api_key
      }
      if (apiKeys.anthropic_api_key && !apiKeys.anthropic_api_key.startsWith('***')) {
        keysToUpdate.anthropic_api_key = apiKeys.anthropic_api_key
      }

      const response = await wizardApi.updateApiKeys(keysToUpdate)

      if (response.data.success) {
        setSuccess('API keys saved successfully!')
        markStepComplete(0)

        // Reload keys to get masked values
        await loadApiKeys()
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save API keys')
    } finally {
      setLoading(false)
    }
  }

  const markStepComplete = (stepIndex: number) => {
    const newSteps = [...steps]
    newSteps[stepIndex].completed = true
    setSteps(newSteps)

    if (stepIndex < steps.length - 1) {
      setCurrentStep(stepIndex + 1)
    }
  }

  const completeWizard = async () => {
    setLoading(true)
    try {
      await wizardApi.complete()
      setSuccess('Setup complete! Redirecting to dashboard...')

      setTimeout(() => {
        navigate('/')
      }, 1500)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to complete wizard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2">
          <Wand2 className="h-8 w-8 text-primary-600 dark:text-primary-400" />
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Setup Wizard</h1>
        </div>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Let's get your ushadow platform configured and ready to use
        </p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="card p-4 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800">
          <div className="flex items-center space-x-2 text-error-700 dark:text-error-300">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="card p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800">
          <div className="flex items-center space-x-2 text-success-700 dark:text-success-300">
            <CheckCircle className="h-5 w-5" />
            <span>{success}</span>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <button
                  onClick={() => setCurrentStep(index)}
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center transition-all
                    ${step.completed
                      ? 'bg-success-500 text-white'
                      : currentStep === index
                        ? 'bg-primary-500 text-white ring-4 ring-primary-100 dark:ring-primary-900/30'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'
                    }
                  `}
                >
                  {step.completed ? (
                    <CheckCircle className="h-6 w-6" />
                  ) : (
                    <Circle className="h-6 w-6" />
                  )}
                </button>
                <div className="mt-2 text-center">
                  <p className={`text-sm font-medium ${currentStep === index ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-600 dark:text-neutral-400'}`}>
                    {step.title}
                  </p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-1 mx-4 rounded ${step.completed ? 'bg-success-500' : 'bg-neutral-200 dark:bg-neutral-700'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="card p-6">
        {/* API Keys Step */}
        {currentStep === 0 && (
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <Key className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                Configure API Keys
              </h2>
            </div>

            <p className="text-neutral-600 dark:text-neutral-400">
              Enter your API keys for the AI services you plan to use. These can be updated later in Settings.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  OpenAI API Key <span className="text-error-500">*</span>
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="sk-..."
                  value={apiKeys.openai_api_key}
                  onChange={(e) => setApiKeys({ ...apiKeys, openai_api_key: e.target.value })}
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Get your API key from <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">platform.openai.com</a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Anthropic API Key <span className="text-error-500">*</span>
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="sk-ant-..."
                  value={apiKeys.anthropic_api_key}
                  onChange={(e) => setApiKeys({ ...apiKeys, anthropic_api_key: e.target.value })}
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Get your API key from <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">console.anthropic.com</a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Deepgram API Key (for transcription)
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="Enter Deepgram API key..."
                  value={apiKeys.deepgram_api_key}
                  onChange={(e) => setApiKeys({ ...apiKeys, deepgram_api_key: e.target.value })}
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Optional: For voice transcription features
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Mistral API Key (alternative transcription)
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="Enter Mistral API key..."
                  value={apiKeys.mistral_api_key}
                  onChange={(e) => setApiKeys({ ...apiKeys, mistral_api_key: e.target.value })}
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Optional: Alternative transcription service
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={saveApiKeys}
                disabled={loading}
                className="btn-primary flex items-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>Save & Continue</span>
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Services Step */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <Server className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                Configure Services
              </h2>
            </div>

            <p className="text-neutral-600 dark:text-neutral-400">
              Select which services you want to enable in your AI orchestration platform.
            </p>

            <div className="space-y-4">
              <div className="card p-4 bg-neutral-50 dark:bg-neutral-900/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Chronicle</h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">AI conversation management</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="chronicle-enable"
                      className="rounded"
                      checked={services.chronicle}
                      onChange={(e) => setServices({ ...services, chronicle: e.target.checked })}
                    />
                    <label htmlFor="chronicle-enable" className="text-sm">Enable</label>
                  </div>
                </div>
              </div>

              <div className="card p-4 bg-neutral-50 dark:bg-neutral-900/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-neutral-900 dark:text-neutral-100">MCP Hub</h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">Model Context Protocol integration</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="mcp-enable"
                      className="rounded"
                      checked={services.mcp}
                      onChange={(e) => setServices({ ...services, mcp: e.target.checked })}
                    />
                    <label htmlFor="mcp-enable" className="text-sm">Enable</label>
                  </div>
                </div>
              </div>

              <div className="card p-4 bg-neutral-50 dark:bg-neutral-900/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Agent Zero</h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">Autonomous AI agent framework</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="agent-enable"
                      className="rounded"
                      checked={services.agentZero}
                      onChange={(e) => setServices({ ...services, agentZero: e.target.checked })}
                    />
                    <label htmlFor="agent-enable" className="text-sm">Enable</label>
                  </div>
                </div>
              </div>

              <div className="card p-4 bg-neutral-50 dark:bg-neutral-900/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-neutral-900 dark:text-neutral-100">n8n Workflows</h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">Workflow automation</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="n8n-enable"
                      className="rounded"
                      checked={services.n8n}
                      onChange={(e) => setServices({ ...services, n8n: e.target.checked })}
                    />
                    <label htmlFor="n8n-enable" className="text-sm">Enable</label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                onClick={() => setCurrentStep(0)}
                className="btn-ghost"
              >
                Back
              </button>
              <button
                onClick={() => markStepComplete(1)}
                className="btn-primary flex items-center space-x-2"
              >
                <span>Continue</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Database Step */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <Database className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                Database Setup
              </h2>
            </div>

            <p className="text-neutral-600 dark:text-neutral-400">
              Verify your database connections are working correctly.
            </p>

            <div className="space-y-4">
              <div className="card p-4 bg-neutral-50 dark:bg-neutral-900/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-success-100 dark:bg-success-900/30 rounded-lg flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400" />
                    </div>
                    <div>
                      <h3 className="font-medium text-neutral-900 dark:text-neutral-100">MongoDB</h3>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">mongodb://mongo:27017</p>
                    </div>
                  </div>
                  <span className="badge badge-success">Connected</span>
                </div>
              </div>

              <div className="card p-4 bg-neutral-50 dark:bg-neutral-900/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-success-100 dark:bg-success-900/30 rounded-lg flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400" />
                    </div>
                    <div>
                      <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Redis</h3>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">redis://redis:6379/0</p>
                    </div>
                  </div>
                  <span className="badge badge-success">Connected</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                onClick={() => setCurrentStep(1)}
                className="btn-ghost"
              >
                Back
              </button>
              <button
                onClick={() => markStepComplete(2)}
                className="btn-primary flex items-center space-x-2"
              >
                <span>Continue</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Complete Step */}
        {currentStep === 3 && (
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-success-100 dark:bg-success-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="h-12 w-12 text-success-600 dark:text-success-400" />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                Setup Complete!
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400">
                Your ushadow platform is now configured and ready to use.
              </p>
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                Next Steps:
              </h3>
              <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                <li className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-success-500 flex-shrink-0 mt-0.5" />
                  <span>Start conversations with Chronicle</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-success-500 flex-shrink-0 mt-0.5" />
                  <span>Explore MCP integrations in the MCP Hub</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-success-500 flex-shrink-0 mt-0.5" />
                  <span>Create automated workflows with n8n</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-success-500 flex-shrink-0 mt-0.5" />
                  <span>Deploy autonomous agents with Agent Zero</span>
                </li>
              </ul>
            </div>

            <div className="flex justify-between pt-4">
              <button
                onClick={() => setCurrentStep(2)}
                className="btn-ghost"
              >
                Back
              </button>
              <button
                onClick={completeWizard}
                disabled={loading}
                className="btn-primary flex items-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Completing...</span>
                  </>
                ) : (
                  <>
                    <span>Go to Dashboard</span>
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
