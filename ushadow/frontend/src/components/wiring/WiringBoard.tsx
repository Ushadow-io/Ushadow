/**
 * WiringBoard - Drag-and-drop wiring interface
 *
 * Two-column layout:
 * - Left: Provider instances (sources)
 * - Right: Consumer instances with capability slots (targets)
 *
 * Drag from a provider to a consumer's capability slot to create a connection.
 */

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
  pointerWithin,
  useSensor,
  useSensors,
  PointerSensor,
  MouseSensor,
} from '@dnd-kit/core'
import {
  Cloud,
  HardDrive,
  AlertCircle,
  X,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  PlayCircle,
  StopCircle,
  Settings,
  Loader2,
  Package,
} from 'lucide-react'
import { ServiceTemplateCard } from './ServiceTemplateCard'
import { ServiceInstanceCard } from './ServiceInstanceCard'
import { StatusIndicator } from './StatusIndicator'
// Per-service wiring model - each consumer has its own connections

interface ConfigVar {
  key: string
  label: string
  value: string // Display value (masked for secrets)
  isSecret: boolean
  required?: boolean // Whether this config field is required
}

interface ProviderInfo {
  id: string
  name: string
  capability: string
  status: string
  mode?: string
  isTemplate: boolean
  templateId: string // For templates: own ID; for instances: parent template ID
  configVars: ConfigVar[]
  configured?: boolean // Whether all required config fields have values
}

interface ConsumerInfo {
  id: string
  name: string
  requires: string[]
  status: string
  mode?: string // 'local' | 'cloud'
  configVars?: ConfigVar[]
  configured?: boolean
  description?: string // Service description
  isTemplate?: boolean // True for templates, false for instances
  templateId?: string // For templates: own ID; for instances: parent template ID
}

interface WiringInfo {
  id: string
  source_config_id: string
  source_capability: string
  target_config_id: string
  target_capability: string
}

interface DropInfo {
  provider: ProviderInfo
  consumerId: string
  capability: string
}

interface WiringBoardProps {
  providers: ProviderInfo[]
  consumers: ConsumerInfo[]
  wiring: WiringInfo[]
  onProviderDrop: (dropInfo: DropInfo) => void
  onDeleteWiring: (consumerId: string, capability: string) => Promise<void>
  onEditProvider: (providerId: string, isTemplate: boolean) => void
  onCreateServiceConfig: (templateId: string) => void
  onUpdateTemplateConfigVars?: (templateId: string, configVars: ConfigVar[]) => Promise<void>
  onDeleteServiceConfig: (instanceId: string) => void
  onStartProvider?: (providerId: string, isTemplate: boolean) => Promise<void>
  onStopProvider?: (providerId: string, isTemplate: boolean) => Promise<void>
  // Consumer/Service callbacks
  onEditConsumer?: (consumerId: string) => void
  onStartConsumer?: (consumerId: string) => Promise<void>
  onStopConsumer?: (consumerId: string) => Promise<void>
  onDeployConsumer?: (consumerId: string, target: { type: 'local' | 'remote' | 'kubernetes'; id?: string }) => void
}

