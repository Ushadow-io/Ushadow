/**
 * ServicesTab - Services tab content with FlatServiceCard grid
 */

import { Package } from 'lucide-react'
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

export default function ServicesTab({
  composeTemplates,
  instances,
  wiring,
  providerTemplates,
  serviceStatuses,
  deployments,
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
  if (composeTemplates.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title='No services installed yet. Click "Browse Services" to add some.'
      />
    )
  }

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
