import { useState, useEffect } from 'react'
import { useForm, FormProvider, useFormContext } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import {
  Server,
  Loader2,
  Play,
  CheckCircle,
  XCircle,
  RefreshCw,
  Cpu,
  Mic,
  ExternalLink,
} from 'lucide-react'

import { settingsApi, dockerApi } from '../services/api'
import { useWizard } from '../contexts/WizardContext'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage } from '../components/wizard'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'

/**
 * LocalServicesWizard - Setup for completely local AI services.
 *
 * Step 1: Configure local LLM (Ollama container or custom URL)
 * Step 2: Configure local transcription (Parakeet container or Whisper URL)
 * Step 3: Start core services (OpenMemory + Chronicle)
 * Step 4: Complete
 */

// Step definitions
const STEPS: WizardStep[] = [
  { id: 'llm', label: 'LLM' },
  { id: 'transcription', label: 'Speech' },
  { id: 'start_services', label: 'Start' },
  { id: 'complete', label: 'Done' },
]

// Form schema
const schema = z.object({
  llm: z.object({
    mode: z.enum(['container', 'manual']),
    url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    model: z.string().optional(),
  }),
  transcription: z.object({
    mode: z.enum(['parakeet', 'whisper']),
    url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  }),
})

type FormData = z.infer<typeof schema>

// Container status
interface ContainerInfo {
  name: string
  displayName: string
  status: 'unknown' | 'stopped' | 'starting' | 'running' | 'error'
  error?: string
}

