import { useState, useEffect } from 'react'
import { useForm, FormProvider, useFormContext, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, CheckCircle, Sparkles } from 'lucide-react'

import { wizardApi } from '../services/api'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage } from '../components/wizard'
import { SecretInput } from '../components/settings'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage, fieldConfig } from './wizard-utils'

// Schema
const chronicleSchema = z.object({
  llmProvider: z.enum(['openai', 'anthropic']),
  llmApiKey: z.string().min(1, 'API key is required'),
  transcriptionProvider: z.enum(['deepgram', 'mistral']),
  transcriptionApiKey: z.string().min(1, 'API key is required'),
})

type ChronicleFormData = z.infer<typeof chronicleSchema>

// Steps
const STEPS: WizardStep[] = [
  { id: 'llm', label: 'LLM Setup' },
  { id: 'transcription', label: 'Transcription' },
  { id: 'complete', label: 'Complete' },
] as const

export default function ChronicleWizard() {
  const navigate = useNavigate()
  const wizard = useWizardSteps(STEPS)
  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const methods = useForm<ChronicleFormData>({
    resolver: zodResolver(chronicleSchema),
    defaultValues: {
      llmProvider: 'openai',
      llmApiKey: '',
      transcriptionProvider: 'deepgram',
      transcriptionApiKey: '',
    },
    mode: 'onChange',
  })

  // Load existing configuration
  useEffect(() => {
    loadExistingConfig()
  }, [])

  const loadExistingConfig = async () => {
    try {
      const response = await wizardApi.getApiKeys()
      const keys = response.data

      if (keys.openai_api_key) {
        methods.setValue('llmProvider', 'openai')
        methods.setValue('llmApiKey', keys.openai_api_key)
      } else if (keys.anthropic_api_key) {
        methods.setValue('llmProvider', 'anthropic')
        methods.setValue('llmApiKey', keys.anthropic_api_key)
      }

      if (keys.deepgram_api_key) {
        methods.setValue('transcriptionProvider', 'deepgram')
        methods.setValue('transcriptionApiKey', keys.deepgram_api_key)
      } else if (keys.mistral_api_key) {
        methods.setValue('transcriptionProvider', 'mistral')
        methods.setValue('transcriptionApiKey', keys.mistral_api_key)
      }
    } catch (err) {
      console.error('Failed to load existing config:', err)
    }
  }

  // Map steps to form fields for validation
  const getFieldsForStep = (stepId: string): (keyof ChronicleFormData)[] => {
    switch (stepId) {
      case 'llm': return ['llmProvider', 'llmApiKey']
      case 'transcription': return ['transcriptionProvider', 'transcriptionApiKey']
      default: return []
    }
  }

  // Save step data to backend
  const saveStepData = async (stepId: string): Promise<boolean> => {
    const data = methods.getValues()

    try {
      if (stepId === 'llm') {
        const payload: Record<string, string> = {}
        if (data.llmProvider === 'openai') {
          payload.openai_api_key = data.llmApiKey
        } else {
          payload.anthropic_api_key = data.llmApiKey
        }
        await wizardApi.updateApiKeys(payload)
      } else if (stepId === 'transcription') {
        const payload: Record<string, string> = {}
        if (data.transcriptionProvider === 'deepgram') {
          payload.deepgram_api_key = data.transcriptionApiKey
        } else {
          payload.mistral_api_key = data.transcriptionApiKey
        }
        await wizardApi.updateApiKeys(payload)
      }
      return true
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save configuration') })
      return false
    }
  }

  // Final submission
  const handleComplete = async () => {
    setIsSubmitting(true)
    try {
      await wizardApi.complete()
      setMessage({ type: 'success', text: 'Chronicle setup complete! Redirecting...' })
      setTimeout(() => navigate('/chronicle'), 1500)
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to complete wizard') })
      setIsSubmitting(false)
    }
  }

  // Next button handler
  const handleNext = async () => {
    setMessage(null)

    if (wizard.isLast) {
      handleComplete()
      return
    }

    // Validate current step fields
    const fields = getFieldsForStep(wizard.currentStep.id)
    const isValid = await methods.trigger(fields)

    if (!isValid) return

    // Save step data
    setIsSubmitting(true)
    const saved = await saveStepData(wizard.currentStep.id)
    setIsSubmitting(false)

    if (saved) {
      setMessage({ type: 'success', text: 'Configuration saved!' })
      setTimeout(() => {
        setMessage(null)
        wizard.next()
      }, 500)
    }
  }

  const handleBack = () => {
    setMessage(null)
    wizard.back()
  }

  return (
    <WizardShell
      wizardId="chronicle"
      title="Chronicle Setup"
      subtitle="Configure Chronicle's AI and transcription services"
      icon={MessageSquare}
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
        {wizard.currentStep.id === 'llm' && <LLMStep />}
        {wizard.currentStep.id === 'transcription' && <TranscriptionStep />}
        {wizard.currentStep.id === 'complete' && <CompleteStep />}
      </FormProvider>
    </WizardShell>
  )
}