export default function WiringBoard({
  providers,
  consumers,
  wiring,
  onProviderDrop,
  onDeleteWiring,
  onEditProvider,
  onCreateServiceConfig,
  onUpdateTemplateConfigVars,
  onDeleteServiceConfig,
  onStartProvider,
  onStopProvider,
  onEditConsumer,
  onStartConsumer,
  onDeployConsumer,
  onStopConsumer,
}: WiringBoardProps) {
  const [activeProvider, setActiveProvider] = useState<ProviderInfo | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Configure sensors for proper drag handling
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 5,
    },
  })
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 5,
    },
  })
  const sensors = useSensors(mouseSensor, pointerSensor)

  // Track mouse position during drag for custom overlay
  useEffect(() => {
    if (!activeProvider) return

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [activeProvider])

  // Group providers by capability, then by template (templates with their instances nested)
  const providersByCapability = providers.reduce(
    (acc, provider) => {
      if (!acc[provider.capability]) {
        acc[provider.capability] = { templates: {} as Record<string, { template: ProviderInfo; instances: ProviderInfo[] }> }
      }

      if (provider.isTemplate) {
        // This is a template - create entry if doesn't exist
        if (!acc[provider.capability].templates[provider.id]) {
          acc[provider.capability].templates[provider.id] = { template: provider, instances: [] }
        } else {
          acc[provider.capability].templates[provider.id].template = provider
        }
      } else {
        // This is an instance - nest under its template
        if (!acc[provider.capability].templates[provider.templateId]) {
          // Template entry doesn't exist yet, create placeholder
          acc[provider.capability].templates[provider.templateId] = {
            template: null as any, // Will be filled when template is processed
            instances: []
          }
        }
        acc[provider.capability].templates[provider.templateId].instances.push(provider)
      }
      return acc
    },
    {} as Record<string, { templates: Record<string, { template: ProviderInfo; instances: ProviderInfo[] }> }>
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const provider = providers.find((p) => p.id === event.active.id)
    if (provider) {
      setActiveProvider(provider)
    }
  }, [providers])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveProvider(null)

      if (!over || !active) return

      // Parse the drop target ID: "slot::{consumerId}::{capability}"
      const overId = String(over.id)
      if (!overId.startsWith('slot::')) return

      const [, consumerId, capability] = overId.split('::')
      const provider = providers.find((p) => p.id === active.id)

      if (!provider || !consumerId || !capability) return

      // Check if provider capability matches the slot
      if (provider.capability !== capability) {
        return // Can't connect mismatched capabilities
      }

      // Trigger the drop callback - parent handles the modal
      onProviderDrop({ provider, consumerId, capability })
    },
    [providers, onProviderDrop]
  )

  // Get provider for a specific consumer's capability slot
  const getProviderForSlot = (consumerId: string, capability: string) => {
    const wire = wiring.find(
      (w) => w.target_config_id === consumerId && w.target_capability === capability
    )
    if (wire) {
      return {
        provider: providers.find((p) => p.id === wire.source_config_id),
        capability,
      }
    }
    return null
  }

  if (providers.length === 0 && consumers.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-400 dark:text-neutral-500">
        <Plug className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm mb-2">No instances to wire</p>
        <p className="text-xs">Create provider and service instances first</p>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetection={pointerWithin}
    >
      <div
        className="grid grid-cols-2 gap-8"
        data-testid="wiring-board"
      >
        {/* Left Column: Providers */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Providers
          </h3>

          {Object.entries(providersByCapability).map(([capability, { templates }]) => (
            <div key={capability} className="space-y-2">
              <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                {capability}
              </div>
              <div className="space-y-2">
                {Object.values(templates).map(({ template, instances }) => {
                  if (!template) return null // Skip if template not loaded
                  const templateConnectionCount = wiring.filter(
                    (w) => w.source_config_id === template.id
                  ).length
                  return (
                    <div key={template.id} className="space-y-1">
                      {/* Template (default) */}
                      <DraggableProvider
                        provider={template}
                        connectionCount={templateConnectionCount}
                        onEdit={() => onEditProvider(template.id, true)}
                        onCreateServiceConfig={() => onCreateServiceConfig(template.id)}
                        onStart={onStartProvider ? () => onStartProvider(template.id, true) : undefined}
                        onStop={onStopProvider ? () => onStopProvider(template.id, true) : undefined}
                      />
                      {/* Nested instances */}
                      {instances.length > 0 && (
                        <div className="ml-6 space-y-1 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3">
                          {instances.map((instance) => {
                            const instanceConnectionCount = wiring.filter(
                              (w) => w.source_config_id === instance.id
                            ).length
                            return (
                              <DraggableProvider
                                key={instance.id}
                                provider={instance}
                                connectionCount={instanceConnectionCount}
                                onEdit={() => onEditProvider(instance.id, false)}
                                onDelete={() => onDeleteServiceConfig(instance.id)}
                                onStart={onStartProvider ? () => onStartProvider(instance.id, false) : undefined}
                                onStop={onStopProvider ? () => onStopProvider(instance.id, false) : undefined}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {providers.length === 0 && (
            <div className="p-4 text-center text-neutral-400 dark:text-neutral-500 text-sm border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-lg">
              No provider instances
            </div>
          )}
        </div>

        {/* Right Column: Consumers */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Services
          </h3>

          {consumers.length > 0 ? (
            <div className="space-y-4">
              {/* Group consumers by template */}
              {(() => {
                // Separate templates and instances
                const templates = consumers.filter((c) => c.isTemplate)
                const instances = consumers.filter((c) => !c.isTemplate)

                // Group instances by template
                const instancesByTemplate = instances.reduce((acc, instance) => {
                  const templateId = instance.templateId || 'unknown'
                  if (!acc[templateId]) acc[templateId] = []
                  acc[templateId].push(instance)
                  return acc
                }, {} as Record<string, ConsumerInfo[]>)

                return templates.map((template) => {
                  const templateInstances = instancesByTemplate[template.id] || []

                  return (
                    <div key={template.id} className="space-y-2">
                      {/* Template - no slots, just + button */}
                      <ServiceTemplateCard
                        template={{
                          id: template.id,
                          name: template.name,
                          description: template.description,
                          requires: template.requires,
                        }}
                        configVars={template.configVars}
                        onCreateInstance={() => onCreateServiceConfig(template.id)}
                        onUpdateConfigVars={
                          onUpdateTemplateConfigVars
                            ? (vars) => onUpdateTemplateConfigVars(template.id, vars)
                            : undefined
                        }
                        alwaysShowConfig={true}
                      />

                      {/* Nested instances - these have the capability slots */}
                      {templateInstances.length > 0 && (
                        <div className="ml-6 space-y-2 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3">
                          {templateInstances.map((instance) => {
                            return (
                              <ServiceInstanceCard
                                key={instance.id}
                                instance={{
                                  id: instance.id,
                                  name: instance.name,
                                  requires: instance.requires,
                                  status: instance.status,
                                  mode: instance.mode,
                                  description: instance.description,
                                }}
                                configVars={instance.configVars}
                                activeProvider={activeProvider}
                                getProviderForSlot={getProviderForSlot}
                                onDeleteWiring={onDeleteWiring}
                                onEdit={onEditConsumer}
                                onStart={onStartConsumer}
                                onStop={onStopConsumer}
                                onDeploy={onDeployConsumer}
                                onDelete={() => onDeleteServiceConfig(instance.id)}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          ) : (
            <div className="p-4 text-center text-neutral-400 dark:text-neutral-500 text-sm border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-lg">
              No service instances
            </div>
          )}
        </div>
      </div>

      {/* Custom drag overlay rendered via portal to bypass CSS transforms */}
      {activeProvider && createPortal(
        <div
          className="fixed pointer-events-none z-[9999]"
          style={{
            left: mousePos.x - 80,
            top: mousePos.y - 20,
          }}
        >
          <div className="px-4 py-3 rounded-lg bg-primary-500 text-white shadow-xl cursor-grabbing">
            <div className="flex items-center gap-2">
              {activeProvider.mode === 'local' ? (
                <HardDrive className="h-4 w-4" />
              ) : (
                <Cloud className="h-4 w-4" />
              )}
              <span className="font-medium">{activeProvider.name}</span>
            </div>
          </div>
        </div>,
        document.body
      )}

    </DndContext>
  )
}

// =============================================================================
// Draggable Provider Component
// =============================================================================

interface DraggableProviderProps {
  provider: ProviderInfo
  connectionCount: number
  onEdit: () => void
  onCreateServiceConfig?: () => void // Only for templates
  onDelete?: () => void // Only for instances
  onStart?: () => Promise<void>
  onStop?: () => Promise<void>
}

function DraggableProvider({ provider, connectionCount, onEdit, onCreateServiceConfig, onDelete, onStart, onStop }: DraggableProviderProps) {
  const [isStarting, setIsStarting] = useState(false)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: provider.id,
    data: { provider },
  })

  const isConnected = connectionCount > 0
  const configuredVars = provider.configVars.filter((v) => v.value)
  const missingRequiredVars = provider.configVars.filter((v) => v.required && !v.value)
  const needsSetup = provider.configured === false || missingRequiredVars.length > 0
  const isCloud = provider.mode === 'cloud'
  const canStart = !isCloud && (provider.status === 'stopped' || provider.status === 'pending' || provider.status === 'error' || provider.status === 'not_found' || provider.status === 'not_running')
  const canStop = !isCloud && (provider.status === 'running' || provider.status === 'deploying')

  // Prevent drag when clicking action buttons
  const handleButtonClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation()
    e.preventDefault()
    action()
  }

  const handleStartClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!onStart) return
    setIsStarting(true)
    try {
      await onStart()
    } finally {
      setIsStarting(false)
    }
  }

  const handleStopClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!onStop) return
    setIsStarting(true)
    try {
      await onStop()
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`
        group relative rounded-lg border transition-all
        ${isDragging ? 'opacity-30 border-dashed border-primary-400 dark:border-primary-500' : 'border-neutral-200 dark:border-neutral-700'}
        ${isConnected ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800' : 'bg-white dark:bg-neutral-900'}
        hover:border-primary-300 dark:hover:border-primary-600
      `}
      data-testid={`provider-drag-${provider.id}`}
    >
      {/* Draggable header */}
      <div
        className="px-3 py-2 flex items-center gap-2 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-neutral-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate">
              {provider.name}
            </span>
            <div className="flex items-center gap-1.5 ml-auto">
              {isConnected && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                  {connectionCount}
                </span>
              )}
              {provider.isTemplate && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400">
                  default
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Start/Stop/Setup buttons for local providers */}
          {!isCloud && onStart && onStop && (
            <>
              {isStarting ? (
                <span className="p-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />
                </span>
              ) : needsSetup && canStart ? (
                <button
                  onClick={(e) => handleButtonClick(e, onEdit)}
                  className="p-1 text-warning-500 hover:text-warning-600 hover:bg-warning-100 dark:hover:bg-warning-900/30 rounded"
                  title="Configure required settings"
                  data-testid={`provider-setup-${provider.id}`}
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              ) : canStart ? (
                <button
                  onClick={handleStartClick}
                  className="p-1 text-success-500 hover:text-success-600 hover:bg-success-100 dark:hover:bg-success-900/30 rounded"
                  title="Start"
                  data-testid={`provider-start-${provider.id}`}
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                </button>
              ) : canStop ? (
                <button
                  onClick={handleStopClick}
                  className="p-1 text-neutral-400 hover:text-error-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                  title="Stop"
                  data-testid={`provider-stop-${provider.id}`}
                >
                  <StopCircle className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </>
          )}
          <button
            onClick={(e) => handleButtonClick(e, onEdit)}
            className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
            title="Edit settings"
            data-testid={`provider-edit-${provider.id}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {provider.isTemplate && onCreateServiceConfig && (
            <button
              onClick={(e) => handleButtonClick(e, onCreateServiceConfig)}
              className="p-1 text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
              title="Create new instance"
              data-testid={`provider-create-instance-${provider.id}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          {!provider.isTemplate && onDelete && (
            <button
              onClick={(e) => handleButtonClick(e, onDelete)}
              className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
              title="Delete instance"
              data-testid={`provider-delete-${provider.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <StatusIndicator status={provider.status} />
      </div>

      {/* Config vars display - show missing required first, then configured */}
      {(missingRequiredVars.length > 0 || configuredVars.length > 0) && (
        <div className="px-3 pb-2 pt-0">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {/* Missing required fields - shown first with warning */}
            {missingRequiredVars.slice(0, 2).map((v) => (
              <span
                key={v.key}
                className="text-xs text-warning-600 dark:text-warning-400"
                title={`${v.label}: Required - not set`}
              >
                <span className="text-error-500 mr-0.5">*</span>
                <span>{v.label}:</span>{' '}
                <span className="italic">Not set</span>
              </span>
            ))}
            {missingRequiredVars.length > 2 && (
              <span className="text-xs text-warning-500">
                +{missingRequiredVars.length - 2} required
              </span>
            )}
            {/* Configured fields */}
            {configuredVars.slice(0, 3 - Math.min(missingRequiredVars.length, 2)).map((v) => (
              <span
                key={v.key}
                className="text-xs text-neutral-500 dark:text-neutral-400"
                title={`${v.label}: ${v.value}`}
              >
                {v.required && <span className="text-error-500 mr-0.5">*</span>}
                <span className="text-neutral-400 dark:text-neutral-500">{v.label}:</span>{' '}
                <span className={v.isSecret ? 'font-mono' : ''}>{v.value}</span>
              </span>
            ))}
            {configuredVars.length > (3 - Math.min(missingRequiredVars.length, 2)) && (
              <span className="text-xs text-neutral-400">
                +{configuredVars.length - (3 - Math.min(missingRequiredVars.length, 2))} more
              </span>
            )}
          </div>
        </div>
      )}

    </div>
  )
}


