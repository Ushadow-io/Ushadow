/**
 * ServicesTab - Services tab content with FlatServiceCard grid
 * Organized into API/Workers and UI subtabs
 */

import { useState } from 'react'
import { Package, Server, Monitor } from 'lucide-react'
import { FlatServiceCard } from '../wiring'
import EmptyState from './EmptyState'
import { Template, ServiceConfig, Wiring, DeployTarget } from '../../services/api'

interface ServicesTabProps {
  composeTemplates: Template[]
  instances: ServiceConfig[]
  wiring: Wiring[]
  providerTemplates: Template[]
  serviceStatuses: Record<string, any>
  deployments: any[]
  splitServicesEnabled?: boolean // Feature flag for split services view
  onAddConfig: (serviceId: string) => void
  onWiringChange: (consumerId: string, capability: string, sourceConfigId: string) => Promise<void>
  onWiringClear: (consumerId: string, capability: string) => Promise<void>
  onConfigCreate: (templateId: string, name: string, configValues: any) => Promise<string>
  onEditConfig: (config: ServiceConfig) => void
  onDeleteConfig: (configId: string, configName: string) => void
  onUpdateConfig: (configId: string, updates: Partial<ServiceConfig>) => void
  onStart: (serviceId: string) => Promise<void>
  onStop: (serviceId: string) => Promise<void>
  onEdit: (serviceId: string) => void
  onDeploy: (serviceId: string, target: DeployTarget) => void
  onStopDeployment: (id: string) => void
  onRestartDeployment: (id: string) => void
  onRemoveDeployment: (id: string, name: string) => void
  onEditDeployment: (deployment: any) => void
}

type ServiceSubTab = 'api' | 'ui'