// Step 1: LLM Provider Selection
function LLMStep() {
  const { register, watch, control, formState: { errors } } = useFormContext<ChronicleFormData>()
  const selectedProvider = watch('llmProvider')

  const providers = [
    { value: 'openai' as const, label: 'OpenAI', description: 'GPT-4, GPT-3.5, and more', config: fieldConfig.openai },
    { value: 'anthropic' as const, label: 'Anthropic', description: 'Claude 3.5 Sonnet and family', config: fieldConfig.anthropic },
  ]

  return (
    <div data-testid="chronicle-step-llm" className="space-y-6">
      <div className="flex items-center space-x-3">
        <Sparkles className="h-6 w-6 text-primary-600 dark:text-primary-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Configure Your LLM Provider
        </h2>
      </div>

      <p className="text-gray-600 dark:text-gray-400">
        Select your AI language model provider and enter the API key.
      </p>

      <div className="space-y-3">
        {providers.map((provider) => (
          <label
            key={provider.value}
            data-testid={`chronicle-llm-${provider.value}-option`}
            className={`block p-4 rounded-lg border-2 transition-all cursor-pointer ${
              selectedProvider === provider.value
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
            }`}
          >
            <input
              type="radio"
              value={provider.value}
              {...register('llmProvider')}
              className="sr-only"
            />
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{provider.label}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{provider.description}</p>
              </div>
              {selectedProvider === provider.value && (
                <CheckCircle className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              )}
            </div>

            {selectedProvider === provider.value && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {provider.config.label} <span className="text-red-600">*</span>
                  </span>
                  <a
                    href={provider.config.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 hover:underline"
                  >
                    {provider.config.linkText}
                  </a>
                </div>
                <Controller
                  name="llmApiKey"
                  control={control}
                  render={({ field }) => (
                    <SecretInput
                      id={`chronicle-${provider.value}-api-key`}
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={provider.config.placeholder}
                      error={errors.llmApiKey?.message}
                    />
                  )}
                />
              </div>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}

// Step 2: Transcription Provider Selection
function TranscriptionStep() {
  const { register, watch, control, formState: { errors } } = useFormContext<ChronicleFormData>()
  const selectedProvider = watch('transcriptionProvider')

  const providers = [
    { value: 'deepgram' as const, label: 'Deepgram', description: 'High-accuracy speech recognition', config: fieldConfig.deepgram },
    { value: 'mistral' as const, label: 'Mistral', description: 'Alternative transcription service', config: fieldConfig.mistral },
  ]

  return (
    <div data-testid="chronicle-step-transcription" className="space-y-6">
      <div className="flex items-center space-x-3">
        <Sparkles className="h-6 w-6 text-primary-600 dark:text-primary-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Configure Transcription Service
        </h2>
      </div>

      <p className="text-gray-600 dark:text-gray-400">
        Select your transcription provider and enter the API key.
      </p>

      <div className="space-y-3">
        {providers.map((provider) => (
          <label
            key={provider.value}
            data-testid={`chronicle-transcription-${provider.value}-option`}
            className={`block p-4 rounded-lg border-2 transition-all cursor-pointer ${
              selectedProvider === provider.value
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
            }`}
          >
            <input
              type="radio"
              value={provider.value}
              {...register('transcriptionProvider')}
              className="sr-only"
            />
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{provider.label}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{provider.description}</p>
              </div>
              {selectedProvider === provider.value && (
                <CheckCircle className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              )}
            </div>

            {selectedProvider === provider.value && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {provider.config.label} <span className="text-red-600">*</span>
                  </span>
                  <a
                    href={provider.config.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 hover:underline"
                  >
                    {provider.config.linkText}
                  </a>
                </div>
                <Controller
                  name="transcriptionApiKey"
                  control={control}
                  render={({ field }) => (
                    <SecretInput
                      id={`chronicle-${provider.value}-api-key`}
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={provider.config.placeholder}
                      error={errors.transcriptionApiKey?.message}
                    />
                  )}
                />
              </div>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}

// Step 3: Complete
function CompleteStep() {
  const { watch } = useFormContext<ChronicleFormData>()
  const llmProvider = watch('llmProvider')
  const transcriptionProvider = watch('transcriptionProvider')

  return (
    <div data-testid="chronicle-step-complete" className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          Chronicle is Ready!
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Your AI conversation platform is configured and ready to use.
        </p>
      </div>

      <div id="chronicle-config-summary" className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6 text-left">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
          Configuration Summary:
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">LLM Provider:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Transcription:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {transcriptionProvider === 'deepgram' ? 'Deepgram' : 'Mistral'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
