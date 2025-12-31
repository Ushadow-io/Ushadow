import { useState, useEffect } from 'react'
import { useForm, FormProvider, useFormContext, Controller } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, CheckCircle, RefreshCw } from 'lucide-react'
// Note: Eye/EyeOff icons removed - now handled by SecretInput component

import { composeServicesApi, settingsApi, dockerApi, type IncompleteEnvVar } from '../services/api'
import { ServiceStatusCard, type ServiceStatus } from '../components/services'
import { SecretInput, SettingField } from '../components/settings'
import { useWizard } from '../contexts/WizardContext'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage } from '../components/wizard'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'

/**
 * QuickstartWizard - Multi-step setup for cloud services.
 *
 * Step 1: Configure API keys for cloud services
 * Step 2: Start core services (OpenMemory + Chronicle)
 * Step 3: Complete - ready to use web client
 */

// Step definitions
const STEPS: WizardStep[] = [
  { id: 'api_keys', label: 'API Keys' },
  { id: 'start_services', label: 'Start' },
  { id: 'complete', label: 'Done' },
]

interface EnvVarField {
  name: string
  type: 'secret' | 'url' | 'string'
  label: string
  has_default: boolean
  default_value?: string
  suggestions: Array<{
    path: string
    label: string
    has_value: boolean
    value?: string
  }>
}

interface ServiceEnvGroup {
  service_id: string
  service_name: string
  env_vars: EnvVarField[]
}

type FormData = Record<string, Record<string, any>>

// Container status for service cards
interface ContainerInfo {
  name: string
  displayName: string
  status: 'unknown' | 'stopped' | 'starting' | 'running' | 'error'
  error?: string
}