export default function LocalServicesWizard() {
  const navigate = useNavigate()
  const { markPhaseComplete, updateServiceStatus, setMode } = useWizard()
  const wizard = useWizardSteps(STEPS)

  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Container states
  const [ollamaStatus, setOllamaStatus] = useState<ContainerInfo>({
    name: 'ollama',
    displayName: 'Ollama',
    status: 'unknown',
  })

  const [parakeetStatus, setParakeetStatus] = useState<ContainerInfo>({
    name: 'parakeet',
    displayName: 'Parakeet',
    status: 'unknown',
  })

  const [coreContainers, setCoreContainers] = useState<ContainerInfo[]>([
    { name: 'openmemory', displayName: 'OpenMemory', status: 'unknown' },
    { name: 'chronicle-backend', displayName: 'Chronicle', status: 'unknown' },
  ])

  // Available Ollama models
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  const methods = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      llm: {
        mode: 'container',
        url: 'http://localhost:11434',
        model: '',
      },
      transcription: {
        mode: 'parakeet',
        url: '',
      },
    },
    mode: 'onChange',
  })

  // Set mode to 'local' when this wizard starts
  useEffect(() => {
    setMode('local')
    checkContainerStatuses()
  }, [])

  // Check container statuses when entering start_services step
  useEffect(() => {
    if (wizard.currentStep.id === 'start_services') {
      checkCoreContainerStatuses()
    }
  }, [wizard.currentStep.id])

  const checkContainerStatuses = async () => {
    try {
      const response = await dockerApi.listServices()
      const services = response.data

      // Check Ollama
      const ollamaService = services.find((s: any) => s.name.includes('ollama'))
      if (ollamaService) {
        setOllamaStatus((prev) => ({
          ...prev,
          status: ollamaService.status === 'running' ? 'running' : 'stopped',
        }))
        if (ollamaService.status === 'running') {
          fetchOllamaModels()
        }
      }

      // Check Parakeet
      const parakeetService = services.find((s: any) => s.name.includes('parakeet'))
      if (parakeetService) {
        setParakeetStatus((prev) => ({
          ...prev,
          status: parakeetService.status === 'running' ? 'running' : 'stopped',
        }))
      }
    } catch (error) {
      console.error('Failed to check container statuses:', error)
    }
  }

  const checkCoreContainerStatuses = async () => {
    try {
      const response = await dockerApi.listServices()
      const services = response.data

      setCoreContainers((prev) =>
        prev.map((container) => {
          const serviceInfo = services.find(
            (s: any) => s.name === container.name || s.name.includes(container.name)
          )
          if (serviceInfo) {
            return {
              ...container,
              status: serviceInfo.status === 'running' ? 'running' : 'stopped',
            }
          }
          return { ...container, status: 'stopped' }
        })
      )
    } catch (error) {
      console.error('Failed to check core container statuses:', error)
    }
  }

  const fetchOllamaModels = async () => {
    setLoadingModels(true)
    try {
      // Try to fetch models from Ollama API
      const url = methods.getValues('llm.url') || 'http://localhost:11434'
      const response = await fetch(`${url}/api/tags`)
      const data = await response.json()
      if (data.models) {
        setAvailableModels(data.models.map((m: any) => m.name))
      }
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error)
      // Set some common models as fallback
      setAvailableModels(['llama3.2', 'llama3.1', 'mistral', 'phi3', 'gemma2'])
    } finally {
      setLoadingModels(false)
    }
  }

  const startContainer = async (
    containerName: string,
    setStatus: React.Dispatch<React.SetStateAction<ContainerInfo>>
  ) => {
    setStatus((prev) => ({ ...prev, status: 'starting' }))

    try {
      await dockerApi.startService(containerName)

      // Poll for status
      let attempts = 0
      const maxAttempts = 15

      const pollStatus = async () => {
        attempts++
        try {
          const response = await dockerApi.getServiceInfo(containerName)
          const isRunning = response.data.status === 'running'

          if (isRunning) {
            setStatus((prev) => ({ ...prev, status: 'running' }))

            // If Ollama, fetch models
            if (containerName === 'ollama') {
              setTimeout(fetchOllamaModels, 2000)
            }

            setMessage({ type: 'success', text: `${containerName} started successfully!` })
            return
          }

          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 2000)
          } else {
            setStatus((prev) => ({
              ...prev,
              status: 'error',
              error: 'Timeout waiting for container to start',
            }))
          }
        } catch (err) {
          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 2000)
          }
        }
      }

      setTimeout(pollStatus, 2000)
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        status: 'error',
        error: getErrorMessage(error, 'Failed to start'),
      }))
      setMessage({ type: 'error', text: getErrorMessage(error, `Failed to start ${containerName}`) })
    }
  }

  const startCoreContainer = async (containerName: string) => {
    setCoreContainers((prev) =>
      prev.map((c) => (c.name === containerName ? { ...c, status: 'starting' } : c))
    )

    try {
      await dockerApi.startService(containerName)

      let attempts = 0
      const maxAttempts = 10

      const pollStatus = async () => {
        attempts++
        try {
          const response = await dockerApi.getServiceInfo(containerName)
          const isRunning = response.data.status === 'running'

          if (isRunning) {
            setCoreContainers((prev) =>
              prev.map((c) => (c.name === containerName ? { ...c, status: 'running' } : c))
            )

            if (containerName === 'openmemory') {
              updateServiceStatus('openMemory', { configured: true, running: true })
            } else if (containerName === 'chronicle-backend') {
              updateServiceStatus('chronicle', { configured: true, running: true })
            }

            setMessage({ type: 'success', text: `${containerName} started successfully!` })
            return
          }

          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 2000)
          } else {
            setCoreContainers((prev) =>
              prev.map((c) =>
                c.name === containerName
                  ? { ...c, status: 'error', error: 'Timeout waiting for container' }
                  : c
              )
            )
          }
        } catch (err) {
          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 2000)
          }
        }
      }

      setTimeout(pollStatus, 2000)
    } catch (error) {
      setCoreContainers((prev) =>
        prev.map((c) =>
          c.name === containerName
            ? { ...c, status: 'error', error: getErrorMessage(error, 'Failed to start') }
            : c
        )
      )
    }
  }

  const saveConfiguration = async (): Promise<boolean> => {
    setIsSubmitting(true)
    setMessage({ type: 'info', text: 'Saving local service configuration...' })

    try {
      const data = methods.getValues()

      const updates: Record<string, any> = {
        service_preferences: {
          llm: {
            provider: 'local',
            url: data.llm.mode === 'container' ? 'http://localhost:11434' : data.llm.url,
            model: data.llm.model || 'llama3.2',
          },
          transcription: {
            provider: 'local',
            url:
              data.transcription.mode === 'parakeet'
                ? 'http://localhost:9000'
                : data.transcription.url,
            type: data.transcription.mode,
          },
        },
      }

      await settingsApi.update(updates)
      updateServiceStatus('apiKeys', true) // Mark as configured (using local instead)
      setMessage({ type: 'success', text: 'Configuration saved!' })
      return true
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save configuration') })
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const allCoreContainersRunning = coreContainers.every((c) => c.status === 'running')

  // Navigation
  const handleNext = async () => {
    setMessage(null)

    if (wizard.currentStep.id === 'llm') {
      const data = methods.getValues()
      if (data.llm.mode === 'container' && ollamaStatus.status !== 'running') {
        setMessage({ type: 'error', text: 'Please start Ollama or switch to manual configuration' })
        return
      }
      if (data.llm.mode === 'manual' && !data.llm.url) {
        setMessage({ type: 'error', text: 'Please enter the Ollama URL' })
        return
      }
      wizard.next()
    } else if (wizard.currentStep.id === 'transcription') {
      const data = methods.getValues()
      if (data.transcription.mode === 'parakeet' && parakeetStatus.status !== 'running') {
        setMessage({
          type: 'error',
          text: 'Please start Parakeet or switch to Whisper URL configuration',
        })
        return
      }
      if (data.transcription.mode === 'whisper' && !data.transcription.url) {
        setMessage({ type: 'error', text: 'Please enter the Whisper API URL' })
        return
      }

      // Save configuration before proceeding
      const saved = await saveConfiguration()
      if (!saved) return

      wizard.next()
    } else if (wizard.currentStep.id === 'start_services') {
      if (!allCoreContainersRunning) {
        setMessage({ type: 'error', text: 'Please start all services before continuing' })
        return
      }

      markPhaseComplete('quickstart')
      wizard.next()
    } else if (wizard.currentStep.id === 'complete') {
      navigate('/')
    }
  }

  const handleBack = () => {
    setMessage(null)
    wizard.back()
  }

  return (
    <WizardShell
      wizardId="local-services"
      title="Local Services Setup"
      subtitle="Configure completely local AI services"
      icon={Server}
      progress={wizard.progress}
      steps={STEPS}
      currentStepId={wizard.currentStep.id}
      isFirstStep={wizard.isFirst}
      onBack={handleBack}
      onNext={handleNext}
      nextLoading={isSubmitting}
      message={message}
    >
      <FormProvider {...methods}>
        {/* Step 1: LLM Configuration */}
        {wizard.currentStep.id === 'llm' && (
          <LLMStep
            ollamaStatus={ollamaStatus}
            availableModels={availableModels}
            loadingModels={loadingModels}
            onStartOllama={() => startContainer('ollama', setOllamaStatus)}
            onRefreshModels={fetchOllamaModels}
          />
        )}

        {/* Step 2: Transcription Configuration */}
        {wizard.currentStep.id === 'transcription' && (
          <TranscriptionStep
            parakeetStatus={parakeetStatus}
            onStartParakeet={() => startContainer('parakeet', setParakeetStatus)}
          />
        )}

        {/* Step 3: Start Core Services */}
        {wizard.currentStep.id === 'start_services' && (
          <StartServicesStep
            containers={coreContainers}
            onStart={startCoreContainer}
            onRefresh={checkCoreContainerStatuses}
          />
        )}

        {/* Step 4: Complete */}
        {wizard.currentStep.id === 'complete' && <CompleteStep />}
      </FormProvider>
    </WizardShell>
  )
}

// Step 1: LLM Configuration
interface LLMStepProps {
  ollamaStatus: ContainerInfo
  availableModels: string[]
  loadingModels: boolean
  onStartOllama: () => void
  onRefreshModels: () => void
}

function LLMStep({
  ollamaStatus,
  availableModels,
  loadingModels,
  onStartOllama,
  onRefreshModels,
}: LLMStepProps) {
  const { register, watch, setValue } = useFormContext<FormData>()
  const mode = watch('llm.mode')

  return (
    <div id="local-services-step-llm" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Configure Local LLM
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Choose how to connect to your local LLM. Ollama is recommended for easy setup.
        </p>
      </div>

      {/* Mode Selection */}
      <div className="grid md:grid-cols-2 gap-4">
        <button
          type="button"
          id="local-services-llm-container"
          onClick={() => setValue('llm.mode', 'container')}
          className={`p-4 rounded-lg border-2 text-left transition-all ${
            mode === 'container'
              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <Cpu className={`w-5 h-5 ${mode === 'container' ? 'text-primary-600' : 'text-gray-500'}`} />
            <span className="font-medium text-gray-900 dark:text-white">Ollama Container</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Spin up Ollama in Docker (recommended)
          </p>
        </button>

        <button
          type="button"
          id="local-services-llm-manual"
          onClick={() => setValue('llm.mode', 'manual')}
          className={`p-4 rounded-lg border-2 text-left transition-all ${
            mode === 'manual'
              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <ExternalLink className={`w-5 h-5 ${mode === 'manual' ? 'text-primary-600' : 'text-gray-500'}`} />
            <span className="font-medium text-gray-900 dark:text-white">Manual URL</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Connect to an existing Ollama instance
          </p>
        </button>
      </div>

      {/* Container Mode */}
      {mode === 'container' && (
        <div className="space-y-4">
          <ContainerStatusCard
            container={ollamaStatus}
            onStart={onStartOllama}
            description="Ollama provides local LLM inference"
          />

          {ollamaStatus.status === 'running' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select Model
                </label>
                <button
                  type="button"
                  onClick={onRefreshModels}
                  disabled={loadingModels}
                  className="text-xs text-primary-600 hover:underline flex items-center gap-1"
                >
                  {loadingModels ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Refresh
                </button>
              </div>
              <select
                id="local-services-llm-model"
                {...register('llm.model')}
                className="input"
              >
                <option value="">Select a model...</option>
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500">
                Don&apos;t see your model? Pull it with: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">ollama pull model-name</code>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Manual Mode */}
      {mode === 'manual' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Ollama URL
            </label>
            <input
              id="local-services-llm-url"
              type="text"
              {...register('llm.url')}
              placeholder="http://localhost:11434"
              className="input"
            />
            <p className="text-xs text-gray-500 mt-1">
              The URL where Ollama is running
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Model Name
            </label>
            <input
              id="local-services-llm-model-manual"
              type="text"
              {...register('llm.model')}
              placeholder="llama3.2"
              className="input"
            />
            <p className="text-xs text-gray-500 mt-1">
              The model to use for inference
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// Step 2: Transcription Configuration
interface TranscriptionStepProps {
  parakeetStatus: ContainerInfo
  onStartParakeet: () => void
}

function TranscriptionStep({ parakeetStatus, onStartParakeet }: TranscriptionStepProps) {
  const { register, watch, setValue } = useFormContext<FormData>()
  const mode = watch('transcription.mode')

  return (
    <div id="local-services-step-transcription" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Configure Transcription
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Choose your speech-to-text provider for converting conversations.
        </p>
      </div>

      {/* Mode Selection */}
      <div className="grid md:grid-cols-2 gap-4">
        <button
          type="button"
          id="local-services-transcription-parakeet"
          onClick={() => setValue('transcription.mode', 'parakeet')}
          className={`p-4 rounded-lg border-2 text-left transition-all ${
            mode === 'parakeet'
              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <Mic className={`w-5 h-5 ${mode === 'parakeet' ? 'text-primary-600' : 'text-gray-500'}`} />
            <span className="font-medium text-gray-900 dark:text-white">Parakeet</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Fast local transcription (recommended)
          </p>
        </button>

        <button
          type="button"
          id="local-services-transcription-whisper"
          onClick={() => setValue('transcription.mode', 'whisper')}
          className={`p-4 rounded-lg border-2 text-left transition-all ${
            mode === 'whisper'
              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <ExternalLink className={`w-5 h-5 ${mode === 'whisper' ? 'text-primary-600' : 'text-gray-500'}`} />
            <span className="font-medium text-gray-900 dark:text-white">Whisper URL</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Connect to existing Whisper API
          </p>
        </button>
      </div>

      {/* Parakeet Mode */}
      {mode === 'parakeet' && (
        <ContainerStatusCard
          container={parakeetStatus}
          onStart={onStartParakeet}
          description="Parakeet provides fast, accurate local transcription"
        />
      )}

      {/* Whisper Mode */}
      {mode === 'whisper' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Whisper API URL
          </label>
          <input
            id="local-services-transcription-url"
            type="text"
            {...register('transcription.url')}
            placeholder="http://localhost:9000/v1/audio/transcriptions"
            className="input"
          />
          <p className="text-xs text-gray-500 mt-1">
            OpenAI-compatible Whisper endpoint (e.g., faster-whisper-server)
          </p>
        </div>
      )}
    </div>
  )
}

// Step 3: Start Core Services (reused from QuickstartWizard pattern)
interface StartServicesStepProps {
  containers: ContainerInfo[]
  onStart: (name: string) => void
  onRefresh: () => void
}

function StartServicesStep({ containers, onStart, onRefresh }: StartServicesStepProps) {
  return (
    <div id="local-services-step-start-services" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Start Core Services
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Start the OpenMemory and Chronicle containers to enable the web client.
          </p>
        </div>
        <button
          id="local-services-refresh-status"
          onClick={onRefresh}
          className="btn-ghost p-2 rounded-lg"
          title="Refresh status"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {containers.map((container) => (
          <ServiceCard
            key={container.name}
            container={container}
            onStart={() => onStart(container.name)}
          />
        ))}
      </div>

      {containers.every((c) => c.status === 'running') && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p className="text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            All services are running! Click next to continue.
          </p>
        </div>
      )}
    </div>
  )
}

// Step 4: Complete
function CompleteStep() {
  return (
    <div id="local-services-step-complete" className="text-center space-y-6">
      <CheckCircle className="w-16 h-16 text-green-600 dark:text-green-400 mx-auto" />
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          Level 1 Complete!
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Your local AI services are configured. Everything runs on your machine - no cloud required.
        </p>
      </div>

      <div className="p-6 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-200 dark:border-primary-800">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Running Locally</h3>
        <ul className="text-left text-sm text-gray-700 dark:text-gray-300 space-y-2">
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            LLM inference via Ollama
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            Transcription via local service
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            OpenMemory for storing memories
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            Chronicle for recording conversations
          </li>
        </ul>
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Next:</strong> Add mobile access with Tailscale (Level 2)
        </p>
      </div>
    </div>
  )
}

// Reusable container status card
function ContainerStatusCard({
  container,
  onStart,
  description,
}: {
  container: ContainerInfo
  onStart: () => void
  description: string
}) {
  const getStatusColor = () => {
    switch (container.status) {
      case 'running':
        return 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700'
      case 'starting':
        return 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700'
      case 'error':
        return 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700'
      default:
        return 'bg-gray-100 dark:bg-gray-700/30 border-gray-300 dark:border-gray-600'
    }
  }

  const getStatusIcon = () => {
    switch (container.status) {
      case 'running':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
      case 'starting':
        return <Loader2 className="w-5 h-5 text-yellow-600 dark:text-yellow-400 animate-spin" />
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-gray-400" />
    }
  }

  return (
    <div className={`p-4 rounded-lg border-2 ${getStatusColor()} transition-colors`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">{container.displayName}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {container.status === 'starting' ? 'Starting...' : description}
            </p>
          </div>
        </div>

        {container.status !== 'running' && container.status !== 'starting' && (
          <button onClick={onStart} className="btn-primary flex items-center gap-2">
            <Play className="w-4 h-4" />
            Start
          </button>
        )}
      </div>

      {container.error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{container.error}</p>
      )}
    </div>
  )
}

// Reusable service card (same as QuickstartWizard)
function ServiceCard({
  container,
  onStart,
}: {
  container: ContainerInfo
  onStart: () => void
}) {
  const getStatusColor = () => {
    switch (container.status) {
      case 'running':
        return 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700'
      case 'starting':
        return 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700'
      case 'error':
        return 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700'
      default:
        return 'bg-gray-100 dark:bg-gray-700/30 border-gray-300 dark:border-gray-600'
    }
  }

  const getStatusIcon = () => {
    switch (container.status) {
      case 'running':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
      case 'starting':
        return <Loader2 className="w-5 h-5 text-yellow-600 dark:text-yellow-400 animate-spin" />
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-gray-400" />
    }
  }

  return (
    <div
      id={`local-services-service-${container.name}`}
      className={`p-4 rounded-lg border-2 ${getStatusColor()} transition-colors`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">{container.displayName}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
              {container.status === 'starting' ? 'Starting...' : container.status}
            </p>
          </div>
        </div>

        {container.status !== 'running' && container.status !== 'starting' && (
          <button
            id={`local-services-start-${container.name}`}
            onClick={onStart}
            className="btn-primary flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Start
          </button>
        )}
      </div>

      {container.error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{container.error}</p>
      )}
    </div>
  )
}
