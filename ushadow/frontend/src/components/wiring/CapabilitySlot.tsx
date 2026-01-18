import { useDroppable } from '@dnd-kit/core'
import { Cloud, AlertCircle, X, Plug } from 'lucide-react'

interface ProviderInfo {
  id: string
  name: string
  capability: string
}

interface CapabilitySlotProps {
  consumerId: string
  capability: string
  connection: { provider?: ProviderInfo; capability: string } | null
  isDropTarget: boolean
  onClear: () => void
}

export function CapabilitySlot({ consumerId, capability, connection, isDropTarget, onClear }: CapabilitySlotProps) {
  const dropId = `slot::${consumerId}::${capability}`
  const { isOver, setNodeRef } = useDroppable({ id: dropId })

  const hasProvider = connection?.provider
  const isOrphaned = connection && !connection.provider

  return (
    <div>
      {/* Capability label */}
      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">{capability}</div>
      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`
          relative rounded-lg border-2 transition-all p-3 min-h-[48px] flex items-center
          ${isOver && isDropTarget ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : ''}
          ${isDropTarget && !isOver ? 'border-primary-300 dark:border-primary-600 border-dashed bg-primary-50/50 dark:bg-primary-900/10' : ''}
          ${hasProvider ? 'border-success-300 dark:border-success-700 bg-success-50 dark:bg-success-900/20' : ''}
          ${isOrphaned ? 'border-warning-300 dark:border-warning-700 bg-warning-50 dark:bg-warning-900/20' : ''}
          ${!hasProvider && !isOrphaned && !isDropTarget ? 'border-neutral-200 dark:border-neutral-700 border-dashed' : ''}
        `}
        data-testid={`capability-slot-${consumerId}-${capability}`}
      >
        {hasProvider ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-success-500" />
              <span className="font-medium text-neutral-900 dark:text-neutral-100">{connection.provider!.name}</span>
            </div>
            <button
              onClick={onClear}
              className="p-1 text-neutral-400 hover:text-error-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
              title="Disconnect"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : isOrphaned ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 text-warning-600 dark:text-warning-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Provider missing</span>
            </div>
            <button
              onClick={onClear}
              className="p-1 text-neutral-400 hover:text-error-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
              title="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-500">
            <Plug className="h-4 w-4" />
            <span className="text-sm">{isDropTarget ? 'Drop provider here' : 'Drag a provider here'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
