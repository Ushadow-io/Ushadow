import { useState, useEffect } from 'react'
import { useFormContext, Controller } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, CheckCircle, RefreshCw, ExternalLink } from 'lucide-react'

import { composeServicesApi, dockerApi, type QuickstartConfig, type CapabilityRequirement, type MissingKey, type ServiceInfo } from '../services/api'
import { ServiceStatusCard, type ServiceStatus } from '../components/services'
import { SecretInput, SettingField } from '../components/settings'
import { useWizard } from '../contexts/WizardContext'
import { WizardFormProvider, useWizardForm } from '../contexts/WizardFormContext'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage } from '../components/wizard'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'

/**
 * QuickstartWizard - Multi-step setup for cloud services.
 *
 * Step 1: Configure API keys for cloud providers (OpenAI, Deepgram)
 * Step 2: Start core services (OpenMemory + Chronicle)
 * Step 3: Complete - ready to use web client
 */

// Step definitions
const STEPS: WizardStep[] = [
  { id: 'api_keys', label: 'API Keys' },
  { id: 'start_services', label: 'Start' },
  { id: 'complete', label: 'Done' },
]

// Container status for service cards
interface ContainerInfo {
  name: string
  displayName: string
  status: 'unknown' | 'stopped' | 'starting' | 'running' | 'error'
  error?: string
}

/**
 * QuickstartWizard wrapper - provides the WizardFormContext
 */
export default function QuickstartWizard() {
  return (
    <WizardFormProvider>
      <QuickstartWizardContent />
    </WizardFormProvider>
  )
}

/**
 * QuickstartWizard content - uses WizardFormContext for form handling
 */
