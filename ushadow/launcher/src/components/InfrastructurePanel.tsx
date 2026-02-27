import { useState, useEffect } from 'react'
import { Play, Square, RotateCcw, Loader2, ChevronDown, ChevronRight, Check } from 'lucide-react'
import { tauri, type InfraService, type ComposeServiceDefinition } from '../hooks/useTauri'

interface InfrastructurePanelProps {
  services: InfraService[]
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  isLoading: boolean
  selectedServices?: string[]
  onToggleService?: (serviceId: string) => void
  projectRoot?: string | null
}

// Parse Docker port mappings into clean port numbers
// Input: "0.0.0.0:27017->27017/tcp, [::]:27017->27017/tcp"
// Output: ["27017"]
function parsePortMapping(ports: string | null): string[] {
  if (!ports) return []

  const portSet = new Set<string>()

  // Match patterns like "27017->27017" or "6333-6334->6333-6334"
  const regex = /(\d+(?:-\d+)?)->(\d+(?:-\d+)?)/g
  let match

  while ((match = regex.exec(ports)) !== null) {
    portSet.add(match[1]) // Extract the host port (before ->)
  }

  return Array.from(portSet).sort((a, b) => {
    // Sort by first port number
    const aNum = parseInt(a.split('-')[0])
    const bNum = parseInt(b.split('-')[0])
    return aNum - bNum
  })
}

