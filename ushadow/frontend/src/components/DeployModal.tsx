import { useState, useEffect } from 'react'
import { CheckCircle, Loader, ChevronRight, Cloud, HardDrive } from 'lucide-react'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import EnvVarEditor from './EnvVarEditor'
import DeployTargetSelector from './DeployTargetSelector'
import { kubernetesApi, servicesApi, svcConfigsApi, deploymentsApi, DeployTarget, EnvVarInfo, EnvVarConfig } from '../services/api'

interface DeployModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void  // Called after successful deployment
  mode?: 'deploy' | 'create-config'  // Mode: deploy (default) or just create config
  target?: DeployTarget  // Optional - if not provided, show target selection
  availableTargets?: DeployTarget[]  // For target selection
  infraServices?: Record<string, any>  // K8s only - infrastructure scan data
  preselectedServiceId?: string  // If provided, skip service selection step
  preselectedConfigId?: string  // If provided, use this config for deployment (overrides template defaults)
}

interface ServiceOption {
  service_id: string
  service_name: string
  display_name: string
  description?: string
  image?: string
  requires?: string[]
}

export default function DeployModal({ isOpen, onClose, onSuccess, mode = 'deploy', target: initialTarget, availableTargets = [], infraServices: initialInfraServices = {}, preselectedServiceId, preselectedConfigId }: DeployModalProps) {
  const [step, setStep] = useState<'target' | 'select' | 'configure' | 'deploying' | 'complete'>(
    // If no target selected and multiple targets available, show target selection
    !initialTarget && availableTargets.length > 1 ? 'target' :
    // If we have both service and target, go to configure
    preselectedServiceId && initialTarget ? 'configure' :
    // If we have service but no target (deploying from config), need target selection first
    preselectedServiceId && !initialTarget ? 'target' :
    // Otherwise show service selection
    'select'
  )
  const [selectedTarget, setSelectedTarget] = useState<DeployTarget | null>(initialTarget || null)
  const [infraServices, setInfraServices] = useState<Record<string, any>>(initialInfraServices)

  // Sync infra services from prop to state when it changes
  useEffect(() => {
    if (isOpen) {
      console.log('🚀 DeployModal infra services updated:', initialInfraServices)
      setInfraServices(initialInfraServices)
    }
  }, [isOpen, initialInfraServices])
  const [services, setServices] = useState<ServiceOption[]>([])
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null)
  const [namespace, setNamespace] = useState('ushadow')
  const [envVars, setEnvVars] = useState<EnvVarInfo[]>([])
  const [envConfigs, setEnvConfigs] = useState<Record<string, EnvVarConfig>>({})
  const [loadingEnvVars, setLoadingEnvVars] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deploymentResult, setDeploymentResult] = useState<string | null>(null)
  const [forceRebuild, setForceRebuild] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // If service is preselected, load env vars directly
      if (preselectedServiceId) {
        handleSelectService({
          service_id: preselectedServiceId,
          service_name: preselectedServiceId,
          display_name: preselectedServiceId,
        })
      } else {
        // Otherwise, load service list for selection
        loadServices()
      }
    }
  }, [isOpen, preselectedServiceId])

  const loadServices = async () => {
    try {
      // Use servicesApi instead of kubernetesApi to get installed compose services
      const response = await servicesApi.getInstalled()

      // Convert to the expected format
      const serviceOptions: ServiceOption[] = response.data
        .filter((svc: any) => svc.installed) // Only installed services
        .map((svc: any) => ({
          service_id: svc.service_id || svc.name,
          service_name: svc.name,
          display_name: svc.display_name || svc.name,
          description: svc.description,
          image: svc.image,
          requires: svc.requires || []
        }))

      setServices(serviceOptions)
    } catch (err: any) {
      console.error('Failed to load services:', err)
      setError('Failed to load services')
    }
  }

  const formatError = (err: any): string => {
    if (typeof err === 'string') return err

    // Handle Pydantic validation errors (array of error objects)
    if (Array.isArray(err)) {
      return err.map(e => e.msg || JSON.stringify(e)).join(', ')
    }

    // Handle error response from API
    const detail = err.response?.data?.detail
    if (detail) {
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail)) {
        return detail.map(e => e.msg || JSON.stringify(e)).join(', ')
      }
      return JSON.stringify(detail)
    }

    return err.message || 'An error occurred'
  }

  const handleSelectService = async (service: ServiceOption) => {
    setSelectedService(service)
    setError(null)
    setLoadingEnvVars(true)

    try {
      console.log('📦 Selected service:', service.service_id)
      console.log('🔧 Current infraServices state:', infraServices)

      // Load environment variable schema with suggestions from settingsStore
      // Pass deployment_target_id for unified deployment target resolution
      const envResponse = await servicesApi.getEnvConfig(
        service.service_id,
        selectedTarget?.id
      )
      const envData = envResponse.data

      // Initialize env vars and configs (EXACT same pattern as ServicesPage)
      const allEnvVars = [...envData.required_env_vars, ...envData.optional_env_vars]
      setEnvVars(allEnvVars)

      // Use API response data directly (backend already did smart mapping)
      // ONLY override with infrastructure detection for K8s-specific values
      const initialConfigs: Record<string, EnvVarConfig> = {}
      allEnvVars.forEach(envVar => {
        // Skip infrastructure detection if no services detected or in create-config mode without target
        const hasInfraServices = infraServices && Object.keys(infraServices).length > 0
        const infraValue = hasInfraServices ? getInfraValueForEnvVar(envVar.name, infraServices) : null
        console.log(`🔍 Checking env var ${envVar.name}:`, { infraValue, hasInfraServices, infraServices })

        if (infraValue) {
          // Pre-fill with infrastructure value for K8s cluster-specific endpoints
          // Don't lock - user should be able to override if needed
          // Mark as NOT template default since this is detected infra
          initialConfigs[envVar.name] = {
            name: envVar.name,
            source: 'new_setting',
            value: infraValue,
            new_setting_path: `api_keys.${envVar.name.toLowerCase()}`,
            setting_path: undefined,
            locked: false,  // Allow editing - infra values are suggestions, not requirements
            provider_name: 'K8s Infrastructure',
            _isTemplateDefault: false  // This is detected infrastructure, should be saved
          }
        } else {
          // Use data from API response (backend already mapped to settings)
          // Mark as NOT user-modified initially - these are template defaults
          const fallbackValue = envVar.resolved_value || envVar.value || envVar.default_value || ''
          initialConfigs[envVar.name] = {
            name: envVar.name,
            source: (envVar.source as 'setting' | 'new_setting' | 'literal' | 'default') || 'default',
            setting_path: envVar.setting_path,
            value: fallbackValue,
            new_setting_path: undefined,
            _isTemplateDefault: true  // Mark as coming from template, not user override
          }
        }
      })

      setEnvConfigs(initialConfigs)
      setStep('configure')
    } catch (err: any) {
      console.error('Failed to load env config:', err)
      setError(`Failed to load environment configuration: ${formatError(err)}`)
    } finally {
      setLoadingEnvVars(false)
    }
  }

  // Helper to get infrastructure endpoint for common env vars
  const getInfraValueForEnvVar = (envVarName: string, infraServices: Record<string, any>): string | null => {
    const upperName = envVarName.toUpperCase()

    // MongoDB - only set connection URL from infrastructure, not database name
    // Database name should come from settings/environment via MONGODB_DATABASE
    if (upperName.includes('MONGO') || upperName.includes('MONGODB')) {
      if (infraServices.mongo?.found && infraServices.mongo.endpoints.length > 0) {
        // MongoDB URL without database name - services specify database separately
        return `mongodb://${infraServices.mongo.endpoints[0]}`
      }
    }

    // Redis
    if (upperName.includes('REDIS')) {
      if (infraServices.redis?.found && infraServices.redis.endpoints.length > 0) {
        return `redis://${infraServices.redis.endpoints[0]}/0`
      }
    }

    // Postgres - infrastructure detection should not hardcode credentials/database
    // These should come from settings/environment
    if (upperName.includes('POSTGRES') || upperName.includes('DATABASE_URL')) {
      if (infraServices.postgres?.found && infraServices.postgres.endpoints.length > 0) {
        // Return host:port only - credentials and database should come from settings
        return infraServices.postgres.endpoints[0]
      }
    }

    // Qdrant - be specific about port vs base URL
    if (upperName === 'QDRANT_PORT') {
      // Only return port if qdrant infrastructure is actually detected
      if (infraServices.qdrant?.found) {
        return '6333'  // Just the port number
      }
    }
    if (upperName.includes('QDRANT')) {
      if (infraServices.qdrant?.found && infraServices.qdrant.endpoints.length > 0) {
        return `http://${infraServices.qdrant.endpoints[0]}`
      }
    }

    return null
  }

  const handleDeploy = async () => {
    if (!selectedService) return
    if (mode === 'deploy' && !selectedTarget) return

    try {
      setStep('deploying')
      setError(null)

      // For create-config mode, we don't need a target
      if (mode === 'create-config' && !selectedTarget) {
        // Create a config without deploying
        const sanitizedServiceId = selectedService.service_id.replace(/[^a-z0-9-]/g, '-')
        const instanceId = `${sanitizedServiceId}-config-${Date.now()}`

        // Convert env configs to instance config format
        // ONLY save user modifications - skip template defaults
        const configValues: Record<string, any> = {}
        console.log('💾 Saving config - filtering out template defaults:')
        Object.entries(envConfigs).forEach(([name, config]) => {
          // Skip if this is a template default (user didn't change it)
          if ((config as any)._isTemplateDefault) {
            console.log(`  ⏭️  Skipping ${name} (template default)`)
            return  // Don't save - template already defines this
          }
          console.log(`  ✅ Saving ${name} (user modified)`, config)

          // User explicitly changed the mapping
          if (config.setting_path) {
            configValues[name] = `@${config.setting_path}`
          }
          // User entered a new value
          else if (config.source === 'new_setting' && config.new_setting_path && config.value) {
            configValues[name] = `@${config.new_setting_path}`
          }
          // User entered a literal value
          else if (config.value !== undefined && config.value !== '') {
            configValues[name] = config.value
          }
        })

        console.log('📦 Final config values to save:', configValues)

        // Create ServiceConfig
        await svcConfigsApi.createServiceConfig({
          id: instanceId,
          template_id: selectedService.service_id,
          name: `${selectedService.display_name} Config`,
          description: 'Configuration created from template',
          config: configValues,
        })

        setDeploymentResult(`Configuration "${selectedService.display_name} Config" created successfully`)
        setStep('complete')
        onSuccess?.()
        return
      }

      // Determine which config to use for deployment
      let configId: string

      if (preselectedConfigId) {
        // Use existing config - don't create a new one
        configId = preselectedConfigId
        console.log('📦 Using preselected config:', configId)
      } else {
        // Generate instance ID for this deployment target (only lowercase, numbers, hyphens)
        const sanitizedServiceId = selectedService.service_id.replace(/[^a-z0-9-]/g, '-')
        const targetName = selectedTarget.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        configId = `${sanitizedServiceId}-${targetName}`

        // Build deployment_target format based on platform type
        const deploymentTarget = selectedTarget.type === 'k8s'
          ? `k8s://${selectedTarget.identifier}/${namespace}`
          : `docker://${selectedTarget.identifier}`

        // Convert env configs to instance config format
        // ONLY save user modifications - skip template defaults
        const configValues: Record<string, any> = {}
        Object.entries(envConfigs).forEach(([name, config]) => {
          // Skip if this is a template default (user didn't change it)
          if ((config as any)._isTemplateDefault) {
            return  // Don't save - template already defines this
          }

          if (config.source === 'setting' && config.setting_path) {
            configValues[name] = { _from_setting: config.setting_path }
          } else if (config.source === 'new_setting' && config.value) {
            configValues[name] = config.value
            // Also save to settings if new_setting_path is specified
            if (config.new_setting_path) {
              configValues[`_save_${name}`] = config.new_setting_path
            }
          } else if (config.value !== undefined && config.value !== '') {
            configValues[name] = config.value
          }
        })

        // Generate name/description based on target type
        const displayName = selectedTarget.type === 'k8s'
          ? `${selectedService.display_name} (${selectedTarget.name}/${namespace})`
          : `${selectedService.display_name} (${selectedTarget.name})`

        const description = selectedTarget.type === 'k8s'
          ? `K8s deployment to ${selectedTarget.name} in ${namespace} namespace`
          : `Docker deployment to ${selectedTarget.name}`

        // Step 1: Create or update instance with this configuration
        try {
          // Try to get existing instance
          await svcConfigsApi.getServiceConfig(configId)
          // ServiceConfig exists - update it
          await svcConfigsApi.updateServiceConfig(configId, {
            name: displayName,
            description: description,
            config: configValues,
          })
        } catch {
          // ServiceConfig doesn't exist - create it
          await svcConfigsApi.createServiceConfig({
            id: configId,
            template_id: selectedService.service_id,
            name: displayName,
            description: description,
            config: configValues,
          })
        }
      }

      // Step 2: Deploy based on target type
      let deployResponse
      if (selectedTarget.type === 'k8s') {
        // Deploy to Kubernetes
        deployResponse = await kubernetesApi.deployService(
          selectedTarget.identifier,
          {
            service_id: selectedService.service_id,
            namespace: namespace,
            config_id: configId
          }
        )
      } else {
        // Deploy to Docker (unode)
        deployResponse = await deploymentsApi.deploy(
          selectedService.service_id,
          selectedTarget.identifier,  // unode hostname
          configId,
          forceRebuild
        )
      }

      setDeploymentResult(deployResponse.data.message || 'Deployment successful')
      setStep('complete')

      // Notify parent of successful deployment
      onSuccess?.()
    } catch (err: any) {
      console.error('Deployment failed:', err)
      setError(`Deployment failed: ${formatError(err)}`)
      setStep('configure')
    }
  }

  const handleEnvConfigChange = (envVarName: string, updates: Partial<EnvVarConfig>) => {
    setEnvConfigs(prev => ({
      ...prev,
      [envVarName]: {
        ...(prev[envVarName] || { name: envVarName }),
        ...updates,
        _isTemplateDefault: false  // Mark as user-modified
      } as EnvVarConfig
    }))
  }

  const handleTargetSelection = async (target: DeployTarget) => {
    setSelectedTarget(target)
    setError(null)

    // Use infrastructure from standardized DeployTarget field
    const infraData = target.infrastructure || {}
    console.log(`🔍 Selected target ${target.name} with infrastructure:`, infraData)
    setInfraServices(infraData)

    // If service is already selected, re-query env vars with infrastructure detection
    if (selectedService) {
      console.log(`🔄 Re-querying env vars for ${selectedService.service_id} with target ${target.id}`)
      setLoadingEnvVars(true)
      try {
        // Re-load environment variable schema with infrastructure from selected target
        const envResponse = await servicesApi.getEnvConfig(
          selectedService.service_id,
          target.id
        )
        const envData = envResponse.data

        // Re-initialize env vars and configs with new infrastructure detection
        const allEnvVars = [...envData.required_env_vars, ...envData.optional_env_vars]
        setEnvVars(allEnvVars)

        // Re-detect infrastructure values with new target
        const updatedConfigs: Record<string, EnvVarConfig> = {}
        allEnvVars.forEach(envVar => {
          const hasInfraServices = infraData && Object.keys(infraData).length > 0
          const infraValue = hasInfraServices ? getInfraValueForEnvVar(envVar.name, infraData) : null

          if (infraValue) {
            // Infrastructure detected - use 'infra' source to display nicely
            updatedConfigs[envVar.name] = {
              name: envVar.name,
              source: 'infra',
              value: infraValue,
              new_setting_path: undefined,
              setting_path: undefined,
              locked: true,  // Lock to prevent accidental changes
              provider_name: `${target.type === 'k8s' ? 'K8s' : 'Docker'} Infrastructure`,
              _isTemplateDefault: false  // Infrastructure values should be saved
            }
          } else {
            // Use existing config or template default
            const existing = envConfigs[envVar.name]
            if (existing) {
              updatedConfigs[envVar.name] = existing
            } else {
              const fallbackValue = envVar.resolved_value || envVar.value || envVar.default_value || ''
              updatedConfigs[envVar.name] = {
                name: envVar.name,
                source: (envVar.source as 'setting' | 'new_setting' | 'literal' | 'default') || 'default',
                setting_path: envVar.setting_path,
                value: fallbackValue,
                new_setting_path: undefined,
                _isTemplateDefault: true  // Template default
              }
            }
          }
        })

        setEnvConfigs(updatedConfigs)
        setStep('configure')
      } catch (err: any) {
        console.error('Failed to reload env config:', err)
        setError(`Failed to reload environment configuration: ${formatError(err)}`)
      } finally {
        setLoadingEnvVars(false)
      }
    } else if (preselectedServiceId) {
      // Service not loaded yet, load it
      setStep('configure')
      await handleSelectService({
        service_id: preselectedServiceId,
        service_name: preselectedServiceId,
        display_name: preselectedServiceId,
      })
    } else {
      // No service selected, go to service selection
      setStep('select')
    }
  }

  const renderTargetSelection = () => (
    <DeployTargetSelector
      targets={availableTargets}
      selectedTarget={selectedTarget}
      onSelect={handleTargetSelection}
      label={selectedService
        ? `Select deployment target for ${selectedService.display_name}`
        : 'Select a deployment target'
      }
      showInfrastructure={true}
    />
  )

  const renderSelectService = () => (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Select a service to deploy to <strong>{selectedTarget?.name}</strong>
        {selectedTarget?.type === 'k8s' && (
          <> in namespace <code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded">{namespace}</code></>
        )}
      </p>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {services.map((service) => (
          <button
            key={service.service_id}
            onClick={() => handleSelectService(service)}
            className="w-full p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors text-left"
            data-testid={`select-service-${service.service_name}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {service.display_name}
                </h4>
                {service.description && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                    {service.description}
                  </p>
                )}
                {service.requires && service.requires.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {service.requires.map((req) => (
                      <span
                        key={req}
                        className="text-xs px-2 py-0.5 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                      >
                        {req}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <ChevronRight className="h-5 w-5 text-neutral-400" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  const renderConfigureEnvVars = () => (
    <div className="space-y-4">
      <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4">
        <h4 className="font-semibold text-primary-900 dark:text-primary-100 mb-2">
          {selectedService?.display_name}
        </h4>
        <p className="text-sm text-primary-700 dark:text-primary-300">
          {mode === 'create-config'
            ? 'Create a configuration for this service. You can deploy it later to any target.'
            : 'Configure deployment settings for this service'}
        </p>
      </div>

      {error && (
        <div className="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-danger-600 dark:text-danger-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-danger-800 dark:text-danger-300 mb-1">Deployment Failed</h4>
              <p className="text-sm text-danger-700 dark:text-danger-300 whitespace-pre-wrap">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Target selector in deploy mode */}
      {mode === 'deploy' && availableTargets.length > 0 && !selectedTarget && (
        <DeployTargetSelector
          targets={availableTargets}
          selectedTarget={selectedTarget}
          onSelect={handleTargetSelection}
          label={selectedService
            ? `Select deployment target for ${selectedService.display_name}`
            : 'Select a deployment target'
          }
          showInfrastructure={true}
        />
      )}

      {/* Show selected target with change option */}
      {mode === 'deploy' && selectedTarget && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Deployment Target
          </label>
          <button
            onClick={() => setSelectedTarget(null)}
            className="w-full text-left p-4 rounded-lg border border-primary-500 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
            data-testid="change-deploy-target"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 text-primary-600 dark:text-primary-400 mt-0.5">
                {selectedTarget.type === 'k8s' ? <Cloud className="h-5 w-5" /> : <HardDrive className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-1">
                  {selectedTarget.name}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <span className={`px-2 py-0.5 rounded ${
                    selectedTarget.type === 'k8s'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                  }`}>
                    {selectedTarget.type === 'k8s' ? 'Kubernetes' : 'Docker'}
                  </span>
                  <span className={`px-2 py-0.5 rounded ${
                    selectedTarget.status === 'online'
                      ? 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                  }`}>
                    {selectedTarget.status}
                  </span>
                  {selectedTarget.environment && (
                    <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                      {selectedTarget.environment}
                    </span>
                  )}
                  {selectedTarget.infrastructure && Object.keys(selectedTarget.infrastructure).length > 0 && (
                    <span className="text-success-600 dark:text-success-400">
                      • Infrastructure detected
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 text-neutral-400">
                <ChevronRight className="h-5 w-5 rotate-90" />
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Namespace input (K8s only) */}
      {selectedTarget?.type === 'k8s' && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Target Namespace
          </label>
          <input
            type="text"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            placeholder="default"
            className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
            data-testid="deploy-namespace-input"
          />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Kubernetes namespace where the service will be deployed
          </p>
        </div>
      )}

      {/* Force Rebuild (Docker only) */}
      {mode === 'deploy' && selectedTarget?.type !== 'k8s' && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
          <input
            type="checkbox"
            id="force-rebuild"
            checked={forceRebuild}
            onChange={(e) => setForceRebuild(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
            data-testid="force-rebuild-checkbox"
          />
          <label htmlFor="force-rebuild" className="flex-1 cursor-pointer">
            <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Force rebuild Docker image
            </span>
            <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Rebuild the image even if it already exists locally (useful after code changes)
            </span>
          </label>
        </div>
      )}

      {/* Environment Variables */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Environment Variables
        </label>
        {loadingEnvVars ? (
          <div className="flex items-center justify-center py-12 rounded-lg border border-neutral-200 dark:border-neutral-700">
            <Loader className="h-6 w-6 animate-spin text-primary-600" />
            <span className="ml-3 text-sm text-neutral-600 dark:text-neutral-400">Loading configuration...</span>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
            {envVars.map((envVar) => {
              const config = envConfigs[envVar.name] || {
                name: envVar.name,
                source: 'default',
                value: undefined,
                setting_path: undefined,
                new_setting_path: undefined
              }

              return (
                <EnvVarEditor
                  key={envVar.name}
                  envVar={envVar}
                  config={config}
                  onChange={(updates) => handleEnvConfigChange(envVar.name, updates)}
                  mode={mode === 'create-config' ? 'config' : 'deploy'}
                />
              )
            })}
          </div>
        )}
      </div>

      <div className="flex justify-between items-center pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <button
          onClick={() => setStep('select')}
          className="btn-secondary"
        >
          Back
        </button>
        <button
          onClick={handleDeploy}
          disabled={loadingEnvVars}
          className="btn-primary"
          data-testid="deploy-service-btn"
        >
          {mode === 'create-config'
            ? 'Create Configuration'
            : `Deploy to ${selectedTarget?.type === 'k8s' ? 'Kubernetes' : 'Docker'}`}
        </button>
      </div>
    </div>
  )

  const renderDeploying = () => (
    <div className="text-center py-12">
      <Loader className="h-12 w-12 text-primary-600 dark:text-primary-400 mx-auto mb-4 animate-spin" />
      <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
        {mode === 'create-config'
          ? `Creating configuration for ${selectedService?.display_name}...`
          : `Deploying ${selectedService?.display_name}...`}
      </h4>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {mode === 'create-config'
          ? 'Saving configuration mappings'
          : 'Building image and creating deployment...'}
      </p>
      {mode !== 'create-config' && (
        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-2">
          This may take several minutes if building Docker images
        </p>
      )}
    </div>
  )

  const renderComplete = () => (
    <div className="text-center py-12">
      <CheckCircle className="h-12 w-12 text-success-600 dark:text-success-400 mx-auto mb-4" />
      <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
        Deployment Successful!
      </h4>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
        {deploymentResult}
      </p>
      {selectedTarget?.type === 'k8s' && (
        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4 text-left">
          <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-2">
            <strong>Check deployment status:</strong>
          </p>
          <code className="block text-xs bg-neutral-100 dark:bg-neutral-900 px-3 py-2 rounded font-mono">
            kubectl get pods -n {namespace}
          </code>
        </div>
      )}
      <button
        onClick={onClose}
        className="btn-primary mt-6"
        data-testid="close-deployment-modal"
      >
        Done
      </button>
    </div>
  )

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          mode === 'create-config'
            ? 'Create Service Configuration'
            : (selectedTarget ? `Deploy to ${selectedTarget.type === 'k8s' ? 'Kubernetes' : 'Docker'}` : 'Deploy Service')
        }
        maxWidth="4xl"
        testId="deploy-modal"
      >
        {step === 'target' && renderTargetSelection()}
        {step === 'select' && renderSelectService()}
        {step === 'configure' && renderConfigureEnvVars()}
        {step === 'deploying' && renderDeploying()}
        {step === 'complete' && renderComplete()}
      </Modal>

    </>
  )
}
