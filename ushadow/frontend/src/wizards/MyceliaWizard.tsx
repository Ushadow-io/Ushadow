import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, CheckCircle, Loader2, AlertCircle, Wifi, WifiOff, Plus } from 'lucide-react'

import {
  servicesApi,
  deploymentsApi,
  settingsApi,
  svcConfigsApi,
  type EnvVarInfo,
  type EnvVarConfig,
  type EnvVarSuggestion,
  type DeployTarget,
  type Deployment,
  type Template,
  type ServiceConfigSummary,
  type Wiring,
} from '../services/api'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage } from '../components/wizard'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'
import EnvVarEditor from '../components/EnvVarEditor'

// Steps
const STEPS: WizardStep[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'capability_config', label: 'Configure' },
  { id: 'complete', label: 'Complete' },
] as const

const MYCELIA_TARGET = 'mycelia-backend'
const TRANSCRIPTION_CAPABILITY = 'transcription'
const WHISPER_PROVIDER_TEMPLATE = 'whisper-local'
const WHISPER_COMPOSE_SERVICE = 'faster-whisper'

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
    name: 'AUTH_SECRET_KEY',
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
          name: 'AUTH_SECRET_KEY',
          source: 'setting',
          setting_path: 'security.auth_secret_key',
          value: settings.security.auth_secret_key,
        })
      }

      // Check if already configured — skip directly to complete
      const hasToken = settings.api_keys?.mycelia_token
      const hasClientId = settings.api_keys?.mycelia_client_id

      if (hasToken && hasClientId) {
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

  /** Save auth key and advance to capability_config step */
  const handleSetupNext = async () => {
    setIsStarting(true)
    setMessage(null)

    try {
      const settingPath = authSecretKeyConfig.setting_path || authSecretKeyConfig.new_setting_path

      if (!settingPath) {
        setMessage({ type: 'error', text: 'Please select or enter an AUTH_SECRET_KEY' })
        return
      }

      // If creating a new setting, save it first
      if (authSecretKeyConfig.source === 'new_setting' && authSecretKeyConfig.value) {
        await settingsApi.update({ [settingPath]: authSecretKeyConfig.value })
      }

      // Copy to security.auth_secret_key if using a different path
      if (settingPath !== 'security.auth_secret_key') {
        const secretResponse = await settingsApi.getSecret(settingPath)
        await settingsApi.update({ 'security.auth_secret_key': secretResponse.data.value })
      }

      wizard.next()
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save auth key.') })
    } finally {
      setIsStarting(false)
    }
  }

  /** Deploy services and generate token — triggered from complete step */
  const handleDeploy = async () => {
    setIsStarting(true)
    setMessage({ type: 'info', text: 'Starting Mycelia...' })

    try {
      // Deploy backend + worker via the deployments API
      const targetsRes = await deploymentsApi.listTargets()
      const leader = targetsRes.data.find((t) => t.type === 'docker' && t.is_leader)
      if (!leader) throw new Error('No local deployment target found.')

      await Promise.all([
        deploymentsApi.deploy('mycelia-backend', leader.identifier),
        deploymentsApi.deploy('mycelia-python-worker', leader.identifier),
      ])
      setMessage({ type: 'info', text: 'Mycelia starting... waiting for backend to be ready.' })

      // Poll until backend is running
      const POLL_INTERVAL = 3000
      const TIMEOUT = 180_000
      const deadline = Date.now() + TIMEOUT
      let isRunning = false
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
        try {
          const deps = await deploymentsApi.listDeployments({ unode_hostname: leader.identifier })
          const backend = deps.data.find((d) => d.service_id.includes('mycelia-backend'))
          if (backend?.status === 'running') {
            isRunning = true
            break
          }
        } catch {
          // ignore transient errors during startup
        }
      }
      if (!isRunning) {
        throw new Error('Mycelia backend did not start within 3 minutes. Please check the logs.')
      }
      setMessage({ type: 'success', text: 'Mycelia backend running. Generating credentials...' })

      // Generate token
      const response = await servicesApi.generateMyceliaToken()
      const { token, client_id } = response.data

      // Save token and client_id to settings
      await settingsApi.update({
        'api_keys.mycelia_token': token,
        'api_keys.mycelia_client_id': client_id,
      })

      setTokenData({ token, clientId: client_id })
      setServiceStarted(true)
      setMessage({ type: 'success', text: 'Credentials generated successfully!' })
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Setup failed. Please try again.') })
    } finally {
      setIsStarting(false)
    }
  }

  const handleNext = async () => {
    if (wizard.currentStep.id === 'setup') {
      await handleSetupNext()
    } else if (wizard.currentStep.id === 'capability_config') {
      wizard.next()
    } else if (wizard.currentStep.id === 'complete') {
      navigate('/instances', { state: { refresh: true } })
    }
  }

  const handleBack = () => {
    if (!wizard.isFirst) wizard.back()
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
          !authSecretKeyEnvVar.resolved_value &&
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
        />
      )}
      {wizard.currentStep.id === 'capability_config' && (
        <CapabilityConfigStep />
      )}
      {wizard.currentStep.id === 'complete' && (
        <CompleteStep
          tokenData={tokenData}
          serviceStarted={serviceStarted}
          isStarting={isStarting}
          onDeploy={handleDeploy}
        />
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
}

function SetupStep({ authSecretKeyEnvVar, authSecretKeyConfig, onAuthSecretKeyChange, isStarting }: SetupStepProps) {
  return (
    <div data-testid="mycelia-step-setup" className="space-y-6">
      {isStarting ? (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-12 w-12 text-blue-600 dark:text-blue-400 animate-spin" />
            <div className="text-center">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Saving configuration...
              </h3>
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
        </>
      )}
    </div>
  )
}

// =============================================================================
// Capability Config Step
// =============================================================================

function CapabilityConfigStep() {
  const [loading, setLoading] = useState(true)
  const [existingConfigs, setExistingConfigs] = useState<ServiceConfigSummary[]>([])
  const [currentWiring, setCurrentWiring] = useState<Wiring | null>(null)
  const [deployTarget, setDeployTarget] = useState<DeployTarget | null>(null)
  const [mode, setMode] = useState<'url' | 'local' | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [stepMessage, setStepMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [templatesRes, configsRes, wiringRes, targetsRes] = await Promise.all([
        svcConfigsApi.getTemplates(),
        svcConfigsApi.getServiceConfigs(),
        svcConfigsApi.getWiring(),
        deploymentsApi.listTargets(),
      ])

      // Provider templates that provide transcription
      const transProviders = templatesRes.data.filter(
        (t: Template) => t.provides === TRANSCRIPTION_CAPABILITY && t.source === 'provider'
      )

      // Existing ServiceConfigs for those templates
      const transConfigs = configsRes.data.filter((c: ServiceConfigSummary) =>
        transProviders.some((t: Template) => t.id === c.template_id)
      )
      setExistingConfigs(transConfigs)

      // Current transcription wiring for mycelia-backend
      const transWiring = wiringRes.data.find(
        (w: Wiring) => w.target_config_id === MYCELIA_TARGET && w.target_capability === TRANSCRIPTION_CAPABILITY
      )
      setCurrentWiring(transWiring || null)

      // Deploy target for "start locally" option
      const leader = targetsRes.data.find((t: DeployTarget) => t.type === 'docker' && t.is_leader)
      setDeployTarget(leader || null)
    } catch (err) {
      console.error('Failed to load capability data:', err)
    } finally {
      setLoading(false)
    }
  }

  const wireConfig = async (configId: string) => {
    if (currentWiring) {
      await svcConfigsApi.deleteWiring(currentWiring.id)
    }
    await svcConfigsApi.createWiring({
      source_config_id: configId,
      source_capability: TRANSCRIPTION_CAPABILITY,
      target_config_id: MYCELIA_TARGET,
      target_capability: TRANSCRIPTION_CAPABILITY,
    })
    await loadData()
  }

  const handleUseUrl = async () => {
    if (!urlInput.trim()) return
    setIsProcessing(true)
    setStepMessage({ type: 'info', text: 'Creating configuration...' })
    try {
      let configId = 'whisper-custom'
      try {
        const config = await svcConfigsApi.createServiceConfig({
          id: configId,
          template_id: WHISPER_PROVIDER_TEMPLATE,
          name: 'Whisper (Custom URL)',
          config: { server_url: urlInput.trim() },
        })
        configId = config.data.id
      } catch {
        await svcConfigsApi.updateServiceConfig(configId, { config: { server_url: urlInput.trim() } })
      }
      await wireConfig(configId)
      setMode(null)
      setUrlInput('')
      setStepMessage({ type: 'success', text: 'Transcription provider configured!' })
    } catch (err) {
      setStepMessage({ type: 'error', text: getErrorMessage(err, 'Failed to configure') })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleStartLocally = async () => {
    if (!deployTarget) return
    setIsProcessing(true)
    setStepMessage({ type: 'info', text: 'Deploying Faster-Whisper...' })
    try {
      await deploymentsApi.deploy(WHISPER_COMPOSE_SERVICE, deployTarget.identifier)

      // Poll until running
      let running = false
      const deadline = Date.now() + 180_000
      while (Date.now() < deadline && !running) {
        await new Promise(r => setTimeout(r, 3000))
        try {
          const deps = await deploymentsApi.listDeployments({ unode_hostname: deployTarget.identifier })
          const dep = deps.data.find((d: Deployment) => d.service_id.includes(WHISPER_COMPOSE_SERVICE))
          if (dep?.status === 'running') running = true
        } catch {
          // ignore transient polling errors
        }
      }
      if (!running) throw new Error('Deployment timed out')

      setStepMessage({ type: 'info', text: 'Whisper running. Configuring connection...' })

      // Get internal URL for container-to-container communication
      const info = await servicesApi.getConnectionInfo(WHISPER_COMPOSE_SERVICE)
      const serverUrl = info.data.internal_url || info.data.proxy_url
      if (!serverUrl) throw new Error('Could not get service URL')

      // Create provider ServiceConfig with the URL
      let configId = 'whisper-local'
      try {
        const config = await svcConfigsApi.createServiceConfig({
          id: configId,
          template_id: WHISPER_PROVIDER_TEMPLATE,
          name: 'Whisper (Local)',
          config: { server_url: serverUrl },
        })
        configId = config.data.id
      } catch {
        await svcConfigsApi.updateServiceConfig(configId, { config: { server_url: serverUrl } })
      }
      await wireConfig(configId)
      setMode(null)
      setStepMessage({ type: 'success', text: 'Faster-Whisper deployed and configured!' })
    } catch (err) {
      setStepMessage({ type: 'error', text: getErrorMessage(err, 'Failed to deploy Whisper') })
    } finally {
      setIsProcessing(false)
    }
  }

  if (loading) {
    return (
      <div data-testid="mycelia-step-capability-config" className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  const isConfigured = !!currentWiring

  return (
    <div data-testid="mycelia-step-capability-config" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
          Configure Providers
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Optionally configure AI providers for Mycelia's features. You can skip and configure later.
        </p>
      </div>

      {/* Transcription slot */}
      <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
          <div>
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100 text-sm">Transcription</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Voice-to-text for audio processing</p>
          </div>
          {isConfigured ? (
            <div className="flex items-center gap-1.5 text-success-600 dark:text-success-400">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Configured</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-neutral-400">
              <WifiOff className="w-4 h-4" />
              <span className="text-xs">Not configured</span>
            </div>
          )}
        </div>

        <div className="p-4 space-y-3">
          {/* Current wiring */}
          {isConfigured && (
            <div className="flex items-center justify-between text-sm bg-success-50 dark:bg-success-900/20 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-success-600 dark:text-success-400" />
                <span className="text-neutral-700 dark:text-neutral-300">{currentWiring!.source_config_id}</span>
              </div>
              <button
                data-testid="mycelia-capability-transcription-change"
                onClick={() => setMode(mode ? null : 'url')}
                className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                Change
              </button>
            </div>
          )}

          {/* Existing configs to select */}
          {!isConfigured && existingConfigs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Use existing config:</p>
              {existingConfigs.map((config) => (
                <button
                  key={config.id}
                  data-testid={`mycelia-capability-select-config-${config.id}`}
                  onClick={() => wireConfig(config.id)}
                  disabled={isProcessing}
                  className="w-full text-left px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-primary-400 dark:hover:border-primary-600 text-sm transition-colors"
                >
                  {config.name || config.id}
                </button>
              ))}
            </div>
          )}

          {/* Add new options */}
          {(!isConfigured || mode) && (
            <div className="space-y-3">
              {!isConfigured && <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Configure new:</p>}

              {/* Toggle buttons */}
              <div className="flex gap-2">
                <button
                  data-testid="mycelia-capability-mode-url"
                  onClick={() => setMode(mode === 'url' ? null : 'url')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    mode === 'url'
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:border-primary-400'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Use URL
                </button>
                {deployTarget && (
                  <button
                    data-testid="mycelia-capability-mode-local"
                    onClick={() => setMode(mode === 'local' ? null : 'local')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      mode === 'local'
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:border-primary-400'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                    Start Locally
                  </button>
                )}
              </div>

              {/* URL form */}
              {mode === 'url' && (
                <div className="space-y-2 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    Whisper Server URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      data-testid="mycelia-capability-url-input"
                      type="url"
                      value={urlInput}
                      onChange={e => setUrlInput(e.target.value)}
                      placeholder="http://your-whisper-server:9000"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                    />
                    <button
                      data-testid="mycelia-capability-url-save"
                      onClick={handleUseUrl}
                      disabled={isProcessing || !urlInput.trim()}
                      className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {/* Start locally form */}
              {mode === 'local' && (
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg space-y-2">
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    Deploy Faster-Whisper on this machine. Uses CPU; ensure you have enough RAM (~2GB).
                  </p>
                  <button
                    data-testid="mycelia-capability-deploy-local"
                    onClick={handleStartLocally}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Deploying...
                      </>
                    ) : (
                      'Start Faster-Whisper'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {stepMessage && (
            <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${
              stepMessage.type === 'success'
                ? 'bg-success-50 dark:bg-success-900/20 text-success-800 dark:text-success-200'
                : stepMessage.type === 'error'
                ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
            }`}>
              {stepMessage.type === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              ) : stepMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
              )}
              {stepMessage.text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Complete Step
// =============================================================================

interface CompleteStepProps {
  tokenData: { token: string; clientId: string } | null
  serviceStarted: boolean
  isStarting: boolean
  onDeploy: () => void
}

function CompleteStep({ tokenData, serviceStarted, isStarting, onDeploy }: CompleteStepProps) {
  // Auto-trigger deployment when this step is first shown
  useEffect(() => {
    if (!serviceStarted && !isStarting) {
      onDeploy()
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-testid="mycelia-step-complete" className="space-y-6">
      {isStarting ? (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-12 w-12 text-blue-600 dark:text-blue-400 animate-spin" />
            <div className="text-center">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Starting Mycelia...
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Starting services and generating authentication credentials...
              </p>
            </div>
          </div>
        </div>
      ) : serviceStarted ? (
        <>
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-100 dark:bg-success-900/30">
              <CheckCircle className="h-8 w-8 text-success-600 dark:text-success-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
                Mycelia is Ready!
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400">
                Your AI memory and timeline service is configured and running.
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
                <span>Connect Apple Voice Memos, Google Drive, or local audio files</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
                <span>Search your voice notes and conversations</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
                <span>View and manage the service on the Instances page</span>
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
        </>
      ) : (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-red-900 dark:text-red-100">Startup failed</p>
              <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                Check the logs for details.
              </p>
              <button
                data-testid="mycelia-complete-retry"
                onClick={onDeploy}
                className="mt-3 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
