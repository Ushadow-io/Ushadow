import { useState, useEffect } from 'react'
import { CheckCircle, Loader, ChevronRight } from 'lucide-react'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import EnvVarEditor from './EnvVarEditor'
import { kubernetesApi, servicesApi, svcConfigsApi, deploymentsApi, DeployTarget, EnvVarInfo, EnvVarConfig } from '../services/api'

interface DeployModalProps {
  isOpen: boolean
  onClose: () => void
  target?: DeployTarget  // Optional - if not provided, show target selection
  availableTargets?: DeployTarget[]  // For target selection
  infraServices?: Record<string, any>  // K8s only - infrastructure scan data
  preselectedServiceId?: string  // If provided, skip service selection step
}

interface ServiceOption {
  service_id: string
  service_name: string
  display_name: string
  description?: string
  image?: string
  requires?: string[]
}

export default function DeployModal({ isOpen, onClose, target: initialTarget, availableTargets = [], infraServices: initialInfraServices = {}, preselectedServiceId }: DeployModalProps) {
  const [step, setStep] = useState<'target' | 'select' | 'configure' | 'deploying' | 'complete'>(
    !initialTarget && availableTargets.length > 1 ? 'target' :
    preselectedServiceId ? 'configure' : 'select'
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
        const infraValue = getInfraValueForEnvVar(envVar.name, infraServices)
        console.log(`🔍 Checking env var ${envVar.name}:`, { infraValue, infraServices })

        if (infraValue) {
          // Override with infrastructure value for K8s cluster-specific endpoints
          // Mark as locked so user can't edit
          initialConfigs[envVar.name] = {
            name: envVar.name,
            source: 'new_setting',
            value: infraValue,
            new_setting_path: `api_keys.${envVar.name.toLowerCase()}`,
            setting_path: undefined,
            locked: true,
            provider_name: 'K8s Infrastructure'
          }
        } else {
          // Use data from API response (backend already mapped to settings)
          // Note: backend sends resolved_value, not value
          initialConfigs[envVar.name] = {
            name: envVar.name,
            source: (envVar.source as 'setting' | 'new_setting' | 'literal' | 'default') || 'default',
            setting_path: envVar.setting_path,
            value: envVar.resolved_value,  // Use resolved_value from backend
            new_setting_path: undefined
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

    // MongoDB - be specific about which env vars get which values
    if (upperName === 'MONGODB_DATABASE') {
      return 'ushadow'  // Just the database name
    }
    if (upperName.includes('MONGO') || upperName.includes('MONGODB')) {
      if (infraServices.mongo?.found && infraServices.mongo.endpoints.length > 0) {
        return `mongodb://${infraServices.mongo.endpoints[0]}/ushadow`
      }
    }

    // Redis
    if (upperName.includes('REDIS')) {
      if (infraServices.redis?.found && infraServices.redis.endpoints.length > 0) {
        return `redis://${infraServices.redis.endpoints[0]}/0`
      }
    }

    // Postgres
    if (upperName.includes('POSTGRES') || upperName.includes('DATABASE_URL')) {
      if (infraServices.postgres?.found && infraServices.postgres.endpoints.length > 0) {
        return `postgresql://ushadow:ushadow@${infraServices.postgres.endpoints[0]}/ushadow`
      }
    }

    // Qdrant - be specific about port vs base URL
    if (upperName === 'QDRANT_PORT') {
      return '6333'  // Just the port number
    }
    if (upperName.includes('QDRANT')) {
      if (infraServices.qdrant?.found && infraServices.qdrant.endpoints.length > 0) {
        return `http://${infraServices.qdrant.endpoints[0]}`
      }
    }

    return null
  }

  const handleDeploy = async () => {
    if (!selectedService || !selectedTarget) return

    try {
      setStep('deploying')
      setError(null)

      // Generate instance ID for this deployment target (only lowercase, numbers, hyphens)
      const sanitizedServiceId = selectedService.service_id.replace(/[^a-z0-9-]/g, '-')
      const targetName = selectedTarget.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      const instanceId = `${sanitizedServiceId}-${targetName}`

      // Build deployment_target format based on platform type
      const deploymentTarget = selectedTarget.type === 'k8s'
        ? `k8s://${selectedTarget.identifier}/${namespace}`
        : `docker://${selectedTarget.identifier}`

      // Convert env configs to instance config format
      const configValues: Record<string, any> = {}
      Object.entries(envConfigs).forEach(([name, config]) => {
        if (config.source === 'setting' && config.setting_path) {
          configValues[name] = { _from_setting: config.setting_path }
        } else if (config.source === 'new_setting' && config.value) {
          configValues[name] = config.value
          // Also save to settings if new_setting_path is specified
          if (config.new_setting_path) {
            configValues[`_save_${name}`] = config.new_setting_path
          }
        } else if (config.value) {
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
        await svcConfigsApi.getServiceConfig(instanceId)
        // ServiceConfig exists - update it
        await svcConfigsApi.updateServiceConfig(instanceId, {
          name: displayName,
          description: description,
          config: configValues,
          deployment_target: deploymentTarget
        })
      } catch {
        // ServiceConfig doesn't exist - create it
        await svcConfigsApi.createServiceConfig({
          id: instanceId,
          template_id: selectedService.service_id,
          name: displayName,
          description: description,
          config: configValues,
          deployment_target: deploymentTarget
        })
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
            config_id: instanceId
          }
        )
      } else {
        // Deploy to Docker (unode)
        deployResponse = await deploymentsApi.deploy(
          selectedService.service_id,
          selectedTarget.identifier,  // unode hostname
          instanceId
        )
      }

      setDeploymentResult(deployResponse.data.message || 'Deployment successful')
      setStep('complete')
    } catch (err: any) {
      console.error('Deployment failed:', err)
      setError(`Deployment failed: ${formatError(err)}`)
      setStep('configure')
    }
  }

  const handleEnvConfigChange = (envVarName: string, updates: Partial<EnvVarConfig>) => {
    setEnvConfigs(prev => ({
      ...prev,
      [envVarName]: { ...(prev[envVarName] || { name: envVarName }), ...updates } as EnvVarConfig
    }))
  }

  const handleTargetSelection = async (target: DeployTarget) => {
    setSelectedTarget(target)
    setError(null)

    // Use infrastructure from standardized DeployTarget field
    const infraData = target.infrastructure || {}
    console.log(`🔍 Using K8s infrastructure from ${target.name}:`, infraData)
    setInfraServices(infraData)

    setStep('select')
  }

  const renderTargetSelection = () => (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Select a deployment target
      </p>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {availableTargets.map((target) => (
          <button
            key={target.id}
            onClick={() => handleTargetSelection(target)}
            className="w-full p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors text-left"
            data-testid={`select-target-${target.identifier}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {target.name}
                </h4>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  {target.provider} • {target.region || 'unknown region'}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-neutral-400" />
            </div>
          </button>
        ))}
      </div>
    </div>
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
          Configure deployment settings for this service
        </p>
      </div>

      {error && (
        <div className="bg-danger-50 dark:bg-danger-900/20 rounded-lg p-4 text-danger-700 dark:text-danger-300 text-sm">
          {error}
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
          Deploy to {selectedTarget?.type === 'k8s' ? 'Kubernetes' : 'Docker'}
        </button>
      </div>
    </div>
  )

  const renderDeploying = () => (
    <div className="text-center py-12">
      <Loader className="h-12 w-12 text-primary-600 dark:text-primary-400 mx-auto mb-4 animate-spin" />
      <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
        Deploying {selectedService?.display_name}...
      </h4>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Creating ConfigMap, Secret, Deployment, and Service
      </p>
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
        title={selectedTarget ? `Deploy to ${selectedTarget.type === 'k8s' ? 'Kubernetes' : 'Docker'}` : 'Deploy Service'}
        maxWidth="xl"
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
