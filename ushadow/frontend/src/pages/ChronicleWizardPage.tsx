import { MessageSquare, CheckCircle, AlertCircle, Loader2, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { wizardApi } from '../services/api'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardProgress } from '../components/wizard'

type LLMProvider = 'openai' | 'anthropic' | null
type TranscriptionProvider = 'deepgram' | 'mistral' | null

const STEPS = [
  { id: 'llm', label: 'LLM Setup' },
  { id: 'transcription', label: 'Transcription' },
  { id: 'complete', label: 'Complete' },
] as const

export default function ChronicleWizardPage() {
  const navigate = useNavigate()
  const wizard = useWizardSteps(STEPS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Track which steps are completed (saved)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())

  // Provider selections
  const [llmProvider, setLlmProvider] = useState<LLMProvider>(null)
  const [transcriptionProvider, setTranscriptionProvider] = useState<TranscriptionProvider>(null)

  // API Keys
  const [llmApiKey, setLlmApiKey] = useState('')
  const [transcriptionApiKey, setTranscriptionApiKey] = useState('')

  // Load existing configuration on mount
  useEffect(() => {
    loadExistingConfig()
  }, [])

  const loadExistingConfig = async () => {
    try {
      const response = await wizardApi.getApiKeys()
      const keys = response.data

      // Detect which providers are already configured
      if (keys.openai_api_key && !keys.openai_api_key.startsWith('***')) {
        setLlmProvider('openai')
        setLlmApiKey(keys.openai_api_key)
      } else if (keys.anthropic_api_key && !keys.anthropic_api_key.startsWith('***')) {
        setLlmProvider('anthropic')
        setLlmApiKey(keys.anthropic_api_key)
      }

      if (keys.deepgram_api_key && !keys.deepgram_api_key.startsWith('***')) {
        setTranscriptionProvider('deepgram')
        setTranscriptionApiKey(keys.deepgram_api_key)
      } else if (keys.mistral_api_key && !keys.mistral_api_key.startsWith('***')) {
        setTranscriptionProvider('mistral')
        setTranscriptionApiKey(keys.mistral_api_key)
      }
    } catch (err) {
      console.error('Failed to load existing config:', err)
    }
  }

  const markStepComplete = (stepId: string) => {
    setCompletedSteps((prev) => new Set([...prev, stepId]))
    wizard.next()
  }

  const saveLlmConfig = async () => {
    if (!llmProvider || !llmApiKey) {
      setError('Please select a provider and enter an API key')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const payload: Record<string, string> = {}
      if (llmProvider === 'openai') {
        payload.openai_api_key = llmApiKey
      } else if (llmProvider === 'anthropic') {
        payload.anthropic_api_key = llmApiKey
      }

      const response = await wizardApi.updateApiKeys(payload)

      if (response.data.success) {
        setSuccess('LLM configuration saved!')
        markStepComplete('llm')
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : undefined
      setError(errorMessage || 'Failed to save configuration')
    } finally {
      setLoading(false)
    }
  }

  const saveTranscriptionConfig = async () => {
    if (!transcriptionProvider || !transcriptionApiKey) {
      setError('Please select a provider and enter an API key')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const payload: Record<string, string> = {}
      if (transcriptionProvider === 'deepgram') {
        payload.deepgram_api_key = transcriptionApiKey
      } else if (transcriptionProvider === 'mistral') {
        payload.mistral_api_key = transcriptionApiKey
      }

      const response = await wizardApi.updateApiKeys(payload)

      if (response.data.success) {
        setSuccess('Transcription configuration saved!')
        markStepComplete('transcription')
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : undefined
      setError(errorMessage || 'Failed to save configuration')
    } finally {
      setLoading(false)
    }
  }

  const completeWizard = async () => {
    setLoading(true)
    try {
      await wizardApi.complete()
      setSuccess('Chronicle setup complete! Redirecting...')

      setTimeout(() => {
        navigate('/chronicle')
      }, 1500)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : undefined
      setError(errorMessage || 'Failed to complete wizard')
    } finally {
      setLoading(false)
    }
  }

  // Determine if current step can advance (has required data)
  const canAdvance = (): boolean => {
    switch (wizard.currentStep.id) {
      case 'llm':
        return !!llmProvider && !!llmApiKey
      case 'transcription':
        return !!transcriptionProvider && !!transcriptionApiKey
      case 'complete':
        return true
      default:
        return false
    }
  }

  // Handle next action based on current step
  const handleNext = () => {
    switch (wizard.currentStep.id) {
      case 'llm':
        saveLlmConfig()
        break
      case 'transcription':
        saveTranscriptionConfig()
        break
      case 'complete':
        completeWizard()
        break
    }
  }

  return (
    <div id="chronicle-wizard-page" className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2">
          <MessageSquare className="h-8 w-8 text-primary-600 dark:text-primary-400" />
          <h1 id="chronicle-wizard-title" className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            Chronicle Setup
          </h1>
        </div>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Configure Chronicle's AI and transcription services
        </p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div id="chronicle-wizard-error" className="card p-4 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800">
          <div className="flex items-center space-x-2 text-error-700 dark:text-error-300">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div id="chronicle-wizard-success" className="card p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800">
          <div className="flex items-center space-x-2 text-success-700 dark:text-success-300">
            <CheckCircle className="h-5 w-5" />
            <span>{success}</span>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="card p-6">
        <WizardProgress
          progress={wizard.progress}
          steps={wizard.steps}
          currentStepId={wizard.currentStep.id}
          completedSteps={completedSteps}
          onStepClick={(stepId) => wizard.goTo(stepId)}
        />
      </div>

      {/* Step Content with Side Arrows */}
      <div className="relative flex items-center justify-center">
        {/* Back Arrow - Left Side */}
        <button
          id="chronicle-wizard-back-arrow"
          onClick={() => wizard.isFirst ? navigate('/wizard/start') : wizard.back()}
          className="absolute left-0 -translate-x-16 w-12 h-12 rounded-full bg-primary-600 hover:bg-primary-700 shadow-lg flex items-center justify-center transition-colors"
          aria-label={wizard.isFirst ? "Back to Setup Wizard" : "Previous step"}
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>

        {/* Step Card */}
        <div className="card p-6 w-full overflow-hidden">
          {/* Step 0: LLM Setup */}
          {wizard.currentStep.id === 'llm' && (
            <div id="chronicle-step-llm" className="space-y-6">
              <div className="flex items-center space-x-3">
                <Sparkles className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                  Configure Your LLM Provider
                </h2>
              </div>

              <p className="text-neutral-600 dark:text-neutral-400">
                Select your AI language model provider and enter the API key.
              </p>

              <div className="space-y-3">
                {/* OpenAI Option */}
                <div
                  id="chronicle-llm-openai-option"
                  className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    llmProvider === 'openai'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700'
                  }`}
                  onClick={() => {
                    setLlmProvider('openai')
                    setError(null)
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">OpenAI</h3>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">GPT-4, GPT-3.5, and more</p>
                    </div>
                    {llmProvider === 'openai' && (
                      <CheckCircle className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                    )}
                  </div>

                  {/* Show API key field if selected */}
                  {llmProvider === 'openai' && (
                    <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                        OpenAI API Key
                      </label>
                      <input
                        id="chronicle-openai-api-key-input"
                        type="password"
                        className="input"
                        placeholder="sk-..."
                        value={llmApiKey}
                        onChange={(e) => setLlmApiKey(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Get your API key from{' '}
                        <a
                          href="https://platform.openai.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline"
                        >
                          platform.openai.com
                        </a>
                      </p>
                    </div>
                  )}
                </div>

                {/* Anthropic Option */}
                <div
                  id="chronicle-llm-anthropic-option"
                  className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    llmProvider === 'anthropic'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700'
                  }`}
                  onClick={() => {
                    setLlmProvider('anthropic')
                    setError(null)
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Anthropic</h3>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">Claude 3.5 Sonnet and family</p>
                    </div>
                    {llmProvider === 'anthropic' && (
                      <CheckCircle className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                    )}
                  </div>

                  {/* Show API key field if selected */}
                  {llmProvider === 'anthropic' && (
                    <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                        Anthropic API Key
                      </label>
                      <input
                        id="chronicle-anthropic-api-key-input"
                        type="password"
                        className="input"
                        placeholder="sk-ant-..."
                        value={llmApiKey}
                        onChange={(e) => setLlmApiKey(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Get your API key from{' '}
                        <a
                          href="https://console.anthropic.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline"
                        >
                          console.anthropic.com
                        </a>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Transcription Setup */}
          {wizard.currentStep.id === 'transcription' && (
            <div id="chronicle-step-transcription" className="space-y-6">
              <div className="flex items-center space-x-3">
                <Sparkles className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                  Configure Transcription Service
                </h2>
              </div>

              <p className="text-neutral-600 dark:text-neutral-400">
                Select your transcription provider and enter the API key.
              </p>

              <div className="space-y-3">
                {/* Deepgram Option */}
                <div
                  id="chronicle-transcription-deepgram-option"
                  className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    transcriptionProvider === 'deepgram'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700'
                  }`}
                  onClick={() => {
                    setTranscriptionProvider('deepgram')
                    setError(null)
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Deepgram</h3>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">High-accuracy speech recognition</p>
                    </div>
                    {transcriptionProvider === 'deepgram' && (
                      <CheckCircle className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                    )}
                  </div>

                  {/* Show API key field if selected */}
                  {transcriptionProvider === 'deepgram' && (
                    <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                        Deepgram API Key
                      </label>
                      <input
                        id="chronicle-deepgram-api-key-input"
                        type="password"
                        className="input"
                        placeholder="Enter Deepgram API key..."
                        value={transcriptionApiKey}
                        onChange={(e) => setTranscriptionApiKey(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Get your API key from the Deepgram dashboard
                      </p>
                    </div>
                  )}
                </div>

                {/* Mistral Option */}
                <div
                  id="chronicle-transcription-mistral-option"
                  className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    transcriptionProvider === 'mistral'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700'
                  }`}
                  onClick={() => {
                    setTranscriptionProvider('mistral')
                    setError(null)
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Mistral</h3>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">Alternative transcription service</p>
                    </div>
                    {transcriptionProvider === 'mistral' && (
                      <CheckCircle className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                    )}
                  </div>

                  {/* Show API key field if selected */}
                  {transcriptionProvider === 'mistral' && (
                    <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                        Mistral API Key
                      </label>
                      <input
                        id="chronicle-mistral-api-key-input"
                        type="password"
                        className="input"
                        placeholder="Enter Mistral API key..."
                        value={transcriptionApiKey}
                        onChange={(e) => setTranscriptionApiKey(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Get your API key from the Mistral dashboard
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Complete */}
          {wizard.currentStep.id === 'complete' && (
            <div id="chronicle-step-complete" className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-success-100 dark:bg-success-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-12 w-12 text-success-600 dark:text-success-400" />
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  Chronicle is Ready!
                </h2>
                <p className="text-neutral-600 dark:text-neutral-400">
                  Your AI conversation platform is configured and ready to use.
                </p>
              </div>

              <div id="chronicle-config-summary" className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-6 text-left">
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                  Configuration Summary:
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-600 dark:text-neutral-400">LLM Provider:</span>
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-600 dark:text-neutral-400">Transcription:</span>
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {transcriptionProvider === 'deepgram' ? 'Deepgram' : 'Mistral'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Next Arrow - Right Side */}
        <button
          id="chronicle-wizard-next-arrow"
          onClick={handleNext}
          disabled={loading || !canAdvance()}
          className={`absolute right-0 translate-x-16 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors ${
            loading || !canAdvance()
              ? 'bg-neutral-200 dark:bg-neutral-700 cursor-not-allowed'
              : 'bg-primary-600 hover:bg-primary-700 text-white'
          }`}
          aria-label={wizard.isLast ? 'Complete setup' : 'Next step'}
        >
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <ChevronRight className="w-6 h-6" />
          )}
        </button>
      </div>
    </div>
  )
}
