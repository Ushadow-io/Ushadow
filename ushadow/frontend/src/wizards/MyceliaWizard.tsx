import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, CheckCircle, Loader2, AlertCircle } from 'lucide-react'

import { servicesApi, settingsApi, EnvVarInfo, EnvVarConfig, EnvVarSuggestion } from '../services/api'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage } from '../components/wizard'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'
import EnvVarEditor from '../components/EnvVarEditor'

// Steps
const STEPS: WizardStep[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'complete', label: 'Complete' },
] as const

export default function MyceliaWizard() {
  const navigate = useNavigate()
  const wizard = useWizardSteps(STEPS)
  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [serviceStarted, setServiceStarted] = useState(false)
  const [tokenData, setTokenData] = useState<{ token: string; clientId: string } | null>(null)

  // EnvVar state for AUTH_SECRET_KEY
  const [authSecretKeyEnvVar, setAuthSecretKeyEnvVar] = useState<EnvVarInfo>({
    name: 'AUTH_SECRET_KEY',
    is_required: true,
    source: 'setting',
    suggestions: [],
  })
  const [authSecretKeyConfig, setAuthSecretKeyConfig] = useState<EnvVarConfig>({
    source: 'setting',
    setting_path: 'security.auth_secret_key',
  })

  // Load existing auth secret key and suggestions from settings
  useEffect(() => {
    loadAuthSecretKey()
  }, [])

  const loadAuthSecretKey = async () => {
    try {
      const response = await settingsApi.getAll()
      const settings = response.data

      // Build suggestions from existing secret keys in settings
      const suggestions: EnvVarSuggestion[] = []

      // Add main auth secret key if exists
      if (settings.security?.auth_secret_key) {
        suggestions.push({
          path: 'security.auth_secret_key',
          label: 'ushadow Auth Secret Key',
          has_value: true,
          value: '•'.repeat(20),
        })
      }

      // Add other potential secret keys
      if (settings.api_keys) {
        Object.keys(settings.api_keys).forEach(key => {
          if (settings.api_keys[key]) {
            suggestions.push({
              path: `api_keys.${key}`,
              label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              has_value: true,
              value: '•'.repeat(20),
            })
          }
        })
      }

      // Update envVar with suggestions
      setAuthSecretKeyEnvVar(prev => ({
        ...prev,
        suggestions,
        resolved_value: settings.security?.auth_secret_key ? '•'.repeat(20) : undefined,
      }))

      // If auth_secret_key already exists, use it
      if (settings.security?.auth_secret_key) {
        setAuthSecretKeyConfig({
          source: 'setting',
          setting_path: 'security.auth_secret_key',
          value: settings.security.auth_secret_key,
        })
      }

      // Check if already configured
      const hasToken = settings.api_keys?.mycelia_token
      const hasClientId = settings.api_keys?.mycelia_client_id

      if (hasToken && hasClientId) {
        // Already configured - skip to complete step
        setServiceStarted(true)
        setTokenData({ token: hasToken, clientId: hasClientId })
        wizard.goTo('complete')
      }
    } catch (err) {
      console.error('Failed to load auth secret key:', err)
      setMessage({
        type: 'error',
        text: getErrorMessage(err, 'Failed to load configuration'),
      })
    }
  }

  const handleAuthSecretKeyChange = (updates: Partial<EnvVarConfig>) => {
    setAuthSecretKeyConfig(prev => ({ ...prev, ...updates }))
  }

  const handleStartAndGenerate = async () => {
    setIsStarting(true)
    setMessage(null)

    try {
      // Determine which setting path to use
      const settingPath = authSecretKeyConfig.setting_path || authSecretKeyConfig.new_setting_path

      if (!settingPath) {
        setMessage({
          type: 'error',
          text: 'Please select or enter an AUTH_SECRET_KEY',
        })
        setIsStarting(false)
        return
      }

      // 1. If creating a new setting, save it first
      if (authSecretKeyConfig.source === 'new_setting' && authSecretKeyConfig.value) {
        await settingsApi.update({
          [settingPath]: authSecretKeyConfig.value,
        })
      }

      // 2. Copy to security.auth_secret_key if using a different path
      // Use backend API to get unmasked secret value
      if (settingPath !== 'security.auth_secret_key') {
        const secretResponse = await settingsApi.getSecret(settingPath)
        await settingsApi.update({
          'security.auth_secret_key': secretResponse.data.value,
        })
      }
      // If already using security.auth_secret_key, no need to copy

      // 2. Start the Mycelia service (will use the AUTH_SECRET_KEY env var)
      await servicesApi.startService('mycelia-backend')
      setMessage({ type: 'success', text: 'Mycelia service started. Generating credentials...' })

      // 3. Wait a bit for service to be ready
      await new Promise(resolve => setTimeout(resolve, 5000))

      // 4. Generate token (runs inside the now-running container)
      const response = await servicesApi.generateMyceliaToken()
      const { token, client_id } = response.data

      // 5. Save token and client_id to secrets.yml
      // Use api_keys.* namespace to ensure both are saved to secrets.yml
      await settingsApi.update({
        'api_keys.mycelia_token': token,
        'api_keys.mycelia_client_id': client_id,
      })

      setTokenData({ token, clientId: client_id })
      setServiceStarted(true)
      setMessage({ type: 'success', text: 'Credentials generated successfully!' })
    } catch (error) {
      console.error('Failed to start and generate:', error)
      setMessage({
        type: 'error',
        text: getErrorMessage(error, 'Setup failed. Please try again.'),
      })
    } finally {
      setIsStarting(false)
    }
  }

  const handleNext = async () => {
    if (wizard.currentStep.id === 'setup') {
      if (!serviceStarted) {
        await handleStartAndGenerate()
        if (serviceStarted) {
          wizard.next()
        }
      } else {
        wizard.next()
      }
    } else if (wizard.currentStep.id === 'complete') {
      // Navigate to services page
      navigate('/services')
    }
  }

  const handleBack = () => {
    if (!wizard.isFirst) {
      wizard.back()
    }
  }

  return (
    <WizardShell
      wizardId="mycelia"
      title="Mycelia Setup"
      subtitle="AI Memory and Timeline"
      icon={Database}
      progress={wizard.progress}
      steps={STEPS}
      currentStepId={wizard.currentStep.id}
      isFirstStep={wizard.isFirst}
      onBack={handleBack}
      onNext={handleNext}
      nextLoading={isStarting}
      nextDisabled={
        (wizard.currentStep.id === 'setup' &&
          !authSecretKeyConfig.value &&
          !authSecretKeyConfig.resolved_value &&
          !authSecretKeyConfig.setting_path &&
          !authSecretKeyConfig.new_setting_path) ||
        isStarting
      }
      message={message}
    >
      {wizard.currentStep.id === 'setup' && (
        <SetupStep
          authSecretKeyEnvVar={authSecretKeyEnvVar}
          authSecretKeyConfig={authSecretKeyConfig}
          onAuthSecretKeyChange={handleAuthSecretKeyChange}
          isStarting={isStarting}
          serviceStarted={serviceStarted}
        />
      )}
      {wizard.currentStep.id === 'complete' && (
        <CompleteStep tokenData={tokenData} />
      )}
    </WizardShell>
  )
}

