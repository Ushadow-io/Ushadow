/**
 * OutputWiring - Components for wiring service outputs to env vars
 *
 * This module provides:
 * - OutputPort: Draggable port on service outputs
 * - EnvVarDropTarget: Droppable target for env vars
 * - WireOverlay: SVG overlay for drawing connection wires
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Circle, Link2, X, ExternalLink } from 'lucide-react'

// =============================================================================
// Types
// =============================================================================

export interface OutputInfo {
  instanceId: string
  instanceName: string
  outputKey: string // "access_url" | "env_vars.XXX" | "capability_values.XXX"
  outputLabel: string
  value?: string
}

export interface EnvVarInfo {
  instanceId: string
  instanceName: string
  envVarKey: string
  envVarLabel: string
  currentValue?: string
}

export interface OutputWiringConnection {
  id: string
  source: OutputInfo
  target: EnvVarInfo
}

export interface WirePosition {
  sourceId: string
  targetId: string
  sourcePos: { x: number; y: number }
  targetPos: { x: number; y: number }
}

// =============================================================================
// OutputPort - Draggable port on service outputs
// =============================================================================

interface OutputPortProps {
  output: OutputInfo
  isConnected: boolean
  connectionCount: number
  onStartDrag: (output: OutputInfo, startPos: { x: number; y: number }) => void
  onEndDrag: () => void
  portRef?: (el: HTMLDivElement | null) => void
}

export function OutputPort({
  output,
  isConnected,
  connectionCount,
  onStartDrag,
  onEndDrag,
  portRef,
}: OutputPortProps) {
  const [isDragging, setIsDragging] = useState(false)
  const localRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    const rect = localRef.current?.getBoundingClientRect()
    if (rect) {
      onStartDrag(output, {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      })
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseUp = () => {
      setIsDragging(false)
      onEndDrag()
    }

    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [isDragging, onEndDrag])

  const setRefs = (el: HTMLDivElement | null) => {
    localRef.current = el
    portRef?.(el)
  }

  return (
    <div
      ref={setRefs}
      data-port-id={`output::${output.instanceId}::${output.outputKey}`}
      className={`
        group/port relative flex items-center gap-2 px-2 py-1 rounded cursor-grab
        transition-all duration-150
        ${isDragging ? 'opacity-50' : ''}
        ${isConnected
          ? 'bg-primary-50 dark:bg-primary-900/20'
          : 'hover:bg-neutral-100 dark:hover:bg-neutral-700/50'
        }
      `}
      onMouseDown={handleMouseDown}
      title={output.value ? `Value: ${output.value}` : 'Drag to connect'}
    >
      {/* Output label */}
      <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate max-w-[100px]">
        {output.outputLabel}
      </span>

      {/* Port circle */}
      <div
        className={`
          w-3 h-3 rounded-full border-2 flex-shrink-0 transition-all
          ${isConnected
            ? 'bg-primary-500 border-primary-600'
            : 'bg-neutral-200 dark:bg-neutral-600 border-neutral-400 dark:border-neutral-500'
          }
          group-hover/port:scale-125 group-hover/port:border-primary-400
        `}
      />

      {/* Connection count badge */}
      {connectionCount > 0 && (
        <span className="absolute -top-1 -right-1 px-1 min-w-[14px] h-[14px] text-[9px] font-bold rounded-full bg-primary-500 text-white flex items-center justify-center">
          {connectionCount}
        </span>
      )}
    </div>
  )
}

// =============================================================================
// EnvVarDropTarget - Droppable target for env vars
// =============================================================================

interface EnvVarDropTargetProps {
  envVar: EnvVarInfo
  isConnected: boolean
  connectedFrom?: OutputInfo
  isDropTarget: boolean
  onDisconnect: () => void
  targetRef?: (el: HTMLDivElement | null) => void
}