export default function ServicesTab({
  composeTemplates,
  instances,
  wiring,
  providerTemplates,
  serviceStatuses,
  deployments,
  splitServicesEnabled = false,
  onAddConfig,
  onWiringChange,
  onWiringClear,
  onConfigCreate,
  onEditConfig,
  onDeleteConfig,
  onUpdateConfig,
  onStart,
  onStop,
  onEdit,
  onDeploy,
  onStopDeployment,
  onRestartDeployment,
  onRemoveDeployment,
  onEditDeployment,
}: ServicesTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<ServiceSubTab>('api')

  if (composeTemplates.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title='No services installed yet. Click "Browse Services" to add some.'
      />
    )
  }

  // Legacy view: show all services in a single grid
  if (!splitServicesEnabled) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Select providers for each service capability
          </p>
        </div>

        {/* Service Cards - Masonry Layout */}
        <div className="columns-1 xl:columns-2 gap-4 pb-8">
          {composeTemplates.map((template) => {
            // Find ALL configs for this template
            const templateConfigs = instances.filter((i) => i.template_id === template.id)
            // Show the first config (or null if none)
            const config = templateConfigs[0] || null
            const consumerId = config?.id || template.id

            // Get service status from Docker
            const serviceName = template.id.includes(':') ? template.id.split(':').pop()! : template.id
            const status = serviceStatuses[serviceName]

            // Filter wiring for this consumer
            const consumerWiring = wiring.filter((w) => w.target_config_id === consumerId)

            // Get deployments for this service
            const serviceDeployments = deployments.filter((d) => d.service_id === template.id)

            return (
              <div key={template.id} className="break-inside-avoid mb-4">
                <FlatServiceCard
                  template={template}
                  config={config ? { ...config, status: status?.status || config.status } : null}
                  wiring={consumerWiring}
                  providerTemplates={providerTemplates}
                  initialConfigs={templateConfigs}
                  instanceCount={templateConfigs.length}
                  deployments={serviceDeployments}
                  onStopDeployment={onStopDeployment}
                  onRestartDeployment={onRestartDeployment}
                  onRemoveDeployment={onRemoveDeployment}
                  onEditDeployment={onEditDeployment}
                  onAddConfig={() => onAddConfig(template.id)}
                  onWiringChange={(capability, sourceConfigId) =>
                    onWiringChange(consumerId, capability, sourceConfigId)
                  }
                  onWiringClear={(capability) => onWiringClear(consumerId, capability)}
                  onConfigCreate={onConfigCreate}
                  onEditConfig={onEditConfig}
                  onDeleteConfig={onDeleteConfig}
                  onUpdateConfig={onUpdateConfig}
                  onStart={() => onStart(template.id)}
                  onStop={() => onStop(template.id)}
                  onEdit={() => onEdit(template.id)}
                  onDeploy={(target) => onDeploy(template.id, target)}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Separate services into UI and non-UI (API/Workers)
  // UI services have "ui" or "frontend" in their name
  const isUiService = (template: Template) => {
    const name = template.name.toLowerCase()
    return name.includes('ui') || name.includes('frontend')
  }

  const uiServices = composeTemplates.filter(isUiService)

  const apiServices = composeTemplates.filter((template) => !isUiService(template))

  // Group workers with their corresponding API services
  // Workers typically have "-worker" or "-workers" in their name
  const groupedApiServices = apiServices.reduce((acc, template) => {
    const templateName = template.name.toLowerCase()

    // Check if this is a worker
    if (templateName.includes('worker')) {
      // Try to find the corresponding API service
      // Remove "worker", "workers", "-worker", "-workers", "python", etc. to find the base name
      const baseName = templateName
        .replace(/[-_\s]?workers?[-_\s]?/gi, '')
        .replace(/[-_\s]?(python|node|go|rust)[-_\s]?/gi, '') // Remove language qualifiers
        .trim()

      // Find the API service that matches this base name
      // Check both directions: parent contains baseName OR baseName contains parent
      const apiService = apiServices.find(t => {
        if (t.name.toLowerCase().includes('worker')) return false
        const parentName = t.name.toLowerCase()
        return parentName.includes(baseName) || baseName.includes(parentName)
      })

      if (apiService) {
        // Add this worker to the API service's workers array
        const existingGroup = acc.find(g => g.api.id === apiService.id)
        if (existingGroup) {
          existingGroup.workers.push(template)
        } else {
          acc.push({ api: apiService, workers: [template] })
        }
        return acc
      }
    }

    // This is an API service (non-worker)
    // Check if we already have a group for it
    const existingGroup = acc.find(g => g.api.id === template.id)
    if (!existingGroup) {
      acc.push({ api: template, workers: [] })
    }

    return acc
  }, [] as Array<{ api: Template; workers: Template[] }>)

  // Helper to get worker data in the format expected by FlatServiceCard
  const getWorkerData = (workerTemplates: Template[]) => {
    return workerTemplates.map((workerTemplate) => {
      const workerConfigs = instances.filter((i) => i.template_id === workerTemplate.id)
      const workerConfig = workerConfigs[0] || null
      const workerServiceName = workerTemplate.id.includes(':')
        ? workerTemplate.id.split(':').pop()!
        : workerTemplate.id
      const workerStatus = serviceStatuses[workerServiceName]
      const workerDeployments = deployments.filter((d) => d.service_id === workerTemplate.id)

      return {
        template: workerTemplate,
        config: workerConfig,
        status: workerStatus?.status || 'stopped',
        deployments: workerDeployments,
      }
    })
  }

  const renderServiceCard = (template: Template, workerTemplates: Template[] = []) => {
    // Find ALL configs for this template
    const templateConfigs = instances.filter((i) => i.template_id === template.id)
    // Show the first config (or null if none)
    const config = templateConfigs[0] || null
    const consumerId = config?.id || template.id

    // Get service status from Docker
    const serviceName = template.id.includes(':') ? template.id.split(':').pop()! : template.id
    const status = serviceStatuses[serviceName]

    // Filter wiring for this consumer
    const consumerWiring = wiring.filter((w) => w.target_config_id === consumerId)

    // Get deployments for this service
    const serviceDeployments = deployments.filter((d) => d.service_id === template.id)

    // Prepare worker data
    const workers = getWorkerData(workerTemplates)

    return (
      <FlatServiceCard
        key={template.id}
        template={template}
        config={config ? { ...config, status: status?.status || config.status } : null}
        wiring={consumerWiring}
        providerTemplates={providerTemplates}
        initialConfigs={templateConfigs}
        instanceCount={templateConfigs.length}
        deployments={serviceDeployments}
        onStopDeployment={onStopDeployment}
        onRestartDeployment={onRestartDeployment}
        onRemoveDeployment={onRemoveDeployment}
        onEditDeployment={onEditDeployment}
        onAddConfig={() => onAddConfig(template.id)}
        onWiringChange={(capability, sourceConfigId) =>
          onWiringChange(consumerId, capability, sourceConfigId)
        }
        onWiringClear={(capability) => onWiringClear(consumerId, capability)}
        onConfigCreate={onConfigCreate}
        onEditConfig={onEditConfig}
        onDeleteConfig={onDeleteConfig}
        onUpdateConfig={onUpdateConfig}
        onStart={() => onStart(template.id)}
        onStop={() => onStop(template.id)}
        onEdit={() => onEdit(template.id)}
        onDeploy={(target) => onDeploy(template.id, target)}
        workers={workers}
        onStartWorker={onStart}
        onStopWorker={onStop}
        onEditWorker={onEdit}
        onDeployWorker={(templateId, target) => onDeploy(templateId, target)}
      />
    )
  }

  const currentServices = activeSubTab === 'api' ? groupedApiServices : uiServices

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-700">
        <button
          onClick={() => setActiveSubTab('api')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeSubTab === 'api'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
          data-testid="api-tab"
        >
          <Server className="h-4 w-4" />
          API & Workers
          <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
            {groupedApiServices.length}
          </span>
        </button>
        <button
          onClick={() => setActiveSubTab('ui')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeSubTab === 'ui'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
          data-testid="ui-tab"
        >
          <Monitor className="h-4 w-4" />
          UI Services
          <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
            {uiServices.length}
          </span>
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {activeSubTab === 'api'
            ? 'API services and their workers'
            : 'User interface services'}
        </p>
      </div>

      {/* Service Cards - Masonry Layout */}
      {activeSubTab === 'api' ? (
        <div className="columns-1 xl:columns-2 gap-4 pb-8">
          {groupedApiServices.map(({ api, workers }) => (
            <div key={api.id} className="break-inside-avoid mb-4">
              {/* API Service Card with workers embedded */}
              {renderServiceCard(api, workers)}
            </div>
          ))}
        </div>
      ) : (
        <div className="columns-1 xl:columns-2 gap-4 pb-8">
          {uiServices.map((template) => (
            <div key={template.id} className="break-inside-avoid mb-4">
              {renderServiceCard(template)}
            </div>
          ))}
        </div>
      )}

      {currentServices.length === 0 && (
        <EmptyState
          icon={activeSubTab === 'api' ? Server : Monitor}
          title={`No ${activeSubTab === 'api' ? 'API/Worker' : 'UI'} services installed yet.`}
        />
      )}
    </div>
  )
}
