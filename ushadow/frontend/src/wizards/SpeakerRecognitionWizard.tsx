import { useState, useEffect } from 'react'
import { useForm, FormProvider, useFormContext, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Users, CheckCircle, Cpu, Zap, ExternalLink, AlertTriangle, Loader2, Key, ShieldCheck, XCircle, Play, RefreshCw } from 'lucide-react'

import { wizardApi, deploymentsApi, settingsApi, type DeployTarget, type Deployment, type HuggingFaceModelsResponse, type ModelAccessStatus } from '../services/api'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { useWizard } from '../contexts/WizardContext'
import { WizardShell, WizardMessage, WhatsNext } from '../components/wizard'
import { SecretInput } from '../components/settings'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'

// Field configuration for HuggingFace
const huggingfaceConfig = {
  label: 'HuggingFace Access Token',
  placeholder: 'hf_...',
  tokenLink: 'https://huggingface.co/settings/tokens',
}

// Schema
const speakerRecSchema = z.object({
  hfToken: z.string().min(1, 'HuggingFace token is required'),
  computeMode: z.enum(['cpu', 'gpu']),
  deepgramApiKey: z.string().optional(),
  similarityThreshold: z.string(),
})

type SpeakerRecFormData = z.infer<typeof speakerRecSchema>

// Container status tracking (same pattern as LocalServicesWizard)
interface ContainerInfo {
  name: string
  displayName: string
  status: 'unknown' | 'stopped' | 'starting' | 'running' | 'error'
  error?: string
}

// Steps - New order: Token → Model Access → Compute → Start Container → Complete
const STEPS: WizardStep[] = [
  { id: 'token', label: 'HuggingFace Token' },
  { id: 'models', label: 'Model Access' },
  { id: 'compute', label: 'Compute Mode' },
  { id: 'start_container', label: 'Start Service' },
  { id: 'complete', label: 'Complete' },
] as const

