import { useState, useEffect } from 'react'
import { useForm, FormProvider, useFormContext } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, Eye, EyeOff, Settings2, ChevronDown, ChevronUp } from 'lucide-react'

import { servicesApi, settingsApi, providersApi, Capability } from '../services/api'
import { useWizard } from '../contexts/WizardContext'
import { WizardShell, WizardMessage, ProviderSelector } from '../components/wizard'
import { getErrorMessage } from './wizard-utils'

/**
 * QuickstartWizard - Dynamic single-page configuration form.
 *
 * Unlike multi-step wizards, this loads fields dynamically from the backend
 * service configuration schema. Uses react-hook-form for consistency.
 */

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

export default function QuickstartWizard() {
  const navigate = useNavigate()
  const { wizardState, markPhaseComplete, selectProvider } = useWizard()

  const [loading, setLoading] = useState(true)
  const [services, setServices] = useState<QuickstartService[]>([])
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showProviderConfig, setShowProviderConfig] = useState(false)

  // In custom mode, show provider configuration by default
  const isCustomMode = wizardState.mode === 'custom'

  const methods = useForm<FormData>({
    defaultValues: {},
    mode: 'onChange',
  })

  useEffect(() => {
    loadQuickstartServices()
    loadCapabilities()
  }, [])

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

  const loadCapabilities = async () => {
    try {
      const response = await providersApi.getCapabilities()
      setCapabilities(response.data)
    } catch (error) {
      console.error('Failed to load capabilities:', error)
      // Non-fatal - wizard can still work without provider selection
    }
  }

  const handleProviderSelect = async (capability: string, providerId: string) => {
    try {
      await selectProvider(capability, providerId)
      // Reload capabilities to refresh selected state
      await loadCapabilities()
      setMessage({ type: 'success', text: `Selected ${providerId} for ${capability}` })
      setTimeout(() => setMessage(null), 2000)
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to select provider') })
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

  const validateForm = (servicesToValidate: QuickstartService[]): boolean => {
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

  const handleComplete = async () => {
    const servicesToValidate = getFilteredServices()
    if (!validateForm(servicesToValidate)) return

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

      setMessage({ type: 'success', text: 'Configuration saved successfully!' })
      markPhaseComplete('quickstart')

      setTimeout(() => navigate('/'), 1500)
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save configuration') })
      setIsSubmitting(false)
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
      subtitle="Get up and running in minutes with cloud services"
      icon={Sparkles}
      progress={100} // Single page = always 100%
      isFirstStep={true}
      onNext={servicesWithRequiredFields.length > 0 ? handleComplete : () => navigate('/')}
      nextLoading={isSubmitting}
      message={message}
    >
      <FormProvider {...methods}>
        <div id="quickstart-form" className="space-y-8">
          {/* Provider Configuration Section - Always visible in Custom mode, collapsible otherwise */}
          {capabilities.length > 0 && (
            <div id="quickstart-providers" className="space-y-4">
              {/* Collapsible header for non-custom modes */}
              {!isCustomMode ? (
                <button
                  type="button"
                  onClick={() => setShowProviderConfig(!showProviderConfig)}
                  className="flex items-center justify-between w-full p-4 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5 text-gray-500" />
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Advanced: Configure Providers
                    </span>
                  </div>
                  {showProviderConfig ? (
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  )}
                </button>
              ) : (
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Select Your Providers
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Choose which services to use for each capability
                  </p>
                </div>
              )}

              {/* Provider selectors */}
              {(isCustomMode || showProviderConfig) && (
                <div className="space-y-6 pt-2">
                  {capabilities.map((capability) => (
                    <ProviderSelector
                      key={capability.id}
                      capability={capability}
                      selectedId={capability.selected_provider}
                      onSelect={(providerId) => handleProviderSelect(capability.id, providerId)}
                      mode="cards"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* API Keys Section */}
          {servicesWithRequiredFields.length > 0 ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  API Keys Required
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Enter your API keys to enable AI features
                </p>
              </div>

              {servicesWithRequiredFields.map((service) => (
                <ServiceFieldGroup key={service.service_id} service={service} />
              ))}
            </div>
          ) : (
            <div id="quickstart-complete" className="text-center space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                All Set!
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                No additional configuration needed. Default services are ready to use.
              </p>
            </div>
          )}
        </div>
      </FormProvider>
    </WizardShell>
  )
}

// Service field group component
function ServiceFieldGroup({ service }: { service: QuickstartService }) {
  return (
    <div id={`quickstart-service-${service.service_id}`} className="space-y-4">
      <h3 className="font-medium text-gray-900 dark:text-white">
        {service.name}
      </h3>
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
          {field.description && (
            <p className="text-xs text-gray-500">{field.description}</p>
          )}
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
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {field.description && (
              <p className="text-xs text-gray-500">{field.description}</p>
            )}
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
          {field.description && (
            <p className="text-xs text-gray-500">{field.description}</p>
          )}
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
