/**
 * WiringBoard - Drag-and-drop wiring interface
 *
 * Two-column layout:
 * - Left: Provider instances (sources)
 * - Right: Consumer instances with capability slots (targets)
 *
 * Drag from a provider to a consumer's capability slot to create a connection.
 * Also supports output-to-env-var wiring with visual wire connections.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
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
  ChevronDown,
  ChevronUp,
  Plug,
  Package,
  ExternalLink,
  Link2,
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
  // Output wiring: available outputs for this provider
  outputs?: {
    access_url?: string
    env_vars?: Record<string, string>
    capability_values?: Record<string, any>
  }
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
  // Output wiring: env vars that can receive wired values
  wirableEnvVars?: Array<{
    key: string
    label: string
    value?: string
    required?: boolean
  }>
}

interface WiringInfo {
  id: string
  source_config_id: string
  source_capability: string
  target_config_id: string
  target_capability: string
}

// Output wiring types
export interface OutputWiringInfo {
  id: string
  source_instance_id: string
  source_output_key: string
  target_instance_id: string
  target_env_var: string
}

export interface OutputInfo {
  instanceId: string
  instanceName: string
  outputKey: string
  outputLabel: string
  value?: string
}

interface DropInfo {
  provider: ProviderInfo
  consumerId: string
  capability: string
}

interface OutputDropInfo {
  source: OutputInfo
  targetInstanceId: string
  targetEnvVar: string
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
  // Output wiring props
  outputWiring?: OutputWiringInfo[]
  onOutputWiringCreate?: (dropInfo: OutputDropInfo) => Promise<void>
  onOutputWiringDelete?: (wiringId: string) => Promise<void>
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
  outputWiring = [],
  onOutputWiringCreate,
  onOutputWiringDelete,
}: WiringBoardProps) {
  const [activeProvider, setActiveProvider] = useState<ProviderInfo | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [collapsedTemplates, setCollapsedTemplates] = useState<Set<string>>(new Set())
  // Provider selection modal state (for click-to-select alternative to drag-drop)
  const [selectingSlot, setSelectingSlot] = useState<{ consumerId: string; capability: string } | null>(null)

  const toggleTemplateCollapse = (templateId: string) => {
    setCollapsedTemplates(prev => {
      const next = new Set(prev)
      if (next.has(templateId)) {
        next.delete(templateId)
      } else {
        next.add(templateId)
      }
      return next
    })
  }

  // Open provider selection modal for a slot
  const handleSelectProviderClick = (consumerId: string, capability: string) => {
    setSelectingSlot({ consumerId, capability })
  }

  // Get available providers for a specific capability
  const getProvidersForCapability = (capability: string) => {
    return providers.filter(p => p.capability === capability)
  }

  // Handle selecting a provider from the modal
  const handleProviderSelected = (provider: ProviderInfo) => {
    if (!selectingSlot) return
    onProviderDrop({
      provider,
      consumerId: selectingSlot.consumerId,
      capability: selectingSlot.capability,
    })
    setSelectingSlot(null)
  }

  // Output wiring state
  const [draggingOutput, setDraggingOutput] = useState<OutputInfo | null>(null)
  const [wireStartPos, setWireStartPos] = useState<{ x: number; y: number } | null>(null)
  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const outputPortRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const envVarTargetRefs = useRef<Map<string, HTMLDivElement>>(new Map())

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

  // Output wire dragging handlers
  const handleOutputDragStart = useCallback((output: OutputInfo, startPos: { x: number; y: number }) => {
    setDraggingOutput(output)
    setWireStartPos(startPos)
  }, [])

  const handleOutputDragEnd = useCallback(async () => {
    if (draggingOutput && hoveredTarget && onOutputWiringCreate) {
      // Parse target: "envvar::instanceId::envVarKey"
      const parts = hoveredTarget.split('::')
      if (parts.length === 3 && parts[0] === 'envvar') {
        await onOutputWiringCreate({
          source: draggingOutput,
          targetInstanceId: parts[1],
          targetEnvVar: parts[2],
        })
      }
    }
    setDraggingOutput(null)
    setWireStartPos(null)
    setHoveredTarget(null)
  }, [draggingOutput, hoveredTarget, onOutputWiringCreate])

  // Track mouse position and detect drop targets during output wire drag
  useEffect(() => {
    if (!draggingOutput) return

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY })

      // Check if hovering over any env var target
      const elements = document.elementsFromPoint(e.clientX, e.clientY)
      const targetEl = elements.find(el => el.getAttribute('data-target-id')?.startsWith('envvar::'))
      if (targetEl) {
        setHoveredTarget(targetEl.getAttribute('data-target-id'))
      } else {
        setHoveredTarget(null)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [draggingOutput])

  // Calculate wire positions for existing output wiring connections
  const getWirePositions = useCallback(() => {
    const positions: Array<{
      sourceId: string
      targetId: string
      sourcePos: { x: number; y: number }
      targetPos: { x: number; y: number }
    }> = []

    outputWiring.forEach((wire) => {
      const sourceKey = `output::${wire.source_instance_id}::${wire.source_output_key}`
      const targetKey = `envvar::${wire.target_instance_id}::${wire.target_env_var}`

      const sourceEl = outputPortRefs.current.get(sourceKey)
      const targetEl = envVarTargetRefs.current.get(targetKey)

      if (sourceEl && targetEl) {
        const sourceRect = sourceEl.getBoundingClientRect()
        const targetRect = targetEl.getBoundingClientRect()

        positions.push({
          sourceId: sourceKey,
          targetId: targetKey,
          sourcePos: { x: sourceRect.right, y: sourceRect.top + sourceRect.height / 2 },
          targetPos: { x: targetRect.left, y: targetRect.top + targetRect.height / 2 },
        })
      }
    })

    return positions
  }, [outputWiring])

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
        ref={boardRef}
        className="grid grid-cols-2 gap-8 relative"
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
                  const isCollapsed = collapsedTemplates.has(template.id)
                  const hasInstances = instances.length > 0
                  return (
                    <div key={template.id} className="space-y-1">
                      {/* Template header with collapse toggle */}
                      <div className="flex items-center gap-1">
                        {hasInstances && (
                          <button
                            onClick={() => toggleTemplateCollapse(template.id)}
                            className="p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                            title={isCollapsed ? `Show ${instances.length} instance(s)` : 'Collapse instances'}
                            data-testid={`collapse-provider-${template.id}`}
                          >
                            {isCollapsed ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronUp className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        <div className={`flex-1 ${!hasInstances ? 'ml-5' : ''}`}>
                          <DraggableProvider
                            provider={template}
                            connectionCount={templateConnectionCount}
                            onEdit={() => onEditProvider(template.id, true)}
                            onCreateServiceConfig={() => onCreateServiceConfig(template.id)}
                            onStart={onStartProvider ? () => onStartProvider(template.id, true) : undefined}
                            onStop={onStopProvider ? () => onStopProvider(template.id, true) : undefined}
                          />
                        </div>
                      </div>
                      {/* Nested instances - collapsible */}
                      {hasInstances && !isCollapsed && (
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
                                outputWiring={outputWiring}
                                onOutputDragStart={handleOutputDragStart}
                                onOutputDragEnd={handleOutputDragEnd}
                                outputPortRefs={outputPortRefs.current}
                              />
                            )
                          })}
                        </div>
                      )}
                      {/* Collapsed indicator */}
                      {hasInstances && isCollapsed && (
                        <div
                          className="ml-6 pl-3 text-xs text-neutral-400 dark:text-neutral-500 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-400"
                          onClick={() => toggleTemplateCollapse(template.id)}
                        >
                          {instances.length} instance{instances.length > 1 ? 's' : ''} hidden
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
                  const isCollapsed = collapsedTemplates.has(template.id)
                  const hasInstances = templateInstances.length > 0

                  return (
                    <div key={template.id} className="space-y-2">
                      {/* Template header with collapse toggle */}
                      <div className="flex items-start gap-1">
                        {hasInstances && (
                          <button
                            onClick={() => toggleTemplateCollapse(template.id)}
                            className="p-0.5 mt-4 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                            title={isCollapsed ? `Show ${templateInstances.length} instance(s)` : 'Collapse instances'}
                            data-testid={`collapse-service-${template.id}`}
                          >
                            {isCollapsed ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronUp className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        <div className={`flex-1 ${!hasInstances ? 'ml-5' : ''}`}>
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
                        </div>
                      </div>

                      {/* Nested instances - collapsible */}
                      {hasInstances && !isCollapsed && (
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
                                onSelectProvider={handleSelectProviderClick}
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
                      {/* Collapsed indicator */}
                      {hasInstances && isCollapsed && (
                        <div
                          className="ml-6 pl-3 text-xs text-neutral-400 dark:text-neutral-500 cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-400"
                          onClick={() => toggleTemplateCollapse(template.id)}
                        >
                          {templateInstances.length} instance{templateInstances.length > 1 ? 's' : ''} hidden
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

      {/* Provider Selection Modal (click-to-select alternative to drag-drop) */}
      {selectingSlot && createPortal(
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9998]"
          onClick={() => setSelectingSlot(null)}
        >
          <div
            className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            data-testid="provider-selection-modal"
          >
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Select Provider
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Choose a <span className="font-medium">{selectingSlot.capability}</span> provider
                </p>
              </div>
              <button
                onClick={() => setSelectingSlot(null)}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto">
              {(() => {
                const availableProviders = getProvidersForCapability(selectingSlot.capability)
                if (availableProviders.length === 0) {
                  return (
                    <div className="text-center py-6 text-neutral-500 dark:text-neutral-400">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No providers available for {selectingSlot.capability}</p>
                      <p className="text-sm mt-1">Add a provider first</p>
                    </div>
                  )
                }
                return (
                  <div className="space-y-2">
                    {availableProviders.map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => handleProviderSelected(provider)}
                        className="w-full p-3 text-left rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                        data-testid={`select-provider-${provider.id}`}
                      >
                        <div className="flex items-center gap-3">
                          {provider.mode === 'local' ? (
                            <HardDrive className="h-5 w-5 text-purple-500" />
                          ) : (
                            <Cloud className="h-5 w-5 text-blue-500" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-neutral-900 dark:text-neutral-100">
                              {provider.name}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">
                              {provider.isTemplate ? 'Default' : 'Instance'} • {provider.mode}
                            </div>
                          </div>
                          <StatusIndicator status={provider.status} />
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })()}
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
  // Output wiring props
  outputWiring?: OutputWiringInfo[]
  onOutputDragStart?: (output: OutputInfo, startPos: { x: number; y: number }) => void
  onOutputDragEnd?: () => void
  outputPortRefs?: Map<string, HTMLDivElement>
}

function DraggableProvider({ provider, connectionCount, onEdit, onCreateServiceConfig, onDelete, onStart, onStop, templateProvider }: DraggableProviderProps) {
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
        group relative rounded-lg border transition-all flex
        ${isDragging ? 'opacity-30 border-dashed border-primary-400 dark:border-primary-500' : 'border-neutral-200 dark:border-neutral-700'}
        ${isConnected ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800' : 'bg-white dark:bg-neutral-900'}
        hover:border-primary-300 dark:hover:border-primary-600
      `}
      data-testid={`provider-drag-${provider.id}`}
    >
      {/* Left side: Main content */}
      <div className="flex-1 min-w-0">
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

      {/* Right side: Output ports for wiring */}
      {provider.outputs && onOutputDragStart && (
        <OutputPortsSidePanel
          provider={provider}
          outputWiring={outputWiring}
          onOutputDragStart={onOutputDragStart}
          onOutputDragEnd={onOutputDragEnd || (() => {})}
          outputPortRefs={outputPortRefs}
        />
      )}

    </div>
  )
}

// =============================================================================
// Output Ports Section - Shows draggable output ports on providers
// =============================================================================

interface OutputPortsSectionProps {
  provider: ProviderInfo
  outputWiring: OutputWiringInfo[]
  onOutputDragStart: (output: OutputInfo, startPos: { x: number; y: number }) => void
  onOutputDragEnd: () => void
  outputPortRefs?: Map<string, HTMLDivElement>
}

function OutputPortsSection({
  provider,
  outputWiring,
  onOutputDragStart,
  onOutputDragEnd,
  outputPortRefs,
}: OutputPortsSectionProps) {
  const outputs = provider.outputs
  if (!outputs) return null

  // Build list of available outputs
  const outputList: Array<{ key: string; label: string; value?: string }> = []

  if (outputs.access_url) {
    outputList.push({ key: 'access_url', label: 'URL', value: outputs.access_url })
  }

  if (outputs.env_vars) {
    Object.entries(outputs.env_vars).forEach(([key, value]) => {
      outputList.push({ key: `env_vars.${key}`, label: key, value })
    })
  }

  if (outputs.capability_values) {
    Object.entries(outputs.capability_values).forEach(([key, value]) => {
      outputList.push({
        key: `capability_values.${key}`,
        label: key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      })
    })
  }

  if (outputList.length === 0) return null

  return (
    <div className="px-3 pb-2 pt-1 border-t border-neutral-100 dark:border-neutral-800">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-1 mb-1">
        <ExternalLink className="w-2.5 h-2.5" />
        Outputs
      </div>
      <div className="flex flex-wrap gap-1">
        {outputList.map((output) => {
          const connectionCount = outputWiring.filter(
            (w) => w.source_instance_id === provider.id && w.source_output_key === output.key
          ).length

          return (
            <OutputPortPill
              key={output.key}
              instanceId={provider.id}
              instanceName={provider.name}
              outputKey={output.key}
              outputLabel={output.label}
              value={output.value}
              connectionCount={connectionCount}
              onDragStart={onOutputDragStart}
              onDragEnd={onOutputDragEnd}
              portRef={(el) => {
                if (el && outputPortRefs) {
                  outputPortRefs.set(`output::${provider.id}::${output.key}`, el)
                }
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

// =============================================================================
// Output Ports Side Panel - Shows outputs on the right side of provider cards
// =============================================================================

function OutputPortsSidePanel({
  provider,
  outputWiring,
  onOutputDragStart,
  onOutputDragEnd,
  outputPortRefs,
}: OutputPortsSectionProps) {
  const outputs = provider.outputs
  if (!outputs) return null

  // Build list of available outputs
  const outputList: Array<{ key: string; label: string; value?: string }> = []

  if (outputs.access_url) {
    outputList.push({ key: 'access_url', label: 'URL', value: outputs.access_url })
  }

  if (outputs.env_vars) {
    Object.entries(outputs.env_vars).forEach(([key, value]) => {
      outputList.push({ key: `env_vars.${key}`, label: key, value })
    })
  }

  if (outputs.capability_values) {
    Object.entries(outputs.capability_values).forEach(([key, value]) => {
      outputList.push({
        key: `capability_values.${key}`,
        label: key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      })
    })
  }

  if (outputList.length === 0) return null

  return (
    <div className="flex flex-col justify-center gap-1 px-2 py-2 border-l border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30 rounded-r-lg">
      {outputList.map((output) => {
        const connectionCount = outputWiring.filter(
          (w) => w.source_instance_id === provider.id && w.source_output_key === output.key
        ).length

        return (
          <OutputPortPill
            key={output.key}
            instanceId={provider.id}
            instanceName={provider.name}
            outputKey={output.key}
            outputLabel={output.label}
            value={output.value}
            connectionCount={connectionCount}
            onDragStart={onOutputDragStart}
            onDragEnd={onOutputDragEnd}
            portRef={(el) => {
              if (el && outputPortRefs) {
                outputPortRefs.set(`output::${provider.id}::${output.key}`, el)
              }
            }}
          />
        )
      })}
    </div>
  )
}

// =============================================================================
// Output Port Pill - Individual draggable output port
// =============================================================================

interface OutputPortPillProps {
  instanceId: string
  instanceName: string
  outputKey: string
  outputLabel: string
  value?: string
  connectionCount: number
  onDragStart: (output: OutputInfo, startPos: { x: number; y: number }) => void
  onDragEnd: () => void
  portRef?: (el: HTMLDivElement | null) => void
}

function OutputPortPill({
  instanceId,
  instanceName,
  outputKey,
  outputLabel,
  value,
  connectionCount,
  onDragStart,
  onDragEnd,
  portRef,
}: OutputPortPillProps) {
  const [isDragging, setIsDragging] = useState(false)
  const localRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    const rect = localRef.current?.getBoundingClientRect()
    if (rect) {
      onDragStart(
        { instanceId, instanceName, outputKey, outputLabel, value },
        { x: rect.right, y: rect.top + rect.height / 2 }
      )
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseUp = () => {
      setIsDragging(false)
      onDragEnd()
    }

    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [isDragging, onDragEnd])

  const setRefs = (el: HTMLDivElement | null) => {
    localRef.current = el
    portRef?.(el)
  }

  const isConnected = connectionCount > 0

  return (
    <div
      ref={setRefs}
      data-port-id={`output::${instanceId}::${outputKey}`}
      className={`
        group/port relative flex items-center gap-1.5 px-2 py-1 rounded cursor-grab
        text-xs transition-all
        ${isDragging ? 'opacity-50 scale-95' : ''}
        ${isConnected
          ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-violet-50 dark:hover:bg-violet-900/20'
        }
      `}
      onMouseDown={handleMouseDown}
      title={value ? `${outputLabel}: ${value}` : outputLabel}
    >
      <span className="truncate max-w-[80px]">{outputLabel}</span>
      <div
        className={`
          w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 transition-all
          ${isConnected
            ? 'bg-violet-500 border-violet-600'
            : 'bg-neutral-300 dark:bg-neutral-600 border-neutral-400 dark:border-neutral-500'
          }
          group-hover/port:scale-125 group-hover/port:border-violet-400
        `}
      />
      {connectionCount > 1 && (
        <span className="absolute -top-1 -right-1 px-1 min-w-[12px] h-[12px] text-[8px] font-bold rounded-full bg-violet-500 text-white flex items-center justify-center">
          {connectionCount}
        </span>
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
  // Output wiring props
  outputWiring?: OutputWiringInfo[]
  draggingOutput?: OutputInfo | null
  hoveredTarget?: string | null
  onOutputWiringDelete?: (wiringId: string) => Promise<void>
  envVarTargetRefs?: Map<string, HTMLDivElement>
  providers?: ProviderInfo[] // To get source instance names
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
  outputWiring = [],
  draggingOutput,
  hoveredTarget,
  onOutputWiringDelete,
  envVarTargetRefs,
  providers = [],
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

      {/* Wirable Env Vars - drop targets for output wiring */}
      {consumer.wirableEnvVars && consumer.wirableEnvVars.length > 0 && (
        <EnvVarTargetsSection
          consumer={consumer}
          outputWiring={outputWiring}
          draggingOutput={draggingOutput}
          hoveredTarget={hoveredTarget}
          onOutputWiringDelete={onOutputWiringDelete}
          envVarTargetRefs={envVarTargetRefs}
          providers={providers}
        />
      )}

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
            {configuredVars.slice(0, 4).map((v) => (
              <div
                key={v.key}
                className="text-sm text-neutral-600 dark:text-neutral-400"
              >
                {v.required && <span className="text-error-500">*</span>}
                <span className="font-medium">{v.label}:</span>{' '}
                <span className={v.isSecret ? 'font-mono' : ''}>{v.value}</span>
              </div>
            ))}
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
// Env Var Targets Section - Shows drop targets for output wiring
// =============================================================================

interface EnvVarTargetsSectionProps {
  consumer: ConsumerInfo
  outputWiring: OutputWiringInfo[]
  draggingOutput?: OutputInfo | null
  hoveredTarget?: string | null
  onOutputWiringDelete?: (wiringId: string) => Promise<void>
  envVarTargetRefs?: Map<string, HTMLDivElement>
  providers: ProviderInfo[]
}

function EnvVarTargetsSection({
  consumer,
  outputWiring,
  draggingOutput,
  hoveredTarget,
  onOutputWiringDelete,
  envVarTargetRefs,
  providers,
}: EnvVarTargetsSectionProps) {
  const envVars = consumer.wirableEnvVars || []
  if (envVars.length === 0) return null

  return (
    <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-700">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-1 mb-2">
        <Link2 className="w-2.5 h-2.5" />
        Wirable Env Vars
      </div>
      <div className="space-y-2">
        {envVars.map((envVar) => {
          // Find if this env var has a wired connection
          const connection = outputWiring.find(
            (w) => w.target_instance_id === consumer.id && w.target_env_var === envVar.key
          )

          // Get source info if connected
          let sourceInfo: { instanceName: string; outputLabel: string } | null = null
          if (connection) {
            const sourceProvider = providers.find((p) => p.id === connection.source_instance_id)
            const outputKey = connection.source_output_key
            let outputLabel = outputKey
            if (outputKey === 'access_url') {
              outputLabel = 'URL'
            } else if (outputKey.startsWith('env_vars.')) {
              outputLabel = outputKey.replace('env_vars.', '')
            } else if (outputKey.startsWith('capability_values.')) {
              outputLabel = outputKey.replace('capability_values.', '')
            }
            sourceInfo = {
              instanceName: sourceProvider?.name || connection.source_instance_id,
              outputLabel,
            }
          }

          const targetId = `envvar::${consumer.id}::${envVar.key}`
          const isDropTarget = draggingOutput !== null
          const isHovered = hoveredTarget === targetId

          return (
            <EnvVarDropTargetPill
              key={envVar.key}
              envVarKey={envVar.key}
              envVarLabel={envVar.label}
              value={envVar.value}
              required={envVar.required}
              isConnected={!!connection}
              sourceInfo={sourceInfo}
              isDropTarget={isDropTarget}
              isHovered={isHovered}
              onDisconnect={
                connection && onOutputWiringDelete
                  ? () => onOutputWiringDelete(connection.id)
                  : undefined
              }
              targetRef={(el) => {
                if (el && envVarTargetRefs) {
                  envVarTargetRefs.set(targetId, el)
                }
              }}
              targetId={targetId}
            />
          )
        })}
      </div>
    </div>
  )
}

// =============================================================================
// Env Var Drop Target Pill - Individual drop target for env vars
// =============================================================================

interface EnvVarDropTargetPillProps {
  envVarKey: string
  envVarLabel: string
  value?: string
  required?: boolean
  isConnected: boolean
  sourceInfo: { instanceName: string; outputLabel: string } | null
  isDropTarget: boolean
  isHovered: boolean
  onDisconnect?: () => void
  targetRef?: (el: HTMLDivElement | null) => void
  targetId: string
}

function EnvVarDropTargetPill({
  envVarKey,
  envVarLabel,
  value,
  required,
  isConnected,
  sourceInfo,
  isDropTarget,
  isHovered,
  onDisconnect,
  targetRef,
  targetId,
}: EnvVarDropTargetPillProps) {
  return (
    <div
      ref={targetRef}
      data-target-id={targetId}
      className={`
        group/target flex items-center gap-2 px-3 py-2 rounded-lg transition-all
        ${isHovered
          ? 'bg-violet-100 dark:bg-violet-900/30 ring-2 ring-violet-400 ring-offset-1'
          : ''
        }
        ${isConnected
          ? 'bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-700'
          : isDropTarget
            ? 'bg-violet-50 dark:bg-violet-900/10 border border-dashed border-violet-300 dark:border-violet-600'
            : 'bg-neutral-50 dark:bg-neutral-800/50 border border-dashed border-neutral-300 dark:border-neutral-600'
        }
      `}
    >
      {/* Target indicator circle */}
      <div
        className={`
          w-3 h-3 rounded-full border-2 flex-shrink-0 transition-all
          ${isConnected
            ? 'bg-success-500 border-success-600'
            : isHovered
              ? 'bg-violet-400 border-violet-500 scale-125'
              : isDropTarget
                ? 'bg-violet-200 dark:bg-violet-700 border-violet-400 dark:border-violet-500'
                : 'bg-neutral-200 dark:bg-neutral-600 border-neutral-400 dark:border-neutral-500'
          }
        `}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {required && <span className="text-error-500 text-xs">*</span>}
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
            {envVarLabel}
          </span>
          <span className="text-[10px] text-neutral-400 font-mono">({envVarKey})</span>
        </div>
        {isConnected && sourceInfo ? (
          <span className="text-[10px] text-success-600 dark:text-success-400 flex items-center gap-1">
            <Link2 className="w-2.5 h-2.5" />
            <span className="truncate">
              {sourceInfo.instanceName}.{sourceInfo.outputLabel}
            </span>
          </span>
        ) : value ? (
          <span className="text-[10px] text-neutral-500 truncate block">
            Current: {value}
          </span>
        ) : isDropTarget && !isConnected ? (
          <span className="text-[10px] text-violet-500 animate-pulse">
            {isHovered ? 'Release to connect' : 'Drop output here'}
          </span>
        ) : null}
      </div>

      {/* Disconnect button */}
      {isConnected && onDisconnect && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDisconnect()
          }}
          className="p-0.5 text-neutral-400 hover:text-error-500 rounded opacity-0 group-hover/target:opacity-100 transition-opacity"
          title="Disconnect"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

