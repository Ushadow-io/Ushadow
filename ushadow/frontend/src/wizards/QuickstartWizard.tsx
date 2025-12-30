import { useState, useEffect } from 'react'
import { useForm, FormProvider, useFormContext } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, Eye, EyeOff, CheckCircle, RefreshCw } from 'lucide-react'

import { servicesApi, settingsApi, dockerApi } from '../services/api'
import { ServiceStatusCard, type ServiceStatus } from '../components/services'
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

interface ServiceField {
  key: string
  type: 'secret' | 'string' | 'boolean' | 'number'
  label: string
  description?: string
  required: boolean
  default?: any
  link?: string
  env_var?: string
  options?: string[]
}

interface QuickstartService {
  service_id: string
  name: string
  description: string
  config_schema: ServiceField[]
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
  const [services, setServices] = useState<QuickstartService[]>([])
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
      const [servicesResponse, configResponse] = await Promise.all([
        servicesApi.getQuickstart(),
        settingsApi.getConfig(),
      ])

      const quickstartServices = servicesResponse.data
      const mergedConfig = configResponse.data

      // Initialize form data from OmegaConf merged config
      const initialData: FormData = {}

      quickstartServices.forEach((service: QuickstartService) => {
        initialData[service.service_id] = {}

        service.config_schema.forEach((field) => {
          // Set default value
          if (field.default !== null && field.default !== undefined) {
            initialData[service.service_id][field.key] = field.default
          }

          // Check for existing value in merged config
          if (field.env_var) {
            const keyName = field.env_var.toLowerCase()
            const value = mergedConfig?.api_keys?.[keyName]
            if (value) {
              initialData[service.service_id][field.key] = value
            }
          } else {
            const value = mergedConfig?.service_preferences?.[service.service_id]?.[field.key]
            if (value !== undefined && value !== null) {
              initialData[service.service_id][field.key] = value
            }
          }
        })
      })

      setServices(quickstartServices)
      methods.reset(initialData)
      setLoading(false)
    } catch (error) {
      console.error('Failed to load quickstart services:', error)
      setMessage({ type: 'error', text: 'Failed to load wizard configuration' })
      setLoading(false)
    }
  }

  // Filter to only required fields and deduplicate by env_var
  const getFilteredServices = (): QuickstartService[] => {
    const seenEnvVars = new Set<string>()
    const filtered: QuickstartService[] = []

    services.forEach((service) => {
      const requiredFields = service.config_schema.filter((f) => {
        if (!f.required) return false

        if (f.env_var) {
          if (seenEnvVars.has(f.env_var)) return false
          seenEnvVars.add(f.env_var)
        }

        return true
      })

      if (requiredFields.length > 0) {
        filtered.push({
          ...service,
          config_schema: requiredFields,
        })
      }
    })

    return filtered
  }

  const validateApiKeys = async (): Promise<boolean> => {
    const servicesToValidate = getFilteredServices()
    const data = methods.getValues()

    for (const service of servicesToValidate) {
      for (const field of service.config_schema) {
        if (field.required) {
          const value = data[service.service_id]?.[field.key]
          if (!value || (typeof value === 'string' && value.trim() === '')) {
            setMessage({
              type: 'error',
              text: `${service.name}: ${field.label} is required`,
            })
            return false
          }
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
      <div id="quickstart-loading" className="flex items-center justify-center min-h-[400px]">
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
      <div id="quickstart-step-api-keys" className="text-center space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">All Set!</h2>
        <p className="text-gray-600 dark:text-gray-400">
          No additional API keys needed. Click next to start services.
        </p>
      </div>
    )
  }

  return (
    <div id="quickstart-step-api-keys" className="space-y-6">
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
    <div id="quickstart-step-start-services" className="space-y-6">
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
          id="quickstart-refresh-status"
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
    <div id="quickstart-step-complete" className="text-center space-y-6">
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
    <div id={`quickstart-service-${service.service_id}`} className="space-y-4">
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
  const { register, watch } = useFormContext<FormData>()
  const [showSecret, setShowSecret] = useState(false)

  const fieldPath = `${serviceId}.${field.key}` as const
  const value = watch(fieldPath as any) || ''
  const hasExistingValue = value && String(value).length > 0

  switch (field.type) {
    case 'secret':
      return (
        <div id={`quickstart-field-${serviceId}-${field.key}`} className="space-y-2">
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
          <div className="relative">
            <input
              id={`quickstart-${serviceId}-${field.key}`}
              type={showSecret ? 'text' : 'password'}
              {...register(fieldPath as any)}
              placeholder={hasExistingValue ? '●●●●●●●●' : `Enter ${field.label}`}
              className="input pr-10"
            />
            {hasExistingValue && (
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showSecret ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            )}
          </div>
          {field.description && <p className="text-xs text-gray-500">{field.description}</p>}
        </div>
      )

    case 'string':
      if (field.options && field.options.length > 0) {
        return (
          <div id={`quickstart-field-${serviceId}-${field.key}`} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {field.label}
            </label>
            <select
              id={`quickstart-${serviceId}-${field.key}`}
              {...register(fieldPath as any)}
              className="input"
            >
              {field.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {field.description && <p className="text-xs text-gray-500">{field.description}</p>}
          </div>
        )
      }
      return (
        <div id={`quickstart-field-${serviceId}-${field.key}`} className="space-y-2">
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
          <input
            id={`quickstart-${serviceId}-${field.key}`}
            type="text"
            {...register(fieldPath as any)}
            placeholder={field.default || ''}
            className="input"
          />
          {field.description && <p className="text-xs text-gray-500">{field.description}</p>}
        </div>
      )

    case 'boolean':
      return (
        <div id={`quickstart-field-${serviceId}-${field.key}`} className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={`quickstart-${serviceId}-${field.key}`}
            {...register(fieldPath as any)}
            className="rounded"
          />
          <label
            htmlFor={`quickstart-${serviceId}-${field.key}`}
            className="text-sm text-gray-700 dark:text-gray-300"
          >
            {field.label}
          </label>
        </div>
      )

    default:
      return null
  }
}