export default function SpeakerRecognitionWizard() {
  const navigate = useNavigate()
  const { updateServiceStatus, markPhaseComplete } = useWizard()
  const wizard = useWizardSteps(STEPS)
  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modelAccess, setModelAccess] = useState<HuggingFaceModelsResponse | null>(null)
  const [isCheckingModels, setIsCheckingModels] = useState(false)
  const [tokenSaved, setTokenSaved] = useState(false)
  const [deployTarget, setDeployTarget] = useState<DeployTarget | null>(null)

  // Container state for speaker-recognition service
  const [containerStatus, setContainerStatus] = useState<ContainerInfo>({
    name: 'speaker-recognition',
    displayName: 'Speaker Recognition',
    status: 'unknown',
  })

  const methods = useForm<SpeakerRecFormData>({
    resolver: zodResolver(speakerRecSchema),
    defaultValues: {
      hfToken: '',
      computeMode: 'cpu',
      deepgramApiKey: '',
      similarityThreshold: '0.15',
    },
    mode: 'onChange',
  })

  // Load existing configuration and deploy target
  useEffect(() => {
    loadExistingConfig()
    loadDeployTarget()
  }, [])

  const loadDeployTarget = async () => {
    try {
      const response = await deploymentsApi.listTargets()
      const leader = response.data.find((t: DeployTarget) => t.type === 'docker' && t.is_leader)
      if (leader) setDeployTarget(leader)
    } catch (error) {
      console.error('Failed to load deployment targets:', error)
    }
  }

  // Check model access when entering model access step
  useEffect(() => {
    if (wizard.currentStep.id === 'models' && tokenSaved) {
      checkModelAccess()
    }
  }, [wizard.currentStep.id, tokenSaved])

  // Check container status when entering start_container step (or when deployTarget becomes available)
  useEffect(() => {
    if (wizard.currentStep.id === 'start_container' && deployTarget) {
      checkContainerStatus()
    }
  }, [wizard.currentStep.id, deployTarget])

  const loadExistingConfig = async () => {
    try {
      const response = await wizardApi.getApiKeys()
      const keys = response.data

      if (keys.hf_token) {
        methods.setValue('hfToken', keys.hf_token)
        setTokenSaved(true)
      }
      if (keys.deepgram_api_key) {
        methods.setValue('deepgramApiKey', keys.deepgram_api_key)
      }
    } catch (err) {
      console.error('Failed to load existing config:', err)
    }
  }

  const checkModelAccess = async () => {
    setIsCheckingModels(true)
    try {
      const response = await wizardApi.checkHuggingFaceModels()
      setModelAccess(response.data)
    } catch (err) {
      console.error('Failed to check model access:', err)
      setModelAccess(null)
      setMessage({ type: 'error', text: 'Failed to check model access. Please verify your token.' })
    } finally {
      setIsCheckingModels(false)
    }
  }

  // Check container status via deploymentsApi
  const checkContainerStatus = async () => {
    if (!deployTarget) return
    try {
      const response = await deploymentsApi.listDeployments({ unode_hostname: deployTarget.identifier })
      const deployment = (response.data as Deployment[]).find((d) => d.service_id.includes('speaker-recognition'))
      setContainerStatus((prev) => ({
        ...prev,
        status: deployment?.status === 'running' ? 'running' : 'stopped',
        error: undefined,
      }))
    } catch (error) {
      setContainerStatus((prev) => ({ ...prev, status: 'stopped', error: undefined }))
    }
  }

  // Start the speaker-recognition container via deploymentsApi
  const startContainer = async () => {
    if (!deployTarget) {
      setMessage({ type: 'error', text: 'No deployment target available' })
      return
    }
    setContainerStatus((prev) => ({ ...prev, status: 'starting', error: undefined }))

    try {
      await deploymentsApi.deploy('speaker-recognition', deployTarget.identifier)

      let attempts = 0
      const maxAttempts = 60 // Longer timeout for speaker-rec (model download)

      const pollStatus = async () => {
        attempts++
        try {
          const response = await deploymentsApi.listDeployments({ unode_hostname: deployTarget.identifier })
          const deployment = (response.data as Deployment[]).find((d) => d.service_id.includes('speaker-recognition'))

          if (deployment?.status === 'running') {
            setContainerStatus((prev) => ({ ...prev, status: 'running', error: undefined }))
            updateServiceStatus('speaker-recognition', { configured: true, running: true })
            setMessage({ type: 'success', text: 'Speaker Recognition service started!' })
            return
          }

          if (deployment?.status === 'failed') {
            setContainerStatus((prev) => ({ ...prev, status: 'error', error: 'Deployment failed' }))
            return
          }

          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 2000)
          } else {
            setContainerStatus((prev) => ({
              ...prev,
              status: 'error',
              error: 'Timeout waiting for service to start',
            }))
          }
        } catch (err) {
          if (attempts < maxAttempts) setTimeout(pollStatus, 2000)
        }
      }

      setTimeout(pollStatus, 3000) // Initial delay for container startup
    } catch (error) {
      setContainerStatus((prev) => ({
        ...prev,
        status: 'error',
        error: getErrorMessage(error, 'Failed to start service'),
      }))
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to start speaker recognition service') })
    }
  }

  // Map steps to form fields for validation
  const getFieldsForStep = (stepId: string): (keyof SpeakerRecFormData)[] => {
    switch (stepId) {
      case 'token': return ['hfToken']
      case 'compute': return ['computeMode']
      default: return []
    }
  }

  // Check if step can proceed
  const canProceed = (stepId: string): boolean => {
    if (stepId === 'models') {
      // Must have all models accessible to proceed
      return modelAccess?.all_accessible ?? false
    }
    if (stepId === 'start_container') {
      // Container must be running to proceed
      return containerStatus.status === 'running'
    }
    return true
  }

  // Save step data to backend
  const saveStepData = async (stepId: string): Promise<boolean> => {
    const data = methods.getValues()

    try {
      if (stepId === 'token') {
        // Save HuggingFace token
        await wizardApi.updateApiKeys({
          hf_token: data.hfToken,
        })
        setTokenSaved(true)
      } else if (stepId === 'compute') {
        // Save Deepgram API key if provided
        if (data.deepgramApiKey) {
          await wizardApi.updateApiKeys({
            deepgram_api_key: data.deepgramApiKey,
          })
        }
        // Save service-specific config (compute mode, threshold)
        await settingsApi.updateServiceConfig('speaker-recognition', {
          compute_mode: data.computeMode,
          similarity_threshold: data.similarityThreshold,
        })
      }
      return true
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save configuration') })
      return false
    }
  }

  // Final submission - just mark phase complete (container already started)
  const handleComplete = async () => {
    setIsSubmitting(true)
    try {
      // Container is already running from previous step
      // Just mark the phase complete and navigate
      markPhaseComplete('speaker')
      setMessage({ type: 'success', text: 'Speaker Recognition setup complete! Redirecting...' })
      setTimeout(() => navigate('/speaker-recognition'), 1500)
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to complete setup') })
      setIsSubmitting(false)
    }
  }

  // Next button handler
  const handleNext = async () => {
    setMessage(null)

    // Check custom requirements
    if (!canProceed(wizard.currentStep.id)) {
      if (wizard.currentStep.id === 'models') {
        setMessage({ type: 'error', text: 'Please accept the license terms for all models before proceeding' })
      } else if (wizard.currentStep.id === 'start_container') {
        setMessage({ type: 'error', text: 'Please start the Speaker Recognition service before proceeding' })
      } else {
        setMessage({ type: 'error', text: 'Please complete all requirements before proceeding' })
      }
      return
    }

    if (wizard.isLast) {
      handleComplete()
      return
    }

    // Validate current step fields
    const fields = getFieldsForStep(wizard.currentStep.id)
    if (fields.length > 0) {
      const isValid = await methods.trigger(fields)
      if (!isValid) return
    }

    // Save step data if needed
    if (wizard.currentStep.id === 'token' || wizard.currentStep.id === 'compute') {
      setIsSubmitting(true)
      const saved = await saveStepData(wizard.currentStep.id)
      setIsSubmitting(false)

      if (!saved) return

      setMessage({ type: 'success', text: 'Configuration saved!' })
      setTimeout(() => {
        setMessage(null)
        wizard.next()
      }, 500)
    } else {
      wizard.next()
    }
  }

  const handleBack = () => {
    setMessage(null)
    wizard.back()
  }

  // Compute next button disabled state
  const isNextDisabled = () => {
    if (wizard.currentStep.id === 'models') {
      return isCheckingModels || !(modelAccess?.all_accessible ?? false)
    }
    if (wizard.currentStep.id === 'start_container') {
      return containerStatus.status === 'starting' || containerStatus.status !== 'running'
    }
    return false
  }

  return (
    <WizardShell
      wizardId="speaker-recognition"
      title="Speaker Recognition Setup"
      subtitle="Configure GPU-accelerated speaker diarization and identification"
      icon={Users}
      progress={wizard.progress}
      steps={STEPS}
      currentStepId={wizard.currentStep.id}
      isFirstStep={wizard.isFirst}
      onBack={handleBack}
      onNext={handleNext}
      nextLoading={isSubmitting}
      nextDisabled={isNextDisabled()}
      message={message}
    >
      <FormProvider {...methods}>
        {wizard.currentStep.id === 'token' && <TokenStep />}
        {wizard.currentStep.id === 'models' && (
          <ModelAccessStep
            modelAccess={modelAccess}
            isChecking={isCheckingModels}
            onRefresh={checkModelAccess}
          />
        )}
        {wizard.currentStep.id === 'compute' && <ComputeStep />}
        {wizard.currentStep.id === 'start_container' && (
          <StartContainerStep
            containerStatus={containerStatus}
            onStart={startContainer}
            onRefresh={checkContainerStatus}
          />
        )}
        {wizard.currentStep.id === 'complete' && <CompleteStep />}
      </FormProvider>
    </WizardShell>
  )
}