export function EnvVarDropTarget({
  envVar,
  isConnected,
  connectedFrom,
  isDropTarget,
  onDisconnect,
  targetRef,
}: EnvVarDropTargetProps) {
  const localRef = useRef<HTMLDivElement>(null)

  const setRefs = (el: HTMLDivElement | null) => {
    localRef.current = el
    targetRef?.(el)
  }

  return (
    <div
      ref={setRefs}
      data-target-id={`envvar::${envVar.instanceId}::${envVar.envVarKey}`}
      className={`
        group/target relative flex items-center gap-2 px-2 py-1.5 rounded transition-all
        ${isDropTarget
          ? 'bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-400 ring-offset-1'
          : ''
        }
        ${isConnected
          ? 'bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800'
          : 'bg-neutral-50 dark:bg-neutral-800/50 border border-dashed border-neutral-300 dark:border-neutral-600'
        }
      `}
    >
      {/* Target circle */}
      <div
        className={`
          w-3 h-3 rounded-full border-2 flex-shrink-0 transition-all
          ${isConnected
            ? 'bg-success-500 border-success-600'
            : isDropTarget
              ? 'bg-primary-400 border-primary-500 scale-125'
              : 'bg-neutral-200 dark:bg-neutral-600 border-neutral-400 dark:border-neutral-500'
          }
        `}
      />

      {/* Env var label */}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate block">
          {envVar.envVarLabel}
        </span>
        {isConnected && connectedFrom && (
          <span className="text-[10px] text-success-600 dark:text-success-400 flex items-center gap-1">
            <Link2 className="w-2.5 h-2.5" />
            <span className="truncate">{connectedFrom.instanceName}.{connectedFrom.outputLabel}</span>
          </span>
        )}
        {!isConnected && isDropTarget && (
          <span className="text-[10px] text-primary-500 animate-pulse">
            Drop to connect
          </span>
        )}
      </div>

      {/* Disconnect button */}
      {isConnected && (
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

// =============================================================================
// WireOverlay - SVG overlay for drawing connection wires
// =============================================================================

interface WireOverlayProps {
  wires: WirePosition[]
  draggingWire?: {
    sourcePos: { x: number; y: number }
    currentPos: { x: number; y: number }
  }
  containerRef: React.RefObject<HTMLElement>
}

export function WireOverlay({ wires, draggingWire, containerRef }: WireOverlayProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: rect.height })
        setOffset({ x: rect.left, y: rect.top })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    window.addEventListener('scroll', updateDimensions)

    // Also update on container size changes
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      window.removeEventListener('resize', updateDimensions)
      window.removeEventListener('scroll', updateDimensions)
      resizeObserver.disconnect()
    }
  }, [containerRef])

  // Convert absolute position to relative position within container
  const toRelative = useCallback((pos: { x: number; y: number }) => ({
    x: pos.x - offset.x,
    y: pos.y - offset.y,
  }), [offset])

  // Generate a curved path between two points
  const generatePath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const dx = end.x - start.x
    const controlPointOffset = Math.min(Math.abs(dx) * 0.5, 100)

    return `M ${start.x} ${start.y}
            C ${start.x + controlPointOffset} ${start.y},
              ${end.x - controlPointOffset} ${end.y},
              ${end.x} ${end.y}`
  }

  if (dimensions.width === 0 || dimensions.height === 0) return null

  return createPortal(
    <svg
      className="fixed inset-0 pointer-events-none z-[1000]"
      style={{
        left: offset.x,
        top: offset.y,
        width: dimensions.width,
        height: dimensions.height,
      }}
    >
      <defs>
        {/* Gradient for connected wires */}
        <linearGradient id="wire-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-primary-400)" />
          <stop offset="100%" stopColor="var(--color-success-400)" />
        </linearGradient>
        {/* Gradient for dragging wire */}
        <linearGradient id="wire-dragging" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-primary-500)" />
          <stop offset="100%" stopColor="var(--color-primary-300)" />
        </linearGradient>
        {/* Arrow marker */}
        <marker
          id="wire-arrow"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 L1,3 Z" fill="var(--color-success-400)" />
        </marker>
      </defs>

      {/* Existing connections */}
      {wires.map((wire) => {
        const startRel = toRelative(wire.sourcePos)
        const endRel = toRelative(wire.targetPos)

        return (
          <g key={`${wire.sourceId}-${wire.targetId}`}>
            {/* Shadow/glow effect */}
            <path
              d={generatePath(startRel, endRel)}
              fill="none"
              stroke="var(--color-primary-200)"
              strokeWidth="6"
              opacity="0.3"
            />
            {/* Main wire */}
            <path
              d={generatePath(startRel, endRel)}
              fill="none"
              stroke="url(#wire-gradient)"
              strokeWidth="2"
              strokeLinecap="round"
              markerEnd="url(#wire-arrow)"
            />
          </g>
        )
      })}

      {/* Currently dragging wire */}
      {draggingWire && (
        <g>
          <path
            d={generatePath(
              toRelative(draggingWire.sourcePos),
              toRelative(draggingWire.currentPos)
            )}
            fill="none"
            stroke="url(#wire-dragging)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="5,5"
            className="animate-pulse"
          />
          {/* Dragging endpoint circle */}
          <circle
            cx={toRelative(draggingWire.currentPos).x}
            cy={toRelative(draggingWire.currentPos).y}
            r="4"
            fill="var(--color-primary-500)"
            className="animate-pulse"
          />
        </g>
      )}
    </svg>,
    document.body
  )
}

