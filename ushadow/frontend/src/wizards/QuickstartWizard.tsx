import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, Eye, EyeOff, Settings2, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react'

import { composeServicesApi, providersApi, Capability, IncompleteEnvVar, QuickstartConfig } from '../services/api'
import { useWizard } from '../contexts/WizardContext'
import { WizardShell, WizardMessage, ProviderSelector } from '../components/wizard'
import { getErrorMessage } from './wizard-utils'

/**
 * QuickstartWizard - Compose-first configuration form.
 *
 * Loads incomplete required env vars from installed services and
 * prompts user to fill them in. Uses the compose registry as source of truth.
 */

export default function QuickstartWizard() {
  const navigate = useNavigate()
  const { wizardState, markPhaseComplete, selectProvider } = useWizard()

  const [loading, setLoading] = useState(true)
  const [quickstartConfig, setQuickstartConfig] = useState<QuickstartConfig | null>(null)
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showProviderConfig, setShowProviderConfig] = useState(false)

  // Form state - env var name -> value
  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

  // In custom mode, show provider configuration by default
  const isCustomMode = wizardState.mode === 'custom'

  useEffect(() => {
    loadQuickstartConfig()
    loadCapabilities()
  }, [])

  const loadQuickstartConfig = async () => {
    try {
      const response = await composeServicesApi.getQuickstart()
      setQuickstartConfig(response.data)

      // Initialize form values from suggestions (if any have values)
      const initial: Record<string, string> = {}
      for (const ev of response.data.incomplete_env_vars) {
        // Check if any suggestion has a value we can use
        const suggestionWithValue = ev.suggestions.find(s => s.has_value)
        if (suggestionWithValue) {
          // Don't pre-fill - let them configure it
          initial[ev.name] = ''
        } else {
          initial[ev.name] = ''
        }
      }
      setEnvValues(initial)
      setLoading(false)
    } catch (error) {
      console.error('Failed to load quickstart config:', error)
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
      // Also reload quickstart config as provider change may affect suggestions
      await loadQuickstartConfig()
      setMessage({ type: 'success', text: `Selected ${providerId} for ${capability}` })
      setTimeout(() => setMessage(null), 2000)
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to select provider') })
    }
  }

  const handleEnvChange = (name: string, value: string) => {
    setEnvValues(prev => ({ ...prev, [name]: value }))
  }

  const toggleShowSecret = (name: string) => {
    setShowSecrets(prev => ({ ...prev, [name]: !prev[name] }))
  }

  const validateForm = (): boolean => {
    if (!quickstartConfig) return true

    for (const ev of quickstartConfig.incomplete_env_vars) {
      const value = envValues[ev.name]
      if (!value || value.trim() === '') {
        setMessage({
          type: 'error',
          text: `${ev.name} is required for ${ev.service_name}`,
        })
        return false
      }
    }
    return true
  }

  const handleComplete = async () => {
    if (!validateForm()) return

    setIsSubmitting(true)
    setMessage({ type: 'info', text: 'Saving configuration...' })

    try {
      // Filter out empty values and masked values
      const valuesToSave: Record<string, string> = {}
      for (const [name, value] of Object.entries(envValues)) {
        if (value && !value.startsWith('***')) {
          valuesToSave[name] = value
        }
      }

      if (Object.keys(valuesToSave).length > 0) {
        await composeServicesApi.saveQuickstart(valuesToSave)
      }

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

  const hasIncompleteVars = quickstartConfig && quickstartConfig.incomplete_env_vars.length > 0

  return (
    <WizardShell
      wizardId="quickstart"
      title="Quickstart Setup"
      subtitle="Get up and running in minutes with cloud services"
      icon={Sparkles}
      progress={100} // Single page = always 100%
      isFirstStep={true}
      onNext={hasIncompleteVars ? handleComplete : () => navigate('/')}
      nextLoading={isSubmitting}
      message={message}
    >
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

        {/* Environment Variables Section */}
        {hasIncompleteVars ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Configuration Required
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {quickstartConfig!.services_needing_setup.length} service{quickstartConfig!.services_needing_setup.length > 1 ? 's' : ''} need{quickstartConfig!.services_needing_setup.length === 1 ? 's' : ''} configuration: {quickstartConfig!.services_needing_setup.join(', ')}
              </p>
            </div>

            {quickstartConfig!.incomplete_env_vars.map((ev) => (
              <EnvVarField
                key={ev.name}
                envVar={ev}
                value={envValues[ev.name] || ''}
                showSecret={showSecrets[ev.name] || false}
                onChange={(value) => handleEnvChange(ev.name, value)}
                onToggleShow={() => toggleShowSecret(ev.name)}
              />
            ))}
          </div>
        ) : (
          <div id="quickstart-complete" className="text-center space-y-4 py-8">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              All Set!
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {quickstartConfig && quickstartConfig.total_services > 0
                ? `All ${quickstartConfig.total_services} installed services are configured and ready to use.`
                : 'No services are installed yet. Visit the Services page to get started.'}
            </p>
          </div>
        )}
      </div>
    </WizardShell>
  )
}

// Environment variable field component
interface EnvVarFieldProps {
  envVar: IncompleteEnvVar
  value: string
  showSecret: boolean
  onChange: (value: string) => void
  onToggleShow: () => void
}

function EnvVarField({ envVar, value, showSecret, onChange, onToggleShow }: EnvVarFieldProps) {
  const isSecret = envVar.setting_type === 'secret'
  const hasExistingValue = value && value.length > 0

  // Find a link hint from suggestions
  const getLinkHint = () => {
    const name = envVar.name.toLowerCase()
    if (name.includes('openai')) return 'https://platform.openai.com/api-keys'
    if (name.includes('anthropic')) return 'https://console.anthropic.com/settings/keys'
    if (name.includes('google')) return 'https://aistudio.google.com/app/apikey'
    return null
  }

  const link = getLinkHint()

  return (
    <div id={`quickstart-field-${envVar.name}`} className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {formatEnvVarName(envVar.name)} <span className="text-red-600">*</span>
          {hasExistingValue && (
            <span className="ml-2 text-xs text-green-600">✓ Configured</span>
          )}
        </label>
        {link && (
          <a
            href={link}
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
          id={`quickstart-input-${envVar.name}`}
          type={isSecret && !showSecret ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${formatEnvVarName(envVar.name)}`}
          className="input pr-10"
        />
        {isSecret && (
          <button
            type="button"
            onClick={onToggleShow}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          >
            {showSecret ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Required by: {envVar.service_name}
      </p>
    </div>
  )
}

// Format env var name for display (e.g., OPENAI_API_KEY -> OpenAI API Key)
function formatEnvVarName(name: string): string {
  return name
    .split('_')
    .map(word => {
      // Keep known acronyms uppercase
      if (['API', 'URL', 'URI', 'ID', 'KEY'].includes(word.toUpperCase())) {
        return word.toUpperCase()
      }
      // Title case others
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}