// Step 1: HuggingFace Token
function TokenStep() {
  const { control, formState: { errors } } = useFormContext<SpeakerRecFormData>()

  return (
    <div data-testid="speaker-rec-step-token" className="space-y-6">
      <div className="flex items-center space-x-3">
        <Key className="h-6 w-6 text-primary-600 dark:text-primary-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Get Your HuggingFace Token
        </h2>
      </div>

      <p className="text-gray-600 dark:text-gray-400">
        Speaker Recognition uses PyAnnote models from HuggingFace. You'll need an access token to download
        the models. The token needs <strong>read</strong> access to gated repositories.
      </p>

      {/* Token Instructions */}
      <div className="p-4 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20">
        <h3 className="font-medium text-primary-900 dark:text-primary-100 mb-2">How to get your token:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-primary-800 dark:text-primary-200">
          <li>Create a free HuggingFace account if you don't have one</li>
          <li>Go to your <a href={huggingfaceConfig.tokenLink} target="_blank" rel="noopener noreferrer" className="underline font-medium">Access Tokens page</a></li>
          <li>Create a new token with <strong>Read</strong> access</li>
          <li>Copy and paste it below</li>
        </ol>
      </div>

      {/* Token Input */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {huggingfaceConfig.label} <span className="text-red-600">*</span>
            </span>
            <a
              href={huggingfaceConfig.tokenLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-600 hover:underline flex items-center space-x-1"
              data-testid="hf-token-link"
            >
              <span>Get Token</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <Controller
            name="hfToken"
            control={control}
            render={({ field }) => (
              <SecretInput
                id="speaker-rec-hf-token"
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                placeholder={huggingfaceConfig.placeholder}
                error={errors.hfToken?.message}
              />
            )}
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Your token is stored securely and only used to download models.
          </p>
        </div>
      </div>
    </div>
  )
}

// Step 2: Model Access Check
interface ModelAccessStepProps {
  modelAccess: HuggingFaceModelsResponse | null
  isChecking: boolean
  onRefresh: () => void
}

function ModelAccessStep({ modelAccess, isChecking, onRefresh }: ModelAccessStepProps) {
  if (isChecking) {
    return (
      <div data-testid="speaker-rec-step-models" className="space-y-6">
        <div className="flex items-center space-x-3">
          <ShieldCheck className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Checking Model Access
          </h2>
        </div>

        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="h-12 w-12 text-primary-600 dark:text-primary-400 animate-spin" />
          <p className="text-gray-600 dark:text-gray-400">Verifying access to required models...</p>
        </div>
      </div>
    )
  }

  const allAccessible = modelAccess?.all_accessible ?? false

  return (
    <div data-testid="speaker-rec-step-models" className="space-y-6">
      <div className="flex items-center space-x-3">
        <ShieldCheck className="h-6 w-6 text-primary-600 dark:text-primary-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Model License Terms
        </h2>
      </div>

      {allAccessible ? (
        <>
          <div className="p-4 rounded-lg border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-200">
                  All model licenses accepted!
                </p>
                <p className="text-sm text-green-600 dark:text-green-400">
                  You have access to all required PyAnnote models.
                </p>
              </div>
            </div>
          </div>

          <p className="text-gray-600 dark:text-gray-400">
            Your HuggingFace account has access to the required speaker recognition models.
            Click Next to continue.
          </p>
        </>
      ) : (
        <>
          <div className="p-4 rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  License acceptance required
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Some models require you to accept their license terms on HuggingFace.
                </p>
              </div>
            </div>
          </div>

          <p className="text-gray-600 dark:text-gray-400">
            The PyAnnote models are gated and require you to accept their license terms.
            Click each model link below to accept the terms, then refresh this page.
          </p>
        </>
      )}

      {/* Model Status List */}
      <div className="space-y-3">
        <h3 className="font-medium text-gray-900 dark:text-white">Required Models:</h3>
        {modelAccess?.models.map((model: ModelAccessStatus) => (
          <ModelAccessItem key={model.model_id} model={model} />
        ))}
      </div>

      {/* Refresh Button */}
      {!allAccessible && (
        <div className="flex justify-center pt-4">
          <button
            onClick={onRefresh}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-700 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            data-testid="speaker-rec-refresh-models"
          >
            <Loader2 className="h-4 w-4" />
            <span>Refresh Model Access</span>
          </button>
        </div>
      )}
    </div>
  )
}

// Individual model access item
function ModelAccessItem({ model }: { model: ModelAccessStatus }) {
  const modelName = model.model_id.split('/').pop() || model.model_id
  const modelUrl = `https://huggingface.co/${model.model_id}`

  if (model.has_access) {
    return (
      <div
        className="flex items-center justify-between p-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10"
        data-testid={`model-access-${modelName}`}
      >
        <div className="flex items-center space-x-3">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
          <div>
            <span className="font-medium text-gray-900 dark:text-white">{model.model_id}</span>
            <p className="text-sm text-green-600 dark:text-green-400">Access granted</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <a
      href={modelUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 hover:border-amber-300 dark:hover:border-amber-700 transition-colors group"
      data-testid={`model-access-${modelName}`}
    >
      <div className="flex items-center space-x-3">
        <XCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        <div>
          <span className="font-medium text-gray-900 dark:text-white">{model.model_id}</span>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {model.error || 'Click to accept license terms'}
          </p>
        </div>
      </div>
      <ExternalLink className="h-5 w-5 text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors" />
    </a>
  )
}

// Step 3: Compute Mode
function ComputeStep() {
  const { register, watch, control, formState: { errors } } = useFormContext<SpeakerRecFormData>()
  const selectedMode = watch('computeMode')

  const modes = [
    {
      value: 'cpu' as const,
      label: 'CPU Mode',
      icon: Cpu,
      description: 'Works on any machine. Slower inference (~10-30s for enrollment).',
      recommended: false,
    },
    {
      value: 'gpu' as const,
      label: 'GPU Mode',
      icon: Zap,
      description: 'Requires NVIDIA GPU with CUDA. Fast inference (~2-5s for enrollment).',
      recommended: true,
    },
  ]

  return (
    <div data-testid="speaker-rec-step-compute" className="space-y-6">
      <div className="flex items-center space-x-3">
        <Cpu className="h-6 w-6 text-primary-600 dark:text-primary-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Choose Compute Mode
        </h2>
      </div>

      <p className="text-gray-600 dark:text-gray-400">
        Select how the speaker recognition models will run.
        GPU mode is significantly faster but requires an NVIDIA GPU.
      </p>

      <div className="space-y-3">
        {modes.map((mode) => (
          <label
            key={mode.value}
            data-testid={`speaker-rec-compute-${mode.value}-option`}
            className={`block p-4 rounded-lg border-2 transition-all cursor-pointer ${
              selectedMode === mode.value
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
            }`}
          >
            <input
              type="radio"
              value={mode.value}
              {...register('computeMode')}
              className="sr-only"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <mode.icon className={`h-6 w-6 ${
                  selectedMode === mode.value
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-400'
                }`} />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
                    <span>{mode.label}</span>
                    {mode.recommended && (
                      <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                        Recommended
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{mode.description}</p>
                </div>
              </div>
              {selectedMode === mode.value && (
                <CheckCircle className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              )}
            </div>
          </label>
        ))}
      </div>

      {/* Optional: Deepgram API Key */}
      <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
        <h3 className="font-medium text-gray-900 dark:text-white mb-2">
          Optional: Enhanced Transcription
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Add a Deepgram API key to enable real-time transcription alongside speaker identification.
        </p>

        <div className="flex items-center justify-between mb-2">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Deepgram API Key
          </span>
          <a
            href="https://console.deepgram.com/project/default/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-600 hover:underline flex items-center space-x-1"
          >
            <span>Get API Key</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <Controller
          name="deepgramApiKey"
          control={control}
          render={({ field }) => (
            <SecretInput
              id="speaker-rec-deepgram-key"
              name={field.name}
              value={field.value || ''}
              onChange={field.onChange}
              placeholder="Enter Deepgram API key (optional)"
              error={errors.deepgramApiKey?.message}
            />
          )}
        />
      </div>
    </div>
  )
}

// Step 4: Start Container
interface StartContainerStepProps {
  containerStatus: ContainerInfo
  onStart: () => void
  onRefresh: () => void
}

function StartContainerStep({ containerStatus, onStart, onRefresh }: StartContainerStepProps) {
  const getStatusColor = () => {
    switch (containerStatus.status) {
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
    switch (containerStatus.status) {
      case 'running':
        return <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
      case 'starting':
        return <Loader2 className="h-6 w-6 text-yellow-600 dark:text-yellow-400 animate-spin" />
      case 'error':
        return <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
      default:
        return <div className="h-6 w-6 rounded-full border-2 border-gray-400" />
    }
  }

  const getStatusText = () => {
    switch (containerStatus.status) {
      case 'running':
        return 'Running'
      case 'starting':
        return 'Starting... (downloading models may take a few minutes)'
      case 'error':
        return containerStatus.error || 'Error'
      case 'stopped':
        return 'Stopped'
      default:
        return 'Unknown'
    }
  }

  return (
    <div data-testid="speaker-rec-step-start-container" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Play className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Start Speaker Recognition Service
          </h2>
        </div>
        <button
          onClick={onRefresh}
          data-testid="speaker-rec-refresh-status"
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Refresh status"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      <p className="text-gray-600 dark:text-gray-400">
        Start the Speaker Recognition container. On first run, the PyAnnote models will be downloaded
        which may take a few minutes depending on your connection.
      </p>

      {/* Container Status Card */}
      <div className={`p-6 rounded-lg border-2 ${getStatusColor()} transition-colors`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {getStatusIcon()}
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {containerStatus.displayName}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {getStatusText()}
              </p>
            </div>
          </div>

          {containerStatus.status !== 'running' && containerStatus.status !== 'starting' && (
            <button
              onClick={onStart}
              data-testid="speaker-rec-start-container"
              className="btn-primary flex items-center space-x-2"
            >
              <Play className="h-4 w-4" />
              <span>Start</span>
            </button>
          )}
        </div>

        {containerStatus.error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{containerStatus.error}</p>
        )}
      </div>

      {/* Info about what happens during start */}
      {containerStatus.status === 'starting' && (
        <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
          <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">What&apos;s happening:</h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• Creating the speaker-recognition container</li>
            <li>• Downloading PyAnnote segmentation model (~50MB)</li>
            <li>• Downloading PyAnnote diarization model (~50MB)</li>
            <li>• Initializing the speaker recognition service</li>
          </ul>
        </div>
      )}

      {/* Success message */}
      {containerStatus.status === 'running' && (
        <div className="p-4 rounded-lg border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">
                Service is running!
              </p>
              <p className="text-sm text-green-600 dark:text-green-400">
                Click Next to complete the setup.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Step 5: Complete
function CompleteStep() {
  const navigate = useNavigate()
  const { watch } = useFormContext<SpeakerRecFormData>()
  const computeMode = watch('computeMode')
  const hasDeepgram = !!watch('deepgramApiKey')

  return (
    <div data-testid="speaker-rec-step-complete" className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          Level 4 Complete - All Done!
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Your speaker recognition service is configured and running.
        </p>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6 text-left">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
          Configuration Summary:
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Service Status:</span>
            <span className="font-medium text-green-600 dark:text-green-400 flex items-center space-x-2">
              <CheckCircle className="h-4 w-4" />
              <span>Running</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Compute Mode:</span>
            <span className="font-medium text-gray-900 dark:text-white flex items-center space-x-2">
              {computeMode === 'gpu' ? (
                <>
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span>GPU Accelerated</span>
                </>
              ) : (
                <>
                  <Cpu className="h-4 w-4 text-gray-500" />
                  <span>CPU</span>
                </>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Transcription:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {hasDeepgram ? 'Deepgram Enhanced' : 'Speaker Labels Only'}
            </span>
          </div>
        </div>
      </div>

      <WhatsNext currentLevel={4} onGoHome={() => navigate('/')} />
    </div>
  )
}
