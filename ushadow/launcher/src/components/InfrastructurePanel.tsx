import { useState } from 'react'
import { Play, Square, RotateCcw, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import type { InfraService } from '../hooks/useTauri'

interface InfrastructurePanelProps {
  services: InfraService[]
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  isLoading: boolean
}

export function InfrastructurePanel({ services, onStart, onStop, onRestart, isLoading }: InfrastructurePanelProps) {
  const hasRunningServices = services.some(s => s.running)
  const allRunning = services.length > 0 && services.every(s => s.running)

  // Always start expanded
  const [expanded, setExpanded] = useState(true)

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
        {allRunning && services.length > 0 && (
          <span className="text-xs px-2 py-1 rounded-full bg-success-500/20 text-success-400">
            {services.length} core service{services.length !== 1 ? 's' : ''} started
          </span>
        )}
        <div className="flex gap-1">
          {!allRunning && (
            <button
              onClick={onStart}
              disabled={isLoading}
              className="p-1.5 rounded bg-success-500/20 text-success-400 hover:bg-success-500/30 transition-colors disabled:opacity-50"
              title="Start infrastructure"
              data-testid="infra-start-button"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          )}
          {hasRunningServices && (
            <>
              <button
                onClick={onRestart}
                disabled={isLoading}
                className="p-1.5 rounded bg-warning-500/20 text-warning-400 hover:bg-warning-500/30 transition-colors disabled:opacity-50"
                title="Restart infrastructure"
                data-testid="infra-restart-button"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={onStop}
                disabled={isLoading}
                className="p-1.5 rounded bg-error-500/20 text-error-400 hover:bg-error-500/30 transition-colors disabled:opacity-50"
                title="Stop infrastructure"
                data-testid="infra-stop-button"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content - only show when expanded */}
      {expanded && (
        <div className="px-4 pb-4">
          {services.length === 0 ? (
            <p className="text-xs text-text-muted">No services detected</p>
          ) : (
            <div className="space-y-2">
              {services.map((svc) => (
                <ServiceCard key={svc.name} service={svc} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ServiceCard({ service }: { service: InfraService }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
        service.running ? 'bg-success-500/10' : 'bg-surface-700/50'
      }`}
      data-testid={`service-${service.name}`}
    >
      <div className={`w-2 h-2 rounded-full ${service.running ? 'bg-success-400' : 'bg-surface-500'}`} />
      <span className={`text-sm ${service.running ? 'text-text-primary' : 'text-text-muted'}`}>
        {service.display_name || service.name}
      </span>
    </div>
  )
}
