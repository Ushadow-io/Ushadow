import { Play, Square, RotateCcw, Loader2 } from 'lucide-react'
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

  return (
    <div className="bg-surface-800 rounded-lg p-4" data-testid="infrastructure-panel">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Shared Infrastructure</h3>
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
