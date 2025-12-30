import { Database, ArrowLeft, ArrowRight, AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, FormProvider, useFormContext } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useWizard } from '../contexts/WizardContext'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardProgress } from '../components/wizard'
import type { WizardStep } from '../types/wizard'

// Schema
const memorySchema = z.object({
  deployment_type: z.enum(['new', 'existing']),
  server_url: z.string().url().optional(),
  enable_graph_memory: z.boolean(),
  neo4j_password: z.string().min(8).optional(),
  neo4j_confirm_password: z.string().optional(),
}).refine(
  (data) => {
    if (!data.enable_graph_memory) return true
    return data.neo4j_password === data.neo4j_confirm_password
  },
  {
    message: "Passwords do not match",
    path: ["neo4j_confirm_password"],
  }
)

type MemoryFormData = z.infer<typeof memorySchema>

// Step definitions
const STEPS: WizardStep[] = [
  { id: 'deployment', label: 'Deployment' },
  { id: 'graph', label: 'Graph Config' },
  { id: 'neo4j', label: 'Neo4j' },
  { id: 'complete', label: 'Complete' },
]

export default function MemoryWizardPage() {
  const navigate = useNavigate()
  const { wizardState, markPhaseComplete } = useWizard()
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const methods = useForm<MemoryFormData>({
    resolver: zodResolver(memorySchema),
    defaultValues: {
      deployment_type: wizardState.mode === 'local' ? 'new' : 'new',
      server_url: 'http://openmemory:8765',
      enable_graph_memory: false,
      neo4j_password: '',
      neo4j_confirm_password: '',
    },
    mode: 'onChange',
  })

  // Watch enable_graph_memory to determine if Neo4j step should be shown
  const enableGraphMemory = methods.watch('enable_graph_memory')

  // Filter steps based on whether Neo4j is enabled
  const activeSteps = enableGraphMemory
    ? STEPS
    : STEPS.filter(step => step.id !== 'neo4j')

  const wizard = useWizardSteps(activeSteps)

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const handleSubmit = async (data: MemoryFormData) => {
    setIsSubmitting(true)

    try {
      // TODO: Call backend API to configure memory services
      console.log('Memory config:', data)

      showMessage('success', 'Memory configured successfully!')
      markPhaseComplete('memory')

      setTimeout(() => {
        navigate('/wizard/chronicle')
      }, 1500)
    } catch (error: any) {
      showMessage('error', error.message || 'Failed to configure memory')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNext = () => {
    setMessage(null)
    if (wizard.isLast) {
      methods.handleSubmit(handleSubmit)()
    } else {
      wizard.next()
    }
  }

  const handleBack = () => {
    setMessage(null)
    wizard.back()
  }

  const handleStepClick = (stepId: string) => {
    const targetIndex = activeSteps.findIndex(s => s.id === stepId)
    if (targetIndex <= wizard.currentIndex) {
      setMessage(null)
      wizard.goTo(stepId)
    }
  }

  return (
    <div id="wizard-container" className="max-w-4xl mx-auto">
      <div className="relative">
        {/* Back Arrow - Left Side (navigates to /wizard/start on first step) */}
        <button
          id="wizard-back-button"
          onClick={() => wizard.isFirst ? navigate('/wizard/start') : handleBack()}
          disabled={isSubmitting}
          className="absolute left-0 top-32 -translate-x-16 w-12 h-12 rounded-full
                     bg-primary-600 hover:bg-primary-700
                     disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center justify-center shadow-lg z-10
                     transition-colors"
          aria-label={wizard.isFirst ? "Back to Setup Wizard" : "Go back"}
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </button>

        {/* Next Arrow - Right Side */}
        <button
          id="wizard-next-button"
          onClick={handleNext}
          disabled={isSubmitting}
          className="absolute right-0 top-32 translate-x-16 w-12 h-12 rounded-full
                     bg-primary-600 hover:bg-primary-700
                     disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center justify-center shadow-lg z-10
                     transition-colors"
          aria-label="Continue"
        >
          {isSubmitting ? (
            <Loader2 className="w-6 h-6 animate-spin text-white" />
          ) : (
            <ArrowRight className="w-6 h-6 text-white" />
          )}
        </button>

        <div className="card">
          {/* Header */}
          <div className="p-8 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Database className="w-8 h-8 text-primary-600" />
              <h1 id="wizard-title" className="text-2xl font-semibold text-gray-900 dark:text-white">
                Memory Setup
              </h1>
            </div>
            <p id="wizard-subtitle" className="text-gray-600 dark:text-gray-400">
              Configure OpenMemory for intelligent conversation memory
            </p>
            {wizardState.mode && (
              <p className="mt-1 text-sm text-primary-600 dark:text-primary-400">
                Mode: {wizardState.mode === 'quickstart' ? 'Quickstart' : wizardState.mode === 'local' ? 'Local' : 'Custom'}
              </p>
            )}

            {/* Progress bar */}
            <div className="mt-6">
              <WizardProgress
                progress={wizard.progress}
                steps={activeSteps}
                currentStepId={wizard.currentStep.id}
                onStepClick={handleStepClick}
              />
            </div>
          </div>

          {/* Message Banner */}
          {message && (
            <div
              id="wizard-message"
              className={`p-4 mx-8 mt-4 rounded-lg flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400'
                  : message.type === 'error'
                  ? 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400'
                  : 'bg-primary-100 dark:bg-primary-900/20 text-primary-800 dark:text-primary-400'
              }`}
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{message.text}</span>
            </div>
          )}

          {/* Step Content */}
          <div id="wizard-content" className="p-8">
            <FormProvider {...methods}>
              {wizard.currentStep.id === 'deployment' && <DeploymentStep />}
              {wizard.currentStep.id === 'graph' && <GraphConfigStep />}
              {wizard.currentStep.id === 'neo4j' && <Neo4jCredentialsStep />}
              {wizard.currentStep.id === 'complete' && <CompleteStep />}
            </FormProvider>
          </div>
        </div>
      </div>
    </div>
  )
}

// Step 1: Deployment
function DeploymentStep() {
  const { register, watch, formState: { errors } } = useFormContext<MemoryFormData>()
  const { wizardState } = useWizard()
  const deploymentType = watch('deployment_type')

  // Hide existing option for quickstart/local modes
  const showExisting = wizardState.mode === 'custom'

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          OpenMemory Deployment
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          {showExisting ? 'Use an existing server or create a new one.' : 'We\'ll set up OpenMemory for you with Docker.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label
          id="deployment-option-new"
          className={`p-6 rounded-lg border-2 transition-all cursor-pointer ${
            deploymentType === 'new'
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          <input type="radio" value="new" {...register('deployment_type')} className="sr-only" />
          <div className="flex items-center gap-3 mb-3">
            <Database className={`w-6 h-6 ${deploymentType === 'new' ? 'text-primary-600' : 'text-gray-500'}`} />
            <h4 className="font-semibold text-gray-900 dark:text-white">
              Create New
            </h4>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Set up OpenMemory automatically with Docker containers
          </p>
        </label>

        {showExisting && (
          <label
            id="deployment-option-existing"
            className={`p-6 rounded-lg border-2 transition-all cursor-pointer ${
              deploymentType === 'existing'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
            }`}
          >
            <input type="radio" value="existing" {...register('deployment_type')} className="sr-only" />
            <div className="flex items-center gap-3 mb-3">
              <Database className={`w-6 h-6 ${deploymentType === 'existing' ? 'text-primary-600' : 'text-gray-500'}`} />
              <h4 className="font-semibold text-gray-900 dark:text-white">
                Use Existing
              </h4>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Connect to an existing OpenMemory server
            </p>
          </label>
        )}
      </div>

      {deploymentType === 'existing' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            OpenMemory Server URL
          </label>
          <input
            id="server-url-input"
            type="text"
            {...register('server_url')}
            placeholder="http://openmemory:8765"
            className="input"
          />
          {errors.server_url && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.server_url.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Step 2: Graph Configuration
function GraphConfigStep() {
  const { register, watch } = useFormContext<MemoryFormData>()
  const enableGraph = watch('enable_graph_memory')

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Graph Memory Configuration
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Enable graph-based memory for enhanced relationship tracking.
        </p>
      </div>

      <div className="card p-4 bg-primary-50 dark:bg-primary-900/20">
        <h4 className="font-semibold text-primary-900 dark:text-primary-200 mb-2">
          What is Graph Memory?
        </h4>
        <p className="text-sm text-primary-800 dark:text-primary-300">
          Graph memory uses Neo4j to store relationships between memories, enabling complex queries and connections. This requires additional resources.
        </p>
      </div>

      <div className="space-y-3">
        <label
          id="graph-option-enabled"
          className={`w-full p-4 rounded-lg border-2 transition-all cursor-pointer flex items-start ${
            enableGraph
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          <input
            type="radio"
            value="true"
            {...register('enable_graph_memory', {
              setValueAs: (v) => v === 'true'
            })}
            className="sr-only"
          />
          <div className="flex items-center gap-3">
            <Database className={`w-6 h-6 flex-shrink-0 ${enableGraph ? 'text-primary-600' : 'text-gray-500'}`} />
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white">
                Enable Graph Memory
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Use Neo4j for advanced memory relationships
              </p>
            </div>
          </div>
        </label>

        <label
          id="graph-option-disabled"
          className={`w-full p-4 rounded-lg border-2 transition-all cursor-pointer flex items-start ${
            !enableGraph
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          <input
            type="radio"
            value="false"
            {...register('enable_graph_memory', {
              setValueAs: (v) => v === 'true'
            })}
            className="sr-only"
          />
          <div className="flex items-center gap-3">
            <Database className={`w-6 h-6 flex-shrink-0 ${!enableGraph ? 'text-primary-600' : 'text-gray-500'}`} />
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white">
                Standard Memory Only
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Use vector-based memory without graph relationships
              </p>
            </div>
          </div>
        </label>
      </div>
    </div>
  )
}

// Step 3: Neo4j Credentials (conditional - only shown if graph enabled)
function Neo4jCredentialsStep() {
  const { register, formState: { errors } } = useFormContext<MemoryFormData>()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Neo4j Credentials
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Set a password for your Neo4j graph database.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Neo4j Password
          </label>
          <input
            id="neo4j-password-input"
            type="password"
            {...register('neo4j_password')}
            placeholder="Enter Neo4j password"
            className="input"
          />
          {errors.neo4j_password && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.neo4j_password.message}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Minimum 8 characters
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Confirm Password
          </label>
          <input
            id="neo4j-confirm-password-input"
            type="password"
            {...register('neo4j_confirm_password')}
            placeholder="Confirm password"
            className="input"
          />
          {errors.neo4j_confirm_password && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.neo4j_confirm_password.message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// Step 4: Complete
function CompleteStep() {
  const { watch } = useFormContext<MemoryFormData>()
  const deploymentType = watch('deployment_type')
  const enableGraph = watch('enable_graph_memory')

  return (
    <div className="space-y-6 text-center">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Ready to Configure Memory
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Review your settings and complete setup.
        </p>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-left">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
          Configuration Summary:
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Deployment:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {deploymentType === 'new' ? 'New (Docker)' : 'Existing Server'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Graph Memory:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {enableGraph ? 'Enabled (Neo4j)' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        Click the arrow to complete setup
      </p>
    </div>
  )
}