// =============================================================================
// OutputSection - Section showing all outputs for a service
// =============================================================================

interface OutputSectionProps {
  instanceId: string
  instanceName: string
  outputs: {
    access_url?: string
    env_vars?: Record<string, string>
    capability_values?: Record<string, any>
  }
  connections: OutputWiringConnection[]
  onStartDrag: (output: OutputInfo, startPos: { x: number; y: number }) => void
  onEndDrag: () => void
  portRefs: Map<string, HTMLDivElement>
}

export function OutputSection({
  instanceId,
  instanceName,
  outputs,
  connections,
  onStartDrag,
  onEndDrag,
  portRefs,
}: OutputSectionProps) {
  // Build list of available outputs
  const outputList: OutputInfo[] = []

  // Add access_url if present
  if (outputs.access_url) {
    outputList.push({
      instanceId,
      instanceName,
      outputKey: 'access_url',
      outputLabel: 'URL',
      value: outputs.access_url,
    })
  }

  // Add env_vars if present
  if (outputs.env_vars) {
    Object.entries(outputs.env_vars).forEach(([key, value]) => {
      outputList.push({
        instanceId,
        instanceName,
        outputKey: `env_vars.${key}`,
        outputLabel: key,
        value,
      })
    })
  }

  // Add capability_values if present
  if (outputs.capability_values) {
    Object.entries(outputs.capability_values).forEach(([key, value]) => {
      outputList.push({
        instanceId,
        instanceName,
        outputKey: `capability_values.${key}`,
        outputLabel: key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      })
    })
  }

  if (outputList.length === 0) {
    return null
  }

  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-1">
        <ExternalLink className="w-3 h-3" />
        Outputs
      </div>
      <div className="flex flex-col gap-1">
        {outputList.map((output) => {
          const connectionCount = connections.filter(
            (c) => c.source.instanceId === instanceId && c.source.outputKey === output.outputKey
          ).length

          return (
            <OutputPort
              key={output.outputKey}
              output={output}
              isConnected={connectionCount > 0}
              connectionCount={connectionCount}
              onStartDrag={onStartDrag}
              onEndDrag={onEndDrag}
              portRef={(el) => {
                if (el) {
                  portRefs.set(`output::${instanceId}::${output.outputKey}`, el)
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
// EnvVarSection - Section showing env vars that can receive wire connections
// =============================================================================

interface EnvVarSectionProps {
  instanceId: string
  instanceName: string
  envVars: Array<{
    key: string
    label: string
    value?: string
    required?: boolean
  }>
  connections: OutputWiringConnection[]
  draggingOutput: OutputInfo | null
  onDisconnect: (connectionId: string) => void
  targetRefs: Map<string, HTMLDivElement>
  isDropTarget: (envVarKey: string) => boolean
}

export function EnvVarSection({
  instanceId,
  instanceName,
  envVars,
  connections,
  draggingOutput,
  onDisconnect,
  targetRefs,
  isDropTarget,
}: EnvVarSectionProps) {
  if (envVars.length === 0) {
    return null
  }

  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-1">
        <Link2 className="w-3 h-3" />
        Env Vars
      </div>
      <div className="flex flex-col gap-1">
        {envVars.map((envVar) => {
          const connection = connections.find(
            (c) => c.target.instanceId === instanceId && c.target.envVarKey === envVar.key
          )

          return (
            <EnvVarDropTarget
              key={envVar.key}
              envVar={{
                instanceId,
                instanceName,
                envVarKey: envVar.key,
                envVarLabel: envVar.label,
                currentValue: envVar.value,
              }}
              isConnected={!!connection}
              connectedFrom={connection?.source}
              isDropTarget={draggingOutput !== null && isDropTarget(envVar.key)}
              onDisconnect={() => {
                if (connection) {
                  onDisconnect(connection.id)
                }
              }}
              targetRef={(el) => {
                if (el) {
                  targetRefs.set(`envvar::${instanceId}::${envVar.key}`, el)
                }
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
