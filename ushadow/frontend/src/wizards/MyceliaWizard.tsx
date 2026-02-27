import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, CheckCircle, Loader2, AlertCircle, Cloud, HardDrive } from 'lucide-react'

import {
  servicesApi,
  deploymentsApi,
  settingsApi,
  svcConfigsApi,
  providersApi,
  type EnvVarInfo,
  type EnvVarConfig,
  type EnvVarSuggestion,
  type DeployTarget,
  type Deployment,
  type Template,
  type ProviderWithStatus,
  type ServiceConfigSummary,
  type Wiring,
} from '../services/api'
import { SettingField } from '../components/settings/SettingField'
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

export default function MyceliaWizard() {
  const navigate = useNavigate()
  const wizard = useWizardSteps(STEPS)
  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [serviceStarted, setServiceStarted] = useState(false)
  const [tokenData, setTokenData] = useState<{ token: string; clientId: string } | null>(null)
  const hasAutoDeployedRef = useRef(false)

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

  // Auto-deploy when entering the complete step (guarded with ref to prevent double-fire)
  useEffect(() => {
    if (wizard.currentStep.id === 'complete' && !serviceStarted && !isStarting && !hasAutoDeployedRef.current) {
      hasAutoDeployedRef.current = true
      handleDeploy()
    }
  }, [wizard.currentStep.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const [providers, setProviders] = useState<ProviderWithStatus[]>([])
  const [composeTemplates, setComposeTemplates] = useState<Template[]>([])
  const [existingConfigs, setExistingConfigs] = useState<ServiceConfigSummary[]>([])
  const [currentWiring, setCurrentWiring] = useState<Wiring | null>(null)
  const [deployTarget, setDeployTarget] = useState<DeployTarget | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showProviders, setShowProviders] = useState(false)
  const [configValues, setConfigValues] = useState<Record<string, string>>({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [stepMessage, setStepMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [providersRes, templatesRes, configsRes, wiringRes, targetsRes] = await Promise.all([
        providersApi.getProvidersByCapability(TRANSCRIPTION_CAPABILITY),
        svcConfigsApi.getTemplates(),
        svcConfigsApi.getServiceConfigs(),
        svcConfigsApi.getWiring(),
        deploymentsApi.listTargets(),
      ])

      setProviders(providersRes.data)

      // Compose services that provide transcription (e.g. faster-whisper)
      setComposeTemplates(
        templatesRes.data.filter(
          (t: Template) => t.source === 'compose' && t.provides === TRANSCRIPTION_CAPABILITY
        )
      )

      // Existing ServiceConfigs for transcription providers
      const providerIds = new Set(providersRes.data.map((p: ProviderWithStatus) => p.id))
      setExistingConfigs(
        configsRes.data.filter(
          (c: ServiceConfigSummary) =>
            c.provides === TRANSCRIPTION_CAPABILITY || providerIds.has(c.template_id)
        )
      )

      // Current transcription wiring for mycelia-backend
      const transWiring = wiringRes.data.find(
        (w: Wiring) => w.target_config_id === MYCELIA_TARGET && w.target_capability === TRANSCRIPTION_CAPABILITY
      )
      setCurrentWiring(transWiring || null)

      // Deploy target (local leader)
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
    setSelectedId(null)
    setShowProviders(false)
    setConfigValues({})
  }

  /** Save provider credentials to settings, create a ServiceConfig, and wire it */
  const handleConfigureProvider = async (provider: ProviderWithStatus) => {
    setIsProcessing(true)
    setStepMessage({ type: 'info', text: 'Saving configuration...' })
    try {
      // Save credentials to their settings paths
      const settingsUpdate: Record<string, string> = {}
      for (const cred of provider.credentials ?? []) {
        if (cred.settings_path && configValues[cred.key]) {
          settingsUpdate[cred.settings_path] = configValues[cred.key]
        }
      }
      if (Object.keys(settingsUpdate).length > 0) {
        await settingsApi.update(settingsUpdate)
      }

      const configId = `${provider.id}-config`
      try {
        const result = await svcConfigsApi.createServiceConfig({
          id: configId,
          template_id: provider.id,
          name: provider.name,
          config: configValues,
        })
        await wireConfig(result.data.id)
      } catch {
        await svcConfigsApi.updateServiceConfig(configId, { config: configValues })
        await wireConfig(configId)
      }
      setStepMessage({ type: 'success', text: `${provider.name} configured!` })
    } catch (err) {
      setStepMessage({ type: 'error', text: getErrorMessage(err, 'Failed to save configuration') })
    } finally {
      setIsProcessing(false)
    }
  }

  /** Deploy a compose service, then create a provider ServiceConfig and wire it */
  const handleDeployCompose = async (composeTemplate: Template) => {
    if (!deployTarget) return
    setIsProcessing(true)
    setStepMessage({ type: 'info', text: `Deploying ${composeTemplate.name}...` })
    try {
      await deploymentsApi.deploy(composeTemplate.id, deployTarget.identifier)

      // Poll until running
      let running = false
      const deadline = Date.now() + 180_000
      while (Date.now() < deadline && !running) {
        await new Promise(r => setTimeout(r, 3000))
        try {
          const deps = await deploymentsApi.listDeployments({ unode_hostname: deployTarget.identifier })
          const dep = deps.data.find((d: Deployment) => d.service_id.includes(composeTemplate.id))
          if (dep?.status === 'running') running = true
        } catch { /* ignore transient polling errors */ }
      }
      if (!running) throw new Error('Deployment timed out after 3 minutes')

      setStepMessage({ type: 'info', text: `${composeTemplate.name} running. Wiring connection...` })

      // Get internal URL for backend→service communication
      const info = await servicesApi.getConnectionInfo(composeTemplate.id)
      const serverUrl = info.data.internal_url || info.data.proxy_url
      if (!serverUrl) throw new Error('Could not determine service URL')

      // Find the local provider to use as the ServiceConfig template
      const localProvider = providers.find(p => p.mode === 'local')
      const configTemplateId = localProvider?.id ?? composeTemplate.id
      const configId = `${composeTemplate.id}-auto`

      try {
        const result = await svcConfigsApi.createServiceConfig({
          id: configId,
          template_id: configTemplateId,
          name: `${composeTemplate.name} (auto)`,
          config: { server_url: serverUrl },
        })
        await wireConfig(result.data.id)
      } catch {
        await svcConfigsApi.updateServiceConfig(configId, { config: { server_url: serverUrl } })
        await wireConfig(configId)
      }

      setStepMessage({ type: 'success', text: `${composeTemplate.name} deployed and connected!` })
    } catch (err) {
      setStepMessage({ type: 'error', text: getErrorMessage(err, `Failed to deploy ${composeTemplate.name}`) })
    } finally {
      setIsProcessing(false)
    }
  }

  const selectedProvider = providers.find(p => p.id === selectedId)
  const selectedCompose = composeTemplates.find(t => t.id === selectedId)

  // Validate required credentials before enabling Save & Connect
  const missingRequiredCreds = (selectedProvider?.credentials ?? []).filter(
    cred => cred.required && !cred.has_value && !configValues[cred.key]
  )

  // Group config: defines which providers and compose templates belong together
  const GROUPS = [
    {
      id: 'whisper',
      label: 'Whisper',
      providerIds: ['whisper-local'],
      composeServiceNames: ['faster-whisper'],
    },
  ]

  const groupedProviderIds = new Set(GROUPS.flatMap(g => g.providerIds))
  const groupedComposeIds = new Set(GROUPS.flatMap(g => g.composeServiceNames))

  const standaloneProviders = providers.filter(p => !groupedProviderIds.has(p.id))
  const standaloneCompose = composeTemplates.filter(t => !(t.service_name && groupedComposeIds.has(t.service_name)))

  const allOptions = providers.length + composeTemplates.length

  if (loading) {
    return (
      <div data-testid="mycelia-step-capability-config" className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div data-testid="mycelia-step-capability-config" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
          Configure Providers
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Optionally configure a transcription provider for voice processing. You can skip and configure later.
        </p>
      </div>

      {/* Transcription capability slot */}
      <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
          <div>
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100 text-sm">Transcription</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Voice-to-text for audio processing</p>
          </div>
          {currentWiring ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-success-600 dark:text-success-400">
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs font-medium">Configured</span>
              </div>
              <button
                data-testid="mycelia-capability-transcription-change"
                onClick={() => {
                  setShowProviders(v => !v)
                  if (showProviders) {
                    setSelectedId(null)
                    setConfigValues({})
                  }
                }}
                className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 ml-2"
              >
                {showProviders ? 'Cancel' : 'Change'}
              </button>
            </div>
          ) : (
            <span className="text-xs text-neutral-400">Not configured</span>
          )}
        </div>

        <div className="p-4 space-y-3">
          {/* Existing configured ServiceConfigs */}
          {existingConfigs.length > 0 && !currentWiring && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Saved configurations</p>
              {existingConfigs.map((cfg) => (
                <button
                  key={cfg.id}
                  data-testid={`mycelia-capability-select-config-${cfg.id}`}
                  onClick={() => wireConfig(cfg.id)}
                  disabled={isProcessing}
                  className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-primary-400 dark:hover:border-primary-600 text-sm transition-colors"
                >
                  <span className="text-neutral-800 dark:text-neutral-200">{cfg.name || cfg.id}</span>
                  <span className="text-xs text-primary-600 dark:text-primary-400">Use</span>
                </button>
              ))}
              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
                <span className="text-xs text-neutral-400">or add new</span>
                <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
              </div>
            </div>
          )}

          {/* Provider + compose selection cards */}
          {(!currentWiring || showProviders) && allOptions > 0 && (
            <div className="space-y-2">
              {/* Standalone providers (not in any group) */}
              {standaloneProviders.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  isSelected={provider.id === selectedId}
                  disabled={isProcessing}
                  onSelect={() => {
                    setSelectedId(provider.id === selectedId ? null : provider.id)
                    setConfigValues({})
                    setStepMessage(null)
                  }}
                />
              ))}

              {/* Standalone compose templates (not in any group) */}
              {standaloneCompose.map((template) => (
                <ComposeCard
                  key={template.id}
                  template={template}
                  isSelected={template.id === selectedId}
                  disabled={isProcessing}
                  onSelect={() => {
                    setSelectedId(template.id === selectedId ? null : template.id)
                    setConfigValues({})
                    setStepMessage(null)
                  }}
                />
              ))}

              {/* Grouped providers */}
              {GROUPS.map((group) => {
                const groupProviders = providers.filter(p => group.providerIds.includes(p.id))
                const groupCompose = composeTemplates.filter(t => t.service_name && group.composeServiceNames.includes(t.service_name))
                if (groupProviders.length + groupCompose.length === 0) return null
                return (
                  <div key={group.id} data-testid={`mycelia-capability-group-${group.id}`} className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700">
                      <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{group.label}</span>
                    </div>
                    <div className="p-2 space-y-1.5">
                      {groupProviders.map((provider) => (
                        <ProviderCard
                          key={provider.id}
                          provider={provider}
                          isSelected={provider.id === selectedId}
                          disabled={isProcessing}
                          onSelect={() => {
                            setSelectedId(provider.id === selectedId ? null : provider.id)
                            setConfigValues({})
                            setStepMessage(null)
                          }}
                        />
                      ))}
                      {groupCompose.map((template) => (
                        <ComposeCard
                          key={template.id}
                          template={template}
                          isSelected={template.id === selectedId}
                          disabled={isProcessing}
                          onSelect={() => {
                            setSelectedId(template.id === selectedId ? null : template.id)
                            setConfigValues({})
                            setStepMessage(null)
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Config panel for selected provider */}
          {selectedProvider && (!currentWiring || showProviders) && (
            <div className="mt-2 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 space-y-3">
              {(selectedProvider.credentials ?? []).length === 0 ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
                  No configuration required.
                </p>
              ) : (
                <div className="space-y-3">
                  {(selectedProvider.credentials ?? []).map((cred) => (
                    <SettingField
                      key={cred.key}
                      id={`mycelia-capability-field-${cred.key}`}
                      name={cred.key}
                      label={cred.label ?? cred.key}
                      type={
                        cred.type === 'secret' ? 'secret'
                        : cred.type === 'url' ? 'url'
                        : 'text'
                      }
                      value={configValues[cred.key] ?? (cred.has_value ? '•'.repeat(16) : '')}
                      onChange={(v) => setConfigValues(prev => ({ ...prev, [cred.key]: v as string }))}
                      required={cred.required}
                      disabled={isProcessing}
                      placeholder={cred.default ?? undefined}
                    />
                  ))}
                </div>
              )}
              <button
                data-testid={`mycelia-capability-provider-save-${selectedProvider.id}`}
                onClick={() => handleConfigureProvider(selectedProvider)}
                disabled={isProcessing || missingRequiredCreds.length > 0}
                title={missingRequiredCreds.length > 0 ? `Missing required fields: ${missingRequiredCreds.map(f => f.label).join(', ')}` : undefined}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isProcessing ? 'Saving...' : 'Save & Connect'}
              </button>
            </div>
          )}

          {/* Deploy panel for selected compose service */}
          {selectedCompose && (!currentWiring || showProviders) && (
            <div className="mt-2 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 space-y-3">
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                {selectedCompose.running
                  ? `${selectedCompose.name} is already running and will be connected automatically.`
                  : `Deploy ${selectedCompose.name} on this machine. ${selectedCompose.description ?? ''}`}
              </p>
              <button
                data-testid={`mycelia-capability-compose-deploy-${selectedCompose.id}`}
                onClick={() => handleDeployCompose(selectedCompose)}
                disabled={isProcessing || !deployTarget}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  selectedCompose.running ? <CheckCircle className="w-4 h-4" /> : <Database className="w-4 h-4" />
                )}
                {isProcessing
                  ? (selectedCompose.running ? 'Connecting...' : 'Deploying...')
                  : (selectedCompose.running ? 'Use This Service' : `Deploy ${selectedCompose.name}`)}
              </button>
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
// Shared card sub-components
// =============================================================================

interface ProviderCardProps {
  provider: ProviderWithStatus
  isSelected: boolean
  disabled: boolean
  onSelect: () => void
}

function ProviderCard({ provider, isSelected, disabled, onSelect }: ProviderCardProps) {
  return (
    <button
      data-testid={`mycelia-capability-provider-${provider.id}`}
      onClick={onSelect}
      disabled={disabled}
      className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
        isSelected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-800'
      }`}
    >
      <div className="flex items-center gap-2">
        {provider.mode === 'cloud' ? (
          <Cloud className="w-4 h-4 text-blue-500 shrink-0" />
        ) : (
          <HardDrive className="w-4 h-4 text-neutral-400 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {provider.name}
            </span>
            {provider.configured && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300">
                Configured
              </span>
            )}
          </div>
          {provider.description && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
              {provider.description}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}

interface ComposeCardProps {
  template: Template
  isSelected: boolean
  disabled: boolean
  onSelect: () => void
}

function ComposeCard({ template, isSelected, disabled, onSelect }: ComposeCardProps) {
  return (
    <button
      data-testid={`mycelia-capability-compose-${template.id}`}
      onClick={onSelect}
      disabled={disabled}
      className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
        isSelected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-800'
      }`}
    >
      <div className="flex items-center gap-2">
        <HardDrive className="w-4 h-4 text-green-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {template.name}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
              {template.running ? 'Running' : 'Deployable'}
            </span>
          </div>
          {template.description && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
              {template.description}
            </p>
          )}
        </div>
      </div>
    </button>
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
