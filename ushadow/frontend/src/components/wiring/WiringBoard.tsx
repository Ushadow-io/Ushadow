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
                                templateProvider={template}
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
  templateProvider?: ProviderInfo // Parent template for instances
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
        className="px-3 py-3 flex items-center gap-2 cursor-grab active:cursor-grabbing"
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
              {/* Capability tag */}
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium">
                {provider.capability}
              </span>
              {isConnected && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                  {connectionCount}
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
            {/* Configured fields - color code overrides */}
            {configuredVars.slice(0, 3 - Math.min(missingRequiredVars.length, 2)).map((v) => {
              // Check if this value is overridden from template
              const isOverridden = templateProvider &&
                templateProvider.configVars.find(tv => tv.key === v.key)?.value !== v.value

              return (
                <span
                  key={v.key}
                  className={`text-xs ${isOverridden ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400'}`}
                  title={`${v.label}: ${v.value}${isOverridden ? ' (overridden)' : ''}`}
                >
                  {v.required && <span className="text-error-500 mr-0.5">*</span>}
                  <span className="text-neutral-400 dark:text-neutral-500">{v.label}:</span>{' '}
                  <span className={v.isSecret ? 'font-mono' : ''}>{v.value}</span>
                </span>
              )
            })}
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


interface ServiceCardProps {
  consumer: ConsumerInfo
  missingRequiredVars: ConfigVar[]
  configuredVars: ConfigVar[]
  needsSetup: boolean
  canStart: boolean
  canStop: boolean
  activeProvider: ProviderInfo | null
  getProviderForSlot: (consumerId: string, capability: string) => { provider?: ProviderInfo; capability: string } | null
  onDeleteWiring: (consumerId: string, capability: string) => Promise<void>
  onEdit?: (consumerId: string) => void
  onStart?: (consumerId: string) => Promise<void>
  onStop?: (consumerId: string) => Promise<void>
  onDeploy?: (consumerId: string, target: { type: 'local' | 'remote' | 'kubernetes'; id?: string }) => void
}

function ConsumerCard({
  consumer,
  missingRequiredVars,
  configuredVars,
  needsSetup,
  canStart,
  canStop,
  activeProvider,
  getProviderForSlot,
  onDeleteWiring,
  onEdit,
  onStart,
  onStop,
  onDeploy,
}: ServiceCardProps) {
  const [isStarting, setIsStarting] = useState(false)
  const [showDeployMenu, setShowDeployMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)

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
      left: rect.right - 192 // 192px = 48 * 4 (w-48)
    })
    setShowDeployMenu(!showDeployMenu)
  }

  const handleStartClick = async () => {
    if (!onStart) return
    setIsStarting(true)
    try {
      await onStart(consumer.id)
    } finally {
      setIsStarting(false)
    }
  }

  const handleStopClick = async () => {
    if (!onStop) return
    setIsStarting(true)
    try {
      await onStop(consumer.id)
    } finally {
      setIsStarting(false)
    }
  }

  // Status-based border styling
  const getCardClasses = () => {
    if (consumer.status === 'running') {
      return 'border-success-400 dark:border-success-600'
    }
    return 'border-neutral-200 dark:border-neutral-700'
  }

  const isCloud = consumer.mode === 'cloud'

  return (
    <div
      className={`rounded-lg border ${getCardClasses()} bg-white dark:bg-neutral-900 overflow-hidden transition-all shadow-sm`}
      data-testid={`consumer-card-${consumer.id}`}
    >
      {/* Header: Service name + mode badge + actions */}
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {/* Mode badge - purple for local, blue for cloud */}
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded ${
              isCloud
                ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                : 'bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800'
            }`}>
              {isCloud ? (
                <Cloud className={`h-3.5 w-3.5 text-blue-600 dark:text-blue-400`} />
              ) : (
                <HardDrive className={`h-3.5 w-3.5 text-purple-600 dark:text-purple-400`} />
              )}
              <span className={`font-medium text-sm ${
                isCloud
                  ? 'text-blue-900 dark:text-blue-100'
                  : 'text-purple-900 dark:text-purple-100'
              }`}>
                {consumer.name}
              </span>
            </div>
            <StatusIndicator status={consumer.status} />
          </div>
          <div className="flex items-center gap-2">
            {/* Start/Stop button - only for local services */}
            {!isCloud && onStart && onStop && (
              <>
                {isStarting ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </span>
                ) : needsSetup && canStart ? (
                  <button
                    onClick={() => onEdit?.(consumer.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300 hover:bg-warning-200"
                    data-testid={`consumer-setup-${consumer.id}`}
                  >
                    <Settings className="h-4 w-4" />
                    Setup
                  </button>
                ) : canStart ? (
                  <button
                    onClick={handleStartClick}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300 hover:bg-success-200"
                    data-testid={`consumer-start-${consumer.id}`}
                  >
                    <PlayCircle className="h-4 w-4" />
                    Start
                  </button>
                ) : canStop ? (
                  <button
                    onClick={handleStopClick}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200"
                    data-testid={`consumer-stop-${consumer.id}`}
                  >
                    <StopCircle className="h-4 w-4" />
                    Stop
                  </button>
                ) : null}
              </>
            )}
            {onDeploy && (
              <>
                <button
                  onClick={handleDeployClick}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50"
                  title="Deploy service"
                  data-testid={`consumer-deploy-${consumer.id}`}
                  data-deploy-menu
                >
                  <Plus className="h-3 w-3" />
                  Deploy
                </button>
                {showDeployMenu && menuPosition && createPortal(
                  <div
                    className="fixed w-48 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl z-[9998]"
                    style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                    data-deploy-menu
                  >
                    <button
                      onClick={() => {
                        onDeploy(consumer.id, { type: 'local' })
                        setShowDeployMenu(false)
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-t-lg flex items-center gap-2"
                    >
                      <HardDrive className="h-4 w-4" />
                      Local (Leader uNode)
                    </button>
                    <button
                      onClick={() => {
                        onDeploy(consumer.id, { type: 'remote' })
                        setShowDeployMenu(false)
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
                    >
                      <Cloud className="h-4 w-4" />
                      Remote uNode
                    </button>
                    <button
                      onClick={() => {
                        onDeploy(consumer.id, { type: 'kubernetes' })
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
            {onEdit && (
              <button
                onClick={() => onEdit(consumer.id)}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                title="Edit settings"
                data-testid={`consumer-edit-${consumer.id}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {/* Description */}
        {consumer.description && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
            {consumer.description}
          </p>
        )}
      </div>

      {/* Capability slots - each capability gets its own labeled drop zone */}
      <div className="p-4 space-y-3">
        {consumer.requires.map((capability) => {
          const connection = getProviderForSlot(consumer.id, capability)
          const isDropTarget = activeProvider?.capability === capability

          return (
            <CapabilitySlot
              key={capability}
              consumerId={consumer.id}
              capability={capability}
              connection={connection}
              isDropTarget={isDropTarget}
              onClear={() => onDeleteWiring(consumer.id, capability)}
            />
          )
        })}
      </div>

      {/* Service config vars at bottom */}
      {(missingRequiredVars.length > 0 || configuredVars.length > 0) && (
        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/50">
          <div className="space-y-1">
            {/* Missing required fields first */}
            {missingRequiredVars.map((v) => (
              <div
                key={v.key}
                className="text-sm text-warning-600 dark:text-warning-400"
              >
                <span className="text-error-500">*</span>
                <span className="font-medium">{v.label}:</span>{' '}
                <span className="italic text-neutral-400">Not set</span>
              </div>
            ))}
            {/* Configured fields */}
            {configuredVars.slice(0, 3 - Math.min(missingRequiredVars.length, 2)).map((v) => (
              <span
            {configuredVars.slice(0, 4).map((v) => (
              <div
                key={v.key}
                className="text-xs text-neutral-500 dark:text-neutral-400"
                title={`${v.label}: ${v.value}`}
                className="text-sm text-neutral-600 dark:text-neutral-400"
              >
                {v.required && <span className="text-error-500 mr-0.5">*</span>}
                <span className="text-neutral-400 dark:text-neutral-500">{v.label}:</span>{' '}
                {v.required && <span className="text-error-500">*</span>}
                <span className="font-medium">{v.label}:</span>{' '}
                <span className={v.isSecret ? 'font-mono' : ''}>{v.value}</span>
              </span>
              </div>
            ))}
            {configuredVars.length > (3 - Math.min(missingRequiredVars.length, 2)) && (
              <span className="text-xs text-neutral-400">
                +{configuredVars.length - (3 - Math.min(missingRequiredVars.length, 2))} more
              </span>
            {configuredVars.length > 4 && (
              <div className="text-xs text-neutral-400">
                +{configuredVars.length - 4} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Capability Slot Component (full-width drop zone for each capability)
// =============================================================================

interface CapabilitySlotProps {
  consumerId: string
  capability: string
  connection: { provider?: ProviderInfo; capability: string } | null
  isDropTarget: boolean
  onClear: () => void
}

function CapabilitySlot({
  consumerId,
  capability,
  connection,
  isDropTarget,
  onClear,
}: CapabilitySlotProps) {
  const dropId = `slot::${consumerId}::${capability}`
  const { isOver, setNodeRef } = useDroppable({ id: dropId })

  const hasProvider = connection?.provider
  const isOrphaned = connection && !connection.provider

  return (
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
        <div className="w-full">
          <div className="flex items-center justify-between w-full mb-1.5">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-success-500" />
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {connection.provider!.name}
              </span>
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium">
                {capability}
              </span>
            </div>
            <button
              onClick={onClear}
              className="p-1 text-neutral-400 hover:text-error-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
              title="Disconnect"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Show provider config vars */}
          {connection.provider!.configVars.filter(v => v.value).length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-6">
              {connection.provider!.configVars
                .filter(v => v.value)
                .slice(0, 2)
                .map((v) => (
                  <span
                    key={v.key}
                    className="text-xs text-neutral-500 dark:text-neutral-400"
                    title={`${v.label}: ${v.value}`}
                  >
                    <span className="text-neutral-400 dark:text-neutral-500">{v.label}:</span>{' '}
                    <span className={v.isSecret ? 'font-mono' : ''}>{v.value}</span>
                  </span>
                ))}
              {connection.provider!.configVars.filter(v => v.value).length > 2 && (
                <span className="text-xs text-neutral-400">
                  +{connection.provider!.configVars.filter(v => v.value).length - 2} more
                </span>
              )}
            </div>
          )}
        </div>
      ) : isOrphaned ? (
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-warning-600 dark:text-warning-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Provider missing</span>
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium">
              {capability}
            </span>
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
          <span className="text-sm">
            {isDropTarget ? 'Drop ' : 'Drag '}
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium">
              {capability}
            </span>
            {isDropTarget ? ' here' : ' provider here'}
          </span>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Status Indicator
// =============================================================================

function StatusIndicator({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300">
          <span className="h-1.5 w-1.5 rounded-full bg-success-500 animate-pulse" />
          Running
        </span>
      )
    case 'configured':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300">
          <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
          Ready
        </span>
      )
    case 'needs_setup':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300">
          <Settings className="h-3 w-3" />
          Setup
        </span>
      )
    case 'stopped':
    case 'not_running':
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
          Stopped
        </span>
      )
    case 'error':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-300">
          <AlertCircle className="h-3 w-3" />
          Error
        </span>
      )
    default:
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
          {status}
        </span>
      )
  }
}