export default function QuickstartWizard() {
  const navigate = useNavigate()
  const { markPhaseComplete, updateServiceStatus } = useWizard()
  const wizard = useWizardSteps(STEPS)

  const [loading, setLoading] = useState(true)
  const [serviceGroups, setServiceGroups] = useState<ServiceEnvGroup[]>([])
  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Container states for service cards
  const [containers, setContainers] = useState<ContainerInfo[]>([
    { name: 'openmemory', displayName: 'OpenMemory', status: 'unknown' },
    { name: 'chronicle-backend', displayName: 'Chronicle', status: 'unknown' },
  ])

  const methods = useForm<FormData>({
    defaultValues: {},
    mode: 'onChange',
  })

  useEffect(() => {
    loadQuickstartServices()
  }, [])

  // Check container status when entering start_services step
  useEffect(() => {
    if (wizard.currentStep.id === 'start_services') {
      checkContainerStatuses()
    }
  }, [wizard.currentStep.id])

  const loadQuickstartServices = async () => {
    try {
      const quickstartResponse = await composeServicesApi.getQuickstart()
      const { incomplete_env_vars } = quickstartResponse.data

      // Group incomplete env vars by service
      const groupedByService = new Map<string, ServiceEnvGroup>()

      incomplete_env_vars.forEach((envVar: IncompleteEnvVar) => {
        if (!groupedByService.has(envVar.service_id)) {
          groupedByService.set(envVar.service_id, {
            service_id: envVar.service_id,
            service_name: envVar.service_name,
            env_vars: [],
          })
        }

        const group = groupedByService.get(envVar.service_id)!
        group.env_vars.push({
          name: envVar.name,
          type: envVar.setting_type,
          label: envVar.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          has_default: envVar.has_default,
          default_value: envVar.default_value,
          suggestions: envVar.suggestions.map((s: any) => ({
            path: s.path,
            label: s.label,
            has_value: s.has_value,
            value: s.value,
          })),
        })
      })

      const groups = Array.from(groupedByService.values())

      // Initialize form data - key by env var name for simplicity
      const initialData: FormData = { env_vars: {} }
      incomplete_env_vars.forEach((envVar: IncompleteEnvVar) => {
        // Pre-fill with default if available
        if (envVar.default_value) {
          initialData.env_vars[envVar.name] = envVar.default_value
        }
      })

      setServiceGroups(groups)
      methods.reset(initialData)
      setLoading(false)
    } catch (error) {
      console.error('Failed to load quickstart config:', error)
      setMessage({ type: 'error', text: 'Failed to load wizard configuration' })
      setLoading(false)
    }
  }

  // Get all env vars that need configuration (already filtered by backend)
  const getAllEnvVars = (): EnvVarField[] => {
    return serviceGroups.flatMap((group) => group.env_vars)
  }

  const validateEnvVars = async (): Promise<boolean> => {
    const envVars = getAllEnvVars()
    const data = methods.getValues()

    for (const envVar of envVars) {
      // All env vars from quickstart are required (filtered by backend)
      if (!envVar.has_default) {
        const value = data.env_vars?.[envVar.name]
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          setMessage({
            type: 'error',
            text: `${envVar.label} is required`,
          })
          return false
        }
      }
    }
    return true
  }

  const saveApiKeys = async (): Promise<boolean> => {
    setIsSubmitting(true)
    setMessage({ type: 'info', text: 'Saving configuration...' })

    try {
      const data = methods.getValues()
      const apiKeys: Record<string, string> = {}
      const servicePreferences: Record<string, Record<string, any>> = {}

      for (const service of services) {
        const serviceConfig = data[service.service_id]
        if (!serviceConfig) continue

        service.config_schema.forEach((field) => {
          const value = serviceConfig[field.key]

          if (value === undefined || value === null) return
          if (typeof value === 'string' && value.startsWith('***')) return // Skip masked values

          if (field.env_var) {
            const keyName = field.env_var.toLowerCase()
            apiKeys[keyName] = value
          } else {
            if (!servicePreferences[service.service_id]) {
              servicePreferences[service.service_id] = {}
            }
            servicePreferences[service.service_id][field.key] = value
          }
        })
      }

      const updates: Record<string, any> = {}
      if (Object.keys(apiKeys).length > 0) {
        updates.api_keys = apiKeys
      }
      if (Object.keys(servicePreferences).length > 0) {
        updates.service_preferences = servicePreferences
      }

      await settingsApi.update(updates)
      updateServiceStatus('apiKeys', true)
      setMessage({ type: 'success', text: 'Configuration saved!' })
      return true
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save configuration') })
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  // Container management
  const checkContainerStatuses = async () => {
    try {
      const response = await dockerApi.listServices()
      const servicesList = response.data

      setContainers((prev) =>
        prev.map((container) => {
          const serviceInfo = servicesList.find(
            (s: any) => s.name === container.name || s.name.includes(container.name)
          )

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

    try {
      await dockerApi.startService(containerName)

      // Poll for status
      let attempts = 0
      const maxAttempts = 10

      const pollStatus = async () => {
        attempts++
        try {
          const response = await dockerApi.getServiceInfo(containerName)
          const isRunning = response.data.status === 'running'

          if (isRunning) {
            setContainers((prev) =>
              prev.map((c) => (c.name === containerName ? { ...c, status: 'running' } : c))
            )

            // Update wizard context
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
            setContainers((prev) =>
              prev.map((c) =>
                c.name === containerName
                  ? { ...c, status: 'error', error: 'Timeout waiting for container to start' }
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
      setContainers((prev) =>
        prev.map((c) =>
          c.name === containerName
            ? { ...c, status: 'error', error: getErrorMessage(error, 'Failed to start') }
            : c
        )
      )
      setMessage({ type: 'error', text: getErrorMessage(error, `Failed to start ${containerName}`) })
    }
  }

  const allContainersRunning = containers.every((c) => c.status === 'running')

  // Navigation handlers
  const handleNext = async () => {
    setMessage(null)

    if (wizard.currentStep.id === 'api_keys') {
      // Validate and save API keys
      const isValid = await validateApiKeys()
      if (!isValid) return

      const saved = await saveApiKeys()
      if (!saved) return

      wizard.next()
    } else if (wizard.currentStep.id === 'start_services') {
      // Check all containers are running before proceeding
      if (!allContainersRunning) {
        setMessage({ type: 'error', text: 'Please start all services before continuing' })
        return
      }

      markPhaseComplete('quickstart')
      wizard.next()
    } else if (wizard.currentStep.id === 'complete') {
      // Navigate to dashboard
      navigate('/')
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
        return allContainersRunning
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

  const servicesWithRequiredFields = getFilteredServices()

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
      onNext={handleNext}
      nextDisabled={!canProceed() && wizard.currentStep.id === 'start_services'}
      nextLoading={isSubmitting}
      message={message}
    >
      <FormProvider {...methods}>
        {/* Step 1: API Keys */}
        {wizard.currentStep.id === 'api_keys' && (
          <ApiKeysStep services={servicesWithRequiredFields} />
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
        {wizard.currentStep.id === 'complete' && <CompleteStep />}
      </FormProvider>
    </WizardShell>
  )
}

// Step 1: API Keys
function ApiKeysStep({ services }: { services: QuickstartService[] }) {
  if (services.length === 0) {
    return (
      <div data-testid="quickstart-step-api-keys" className="text-center space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">All Set!</h2>
        <p className="text-gray-600 dark:text-gray-400">
          No additional API keys needed. Click next to start services.
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

      {services.map((service) => (
        <ServiceFieldGroup key={service.service_id} service={service} />
      ))}
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

// Step 3: Complete
function CompleteStep() {
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
    </div>
  )
}

// Service field group component
function ServiceFieldGroup({ service }: { service: QuickstartService }) {
  return (
    <div data-testid={`quickstart-service-${service.service_id}`} className="space-y-4">
      <h3 className="font-medium text-gray-900 dark:text-white">{service.name}</h3>
      {service.config_schema.map((field) => (
        <DynamicField
          key={`${service.service_id}.${field.key}`}
          serviceId={service.service_id}
          field={field}
        />
      ))}
    </div>
  )
}

// Dynamic field renderer
function DynamicField({ serviceId, field }: { serviceId: string; field: ServiceField }) {
  const { control, watch } = useFormContext<FormData>()

  const fieldPath = `${serviceId}.${field.key}` as const
  const fieldId = `quickstart-${serviceId}-${field.key}`
  const value = watch(fieldPath as any) || ''
  const hasExistingValue = value && String(value).length > 0

  switch (field.type) {
    case 'secret':
      return (
        <div data-testid={`quickstart-field-${serviceId}-${field.key}`} className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {field.label} {field.required && <span className="text-red-600">*</span>}
              {hasExistingValue && (
                <span className="ml-2 text-xs text-green-600">✓ Configured</span>
              )}
            </label>
            {field.link && (
              <a
                href={field.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-600 hover:underline"
              >
                Get API Key
              </a>
            )}
          </div>
          <Controller
            name={fieldPath as any}
            control={control}
            render={({ field: controllerField }) => (
              <SecretInput
                id={fieldId}
                name={controllerField.name}
                value={controllerField.value || ''}
                onChange={controllerField.onChange}
                placeholder={hasExistingValue ? '●●●●●●●●' : `Enter ${field.label}`}
              />
            )}
          />
          {field.description && <p className="text-xs text-gray-500">{field.description}</p>}
        </div>
      )

    case 'string':
      if (field.options && field.options.length > 0) {
        return (
          <div data-testid={`quickstart-field-${serviceId}-${field.key}`} className="space-y-2">
            <Controller
              name={fieldPath as any}
              control={control}
              render={({ field: controllerField }) => (
                <SettingField
                  id={fieldId}
                  name={controllerField.name}
                  label={field.label}
                  type="select"
                  value={controllerField.value || ''}
                  onChange={controllerField.onChange}
                  options={field.options!.map(opt => ({ value: opt, label: opt }))}
                  description={field.description}
                />
              )}
            />
          </div>
        )
      }
      return (
        <div data-testid={`quickstart-field-${serviceId}-${field.key}`} className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {field.label}
            </label>
            {field.link && (
              <a
                href={field.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-600 hover:underline"
              >
                Learn More
              </a>
            )}
          </div>
          <Controller
            name={fieldPath as any}
            control={control}
            render={({ field: controllerField }) => (
              <SettingField
                id={fieldId}
                name={controllerField.name}
                label=""
                type="text"
                value={controllerField.value || ''}
                onChange={(v) => controllerField.onChange(v)}
                placeholder={field.default || ''}
              />
            )}
          />
          {field.description && <p className="text-xs text-gray-500">{field.description}</p>}
        </div>
      )

    case 'boolean':
      return (
        <div data-testid={`quickstart-field-${serviceId}-${field.key}`} className="flex items-center space-x-2">
          <Controller
            name={fieldPath as any}
            control={control}
            render={({ field: controllerField }) => (
              <SettingField
                id={fieldId}
                name={controllerField.name}
                label={field.label}
                type="toggle"
                value={controllerField.value || false}
                onChange={controllerField.onChange}
              />
            )}
          />
        </div>
      )

    default:
      return null
  }
}
