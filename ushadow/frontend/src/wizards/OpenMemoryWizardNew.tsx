import { useState } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import StepWizard from 'react-step-wizard'
import { X, ArrowRight, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react'

import { openMemorySchema, defaultValues, type OpenMemoryFormData } from './openmemory/schema'
import DeploymentStep from './openmemory/steps/DeploymentStep'
import GraphConfigStep from './openmemory/steps/GraphConfigStep'
import Neo4jCredentialsStep from './openmemory/steps/Neo4jCredentialsStep'
import { wizardApi, servicesApi } from '../services/api'

interface Message {
  type: 'success' | 'error' | 'info'
  text: string
}

interface OpenMemoryWizardNewProps {
  onComplete: (config: OpenMemoryFormData) => void
  onCancel: () => void
  userName: string
  environmentName: string
}

export default function OpenMemoryWizardNew({
  onComplete,
  onCancel,
  userName,
  environmentName,
}: OpenMemoryWizardNewProps) {
  const [message, setMessage] = useState<Message | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const methods = useForm<OpenMemoryFormData>({
    resolver: zodResolver(openMemorySchema),
    defaultValues,
    mode: 'onChange',
  })

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const handleWizardSubmit = async (data: OpenMemoryFormData) => {
    setIsSubmitting(true)

    try {
      // Save OpenMemory configuration to settings
      await wizardApi.updateProviders({
        memory_provider: 'openmemory_mcp',
        openmemory_server_url: data.server_url,
        openmemory_enable_graph: data.enable_graph_memory,
        openmemory_neo4j_password: data.neo4j_password || undefined,
      })

      // Start containers if new deployment
      if (data.deployment_type === 'new') {
        // Start Neo4j if graph memory enabled
        if (data.enable_graph_memory) {
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
      setTimeout(() => onComplete(data), 1000)
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to complete setup'
      showMessage('error', errorMessage)
    } finally {
      setIsSubmitting(false)
    }
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
            <span>{message.text}</span>
          </div>
        )}

        {/* Wizard Content */}
        <FormProvider {...methods}>
          <StepWizard
            nav={<WizardNav isSubmitting={isSubmitting} />}
          >
            <DeploymentStep />
            <GraphConfigStep />
            <Neo4jCredentialsStep />
            <CompleteStep onSubmit={methods.handleSubmit(handleWizardSubmit)} />
          </StepWizard>
        </FormProvider>
      </div>
    </div>
  )
}

// Wizard navigation component
interface WizardNavProps {
  isSubmitting: boolean
  currentStep?: number
  totalSteps?: number
  previousStep?: () => void
  nextStep?: () => void
}

function WizardNav({ isSubmitting, currentStep = 1, totalSteps = 1, previousStep, nextStep }: WizardNavProps) {
  const isFirstStep = currentStep === 1
  const isLastStep = currentStep === totalSteps

  return (
    <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-between">
      <button
        type="button"
        onClick={previousStep}
        disabled={isFirstStep || isSubmitting}
        className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <ArrowLeft className="w-5 h-5" />
        Back
      </button>

      <button
        type="button"
        onClick={isLastStep ? undefined : nextStep}
        disabled={isSubmitting}
        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Setting up...
          </>
        ) : (
          <>
            {isLastStep ? 'Complete' : 'Next'}
            {!isLastStep && <ArrowRight className="w-5 h-5" />}
          </>
        )}
      </button>
    </div>
  )
}

// Complete step that handles final submission
function CompleteStep({ onSubmit }: any) {
  return (
    <div className="p-6 min-h-[300px]">
      <div className="text-center space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Ready to Complete Setup
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Click Complete to finish configuring OpenMemory.
        </p>
        <button
          type="button"
          onClick={onSubmit}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
        >
          Complete Setup
        </button>
      </div>
    </div>
  )
}