function QuickstartWizardContent() {
  const navigate = useNavigate()
  const { markPhaseComplete, updateServiceStatus, updateApiKeysStatus } = useWizard()
  const { getValue, saveToApi } = useWizardForm()
  const wizard = useWizardSteps(STEPS)

  const [loading, setLoading] = useState(true)
  const [quickstartConfig, setQuickstartConfig] = useState<QuickstartConfig | null>(null)
  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Container states - built dynamically from API response
  const [containers, setContainers] = useState<ContainerInfo[]>([])

  useEffect(() => {
    loadQuickstartConfig()
  }, [])

  // Check container status when entering start_services step
  useEffect(() => {
    if (wizard.currentStep.id === 'start_services') {
      checkContainerStatuses()
    }
  }, [wizard.currentStep.id])

  const loadQuickstartConfig = async () => {
    try {
      const response = await composeServicesApi.getQuickstart()
      setQuickstartConfig(response.data)

      // Build containers state from services in the API response
      const serviceContainers = response.data.services.map((service: ServiceInfo) => ({
        name: service.name,
        displayName: service.display_name,
        status: 'unknown' as const,
      }))
      setContainers(serviceContainers)

      setLoading(false)
    } catch (error) {
      console.error('Failed to load quickstart config:', error)
      setMessage({ type: 'error', text: 'Failed to load wizard configuration' })
      setLoading(false)
    }
  }

  // Get capabilities that need configuration (have missing keys)
  const getCapabilitiesNeedingSetup = (): CapabilityRequirement[] => {
    if (!quickstartConfig) return []
    return quickstartConfig.required_capabilities.filter(cap => !cap.configured && cap.missing_keys.length > 0)
  }

  const validateKeys = async (): Promise<boolean> => {
    const capabilities = getCapabilitiesNeedingSetup()

    // Collect all required settings paths
    const requiredPaths: { path: string; label: string }[] = []
    for (const cap of capabilities) {
      for (const key of cap.missing_keys) {
        if (key.settings_path) {
          requiredPaths.push({ path: key.settings_path, label: key.label })
        }
      }
    }

    // Validate using context helper
    for (const { path, label } of requiredPaths) {
      const value = getValue(path)
      if (!value || value.trim() === '') {
        setMessage({ type: 'error', text: `${label} is required` })
        return false
      }
    }
    return true
  }

  const saveKeys = async (): Promise<boolean> => {
    setIsSubmitting(true)
    setMessage({ type: 'info', text: 'Saving configuration...' })

    // Use context's saveToApi which handles flattening
    const result = await saveToApi(composeServicesApi.saveQuickstart)

    if (result.success) {
      updateApiKeysStatus(true)
      setMessage({ type: 'success', text: 'Configuration saved!' })
      setIsSubmitting(false)
      return true
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to save configuration' })
      setIsSubmitting(false)
      return false
    }
  }

  // Container management
  const checkContainerStatuses = async () => {
    try {
      const response = await dockerApi.listServices()
      const servicesList = response.data

      console.log('[QuickstartWizard] Docker services from API:', servicesList.map((s: any) => ({ name: s.name, status: s.status })))
      console.log('[QuickstartWizard] Containers to check:', containers.map(c => c.name))

      setContainers((prev) =>
        prev.map((container) => {
          // Match by exact name only - avoid false positives from partial matches
          const serviceInfo = servicesList.find(
            (s: any) => s.name === container.name
          )

          console.log(`[QuickstartWizard] Matching ${container.name}:`, serviceInfo ? { name: serviceInfo.name, status: serviceInfo.status } : 'NOT FOUND')

          if (serviceInfo) {
            const isRunning = serviceInfo.status === 'running'
            return {
              ...container,
              status: isRunning ? 'running' : 'stopped',
            }
          }
          return { ...container, status: 'stopped' }
        })
      )
    } catch (error) {
      console.error('Failed to check container statuses:', error)
    }
  }

  const startContainer = async (containerName: string) => {
    setContainers((prev) =>
      prev.map((c) => (c.name === containerName ? { ...c, status: 'starting' } : c))
    )

    // Get display name for messages
    const container = containers.find((c) => c.name === containerName)
    const displayName = container?.displayName || containerName

    try {
      await dockerApi.startService(containerName)

      // Poll for status - longer timeout for slower containers
      let attempts = 0
      const maxAttempts = 30 // 60 seconds total

      const pollStatus = async () => {
        attempts++
        try {
          const response = await dockerApi.getServiceInfo(containerName)
          console.log(`[QuickstartWizard] Poll ${containerName} attempt ${attempts}:`, response.data)
          const isRunning = response.data.status === 'running'

          if (isRunning) {
            setContainers((prev) =>
              prev.map((c) => (c.name === containerName ? { ...c, status: 'running' } : c))
            )

            // Update wizard context with service status (uses service name directly)
            updateServiceStatus(containerName, { configured: true, running: true })

            setMessage({ type: 'success', text: `${displayName} started successfully!` })
            return
          }

          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 2000)
          } else {
            // Final check - container might be running but API was slow
            // Mark as running anyway since the start command succeeded
            setContainers((prev) =>
              prev.map((c) =>
                c.name === containerName
                  ? { ...c, status: 'running' } // Assume running after timeout
                  : c
              )
            )
            updateServiceStatus(containerName, { configured: true, running: true })
            setMessage({ type: 'info', text: `${displayName} started (status check timed out)` })
          }
        } catch (err) {
          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 2000)
          } else {
            // Even on error, assume it started since the start command succeeded
            setContainers((prev) =>
              prev.map((c) =>
                c.name === containerName ? { ...c, status: 'running' } : c
              )
            )
            updateServiceStatus(containerName, { configured: true, running: true })
            setMessage({ type: 'info', text: `${displayName} started (status check failed)` })
          }
        }
      }

      setTimeout(pollStatus, 2000)
    } catch (error) {
      setContainers((prev) =>
        prev.map((c) =>
          c.name === containerName
            ? { ...c, status: 'error', error: getErrorMessage(error, 'Failed to start') }
            : c
        )
      )
      setMessage({ type: 'error', text: getErrorMessage(error, `Failed to start ${displayName}`) })
    }
  }

  const someContainersRunning = containers.some((c) => c.status === 'running')
  const anyContainersStarting = containers.some((c) => c.status === 'starting')

  // Navigation handlers
  const handleNext = async () => {
    setMessage(null)

    if (wizard.currentStep.id === 'api_keys') {
      // Validate and save API keys
      const isValid = await validateKeys()
      if (!isValid) return

      const saved = await saveKeys()
      if (!saved) return

      wizard.next()
    } else if (wizard.currentStep.id === 'start_services') {
      // Allow proceeding if at least some services started (don't block on all)
      if (!someContainersRunning && !anyContainersStarting) {
        setMessage({ type: 'error', text: 'Please start at least one service before continuing' })
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

  const canProceed = (): boolean => {
    switch (wizard.currentStep.id) {
      case 'api_keys':
        return true // Validation happens on next click
      case 'start_services':
        // Can proceed if at least one service is running or starting
        return someContainersRunning || anyContainersStarting
      case 'complete':
        return true
      default:
        return false
    }
  }

  if (loading) {
    return (
      <div data-testid="quickstart-loading" className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  const capabilitiesNeedingSetup = getCapabilitiesNeedingSetup()

  return (
    <WizardShell
      wizardId="quickstart"
      title="Quickstart Setup"
      subtitle="Get up and running with cloud services"
      icon={Sparkles}
      progress={wizard.progress}
      steps={STEPS}
      currentStepId={wizard.currentStep.id}
      isFirstStep={wizard.isFirst}
      onBack={handleBack}
      onNext={wizard.currentStep.id === 'complete' ? undefined : handleNext}
      nextDisabled={!canProceed() && wizard.currentStep.id === 'start_services'}
      nextLoading={isSubmitting}
      message={message}
    >
      {/* Step 1: API Keys */}
      {wizard.currentStep.id === 'api_keys' && (
        <ApiKeysStep capabilities={capabilitiesNeedingSetup} />
      )}

      {/* Step 2: Start Services */}
      {wizard.currentStep.id === 'start_services' && (
        <StartServicesStep
          containers={containers}
          onStart={startContainer}
          onRefresh={checkContainerStatuses}
        />
      )}

      {/* Step 3: Complete */}
      {wizard.currentStep.id === 'complete' && (
        <CompleteStep
          onContinue={() => navigate('/wizard/tailscale')}
          onGoHome={() => navigate('/')}
        />
      )}
    </WizardShell>
  )
}

// Step 1: API Keys - now organized by capability/provider
function ApiKeysStep({ capabilities }: { capabilities: CapabilityRequirement[] }) {
  if (capabilities.length === 0) {
    return (
      <div data-testid="quickstart-step-api-keys" className="text-center space-y-4">
        <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">All Set!</h2>
        <p className="text-gray-600 dark:text-gray-400">
          All required API keys are already configured. Click next to start services.
        </p>
      </div>
    )
  }

  return (
    <div data-testid="quickstart-step-api-keys" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Configure API Keys
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Enter your API keys to enable AI features. These will be securely stored.
        </p>
      </div>

      {capabilities.map((capability) => (
        <CapabilityFieldGroup key={capability.id} capability={capability} />
      ))}
    </div>
  )
}

// Capability field group - shows provider info and missing keys
function CapabilityFieldGroup({ capability }: { capability: CapabilityRequirement }) {
  // Format capability ID for display (llm -> LLM, transcription -> Transcription)
  const capabilityLabel = capability.id === 'llm'
    ? 'LLM'
    : capability.id.charAt(0).toUpperCase() + capability.id.slice(1)

  return (
    <div
      data-testid={`quickstart-capability-${capability.id}`}
      className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">
            {capabilityLabel} Provider
          </h3>
          {capability.provider_name && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Using {capability.provider_name}
              {capability.provider_mode && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                  {capability.provider_mode}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {capability.error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm rounded">
          {capability.error}
        </div>
      )}

      <div className="space-y-3">
        {capability.missing_keys.map((key) => (
          <KeyField key={key.key} keyInfo={key} capabilityId={capability.id} />
        ))}
      </div>
    </div>
  )
}

// Individual key field
function KeyField({ keyInfo, capabilityId }: { keyInfo: MissingKey; capabilityId: string }) {
  const { control } = useFormContext()

  if (!keyInfo.settings_path) return null

  const fieldId = `quickstart-${capabilityId}-${keyInfo.key}`

  return (
    <div data-testid={`quickstart-field-${capabilityId}-${keyInfo.key}`} className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {keyInfo.label} <span className="text-red-600">*</span>
        </label>
        {keyInfo.link && (
          <a
            href={keyInfo.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-600 hover:underline flex items-center gap-1"
          >
            Get API Key <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <Controller
        name={keyInfo.settings_path}
        control={control}
        render={({ field }) => {
          if (keyInfo.type === 'secret') {
            return (
              <SecretInput
                id={fieldId}
                name={field.name as string}
                value={(field.value as string) || ''}
                onChange={field.onChange}
                placeholder={`Enter ${keyInfo.label}`}
              />
            )
          }
          return (
            <SettingField
              id={fieldId}
              name={field.name as string}
              label=""
              type={keyInfo.type === 'url' ? 'url' : 'text'}
              value={(field.value as string) || ''}
              onChange={field.onChange}
              placeholder={`Enter ${keyInfo.label}`}
            />
          )
        }}
      />
    </div>
  )
}

// Step 2: Start Services
interface StartServicesStepProps {
  containers: ContainerInfo[]
  onStart: (name: string) => void
  onRefresh: () => void
}

function StartServicesStep({ containers, onStart, onRefresh }: StartServicesStepProps) {
  return (
    <div data-testid="quickstart-step-start-services" className="space-y-6">
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
          data-testid="quickstart-refresh-status"
          onClick={onRefresh}
          className="btn-ghost p-2 rounded-lg"
          title="Refresh status"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {containers.map((container) => (
          <ServiceStatusCard
            key={container.name}
            id={container.name}
            name={container.displayName}
            status={container.status === 'unknown' ? 'stopped' : container.status as ServiceStatus}
            error={container.error}
            onStart={() => onStart(container.name)}
            idPrefix="quickstart"
          />
        ))}
      </div>

      {containers.some((c) => c.status === 'running') && (
        <div className={`p-4 rounded-lg ${
          containers.every((c) => c.status === 'running')
            ? 'bg-green-50 dark:bg-green-900/20'
            : 'bg-yellow-50 dark:bg-yellow-900/20'
        }`}>
          <p className={`text-sm flex items-center gap-2 ${
            containers.every((c) => c.status === 'running')
              ? 'text-green-800 dark:text-green-200'
              : 'text-yellow-800 dark:text-yellow-200'
          }`}>
            <CheckCircle className="w-5 h-5" />
            {containers.every((c) => c.status === 'running')
              ? 'All services are running! Click next to continue.'
              : 'Some services are running. You can continue or wait for all services.'}
          </p>
        </div>
      )}
    </div>
  )
}

// Step 3: Complete
interface CompleteStepProps {
  onContinue: () => void
  onGoHome: () => void
}

function CompleteStep({ onContinue, onGoHome }: CompleteStepProps) {
  return (
    <div data-testid="quickstart-step-complete" className="text-center space-y-6">
      <CheckCircle className="w-16 h-16 text-green-600 dark:text-green-400 mx-auto" />
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          Level 1 Complete!
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Your core services are running. You can now use the web client for recording conversations
          and storing memories.
        </p>
      </div>

      <div className="p-6 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-200 dark:border-primary-800">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">What&apos;s Next?</h3>
        <ul className="text-left text-sm text-gray-700 dark:text-gray-300 space-y-2">
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            OpenMemory is ready for storing your memories
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            Chronicle is ready for recording conversations
          </li>
          <li className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-gray-400" />
            Add mobile access with Tailscale (Level 2)
          </li>
          <li className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-gray-400" />
            Enable speaker recognition (Level 3)
          </li>
        </ul>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
        <button
          onClick={onGoHome}
          data-testid="quickstart-go-home"
          className="btn-secondary px-6 py-3"
        >
          Go to Dashboard
        </button>
        <button
          onClick={onContinue}
          data-testid="quickstart-continue-setup"
          className="btn-primary px-6 py-3 flex items-center justify-center gap-2"
        >
          Continue to Level 2
          <span className="text-xs opacity-75">(Tailscale)</span>
        </button>
      </div>
    </div>
  )
}
