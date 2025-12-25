import { Database, ArrowRight, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import StepWizard from 'react-step-wizard'
import { useNavigate } from 'react-router-dom'
import { useWizard } from '../contexts/WizardContext'

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2">
          <Database className="h-8 w-8 text-primary-600 dark:text-primary-400" />
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Memory Setup</h1>
        </div>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Configure OpenMemory for intelligent conversation memory
        </p>
        {wizardState.mode && (
          <p className="mt-1 text-sm text-primary-600 dark:text-primary-400">
            Mode: {wizardState.mode === 'quickstart' ? '🚀 Quickstart' : wizardState.mode === 'local' ? '💻 Local' : '⚙️ Custom'}
          </p>
        )}
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`card p-4 border ${
          message.type === 'success'
            ? 'bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800 text-success-700 dark:text-success-300'
            : message.type === 'error'
            ? 'bg-error-50 dark:bg-error-900/20 border-error-200 dark:border-error-800 text-error-700 dark:text-error-300'
            : 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300'
        }`}>
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5" />
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* Wizard */}
      <div className="card p-6 overflow-hidden">
        <FormProvider {...methods}>
          <StepWizard
            nav={<WizardNav isSubmitting={isSubmitting} />}
          >
            <DeploymentStep />
            <GraphConfigStep />
            <Neo4jCredentialsStep />
            <CompleteStep onSubmit={methods.handleSubmit(handleSubmit)} />
          </StepWizard>
        </FormProvider>
      </div>
    </div>
  )
}

// Step 1: Deployment
function DeploymentStep(_props: any) {
  const { register, watch, formState: { errors } } = useFormContext<MemoryFormData>()
  const { wizardState } = useWizard()
  const deploymentType = watch('deployment_type')

  // Hide existing option for quickstart/local modes
  const showExisting = wizardState.mode === 'custom'

  return (
    <div className="space-y-6 min-h-[300px]">
      <div>
        <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          OpenMemory Deployment
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400">
          {showExisting ? 'Use an existing server or create a new one.' : 'We\'ll set up OpenMemory for you with Docker.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label
          className={`p-6 rounded-lg border-2 transition-all cursor-pointer ${
            deploymentType === 'new'
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-neutral-300 dark:border-neutral-600 hover:border-primary-400'
          }`}
        >
          <input type="radio" value="new" {...register('deployment_type')} className="sr-only" />
          <div className="flex items-center gap-3 mb-3">
            <Database className={`w-6 h-6 ${deploymentType === 'new' ? 'text-primary-600' : 'text-neutral-500'}`} />
            <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Create New
            </h4>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Set up OpenMemory automatically with Docker containers
          </p>
        </label>

        {showExisting && (
          <label
            className={`p-6 rounded-lg border-2 transition-all cursor-pointer ${
              deploymentType === 'existing'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-neutral-300 dark:border-neutral-600 hover:border-primary-400'
            }`}
          >
            <input type="radio" value="existing" {...register('deployment_type')} className="sr-only" />
            <div className="flex items-center gap-3 mb-3">
              <Database className={`w-6 h-6 ${deploymentType === 'existing' ? 'text-primary-600' : 'text-neutral-500'}`} />
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                Use Existing
              </h4>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Connect to an existing OpenMemory server
            </p>
          </label>
        )}
      </div>

      {deploymentType === 'existing' && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            OpenMemory Server URL
          </label>
          <input
            type="text"
            {...register('server_url')}
            placeholder="http://openmemory:8765"
            className="input"
          />
          {errors.server_url && (
            <p className="mt-1 text-sm text-error-600 dark:text-error-400">
              {errors.server_url.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Step 2: Graph Configuration
function GraphConfigStep(_props: any) {
  const { register, watch } = useFormContext<MemoryFormData>()
  const enableGraph = watch('enable_graph_memory')

  return (
    <div className="space-y-6 min-h-[300px]">
      <div>
        <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          Graph Memory Configuration
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400">
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
          className={`w-full p-4 rounded-lg border-2 transition-all cursor-pointer flex items-start ${
            enableGraph
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-neutral-300 dark:border-neutral-600 hover:border-primary-400'
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
            <Database className={`w-6 h-6 flex-shrink-0 ${enableGraph ? 'text-primary-600' : 'text-neutral-500'}`} />
            <div>
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                Enable Graph Memory
              </h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Use Neo4j for advanced memory relationships
              </p>
            </div>
          </div>
        </label>

        <label
          className={`w-full p-4 rounded-lg border-2 transition-all cursor-pointer flex items-start ${
            !enableGraph
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-neutral-300 dark:border-neutral-600 hover:border-primary-400'
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
            <Database className={`w-6 h-6 flex-shrink-0 ${!enableGraph ? 'text-primary-600' : 'text-neutral-500'}`} />
            <div>
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                Standard Memory Only
              </h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Use vector-based memory without graph relationships
              </p>
            </div>
          </div>
        </label>
      </div>
    </div>
  )
}

// Step 3: Neo4j Credentials (conditional)
function Neo4jCredentialsStep(_props: any) {
  const { register, watch, formState: { errors } } = useFormContext<MemoryFormData>()
  const enableGraph = watch('enable_graph_memory')

  // Skip this step if graph memory is disabled
  if (!enableGraph) {
    return null
  }

  return (
    <div className="space-y-6 min-h-[300px]">
      <div>
        <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          Neo4j Credentials
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400">
          Set a password for your Neo4j graph database.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Neo4j Password
          </label>
          <input
            type="password"
            {...register('neo4j_password')}
            placeholder="Enter Neo4j password"
            className="input"
          />
          {errors.neo4j_password && (
            <p className="mt-1 text-sm text-error-600 dark:text-error-400">
              {errors.neo4j_password.message}
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-500">
            Minimum 8 characters
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Confirm Password
          </label>
          <input
            type="password"
            {...register('neo4j_confirm_password')}
            placeholder="Confirm password"
            className="input"
          />
          {errors.neo4j_confirm_password && (
            <p className="mt-1 text-sm text-error-600 dark:text-error-400">
              {errors.neo4j_confirm_password.message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// Step 4: Complete
function CompleteStep({ onSubmit }: any) {
  const { watch } = useFormContext<MemoryFormData>()
  const deploymentType = watch('deployment_type')
  const enableGraph = watch('enable_graph_memory')

  return (
    <div className="space-y-6 min-h-[300px] text-center">
      <div>
        <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          Ready to Configure Memory
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400">
          Review your settings and complete setup.
        </p>
      </div>

      <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-6 text-left">
        <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
          Configuration Summary:
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Deployment:</span>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {deploymentType === 'new' ? 'New (Docker)' : 'Existing Server'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Graph Memory:</span>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {enableGraph ? 'Enabled (Neo4j)' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        className="btn-primary"
      >
        Complete Memory Setup
      </button>
    </div>
  )
}

// Wizard Navigation
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
    <div className="pt-6 border-t border-neutral-200 dark:border-neutral-700 flex justify-between">
      <button
        type="button"
        onClick={previousStep}
        disabled={isFirstStep || isSubmitting}
        className="btn-ghost flex items-center gap-2"
      >
        <ArrowLeft className="w-5 h-5" />
        Back
      </button>

      <button
        type="button"
        onClick={nextStep}
        disabled={isSubmitting || isLastStep}
        className="btn-primary flex items-center gap-2"
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

// Import for type safety
import { useFormContext } from 'react-hook-form'