// =============================================================================
// Step Components
// =============================================================================

interface SetupStepProps {
  authSecretKeyEnvVar: EnvVarInfo
  authSecretKeyConfig: EnvVarConfig
  onAuthSecretKeyChange: (updates: Partial<EnvVarConfig>) => void
  isStarting: boolean
  serviceStarted: boolean
}

function SetupStep({ authSecretKeyEnvVar, authSecretKeyConfig, onAuthSecretKeyChange, isStarting, serviceStarted }: SetupStepProps) {
  return (
    <div data-testid="mycelia-step-setup" className="space-y-6">
      {isStarting ? (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-12 w-12 text-blue-600 dark:text-blue-400 animate-spin" />
            <div className="text-center">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Starting Mycelia...
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Starting the service and generating authentication credentials...
              </p>
            </div>
          </div>
        </div>
      ) : serviceStarted ? (
        <div className="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-success-900 dark:text-success-100 mb-1">
                Setup Complete
              </h3>
              <p className="text-sm text-success-800 dark:text-success-200">
                Mycelia has been started and credentials have been generated successfully.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex gap-3">
              <Database className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  Configure Authentication
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Mycelia uses an AUTH_SECRET_KEY to sign JWTs and secure your data. Select an existing secret or create a new one.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
              <h4 className="text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                Authentication Key
              </h4>
            </div>
            <EnvVarEditor
              envVar={authSecretKeyEnvVar}
              config={authSecretKeyConfig}
              onChange={onAuthSecretKeyChange}
            />
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              What happens next?
            </h3>
            <ul className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
              <li className="flex items-start gap-2">
                <span className="text-primary-600 dark:text-primary-400">1.</span>
                <span>Save AUTH_SECRET_KEY to settings</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600 dark:text-primary-400">2.</span>
                <span>Start Mycelia service with proper configuration</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600 dark:text-primary-400">3.</span>
                <span>Generate authentication token in the running container</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600 dark:text-primary-400">4.</span>
                <span>Save credentials to settings</span>
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

interface CompleteStepProps {
  tokenData: { token: string; clientId: string } | null
}

function CompleteStep({ tokenData }: CompleteStepProps) {
  return (
    <div data-testid="mycelia-step-complete" className="space-y-6">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-100 dark:bg-success-900/30">
          <CheckCircle className="h-8 w-8 text-success-600 dark:text-success-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
            Mycelia is Ready!
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400">
            Your AI memory and timeline service is configured and ready to start.
          </p>
        </div>
      </div>

      <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4 space-y-2">
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
          What's Next?
        </h3>
        <ul className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
          <li className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
            <span>Access the web UI at https://localhost:14433</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
            <span>Connect Apple Voice Memos, Google Drive, or local audio files</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
            <span>Search your voice notes and conversations</span>
          </li>
        </ul>
      </div>

      {tokenData && (
        <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning-600 dark:text-warning-400 flex-shrink-0" />
            <div className="flex-1 text-sm text-warning-800 dark:text-warning-200">
              <p className="font-semibold mb-1">Credentials saved</p>
              <p>Your token and client ID have been saved to ushadow settings and will be automatically passed to Mycelia.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
