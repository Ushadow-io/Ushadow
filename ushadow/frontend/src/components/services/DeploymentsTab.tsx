/**
 * DeploymentsTab - Deployments tab content with filtering and deployment list
 */

import { HardDrive } from 'lucide-react'
import DeploymentListItem from './DeploymentListItem'
import EmptyState from './EmptyState'
import { Template, DeployTarget } from '../../services/api'

interface DeploymentsTabProps {
  deployments: any[]
  templates: Template[]
  targets?: DeployTarget[]
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
  targets = [],
  filterCurrentEnvOnly,
  onFilterChange,
  onStopDeployment,
  onRestartDeployment,
  onEditDeployment,
  onRemoveDeployment,
}: DeploymentsTabProps) {
  // Helper to check if unode is funnel-enabled
  const isUnodeFunnelEnabled = (unodeHostname: string): boolean => {
    const target = targets.find((t) => t.identifier === unodeHostname)
    if (!target) return false

    // Check raw_metadata for unode labels
    const labels = target.raw_metadata?.labels || {}
    return labels.funnel === 'enabled'
  }

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
            const unodeFunnelEnabled = isUnodeFunnelEnabled(deployment.unode_hostname)

            return (
              <DeploymentListItem
                key={deployment.id}
                deployment={deployment}
                serviceName={template?.name || deployment.service_id}
                unodeFunnelEnabled={unodeFunnelEnabled}
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
