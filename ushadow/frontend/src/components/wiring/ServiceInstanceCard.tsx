import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Cloud,
  HardDrive,
  Loader2,
  Settings,
  PlayCircle,
  StopCircle,
  Plus,
  Pencil,
  Package,
  Trash2,
} from 'lucide-react'
import { CapabilitySlot } from './CapabilitySlot'
import { StatusIndicator } from './StatusIndicator'

interface ConfigVar {
  key: string
  label: string
  value: string
  isSecret: boolean
  required?: boolean
}

interface ProviderInfo {
  id: string
  name: string
  capability: string
}

interface ServiceInstanceCardProps {
  instance: {
    id: string
    name: string
    requires: string[]
    status: string
    mode?: string
    description?: string
  }
  configVars?: ConfigVar[]
  activeProvider: { id: string; name: string; capability: string } | null
  getProviderForSlot: (instanceId: string, capability: string) => { provider?: ProviderInfo; capability: string } | null
  onDeleteWiring: (instanceId: string, capability: string) => Promise<void>
  onEdit?: (instanceId: string) => void
  onStart?: (instanceId: string) => Promise<void>
  onStop?: (instanceId: string) => Promise<void>
  onDeploy?: (instanceId: string, target: { type: 'local' | 'remote' | 'kubernetes'; id?: string }) => void
  onDelete?: (instanceId: string) => void
}

/**
 * Service instance card - has capability slots for wiring providers
 * Instances are the deployed configs, templates are just metadata
 */