export function InfrastructurePanel({
  services,
  onStart,
  onStop,
  onRestart,
  isLoading,
  selectedServices = [],
  onToggleService,
  projectRoot,
}: InfrastructurePanelProps) {
  const [expanded, setExpanded] = useState(true)
  const [composeServices, setComposeServices] = useState<InfraService[]>([])

  // Load services from docker-compose.infra.yml — only once project root is set
  useEffect(() => {
    if (!projectRoot) return
    tauri.getInfraServicesFromCompose()
      .then(setComposeServices)
      .catch(() => setComposeServices([]))
  }, [projectRoot])

  // Debug: log discovered services (only once when services change)
  useEffect(() => {
    if (services.length > 0) {
      console.log('[InfrastructurePanel] Discovered services:', services.map(s => ({
        name: s.name,
        display_name: s.display_name,
        running: s.running,
        ports: s.ports
      })))
    }
  }, [services.length])

  // Build unified list of services (now composeServices already includes running status)
  const predefinedServices = composeServices.map(composeSvc => {
    const serviceId = composeSvc.name.toLowerCase()
    const isSelected = selectedServices.includes(serviceId)

    return {
      id: serviceId,
      displayName: composeSvc.display_name,
      defaultPort: composeSvc.ports ? parseInt(composeSvc.ports) : null,
      isSelected,
      isRunning: composeSvc.running,
      ports: composeSvc.ports,
      serviceName: composeSvc.name
    }
  })

  // Add discovered services not in compose list (for dynamic container discovery)
  const additionalServices = services
    .filter(s => {
      const matchesPredefined = composeServices.some(composeSvc =>
        s.name.toLowerCase() === composeSvc.name.toLowerCase() ||
        s.name.toLowerCase().includes(composeSvc.name.toLowerCase()) ||
        s.display_name?.toLowerCase().includes(composeSvc.name.toLowerCase())
      )
      return !matchesPredefined
    })
    .map(s => {
      const serviceId = s.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      const isSelected = selectedServices.includes(serviceId)

      return {
        id: serviceId,
        displayName: s.display_name || s.name,
        defaultPort: null,
        isSelected,
        isRunning: s.running,
        ports: s.ports,
        serviceName: s.name
      }
    })

  // Sort: running and selected first, then others
  const unifiedServices = [...predefinedServices, ...additionalServices].sort((a, b) => {
    // Running and selected at top
    const aScore = (a.isRunning ? 2 : 0) + (a.isSelected ? 1 : 0)
    const bScore = (b.isRunning ? 2 : 0) + (b.isSelected ? 1 : 0)
    return bScore - aScore
  })

  const runningCount = unifiedServices.filter(s => s.isRunning).length

  // Calculate what actions are available based on selected services
  const selectedServicesList = unifiedServices.filter(s => s.isSelected)
  const hasSelectedServices = selectedServicesList.length > 0
  const hasSelectedNotRunning = selectedServicesList.some(s => !s.isRunning)
  const hasSelectedRunning = selectedServicesList.some(s => s.isRunning)

  return (
    <div className="bg-surface-800 rounded-lg" data-testid="infrastructure-panel">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2"
        >
          <span className="font-medium">Shared Infrastructure</span>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex items-center gap-3">
          {isLoading && (
            <span className="text-xs px-2 py-1 rounded-full bg-primary-500/20 text-primary-400 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Starting...
            </span>
          )}
          {!isLoading && runningCount > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-success-500/20 text-success-400">
              {runningCount} running
            </span>
          )}
          <div className="flex gap-1">
            {/* Start: only show if there are selected services that are NOT running */}
            {hasSelectedNotRunning && (
              <button
                onClick={onStart}
                disabled={isLoading}
                className="p-1.5 rounded bg-success-500/20 text-success-400 hover:bg-success-500/30 transition-colors disabled:opacity-50"
                title="Start selected services that aren't running"
                data-testid="infra-start-button"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              </button>
            )}
            {/* Restart: only show if there are selected services that ARE running */}
            {hasSelectedRunning && (
              <button
                onClick={onRestart}
                disabled={isLoading}
                className="p-1.5 rounded bg-warning-500/20 text-warning-400 hover:bg-warning-500/30 transition-colors disabled:opacity-50"
                title="Restart selected running services"
                data-testid="infra-restart-button"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              </button>
            )}
            {/* Stop: only show if there are selected services that ARE running */}
            {hasSelectedRunning && (
              <button
                onClick={onStop}
                disabled={isLoading}
                className="p-1.5 rounded bg-error-500/20 text-error-400 hover:bg-error-500/30 transition-colors disabled:opacity-50"
                title="Stop selected running services"
                data-testid="infra-stop-button"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-4 pb-4">
          <p className="text-xs text-text-muted mb-3">
            Select services for group actions (start/stop/restart):
          </p>
          <div className="space-y-1">
            {unifiedServices.map((service) => (
              <UnifiedServiceCard
                key={service.id}
                service={service}
                onToggle={onToggleService ? () => onToggleService(service.id) : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface UnifiedServiceCardProps {
  service: {
    id: string
    displayName: string
    defaultPort: number | null
    isSelected: boolean
    isRunning: boolean
    ports?: string | null
    serviceName?: string
  }
  onToggle?: () => void
}

function UnifiedServiceCard({ service, onToggle }: UnifiedServiceCardProps) {
  const parsedPorts = parsePortMapping(service.ports)

  return (
    <button
      onClick={onToggle}
      disabled={!onToggle}
      className={`
        w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left
        ${service.isRunning
          ? 'bg-success-500/20 border border-success-500/40'
          : 'bg-surface-700/30 border border-transparent hover:bg-surface-700/50'
        }
        ${onToggle ? 'cursor-pointer' : 'cursor-default'}
      `}
      data-testid={`infra-service-${service.id}`}
    >
      {/* Checkbox for selection */}
      {onToggle && (
        <div className={`
          w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
          ${service.isSelected ? 'bg-primary-500 border-primary-500' : 'border-surface-500'}
        `}>
          {service.isSelected && <Check className="w-3 h-3 text-white" />}
        </div>
      )}

      {/* Status Indicator */}
      <div className={`
        w-2 h-2 rounded-full flex-shrink-0
        ${service.isRunning ? 'bg-success-400' : 'bg-surface-500'}
      `} />

      {/* Service Name */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${
          service.isRunning ? 'text-success-300' : 'text-text-primary'
        }`}>
          {service.displayName}
        </p>
      </div>

      {/* Port Info - Clean badges */}
      <div className="flex items-center gap-1.5">
        {parsedPorts.length > 0 ? (
          parsedPorts.map((port, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded text-xs font-mono bg-surface-700 text-text-secondary border border-surface-600"
            >
              :{port}
            </span>
          ))
        ) : service.defaultPort ? (
          <span className="px-2 py-0.5 rounded text-xs font-mono bg-surface-700 text-text-muted border border-surface-600">
            :{service.defaultPort}
          </span>
        ) : null}
      </div>
    </button>
  )
}
