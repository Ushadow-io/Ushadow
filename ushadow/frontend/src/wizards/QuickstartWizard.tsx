import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, RefreshCw, CheckCircle, ExternalLink } from 'lucide-react'

import {
  quickstartApi,
  deploymentsApi,
  settingsApi,
  type QuickstartConfig,
  type CapabilityRequirement,
  type ServiceInfo,
  type ServiceProfile,
  type DeployTarget,
  type Deployment
} from '../services/api'
import { ServiceStatusCard, type ServiceStatus } from '../components/services'
import { RequiredFieldsForm } from '../components/forms'
import { useWizard } from '../contexts/WizardContext'
import { WizardFormProvider, useWizardForm } from '../contexts/WizardFormContext'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage, WhatsNext } from '../components/wizard'
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
  const [isProfileChanging, setIsProfileChanging] = useState(false)
  const [hasAutoStarted, setHasAutoStarted] = useState(false)

  // Deployment target (local leader node)
  const [deployTarget, setDeployTarget] = useState<DeployTarget | null>(null)

  useEffect(() => {
    loadQuickstartConfig()
    loadDeploymentTarget()
  }, [])

  // Auto-start all stopped services when entering start_services step
  const autoStartServices = useCallback(async (currentContainers: ContainerInfo[]) => {
    if (!deployTarget) return
    try {
      const response = await deploymentsApi.listDeployments({ unode_hostname: deployTarget.identifier })
      const deployments = response.data
      for (const container of currentContainers) {
        const deployment = deployments.find((d: Deployment) => d.service_id.includes(container.name))
        if (!deployment || deployment.status !== 'running') {
          startContainer(container.name)
        }
      }
    } catch (err) {
      console.error('[QuickstartWizard] Auto-start failed:', err)
    }
  }, [deployTarget])

  // Check status + auto-start when entering start_services step
  useEffect(() => {
    if (wizard.currentStep.id === 'start_services') {
      checkContainerStatuses()
    }
  }, [wizard.currentStep.id])

  // Trigger auto-start once deployTarget and containers are both ready
  useEffect(() => {
    if (
      wizard.currentStep.id === 'start_services' &&
      deployTarget &&
      containers.length > 0 &&
      !hasAutoStarted
    ) {
      setHasAutoStarted(true)
      autoStartServices(containers)
    }
  }, [wizard.currentStep.id, deployTarget, containers.length, hasAutoStarted, autoStartServices])

  const loadQuickstartConfig = async () => {
    try {
      const response = await quickstartApi.getConfig()
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

  const loadDeploymentTarget = async () => {
    try {
      const response = await deploymentsApi.listTargets()
      // Find the local leader (Docker target with is_leader=true)
      const leader = response.data.find((t: DeployTarget) => t.type === 'docker' && t.is_leader)
      if (leader) {
        setDeployTarget(leader)
        console.log('[QuickstartWizard] Found local leader:', leader.identifier)
      } else {
        console.warn('[QuickstartWizard] No local leader found in deployment targets')
      }
    } catch (error) {
      console.error('Failed to load deployment targets:', error)
    }
  }

  const handleProfileSelect = async (profileName: string) => {
    if (isProfileChanging) return
    setIsProfileChanging(true)
    try {
      await quickstartApi.selectProfile(profileName)
      await loadQuickstartConfig()
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to apply profile: ${getErrorMessage(error, 'Unknown error')}` })
    } finally {
      setIsProfileChanging(false)
    }
  }

  // Get capabilities that need configuration (have missing keys)
  const getCapabilitiesNeedingSetup = (): CapabilityRequirement[] => {
    if (!quickstartConfig || !quickstartConfig.required_capabilities) return []
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
    const result = await saveToApi(quickstartApi.saveConfig)

    if (result.success) {
      // Mark configured providers as installed so they appear in wiring board
      const providerIds = (quickstartConfig?.required_capabilities ?? [])
        .map((cap: CapabilityRequirement) => cap.selected_provider)
        .filter((id): id is string => !!id)
      const uniqueProviderIds = [...new Set(providerIds)]
      if (uniqueProviderIds.length > 0) {
        try {
          const currentConfig = await settingsApi.getConfig()
          const currentInstalled: string[] = currentConfig.data?.installed_services ?? []
          const newInstalled = [...new Set([...currentInstalled, ...uniqueProviderIds])]
          if (newInstalled.length > currentInstalled.length) {
            await settingsApi.update({ installed_services: newInstalled })
          }
        } catch (err) {
          console.warn('Failed to update installed_services after quickstart save:', err)
        }
      }
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

  // Container management - using v2 deployment API
  const checkContainerStatuses = async () => {
    if (!deployTarget) {
      console.warn('[QuickstartWizard] No deployment target available for status check')
      return
    }

    try {
      // Get all deployments for the local leader
      const response = await deploymentsApi.listDeployments({
        unode_hostname: deployTarget.identifier
      })
      const deployments = response.data

      console.log('[QuickstartWizard] Deployments from API:', deployments.map((d: Deployment) => ({ service_id: d.service_id, status: d.status })))
      console.log('[QuickstartWizard] Containers to check:', containers.map(c => c.name))

      setContainers((prev) =>
        prev.map((container) => {
          // Find deployment for this service
          // Note: deployment service_id includes compose file prefix, so we need to match by service name
          const deployment = deployments.find((d: Deployment) =>
            d.service_id.includes(container.name)
          )

          console.log(`[QuickstartWizard] Matching ${container.name}:`, deployment ? { service_id: deployment.service_id, status: deployment.status } : 'NOT FOUND')

          if (deployment) {
            const isRunning = deployment.status === 'running'
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
    if (!deployTarget) {
      setMessage({ type: 'error', text: 'No deployment target available' })
      return
    }

    setContainers((prev) =>
      prev.map((c) => (c.name === containerName ? { ...c, status: 'starting' } : c))
    )

    // Get display name for messages
    const container = containers.find((c) => c.name === containerName)
    const displayName = container?.displayName || containerName

    try {
      // Use v2 deployment API - deploy service to local leader
      // The service_id should match the service name from quickstart config
      await deploymentsApi.deploy(containerName, deployTarget.identifier)

      setMessage({ type: 'info', text: `Deploying ${displayName}... (pulling images if needed)` })

      // Poll for deployment status - longer timeout for image pulls
      let attempts = 0
      const maxAttempts = 60 // 120 seconds total (2 minutes for image pulls)

      const pollStatus = async () => {
        attempts++
        try {
          if (!deployTarget) return

          // Get deployments for this service
          const response = await deploymentsApi.listDeployments({
            unode_hostname: deployTarget.identifier
          })

          // Find this service's deployment
          const deployment = response.data.find((d: Deployment) =>
            d.service_id.includes(containerName)
          )

          console.log(`[QuickstartWizard] Poll ${containerName} attempt ${attempts}:`, deployment?.status)

          if (deployment && deployment.status === 'running') {
            setContainers((prev) =>
              prev.map((c) => (c.name === containerName ? { ...c, status: 'running' } : c))
            )

            // Update wizard context with service status
            updateServiceStatus(containerName, { configured: true, running: true })

            setMessage({ type: 'success', text: `${displayName} started successfully!` })
            return
          }

          if (deployment && deployment.status === 'failed') {
            setContainers((prev) =>
              prev.map((c) =>
                c.name === containerName
                  ? { ...c, status: 'error', error: 'Deployment failed' }
                  : c
              )
            )
            setMessage({ type: 'error', text: `${displayName} deployment failed` })
            return
          }

          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 2000)
          } else {
            // Timeout - check final status
            if (deployment && deployment.status === 'deploying') {
              // Still deploying - probably pulling large images
              setContainers((prev) =>
                prev.map((c) =>
                  c.name === containerName
                    ? { ...c, status: 'running' } // Assume it will succeed
                    : c
                )
              )
              updateServiceStatus(containerName, { configured: true, running: true })
              setMessage({ type: 'info', text: `${displayName} deployment in progress (may take a few more minutes)` })
            } else {
              setMessage({ type: 'info', text: `${displayName} status check timed out` })
            }
          }
        } catch (err) {
          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 2000)
          } else {
            setMessage({ type: 'error', text: `Failed to check ${displayName} status` })
          }
        }
      }

      setTimeout(pollStatus, 3000) // Start polling after 3 seconds
    } catch (error) {
      setContainers((prev) =>
        prev.map((c) =>
          c.name === containerName
            ? { ...c, status: 'error', error: getErrorMessage(error, 'Failed to deploy') }
            : c
        )
      )
      setMessage({ type: 'error', text: getErrorMessage(error, `Failed to deploy ${displayName}`) })
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
          profiles={quickstartConfig?.profiles ?? []}
          activeProfile={quickstartConfig?.active_profile ?? null}
          onProfileSelect={handleProfileSelect}
          isProfileChanging={isProfileChanging}
          onOpenWizard={(wizardId) => navigate(`/wizard/${wizardId}`)}
        />
      )}

      {/* Step 3: Complete */}
      {wizard.currentStep.id === 'complete' && <CompleteStep />}
    </WizardShell>
  )
}

// Step 1: API Keys - now uses shared RequiredFieldsForm component
function ApiKeysStep({ capabilities }: { capabilities: CapabilityRequirement[] }) {
  return (
    <div data-testid="quickstart-step-api-keys">
      <RequiredFieldsForm
        capabilities={capabilities}
        testIdPrefix="quickstart"
        emptyMessage={{
          title: 'All Set!',
          description: 'All required API keys are already configured. Click next to start services.'
        }}
        showHeader={true}
        headerTitle="Configure API Keys"
        headerDescription="Enter your API keys to enable AI features. These will be securely stored."
      />
    </div>
  )
}

// Step 2: Start Services
interface StartServicesStepProps {
  containers: ContainerInfo[]
  onStart: (name: string) => void
  onRefresh: () => void
  profiles: ServiceProfile[]
  activeProfile: string | null
  onProfileSelect: (name: string) => Promise<void>
  isProfileChanging: boolean
  onOpenWizard: (wizardId: string) => void
}

function StartServicesStep({
  containers,
  onStart,
  onRefresh,
  profiles,
  activeProfile,
  onProfileSelect,
  isProfileChanging,
  onOpenWizard,
}: StartServicesStepProps) {
  const activeProfileData = profiles.find((p) => p.name === activeProfile)

  return (
    <div data-testid="quickstart-step-start-services" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Start Core Services
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose a service profile, then start the containers to enable the web client.
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

      {/* Profile picker */}
      {profiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Service Profile</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {profiles.map((profile) => {
              const isActive = profile.name === activeProfile
              return (
                <button
                  key={profile.name}
                  data-testid={`quickstart-profile-${profile.name}`}
                  onClick={() => !isActive && onProfileSelect(profile.name)}
                  disabled={isProfileChanging}
                  className={`text-left p-4 rounded-lg border-2 transition-colors ${
                    isActive
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 bg-white dark:bg-gray-800'
                  } ${isProfileChanging ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                      {profile.display_name}
                    </span>
                    {isActive && (
                      <CheckCircle
                        data-testid={`quickstart-profile-${profile.name}-active`}
                        className="w-4 h-4 text-primary-500 shrink-0"
                      />
                    )}
                    {isProfileChanging && !isActive && (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                    {profile.services.join(', ')}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Wizard link for active profile */}
          {activeProfileData?.wizard && (
            <div className="p-3 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
              <div className="flex items-center justify-between">
                <p className="text-sm text-primary-800 dark:text-primary-200">
                  This profile has a guided setup wizard with more options.
                </p>
                <button
                  data-testid={`quickstart-profile-wizard-link-${activeProfileData.wizard}`}
                  onClick={() => onOpenWizard(activeProfileData.wizard!)}
                  className="flex items-center gap-1.5 text-sm font-medium text-primary-700 dark:text-primary-300 hover:text-primary-900 dark:hover:text-primary-100 whitespace-nowrap ml-3"
                >
                  Open Wizard
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
function CompleteStep() {
  const navigate = useNavigate()

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

      <WhatsNext currentLevel={1} onGoHome={() => navigate('/')} />
    </div>
  )
}
