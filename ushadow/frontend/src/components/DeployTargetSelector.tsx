import { DeployTarget } from '../services/api'
import { Cloud, HardDrive, CheckCircle } from 'lucide-react'

interface DeployTargetSelectorProps {
  targets: DeployTarget[]
  selectedTarget: DeployTarget | null
  onSelect: (target: DeployTarget) => void
  label?: string
  showInfrastructure?: boolean
}

/**
 * Reusable component for selecting deployment targets (Docker unodes or K8s clusters).
 *
 * Used in:
 * - DeployModal: For selecting where to deploy a service
 * - Config deployment flow: For deploying saved configs
 */
export default function DeployTargetSelector({
  targets,
  selectedTarget,
  onSelect,
  label = 'Select deployment target',
  showInfrastructure = true,
}: DeployTargetSelectorProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {label}
      </p>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {targets.map((target) => {
          const isSelected = selectedTarget?.id === target.id
          const isK8s = target.type === 'k8s'
          const hasInfra = target.infrastructure && Object.keys(target.infrastructure).length > 0

          return (
            <button
              key={target.id}
              onClick={() => onSelect(target)}
              className={`w-full text-left p-4 rounded-lg border transition-all ${
                isSelected
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
              }`}
              data-testid={`deploy-target-${target.id}`}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={`flex-shrink-0 mt-0.5 ${isSelected ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-400'}`}>
                  {isK8s ? <Cloud className="h-5 w-5" /> : <HardDrive className="h-5 w-5" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
                      {target.name}
                    </h3>
                    {isSelected && (
                      <CheckCircle className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <span className={`px-2 py-0.5 rounded ${
                      isK8s
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                    }`}>
                      {isK8s ? 'Kubernetes' : 'Docker'}
                    </span>

                    <span className={`px-2 py-0.5 rounded ${
                      target.status === 'online'
                        ? 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                    }`}>
                      {target.status}
                    </span>

                    {target.environment && (
                      <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                        {target.environment}
                      </span>
                    )}

                    {isK8s && target.namespace && (
                      <span className="text-neutral-500 dark:text-neutral-400">
                        ns: {target.namespace}
                      </span>
                    )}

                    {target.region && (
                      <span className="text-neutral-500 dark:text-neutral-400">
                        {target.region}
                      </span>
                    )}
                  </div>

                  {/* Infrastructure info */}
                  {showInfrastructure && hasInfra && (
                    <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                        Infrastructure detected:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(target.infrastructure || {}).map(([key, value]: [string, any]) => {
                          if (!value?.found) return null
                          return (
                            <span
                              key={key}
                              className="px-1.5 py-0.5 text-xs rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            >
                              {key}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}

        {targets.length === 0 && (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            <HardDrive className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No deployment targets available</p>
          </div>
        )}
      </div>
    </div>
  )
}