export function ServiceInstanceCard({
  instance,
  configVars = [],
  activeProvider,
  getProviderForSlot,
  onDeleteWiring,
  onEdit,
  onStart,
  onStop,
  onDeploy,
  onDelete,
}: ServiceInstanceCardProps) {
  const [isStarting, setIsStarting] = useState(false)
  const [showDeployMenu, setShowDeployMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)

  const missingRequiredVars = configVars.filter((v) => v.required && !v.value)
  const configuredVars = configVars.filter((v) => v.value)
  const needsSetup = missingRequiredVars.length > 0

  const isCloud = instance.mode === 'cloud'
  const canStart = !isCloud && (instance.status === 'stopped' || instance.status === 'pending' || instance.status === 'exited' || instance.status === 'not_running' || instance.status === 'not_found')
  const canStop = !isCloud && (instance.status === 'running' || instance.status === 'starting')

  // Close deploy menu when clicking outside
  useEffect(() => {
    if (!showDeployMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-deploy-menu]')) {
        setShowDeployMenu(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showDeployMenu])

  const handleDeployClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget
    const rect = button.getBoundingClientRect()
    setMenuPosition({
      top: rect.bottom + 4,
      left: rect.right - 192, // 192px = w-48
    })
    setShowDeployMenu(!showDeployMenu)
  }

  const handleStartClick = async () => {
    if (!onStart) return
    setIsStarting(true)
    try {
      await onStart(instance.id)
    } finally {
      setIsStarting(false)
    }
  }

  const handleStopClick = async () => {
    if (!onStop) return
    setIsStarting(true)
    try {
      await onStop(instance.id)
    } finally {
      setIsStarting(false)
    }
  }

  const getCardClasses = () => {
    if (instance.status === 'running') {
      return 'border-success-400 dark:border-success-600'
    }
    return 'border-neutral-200 dark:border-neutral-700'
  }

  // Parse instance name to extract node/service info
  // Format: "service-name" or "node/service-name"
  const parseInstanceName = () => {
    const nameParts = instance.id.split('/')
    if (nameParts.length === 2) {
      return { node: nameParts[0], service: nameParts[1] }
    }
    return { node: null, service: instance.id }
  }

  const { node, service } = parseInstanceName()

  return (
    <div
      className={`rounded-lg border ${getCardClasses()} bg-white dark:bg-neutral-900 overflow-hidden transition-all shadow-sm`}
      data-testid={`service-instance-${instance.id}`}
    >
      {/* Header */}
      <div className={`px-4 py-3 bg-neutral-50 dark:bg-neutral-800 ${instance.requires.length > 0 ? 'border-b border-neutral-200 dark:border-neutral-700' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Mode icon */}
            {isCloud ? (
              <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            ) : (
              <HardDrive className="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
            )}

            {/* Service name and node */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {node && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                  {node}/
                </span>
              )}
              <span className="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate">
                {instance.name}
              </span>
            </div>

            <StatusIndicator status={instance.status} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Start/Stop */}
            {!isCloud && onStart && onStop && (
              <>
                {isStarting ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </span>
                ) : needsSetup && canStart ? (
                  <button
                    onClick={() => onEdit?.(instance.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300 hover:bg-warning-200"
                    data-testid={`instance-setup-${instance.id}`}
                  >
                    <Settings className="h-4 w-4" />
                    Setup
                  </button>
                ) : canStart ? (
                  <button
                    onClick={handleStartClick}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300 hover:bg-success-200"
                    data-testid={`instance-start-${instance.id}`}
                  >
                    <PlayCircle className="h-4 w-4" />
                    Start
                  </button>
                ) : canStop ? (
                  <button
                    onClick={handleStopClick}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200"
                    data-testid={`instance-stop-${instance.id}`}
                  >
                    <StopCircle className="h-4 w-4" />
                    Stop
                  </button>
                ) : null}
              </>
            )}

            {/* Deploy menu */}
            {onDeploy && (
              <>
                <button
                  onClick={handleDeployClick}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50"
                  title="Deploy service"
                  data-testid={`instance-deploy-${instance.id}`}
                  data-deploy-menu
                >
                  <Plus className="h-3 w-3" />
                  Deploy
                </button>
                {showDeployMenu &&
                  menuPosition &&
                  createPortal(
                    <div
                      className="fixed w-48 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl z-[9998]"
                      style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                      data-deploy-menu
                    >
                      <button
                        onClick={() => {
                          onDeploy(instance.id, { type: 'local' })
                          setShowDeployMenu(false)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-t-lg flex items-center gap-2"
                      >
                        <HardDrive className="h-4 w-4" />
                        Local (Leader uNode)
                      </button>
                      <button
                        onClick={() => {
                          onDeploy(instance.id, { type: 'remote' })
                          setShowDeployMenu(false)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
                      >
                        <Cloud className="h-4 w-4" />
                        Remote uNode
                      </button>
                      <button
                        onClick={() => {
                          onDeploy(instance.id, { type: 'kubernetes' })
                          setShowDeployMenu(false)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-b-lg flex items-center gap-2"
                      >
                        <Package className="h-4 w-4" />
                        Kubernetes
                      </button>
                    </div>,
                    document.body
                  )}
              </>
            )}

            {/* Edit */}
            {onEdit && (
              <button
                onClick={() => onEdit(instance.id)}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                title="Edit settings"
                data-testid={`instance-edit-${instance.id}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}

            {/* Delete */}
            {onDelete && (
              <button
                onClick={() => onDelete(instance.id)}
                className="p-1.5 text-neutral-400 hover:text-error-600 dark:hover:text-error-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                title="Delete instance"
                data-testid={`instance-delete-${instance.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Capability Slots - only show if there are slots */}
      {instance.requires.length > 0 && (
        <div className="p-4 space-y-3">
          {instance.requires.map((capability) => {
            const connection = getProviderForSlot(instance.id, capability)
            const isDropTarget = activeProvider?.capability === capability

            return (
              <CapabilitySlot
                key={capability}
                consumerId={instance.id}
                capability={capability}
                connection={connection}
                isDropTarget={isDropTarget}
                onClear={() => onDeleteWiring(instance.id, capability)}
              />
            )
          })}
        </div>
      )}

      {/* Config Vars */}
      {(missingRequiredVars.length > 0 || configuredVars.length > 0) && (
        <div className={`px-4 py-3 bg-neutral-50/50 dark:bg-neutral-800/50 ${instance.requires.length > 0 ? 'border-t border-neutral-200 dark:border-neutral-700' : ''}`}>
          <div className="space-y-1">
            {/* Missing required fields */}
            {missingRequiredVars.map((v) => (
              <div key={v.key} className="text-sm text-warning-600 dark:text-warning-400">
                <span className="text-error-500">*</span>
                <span className="font-medium">{v.label}:</span> <span className="italic text-neutral-400">Not set</span>
              </div>
            ))}
            {/* Configured fields */}
            {configuredVars.slice(0, 4).map((v) => (
              <div key={v.key} className="text-sm text-neutral-600 dark:text-neutral-400">
                {v.required && <span className="text-error-500">*</span>}
                <span className="font-medium">{v.label}:</span> <span className={v.isSecret ? 'font-mono' : ''}>{v.value}</span>
              </div>
            ))}
            {configuredVars.length > 4 && <div className="text-xs text-neutral-400">+{configuredVars.length - 4} more</div>}
          </div>
        </div>
      )}
    </div>
  )
}
