/**
 * Dialog for resolving port conflicts when starting services.
 *
 * Shows which port is in use and by what process, and allows
 * the user to choose an alternative port.
 */

import { useState, useEffect } from 'react'
import { AlertTriangle, X, Server, ArrowRight } from 'lucide-react'
import type { PortConflict } from '../../hooks/useServiceStart'

interface PortConflictDialogProps {
  isOpen: boolean
  serviceName: string
  conflicts: PortConflict[]
  onResolve: (envVar: string, newPort: number) => void
  onDismiss: () => void
  isResolving?: boolean
}

export function PortConflictDialog({
  isOpen,
  serviceName,
  conflicts,
  onResolve,
  onDismiss,
  isResolving = false
}: PortConflictDialogProps) {
  // Track custom port values for each conflict
  const [customPorts, setCustomPorts] = useState<Record<string, string>>({})

  // Initialize custom ports when conflicts change
  useEffect(() => {
    const initial: Record<string, string> = {}
    conflicts.forEach(c => {
      if (c.envVar) {
        initial[c.envVar] = String(c.suggestedPort)
      }
    })
    setCustomPorts(initial)
  }, [conflicts])

  if (!isOpen || conflicts.length === 0) return null

  const handlePortChange = (envVar: string, value: string) => {
    setCustomPorts(prev => ({ ...prev, [envVar]: value }))
  }

  const handleResolve = (conflict: PortConflict) => {
    if (!conflict.envVar) return
    const port = parseInt(customPorts[conflict.envVar] || String(conflict.suggestedPort), 10)
    if (isNaN(port) || port < 1 || port > 65535) return
    onResolve(conflict.envVar, port)
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      data-testid="port-conflict-dialog"
    >
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl max-w-lg w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-100">
              Port Conflict
            </h2>
          </div>
          <button
            onClick={onDismiss}
            className="p-1.5 hover:bg-neutral-700 rounded-lg transition-colors"
            data-testid="port-conflict-close"
          >
            <X className="h-5 w-5 text-neutral-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-neutral-400">
            Cannot start <span className="text-neutral-200 font-medium">{serviceName}</span> because a required port is already in use.
          </p>

          {conflicts.map((conflict, index) => (
            <div
              key={conflict.envVar || index}
              className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg overflow-hidden"
              data-testid={`port-conflict-item-${index}`}
            >
              {/* Conflict info header */}
              <div className="px-4 py-3 border-b border-neutral-700/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-red-500/10 rounded">
                      <Server className="h-4 w-4 text-red-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-semibold text-neutral-100">
                          {conflict.port}
                        </span>
                        {conflict.envVar && (
                          <span className="text-xs text-neutral-500 font-mono">
                            {conflict.envVar}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-sm text-red-400">
                  In use by <span className="font-medium">{conflict.usedBy}</span>
                </p>
              </div>

              {/* Resolution controls */}
              {conflict.envVar && (
                <div className="px-4 py-3 bg-neutral-800/50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-neutral-400 whitespace-nowrap">
                      Change to:
                    </span>
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="number"
                        min="1"
                        max="65535"
                        value={customPorts[conflict.envVar] || conflict.suggestedPort}
                        onChange={(e) => handlePortChange(conflict.envVar!, e.target.value)}
                        className="w-24 px-3 py-2 text-sm font-mono bg-neutral-900 border border-neutral-600 rounded-lg text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        data-testid={`port-input-${conflict.envVar}`}
                      />
                      <ArrowRight className="h-4 w-4 text-neutral-500 flex-shrink-0" />
                      <button
                        onClick={() => handleResolve(conflict)}
                        disabled={isResolving}
                        className="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg transition-colors whitespace-nowrap"
                        data-testid={`port-resolve-${conflict.envVar}`}
                      >
                        {isResolving ? 'Applying...' : 'Apply & Start'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!conflict.envVar && (
                <div className="px-4 py-3 bg-neutral-800/50">
                  <p className="text-xs text-neutral-500">
                    This port is hardcoded and cannot be changed. Please stop the conflicting service first.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-4 border-t border-neutral-700">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-sm font-medium text-neutral-300 hover:text-neutral-100 hover:bg-neutral-700 rounded-lg transition-colors"
            data-testid="port-conflict-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
