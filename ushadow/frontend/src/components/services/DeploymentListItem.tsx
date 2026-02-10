/**
 * DeploymentListItem - Individual deployment card with controls
 */

import { useState } from 'react'
import { HardDrive, Pencil, PlayCircle, StopCircle, Trash2, Globe, ExternalLink, Loader2 } from 'lucide-react'
import Modal from '../Modal'
import FunnelRouteManager from './FunnelRouteManager'

interface DeploymentListItemProps {
  deployment: any
  serviceName: string
  unodeFunnelEnabled?: boolean
  onStop: (id: string) => void
  onRestart: (id: string) => void
  onEdit: (deployment: any) => void
  onRemove: (id: string, name: string) => void
}

export default function DeploymentListItem({
  deployment,
  serviceName,
  unodeFunnelEnabled = false,
  onStop,
  onRestart,
  onEdit,
  onRemove,
}: DeploymentListItemProps) {
  const [showFunnelManager, setShowFunnelManager] = useState(false)
  const isRunning = deployment.status === 'running' || deployment.status === 'deploying'
  const isTransitioning = deployment.status === 'starting' || deployment.status === 'stopping'

  const statusColor = {
    running: 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400',
    deploying: 'bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400',
    starting: 'bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400',
    stopping: 'bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400',
    stopped: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400',
    failed: 'bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-400',
  }[deployment.status] || 'bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-400'

  return (
    <div className="card p-4" data-testid={`deployment-item-${deployment.id}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">{serviceName}</h3>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${statusColor}`}
              title={deployment.health_message || undefined}
            >
              {isTransitioning && <Loader2 className="h-3 w-3 animate-spin" />}
              {deployment.status}
            </span>

            {/* Stop/Restart button next to status */}
            {isRunning ? (
              <button
                onClick={() => onStop(deployment.id)}
                disabled={isTransitioning}
                className="p-1 text-error-600 dark:text-error-400 hover:text-error-700 dark:hover:text-error-300 hover:bg-error-50 dark:hover:bg-error-900/20 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                title="Stop deployment"
                data-testid={`stop-deployment-${deployment.id}`}
              >
                <StopCircle className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={() => onRestart(deployment.id)}
                disabled={isTransitioning}
                className="p-1 text-success-600 dark:text-success-400 hover:text-success-700 dark:hover:text-success-300 hover:bg-success-50 dark:hover:bg-success-900/20 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                title="Start deployment"
                data-testid={`restart-deployment-${deployment.id}`}
              >
                {deployment.status === 'starting' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="flex items-center gap-1">
              <HardDrive className="h-3.5 w-3.5" />
              {deployment.unode_hostname}
            </span>
            {deployment.exposed_port && (
              <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-mono">
                :{deployment.exposed_port}
              </span>
            )}
            {deployment.public_url && (
              <a
                href={deployment.public_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 text-xs hover:bg-primary-100 dark:hover:bg-primary-900/30"
                title={`Public: ${deployment.public_url}`}
                data-testid={`deployment-public-url-${deployment.id}`}
              >
                <Globe className="h-3 w-3" />
                Public
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Manage Public Access (only for funnel-enabled unodes) */}
          {unodeFunnelEnabled && (
            <button
              onClick={() => setShowFunnelManager(true)}
              className="p-1.5 text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded"
              title="Manage public access"
              data-testid={`manage-funnel-${deployment.id}`}
            >
              <Globe className="h-4 w-4" />
            </button>
          )}

          {/* Edit */}
          <button
            onClick={() => onEdit(deployment)}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
            title="Edit deployment"
            data-testid={`edit-deployment-${deployment.id}`}
          >
            <Pencil className="h-4 w-4" />
          </button>

          {/* Remove */}
          <button
            onClick={() => onRemove(deployment.id, serviceName)}
            className="p-1.5 text-neutral-400 hover:text-error-600 dark:hover:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20 rounded"
            title="Remove deployment"
            data-testid={`remove-deployment-${deployment.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Funnel Route Manager Modal */}
      {showFunnelManager && (
        <Modal
          isOpen={showFunnelManager}
          onClose={() => setShowFunnelManager(false)}
          title="Manage Public Access"
          maxWidth="lg"
          testId="funnel-manager-modal"
        >
          <FunnelRouteManager
            deployment={deployment}
            unodeFunnelEnabled={unodeFunnelEnabled}
          />
        </Modal>
      )}
    </div>
  )
}
