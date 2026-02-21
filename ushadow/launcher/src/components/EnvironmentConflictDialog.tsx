import { AlertCircle, GitBranch, Play, X } from 'lucide-react'
import type { EnvironmentConflict } from '../hooks/useTauri'

interface EnvironmentConflictDialogProps {
  conflict: EnvironmentConflict | null
  newBranch: string
  onStartExisting: () => void
  onSwitchBranch: () => void
  onDeleteAndRecreate: () => void
  onCancel: () => void
}

export function EnvironmentConflictDialog({
  conflict,
  newBranch,
  onStartExisting,
  onSwitchBranch,
  onDeleteAndRecreate,
  onCancel,
}: EnvironmentConflictDialogProps) {
  if (!conflict) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-testid="env-conflict-dialog"
    >
      <div className="bg-surface-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-400" />
            Environment Already Exists
          </h2>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-surface-700 transition-colors"
            data-testid="close-conflict-dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conflict Info */}
        <div className="mb-6 p-4 bg-surface-700/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="w-4 h-4 text-text-muted" />
            <span className="text-sm text-text-muted">Current branch:</span>
          </div>
          <div className="text-base font-medium text-text-primary mb-1">
            {conflict.current_branch}
          </div>
          <div className="text-xs text-text-muted">
            Path: {conflict.path}
          </div>
          {conflict.is_running && (
            <div className="mt-2 px-2 py-1 bg-success-500/20 text-success-400 text-xs rounded inline-block">
              Currently running
            </div>
          )}
        </div>

        {/* New Branch Info */}
        <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="text-xs text-blue-300 mb-1">You want to create:</div>
          <div className="text-sm font-medium text-blue-200">{newBranch}</div>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-4">
          <button
            onClick={onStartExisting}
            className="w-full p-3 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors text-left"
            data-testid="conflict-start-existing"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center mt-0.5">
                <Play className="w-3.5 h-3.5 text-primary-400" />
              </div>
              <div>
                <div className="font-medium text-sm mb-1">Start existing environment</div>
                <div className="text-xs text-text-muted">
                  Keep current branch ({conflict.current_branch}) and start containers
                </div>
              </div>
            </div>
          </button>

          <button
            onClick={onSwitchBranch}
            className="w-full p-3 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors text-left"
            data-testid="conflict-switch-branch"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
                <GitBranch className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div>
                <div className="font-medium text-sm mb-1">Switch to new branch</div>
                <div className="text-xs text-text-muted">
                  Checkout {newBranch} in existing environment
                </div>
                {conflict.is_running && (
                  <div className="text-xs text-yellow-400 mt-1">
                    ⚠ Will stop containers first
                  </div>
                )}
              </div>
            </div>
          </button>

          <button
            onClick={onDeleteAndRecreate}
            className="w-full p-3 rounded-lg bg-error-500/20 hover:bg-error-500/30 transition-colors text-left border border-error-500/30"
            data-testid="conflict-delete-recreate"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-error-500/30 flex items-center justify-center mt-0.5">
                <X className="w-3.5 h-3.5 text-error-400" />
              </div>
              <div>
                <div className="font-medium text-sm mb-1 text-error-300">Delete and recreate</div>
                <div className="text-xs text-text-muted">
                  Remove old environment and create new one with {newBranch}
                </div>
                <div className="text-xs text-error-400 mt-1">
                  ⚠ This will delete all uncommitted changes!
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Cancel */}
        <button
          onClick={onCancel}
          className="w-full py-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
