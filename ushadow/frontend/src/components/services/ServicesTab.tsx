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

        {/* Service Cards Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-8">
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
              />
            )
          })}
        </div>
      </div>
    )
  }

  // Separate services into UI and non-UI (API/Workers)
  // UI services have "UI" or "ui" in their name
  const uiServices = composeTemplates.filter((template) =>
    template.name.toLowerCase().includes('ui')
  )

  const apiServices = composeTemplates.filter((template) =>
    !template.name.toLowerCase().includes('ui')
  )

  // Group workers with their corresponding API services
  // Workers typically have "-worker" in their name
  const groupedApiServices = apiServices.reduce((acc, template) => {
    const templateName = template.name.toLowerCase()

    // Check if this is a worker
    if (templateName.includes('worker')) {
      // Try to find the corresponding API service
      // Remove "worker" and "-worker" to find the base name
      const baseName = templateName.replace(/[-_]?worker[-_]?/gi, '').trim()

      // Find the API service that matches this base name
      const apiService = apiServices.find(t =>
        !t.name.toLowerCase().includes('worker') &&
        t.name.toLowerCase().includes(baseName)
      )

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

  const renderServiceCard = (template: Template) => {
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

      {/* Service Cards Grid */}
      {activeSubTab === 'api' ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-8">
          {groupedApiServices.map(({ api, workers }) => (
            <div key={api.id} className="space-y-2">
              {/* API Service Card */}
              {renderServiceCard(api)}

              {/* Worker Cards - shown in the same column as their API */}
              {workers.length > 0 && (
                <div className="ml-4 space-y-2 border-l-2 border-neutral-200 dark:border-neutral-700 pl-4">
                  {workers.map((worker) => renderServiceCard(worker))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-8">
          {uiServices.map((template) => renderServiceCard(template))}
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
