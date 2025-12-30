import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ArrowRight, ArrowLeft, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { servicesApi, settingsApi } from '../services/api'
import { useWizard } from '../contexts/WizardContext'

export default function QuickstartWizardPage() {
  const navigate = useNavigate()
  const { markPhaseComplete } = useWizard()

  const [loading, setLoading] = useState(true)
  const [services, setServices] = useState<any[]>([])
  const [formData, setFormData] = useState<Record<string, Record<string, any>>>({})
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null)

  useEffect(() => {
    loadQuickstartServices()
  }, [])

  const loadQuickstartServices = async () => {
    try {
      const [servicesResponse, configResponse] = await Promise.all([
        servicesApi.getQuickstart(),
        settingsApi.getConfig()  // Load merged OmegaConf config
      ])

      const quickstartServices = servicesResponse.data
      const mergedConfig = configResponse.data

      // Initialize form data from OmegaConf merged config
      const initialData: Record<string, Record<string, any>> = {}

      quickstartServices.forEach((service: any) => {
        initialData[service.service_id] = {}

        service.config_schema.forEach((field: any) => {
          // Set default from schema
          if (field.default !== null && field.default !== undefined) {
            initialData[service.service_id][field.key] = field.default
          }

          // Load from merged config (handles interpolation automatically!)
          if (field.env_var) {
            // Shared key from api_keys namespace
            const keyName = field.env_var.toLowerCase()
            const value = mergedConfig?.api_keys?.[keyName]
            // Keep masked values (***xxxx) to show "Configured" indicator
            // User can still override by typing a new value
            if (value) {
              initialData[service.service_id][field.key] = value
            }
          } else {
            // Service preference
            const value = mergedConfig?.service_preferences?.[service.service_id]?.[field.key]
            if (value !== undefined && value !== null) {
              initialData[service.service_id][field.key] = value
            }
          }
        })
      })

      console.log('📥 Loaded wizard data:', initialData)

      setServices(quickstartServices)
      setFormData(initialData)
      setLoading(false)
    } catch (error) {
      console.error('Failed to load quickstart services:', error)
      setMessage({ type: 'error', text: 'Failed to load wizard configuration' })
      setLoading(false)
    }
  }

  const toggleSecretVisibility = (fieldId: string) => {
    setShowSecrets(prev => ({ ...prev, [fieldId]: !prev[fieldId] }))
  }

  const handleFieldChange = (serviceId: string, fieldKey: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        [fieldKey]: value
      }
    }))
  }

  // Filter to only required fields and deduplicate by env_var
  const getFilteredServices = () => {
    const seenEnvVars = new Set<string>()
    const filtered: any[] = []

    services.forEach(service => {
      const requiredFields = service.config_schema.filter((f: any) => {
        if (!f.required) return false

        // Deduplicate by env_var (shared credentials)
        if (f.env_var) {
          if (seenEnvVars.has(f.env_var)) {
            return false  // Already asked in previous service
          }
          seenEnvVars.add(f.env_var)
        }

        return true
      })

      if (requiredFields.length > 0) {
        filtered.push({
          ...service,
          config_schema: requiredFields
        })
      }
    })

    return filtered
  }

  const validateForm = (servicesToValidate: any[]): boolean => {
    for (const service of servicesToValidate) {
      for (const field of service.config_schema) {
        if (field.required) {
          const value = formData[service.service_id]?.[field.key]
          if (!value || (typeof value === 'string' && value.trim() === '')) {
            setMessage({
              type: 'error',
              text: `${service.name}: ${field.label} is required`
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

    setSaving(true)
    setMessage({ type: 'info', text: 'Saving configuration...' })

    try {
      // Separate API keys (shared) from service preferences (per-service)
      const apiKeys: any = {}
      const servicePreferences: any = {}

      for (const service of services) {
        const serviceConfig = formData[service.service_id]
        if (!serviceConfig) continue

        service.config_schema.forEach((field: any) => {
          const value = serviceConfig[field.key]

          // Skip undefined/null (but allow false and empty string)
          if (value === undefined || value === null) return

          // Skip masked values - they're already configured on the backend
          if (typeof value === 'string' && value.startsWith('***')) return

          if (field.env_var) {
            // Shared credential → api_keys namespace ONLY
            const keyName = field.env_var.toLowerCase()
            apiKeys[keyName] = value
            // DO NOT add to servicePreferences!
          } else {
            // Service-specific preference (no env_var = not shared)
            if (!servicePreferences[service.service_id]) {
              servicePreferences[service.service_id] = {}
            }
            servicePreferences[service.service_id][field.key] = value
          }
        })
      }

      // Build update payload for OmegaConf
      const updates: any = {}

      if (Object.keys(apiKeys).length > 0) {
        updates.api_keys = apiKeys
      }

      if (Object.keys(servicePreferences).length > 0) {
        updates.service_preferences = servicePreferences
      }

      console.log('💾 Saving to OmegaConf paths:', updates)

      // Save via OmegaConf settings endpoint
      await settingsApi.update(updates)

      setMessage({ type: 'success', text: 'Configuration saved successfully!' })
      markPhaseComplete('quickstart')

      setTimeout(() => {
        navigate('/')
      }, 1500)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to save configuration'
      })
      setSaving(false)
    }
  }

  const renderField = (service: any, field: any) => {
    const value = formData[service.service_id]?.[field.key] || ''

    switch (field.type) {
      case 'secret':
        const fieldId = `${service.service_id}.${field.key}`
        const isVisible = showSecrets[fieldId] || false
        const hasExistingValue = value && value.length > 0

        return (
          <div key={fieldId} className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {field.label} {field.required && <span className="text-error-600">*</span>}
                {hasExistingValue && (
                  <span className="ml-2 text-xs text-success-600">✓ Configured</span>
                )}
              </label>
              {field.link && (
                <a
                  href={field.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:underline flex items-center gap-1"
                >
                  Get API Key ↗
                </a>
              )}
            </div>
            <div className="relative">
              <input
                type={isVisible ? 'text' : 'password'}
                value={value}
                onChange={(e) => handleFieldChange(service.service_id, field.key, e.target.value)}
                placeholder={hasExistingValue ? '●●●●●●●●' : `Enter ${field.label}`}
                className="input pr-10"
                required={field.required}
              />
              {hasExistingValue && (
                <button
                  type="button"
                  onClick={() => toggleSecretVisibility(fieldId)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                >
                  {isVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              )}
            </div>
            {field.description && (
              <p className="text-xs text-neutral-500">{field.description}</p>
            )}
          </div>
        )

      case 'string':
        if (field.options && field.options.length > 0) {
          return (
            <div key={`${service.service_id}.${field.key}`} className="space-y-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {field.label}
              </label>
              <select
                value={value}
                onChange={(e) => handleFieldChange(service.service_id, field.key, e.target.value)}
                className="input"
              >
                {field.options.map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {field.description && (
                <p className="text-xs text-neutral-500">{field.description}</p>
              )}
            </div>
          )
        }
        return (
          <div key={`${service.service_id}.${field.key}`} className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {field.label}
              </label>
              {field.link && (
                <a
                  href={field.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:underline"
                >
                  Learn More ↗
                </a>
              )}
            </div>
            <input
              type="text"
              value={value}
              onChange={(e) => handleFieldChange(service.service_id, field.key, e.target.value)}
              placeholder={field.default || ''}
              className="input"
            />
            {field.description && (
              <p className="text-xs text-neutral-500">{field.description}</p>
            )}
          </div>
        )

      case 'boolean':
        return (
          <div key={`${service.service_id}.${field.key}`} className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={`${service.service_id}.${field.key}`}
              checked={value === true}
              onChange={(e) => handleFieldChange(service.service_id, field.key, e.target.checked)}
              className="rounded"
            />
            <label htmlFor={`${service.service_id}.${field.key}`} className="text-sm text-neutral-700 dark:text-neutral-300">
              {field.label}
            </label>
          </div>
        )

      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  // Use the filtered services for rendering
  const servicesWithRequiredFields = getFilteredServices()

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center space-x-2 mb-4">
          <Sparkles className="h-10 w-10 text-primary-600 dark:text-primary-400" />
          <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100">Quickstart Setup</h1>
        </div>
        <p className="text-lg text-neutral-600 dark:text-neutral-400">
          Get up and running in minutes with cloud services
        </p>
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

      {/* Required Fields */}
      {servicesWithRequiredFields.length > 0 ? (
        <div className="card p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              API Keys Required
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Enter your API keys to enable AI features
            </p>
          </div>

          {servicesWithRequiredFields.map(service => (
            <div key={service.service_id} className="space-y-4">
              <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
                {service.name}
              </h3>
              {service.config_schema.map((field: any) => renderField(service, field))}
            </div>
          ))}

          <button
            onClick={handleComplete}
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center space-x-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span>Complete Setup</span>
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="card p-6 text-center space-y-4">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            All Set!
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400">
            No additional configuration needed. Default services are ready to use.
          </p>
          <div className="flex justify-between w-full">
            <button
              onClick={() => navigate('/wizard/start')}
              className="btn-ghost flex items-center gap-2"
            >
              <ArrowLeft className="h-5 w-5" />
              Change Mode
            </button>
            
            <button
              onClick={() => navigate('/')}
              className="btn-primary"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
