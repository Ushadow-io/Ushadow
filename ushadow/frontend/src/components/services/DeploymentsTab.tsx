/**
 * DeploymentsTab - Deployments tab content with filtering and deployment list
 */

import { HardDrive } from 'lucide-react'
import DeploymentListItem from './DeploymentListItem'
import EmptyState from './EmptyState'
import { Template } from '../../services/api'

interface DeploymentsTabProps {
  deployments: any[]
  templates: Template[]
  filterCurrentEnvOnly: boolean
  onFilterChange: (checked: boolean) => void
  onStopDeployment: (id: string) => void
  onRestartDeployment: (id: string) => void
  onEditDeployment: (deployment: any) => void
  onRemoveDeployment: (id: string, name: string) => void
}

export default function DeploymentsTab({
  deployments,
  templates,
  filterCurrentEnvOnly,
  onFilterChange,
  onStopDeployment,
  onRestartDeployment,
  onEditDeployment,
  onRemoveDeployment,
}: DeploymentsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Active deployments across all services ({deployments.length} total)
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filterCurrentEnvOnly}
            onChange={(e) => onFilterChange(e.target.checked)}
            className="rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
            data-testid="filter-current-env-toggle"
          />
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            Current environment only
          </span>
        </label>
      </div>

      {deployments.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="No deployments found"
          subtitle="Deploy services from the Services tab"
        />
      ) : (
        <div className="space-y-2">
          {deployments.map((deployment) => {
            const template = templates.find((t) => t.id === deployment.service_id)
            return (
              <DeploymentListItem
                key={deployment.id}
                deployment={deployment}
                serviceName={template?.name || deployment.service_id}
                onStop={onStopDeployment}
                onRestart={onRestartDeployment}
                onEdit={onEditDeployment}
                onRemove={onRemoveDeployment}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
