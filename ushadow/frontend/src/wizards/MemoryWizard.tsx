import { Database } from 'lucide-react'
import { useState } from 'react'
import { useForm, FormProvider, useFormContext, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'

import { settingsApi } from '../services/api'
import { useWizard } from '../contexts/WizardContext'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage } from '../components/wizard'
import { SecretInput } from '../components/settings'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'

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

export default function MemoryWizard() {
  const navigate = useNavigate()
  const { wizardState, markPhaseComplete } = useWizard()
  const [message, setMessage] = useState<WizardMessage | null>(null)
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
      // Save memory configuration to settings
      await settingsApi.update({
        service_preferences: {
          openmemory: {
            deployment_type: data.deployment_type,
            server_url: data.server_url,
            enable_graph: data.enable_graph_memory,
            neo4j_password: data.enable_graph_memory ? data.neo4j_password : undefined,
          },
        },
      })

      showMessage('success', 'Memory configured successfully!')
      markPhaseComplete('memory')

      setTimeout(() => {
        navigate('/wizard/chronicle')
      }, 1500)
    } catch (error) {
      showMessage('error', getErrorMessage(error, 'Failed to configure memory'))
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

  // Build subtitle based on wizard mode
  const getSubtitle = () => {
    let subtitle = 'Configure OpenMemory for intelligent conversation memory'
    if (wizardState.mode) {
      const modeLabel = wizardState.mode === 'quickstart' ? 'Quickstart' : wizardState.mode === 'local' ? 'Local' : 'Custom'
      subtitle += ` • Mode: ${modeLabel}`
    }
    return subtitle
  }

  return (
    <WizardShell
      wizardId="memory"
      title="Memory Setup"
      subtitle={getSubtitle()}
      icon={Database}
      progress={wizard.progress}
      steps={activeSteps}
      currentStepId={wizard.currentStep.id}
      onStepClick={handleStepClick}
      isFirstStep={wizard.isFirst}
      onBack={handleBack}
      onNext={handleNext}
      nextLoading={isSubmitting}
      message={message}
    >
      <FormProvider {...methods}>
        {wizard.currentStep.id === 'deployment' && <DeploymentStep />}
        {wizard.currentStep.id === 'graph' && <GraphConfigStep />}
        {wizard.currentStep.id === 'neo4j' && <Neo4jCredentialsStep />}
        {wizard.currentStep.id === 'complete' && <CompleteStep />}
      </FormProvider>
    </WizardShell>
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
    <div data-testid="memory-step-deployment" className="space-y-6">
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
          data-testid="memory-deployment-new"
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
            data-testid="memory-deployment-existing"
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
            data-testid="memory-server-url-input"
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
    <div data-testid="memory-step-graph" className="space-y-6">
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
          data-testid="memory-graph-enabled"
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
          data-testid="memory-graph-disabled"
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
  const { control, formState: { errors } } = useFormContext<MemoryFormData>()

  return (
    <div data-testid="memory-step-neo4j" className="space-y-6">
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
            Neo4j Password <span className="text-red-500">*</span>
          </label>
          <Controller
            name="neo4j_password"
            control={control}
            render={({ field }) => (
              <SecretInput
                id="memory-neo4j-password"
                name={field.name}
                value={field.value || ''}
                onChange={field.onChange}
                placeholder="Enter Neo4j password"
                error={errors.neo4j_password?.message}
                showIcon={false}
              />
            )}
          />
          <p className="mt-1 text-xs text-gray-500">
            Minimum 8 characters
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Confirm Password <span className="text-red-500">*</span>
          </label>
          <Controller
            name="neo4j_confirm_password"
            control={control}
            render={({ field }) => (
              <SecretInput
                id="memory-neo4j-confirm-password"
                name={field.name}
                value={field.value || ''}
                onChange={field.onChange}
                placeholder="Confirm password"
                error={errors.neo4j_confirm_password?.message}
                showIcon={false}
              />
            )}
          />
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
    <div data-testid="memory-step-complete" className="space-y-6 text-center">
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
