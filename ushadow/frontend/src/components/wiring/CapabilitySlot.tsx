/**
 * CapabilitySlot - Slot for connecting a provider to a capability requirement
 *
 * Supports two modes:
 * - 'legacy' (default): Drag-drop with click-to-select fallback
 * - 'dropdown': ProviderConfigDropdown for selection
 */

import { useDroppable } from '@dnd-kit/core'
import { Cloud, AlertCircle, X, Plug, ChevronDown, HardDrive } from 'lucide-react'
import { ProviderConfigDropdown } from './ProviderConfigDropdown'
import type { ProviderOption, GroupedProviders } from '../../hooks/useProviderConfigs'
import type { Template } from '../../services/api'

// ============================================================================
// Types
// ============================================================================

interface ProviderInfo {
  id: string
  name: string
  capability: string
  mode?: 'cloud' | 'local'
}

interface LegacyModeProps {
  mode?: 'legacy'
  consumerId: string
  capability: string
  connection: { provider?: ProviderInfo; capability: string } | null
  isDropTarget: boolean
  onClear: () => void
  onSelectProvider?: () => void
}

interface DropdownModeProps {
  mode: 'dropdown'
  consumerId: string
  capability: string
  /** Currently selected provider option */
  selectedOption: ProviderOption | null
  /** Grouped provider options */
  options: GroupedProviders
  /** Provider templates for cascading submenu config schema */
  templates?: Template[]
  /** Loading state */
  loading?: boolean
  /** Called when selection changes */
  onSelect: (option: ProviderOption) => void
  /** Called to create a new config from the cascading submenu */
  onCreateConfig?: (templateId: string, name: string, config: Record<string, any>) => Promise<void>
  /** Called to edit an existing config */
  onEditConfig?: (configId: string) => void
  /** Called to delete a config */
  onDeleteConfig?: (configId: string) => Promise<void>
  /** Called to update an existing config */
  onUpdateConfig?: (configId: string, config: Record<string, any>) => Promise<void>
  /** Called after mutations to refresh the options list */
  onRefresh?: () => Promise<void>
  /** Called to create a new config via full form */
  onCreateNew: () => void
  /** Called to clear the current selection */
  onClear: () => void
  /** Error message */
  error?: string
}

type CapabilitySlotProps = LegacyModeProps | DropdownModeProps

// ============================================================================
// Legacy Mode Component
// ============================================================================

function CapabilitySlotLegacy({
  consumerId,
  capability,
  connection,
  isDropTarget,
  onClear,
  onSelectProvider,
}: LegacyModeProps) {
  const dropId = `slot::${consumerId}::${capability}`
  const { isOver, setNodeRef } = useDroppable({ id: dropId })

  const hasProvider = connection?.provider
  const isOrphaned = connection && !connection.provider
  const ModeIcon = connection?.provider?.mode === 'local' ? HardDrive : Cloud

  const handleEmptySlotClick = () => {
    if (onSelectProvider && !hasProvider && !isOrphaned) {
      onSelectProvider()
    }
  }

  return (
    <div>
      {/* Capability label */}
      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
        {capability}
      </div>
      {/* Drop zone */}
      <div
        ref={setNodeRef}
        onClick={handleEmptySlotClick}
        className={`
          relative rounded-lg border-2 transition-all p-3 min-h-[48px] flex items-center
          ${isOver && isDropTarget ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : ''}
          ${isDropTarget && !isOver ? 'border-primary-300 dark:border-primary-600 border-dashed bg-primary-50/50 dark:bg-primary-900/10' : ''}
          ${hasProvider ? 'border-success-300 dark:border-success-700 bg-success-50 dark:bg-success-900/20' : ''}
          ${isOrphaned ? 'border-warning-300 dark:border-warning-700 bg-warning-50 dark:bg-warning-900/20' : ''}
          ${!hasProvider && !isOrphaned && !isDropTarget ? 'border-neutral-200 dark:border-neutral-700 border-dashed hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer' : ''}
        `}
        data-testid={`capability-slot-${consumerId}-${capability}`}
      >
        {hasProvider ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <ModeIcon className="h-4 w-4 text-success-500" />
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {connection.provider!.name}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClear()
              }}
              className="p-1 text-neutral-400 hover:text-error-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
              title="Disconnect"
              data-testid={`capability-slot-${consumerId}-${capability}-clear`}
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
              onClick={(e) => {
                e.stopPropagation()
                onClear()
              }}
              className="p-1 text-neutral-400 hover:text-error-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
              title="Clear"
              data-testid={`capability-slot-${consumerId}-${capability}-clear`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-500">
              <Plug className="h-4 w-4" />
              <span className="text-sm">
                {isDropTarget ? 'Drop provider here' : 'Click to select or drag provider'}
              </span>
            </div>
            {onSelectProvider && !isDropTarget && (
              <ChevronDown className="h-4 w-4 text-neutral-400" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Dropdown Mode Component
// ============================================================================

function CapabilitySlotDropdown({
  consumerId,
  capability,
  selectedOption,
  options,
  templates,
  loading,
  onSelect,
  onCreateConfig,
  onEditConfig,
  onDeleteConfig,
  onUpdateConfig,
  onRefresh,
  onCreateNew,
  onClear: _onClear, // Currently unused - dropdown handles clearing internally
  error,
}: DropdownModeProps) {
  return (
    <div className="flex items-center gap-3">
      {/* Capability label */}
      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide w-32 flex-shrink-0">
        {capability}
      </div>
      {/* Dropdown with cascading submenu */}
      <div className="flex-1">
        <ProviderConfigDropdown
          capability={capability}
          consumerId={consumerId}
          value={selectedOption}
          options={options}
          templates={templates}
          loading={loading}
          onChange={onSelect}
          onCreateConfig={onCreateConfig}
          onEditConfig={onEditConfig}
          onDeleteConfig={onDeleteConfig}
          onUpdateConfig={onUpdateConfig}
          onRefresh={onRefresh}
          onCreateNew={onCreateNew}
          error={error}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function CapabilitySlot(props: CapabilitySlotProps) {
  if (props.mode === 'dropdown') {
    return <CapabilitySlotDropdown {...props} />
  }

  // Default to legacy mode for backwards compatibility
  return <CapabilitySlotLegacy {...props} />
}
