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

import { api, settingsApi, deploymentsApi, DeployTarget, Deployment } from '../services/api'
import { useWizard } from '../contexts/WizardContext'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage } from '../components/wizard'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'
import { StatusBadge } from '../components/StatusBadge'

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
    mode: z.enum(['parakeet', 'faster-whisper', 'whisper']),
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
  const [deployTarget, setDeployTarget] = useState<DeployTarget | null>(null)

  // Container states — names must match the service name in the compose file
  const [ollamaStatus, setOllamaStatus] = useState<ContainerInfo>({
    name: 'ollama',
    displayName: 'Ollama',
    status: 'unknown',
  })

  const [parakeetStatus, setParakeetStatus] = useState<ContainerInfo>({
    name: 'parakeet-asr',
    displayName: 'Parakeet',
    status: 'unknown',
  })

  const [fasterWhisperStatus, setFasterWhisperStatus] = useState<ContainerInfo>({
    name: 'faster-whisper',
    displayName: 'Faster Whisper',
    status: 'unknown',
  })

  const [coreContainers, setCoreContainers] = useState<ContainerInfo[]>([
    { name: 'mem0', displayName: 'OpenMemory', status: 'unknown' },
    { name: 'chronicle-backend', displayName: 'Chronicle', status: 'unknown' },
  ])

  // Available Ollama models
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [pullModelName, setPullModelName] = useState('llama3.2')
  const [pullingModel, setPullingModel] = useState(false)

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
    loadDeployTarget()
  }, [])

  const loadDeployTarget = async () => {
    try {
      const response = await deploymentsApi.listTargets()
      const leader = response.data.find((t: DeployTarget) => t.type === 'docker' && t.is_leader)
      if (leader) {
        setDeployTarget(leader)
        checkContainerStatuses(leader)
      }
    } catch (error) {
      console.error('Failed to load deployment targets:', error)
    }
  }

  // Check container statuses when entering start_services step
  useEffect(() => {
    if (wizard.currentStep.id === 'start_services' && deployTarget) {
      checkCoreContainerStatuses(deployTarget)
    }
  }, [wizard.currentStep.id, deployTarget])

  const checkContainerStatuses = async (target: DeployTarget) => {
    try {
      const response = await deploymentsApi.listDeployments({ unode_hostname: target.identifier })
      const deployments: Deployment[] = response.data

      const findStatus = (name: string) => {
        const d = deployments.find((dep) => dep.service_id.includes(name))
        return d?.status === 'running' ? 'running' : d ? 'stopped' : 'stopped'
      }

      const ollamaRunning = findStatus('ollama') === 'running'
      setOllamaStatus((prev) => ({ ...prev, status: findStatus('ollama') as ContainerInfo['status'] }))
      setParakeetStatus((prev) => ({ ...prev, status: findStatus('parakeet-asr') as ContainerInfo['status'] }))
      setFasterWhisperStatus((prev) => ({ ...prev, status: findStatus('faster-whisper') as ContainerInfo['status'] }))

      if (ollamaRunning) fetchOllamaModels()
    } catch (error) {
      console.error('Failed to check container statuses:', error)
    }
  }

  const checkCoreContainerStatuses = async (target: DeployTarget) => {
    try {
      const response = await deploymentsApi.listDeployments({ unode_hostname: target.identifier })
      const deployments: Deployment[] = response.data

      setCoreContainers((prev) =>
        prev.map((container) => {
          const deployment = deployments.find((d) => d.service_id.includes(container.name))
          return {
            ...container,
            status: deployment?.status === 'running' ? 'running' : 'stopped',
          }
        })
      )
    } catch (error) {
      console.error('Failed to check core container statuses:', error)
    }
  }

  const pullOllamaModel = async (modelName: string) => {
    if (!modelName.trim()) return
    setPullingModel(true)
    setMessage({ type: 'success', text: `Pulling ${modelName}... this may take a few minutes.` })
    try {
      await api.post('/api/services/ollama/proxy/api/pull', { name: modelName.trim(), stream: false })
      setMessage({ type: 'success', text: `Model ${modelName} pulled successfully!` })
      await fetchOllamaModels()
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to pull ${modelName}. Is Ollama running?` })
    } finally {
      setPullingModel(false)
    }
  }

  const fetchOllamaModels = async () => {
    setLoadingModels(true)
    try {
      // Proxy through backend to avoid CORS and use Docker network routing
      const response = await api.get('/api/services/ollama/proxy/api/tags')
      const models: string[] = (response.data?.models ?? []).map((m: any) => m.name)
      setAvailableModels(models)
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error)
      setAvailableModels([])
    } finally {
      setLoadingModels(false)
    }
  }

  const startContainer = async (
    containerName: string,
    setStatus: React.Dispatch<React.SetStateAction<ContainerInfo>>
  ) => {
    if (!deployTarget) {
      setMessage({ type: 'error', text: 'No deployment target available' })
      return
    }
    setStatus((prev) => ({ ...prev, status: 'starting' }))

    try {
      await deploymentsApi.deploy(containerName, deployTarget.identifier)

      let attempts = 0
      const maxAttempts = 60

      const pollStatus = async () => {
        attempts++
        try {
          const response = await deploymentsApi.listDeployments({ unode_hostname: deployTarget.identifier })
          const deployment = response.data.find((d: Deployment) => d.service_id.includes(containerName))

          if (deployment?.status === 'running') {
            setStatus((prev) => ({ ...prev, status: 'running' }))
            if (containerName === 'ollama') setTimeout(fetchOllamaModels, 2000)
            setMessage({ type: 'success', text: `${containerName} started successfully!` })
            return
          }

          if (deployment?.status === 'failed') {
            setStatus((prev) => ({ ...prev, status: 'error', error: 'Deployment failed' }))
            setMessage({ type: 'error', text: `Failed to start ${containerName}` })
            return
          }

          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 2000)
          } else {
            setStatus((prev) => ({ ...prev, status: 'error', error: 'Timeout waiting for container to start' }))
          }
        } catch (err) {
          if (attempts < maxAttempts) setTimeout(pollStatus, 2000)
        }
      }

      setTimeout(pollStatus, 2000)
    } catch (error) {
      setStatus((prev) => ({ ...prev, status: 'error', error: getErrorMessage(error, 'Failed to start') }))
      setMessage({ type: 'error', text: getErrorMessage(error, `Failed to start ${containerName}`) })
    }
  }

  const startCoreContainer = async (containerName: string) => {
    if (!deployTarget) {
      setMessage({ type: 'error', text: 'No deployment target available' })
      return
    }
    setCoreContainers((prev) =>
      prev.map((c) => (c.name === containerName ? { ...c, status: 'starting' } : c))
    )

    try {
      await deploymentsApi.deploy(containerName, deployTarget.identifier)

      let attempts = 0
      const maxAttempts = 60

      const pollStatus = async () => {
        attempts++
        try {
          const response = await deploymentsApi.listDeployments({ unode_hostname: deployTarget.identifier })
          const deployment = response.data.find((d: Deployment) => d.service_id.includes(containerName))

          if (deployment?.status === 'running') {
            setCoreContainers((prev) =>
              prev.map((c) => (c.name === containerName ? { ...c, status: 'running' } : c))
            )
            if (containerName === 'mem0') {
              updateServiceStatus('openMemory', { configured: true, running: true })
            } else if (containerName === 'chronicle-backend') {
              updateServiceStatus('chronicle', { configured: true, running: true })
            }
            setMessage({ type: 'success', text: `${containerName} started successfully!` })
            return
          }

          if (deployment?.status === 'failed') {
            setCoreContainers((prev) =>
              prev.map((c) => (c.name === containerName ? { ...c, status: 'error', error: 'Deployment failed' } : c))
            )
            return
          }

          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 2000)
          } else {
            setCoreContainers((prev) =>
              prev.map((c) =>
                c.name === containerName ? { ...c, status: 'error', error: 'Timeout waiting for container' } : c
              )
            )
          }
        } catch (err) {
          if (attempts < maxAttempts) setTimeout(pollStatus, 2000)
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

  const saveLlmConfig = async (): Promise<boolean> => {
    setIsSubmitting(true)
    try {
      const data = methods.getValues()
      await settingsApi.update({
        'service_preferences.llm': {
          provider: 'local',
          url: data.llm.mode === 'container' ? 'http://localhost:11434' : data.llm.url,
          model: data.llm.model || 'llama3.2',
        },
      })
      setMessage({ type: 'success', text: 'LLM configuration saved.' })
      return true
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save LLM configuration') })
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveTranscriptionConfig = async (): Promise<boolean> => {
    setIsSubmitting(true)
    try {
      const data = methods.getValues()
      const url =
        data.transcription.mode === 'parakeet'
          ? 'http://localhost:9000'
          : data.transcription.mode === 'faster-whisper'
            ? 'http://localhost:10300'
            : data.transcription.url
      await settingsApi.update({
        'service_preferences.transcription': {
          provider: 'local',
          url,
          type: data.transcription.mode,
        },
      })
      updateServiceStatus('apiKeys', true)
      setMessage({ type: 'success', text: 'Transcription configuration saved.' })
      return true
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save transcription configuration') })
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
      const saved = await saveLlmConfig()
      if (!saved) return
      wizard.next()
    } else if (wizard.currentStep.id === 'transcription') {
      const data = methods.getValues()
      if (data.transcription.mode === 'parakeet' && parakeetStatus.status !== 'running') {
        setMessage({ type: 'error', text: 'Please start Parakeet or switch to another option' })
        return
      }
      if (data.transcription.mode === 'faster-whisper' && fasterWhisperStatus.status !== 'running') {
        setMessage({ type: 'error', text: 'Please start Faster Whisper or switch to another option' })
        return
      }
      if (data.transcription.mode === 'whisper' && !data.transcription.url) {
        setMessage({ type: 'error', text: 'Please enter the Whisper API URL' })
        return
      }
      const saved = await saveTranscriptionConfig()
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
      // Handled by CompleteStep buttons
      return
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
      titleBadge={<StatusBadge variant="beta" testId="badge-wizard-local" />}
      progress={wizard.progress}
      steps={STEPS}
      currentStepId={wizard.currentStep.id}
      isFirstStep={wizard.isFirst}
      onBack={handleBack}
      onNext={wizard.currentStep.id === 'complete' ? undefined : handleNext}
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
            pullModelName={pullModelName}
            pullingModel={pullingModel}
            onStartOllama={() => startContainer('ollama', setOllamaStatus)}
            onRefreshModels={fetchOllamaModels}
            onPullModel={pullOllamaModel}
            onPullModelNameChange={setPullModelName}
          />
        )}

        {/* Step 2: Transcription Configuration */}
        {wizard.currentStep.id === 'transcription' && (
          <TranscriptionStep
            parakeetStatus={parakeetStatus}
            fasterWhisperStatus={fasterWhisperStatus}
            onStartParakeet={() => startContainer('parakeet', setParakeetStatus)}
            onStartFasterWhisper={() => startContainer('faster-whisper', setFasterWhisperStatus)}
          />
        )}

        {/* Step 3: Start Core Services */}
        {wizard.currentStep.id === 'start_services' && (
          <StartServicesStep
            containers={coreContainers}
            onStart={startCoreContainer}
            onRefresh={() => deployTarget && checkCoreContainerStatuses(deployTarget)}
          />
        )}

        {/* Step 4: Complete */}
        {wizard.currentStep.id === 'complete' && (
          <CompleteStep
            onContinue={() => navigate('/wizard/tailscale')}
            onGoHome={() => navigate('/')}
          />
        )}
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
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Configure Local LLM
          </h2>
          <StatusBadge variant="not-implemented" testId="badge-ollama" />
        </div>
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
              {loadingModels ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading models...
                </div>
              ) : availableModels.length === 0 ? (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 space-y-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">No models installed</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Pull a model to get started:
                  </p>
                  <code className="block text-xs bg-amber-100 dark:bg-amber-900/40 px-2 py-1 rounded font-mono text-amber-900 dark:text-amber-100">
                    ollama pull llama3.2
                  </code>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Then click Refresh above.
                  </p>
                </div>
              ) : (
                <select
                  data-testid="local-services-llm-model"
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
              )}
              {availableModels.length > 0 && (
                <p className="text-xs text-gray-500">
                  Don&apos;t see your model? Pull it with: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">ollama pull model-name</code>
                </p>
              )}
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
  fasterWhisperStatus: ContainerInfo
  onStartParakeet: () => void
  onStartFasterWhisper: () => void
}

function TranscriptionStep({ parakeetStatus, fasterWhisperStatus, onStartParakeet, onStartFasterWhisper }: TranscriptionStepProps) {
  const { register, watch, setValue } = useFormContext<FormData>()
  const mode = watch('transcription.mode')

  return (
    <div data-testid="local-services-step-transcription" className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Configure Transcription
          </h2>
          <StatusBadge variant="not-implemented" testId="badge-parakeet" />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Choose your speech-to-text provider for converting conversations.
        </p>
      </div>

      {/* Mode Selection */}
      <div className="grid md:grid-cols-3 gap-4">
        <button
          type="button"
          data-testid="local-services-transcription-parakeet"
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
          data-testid="local-services-transcription-faster-whisper"
          onClick={() => setValue('transcription.mode', 'faster-whisper')}
          className={`p-4 rounded-lg border-2 text-left transition-all ${
            mode === 'faster-whisper'
              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <Cpu className={`w-5 h-5 ${mode === 'faster-whisper' ? 'text-primary-600' : 'text-gray-500'}`} />
            <span className="font-medium text-gray-900 dark:text-white">Faster Whisper</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Spin up faster-whisper-server locally
          </p>
        </button>

        <button
          type="button"
          data-testid="local-services-transcription-whisper"
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

      {/* Faster Whisper Mode */}
      {mode === 'faster-whisper' && (
        <ContainerStatusCard
          container={fasterWhisperStatus}
          onStart={onStartFasterWhisper}
          description="faster-whisper-server with OpenAI-compatible API on port 10300"
        />
      )}

      {/* Whisper Mode */}
      {mode === 'whisper' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Whisper API URL
          </label>
          <input
            data-testid="local-services-transcription-url"
            type="text"
            {...register('transcription.url')}
            placeholder="http://localhost:9000/v1/audio/transcriptions"
            className="input"
          />
          <p className="text-xs text-gray-500 mt-1">
            OpenAI-compatible Whisper endpoint
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
interface CompleteStepProps {
  onContinue: () => void
  onGoHome: () => void
}

function CompleteStep({ onContinue, onGoHome }: CompleteStepProps) {
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

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
        <button
          onClick={onGoHome}
          data-testid="local-services-go-home"
          className="btn-secondary px-6 py-3"
        >
          Go to Dashboard
        </button>
        <button
          onClick={onContinue}
          data-testid="local-services-continue-setup"
          className="btn-primary px-6 py-3 flex items-center justify-center gap-2"
        >
          Continue to Level 2
          <span className="text-xs opacity-75">(Tailscale)</span>
        </button>
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
