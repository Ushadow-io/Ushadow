import { useState, useEffect } from 'react'
import { X, GitBranch } from 'lucide-react'

interface NewEnvironmentDialogProps {
  isOpen: boolean
  projectRoot: string
  onClose: () => void
  onLink: (name: string, path: string) => void
  onWorktree: (name: string, branch: string) => void
}

export function NewEnvironmentDialog({
  isOpen,
  projectRoot,
  onClose,
  onWorktree,
}: NewEnvironmentDialogProps) {
  const [name, setName] = useState('')
  const [branch, setBranch] = useState('')
  const [baseBranch, setBaseBranch] = useState<'main' | 'dev'>('main')

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setName('')
      setBranch('')
      setBaseBranch('main')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = () => {
    if (!name.trim()) return
    // Use specified branch name, or fall back to base branch (main/dev)
    const branchName = branch.trim() || baseBranch
    onWorktree(name.trim(), branchName)
  }

  const isValid = name.trim()

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-testid="new-env-dialog"
    >
      <div className="bg-surface-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary-400" />
            New Environment
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-700 transition-colors"
            data-testid="close-new-env-dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Repository reference */}
        <div className="mb-4 p-2 bg-surface-700/50 rounded text-xs text-text-muted">
          <span className="text-text-secondary">Repository:</span> {projectRoot || 'Not set'}
        </div>

        {/* Environment Name */}
        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">
            Environment Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && isValid && handleSubmit()}
            className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
            placeholder="e.g., staging, feature-x, my-env"
            data-testid="env-name-input"
            autoFocus
          />
          <p className="text-xs text-text-muted mt-1">
            Choose a name for your new environment
          </p>
        </div>

        {/* Branch Name */}
        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">
            Branch Name <span className="text-text-muted">(optional)</span>
          </label>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && isValid && handleSubmit()}
            className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
            placeholder="e.g., feature/auth, bugfix/login"
            data-testid="branch-name-input"
          />
          <p className="text-xs text-text-muted mt-1">
            Leave empty to use base branch ({baseBranch})
          </p>
        </div>

        {/* Base Branch Selection */}
        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">
            Base Branch
          </label>
          <div className="flex rounded-lg bg-surface-700 p-1">
            <button
              type="button"
              onClick={() => setBaseBranch('main')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                baseBranch === 'main'
                  ? 'bg-gradient-brand text-white'
                  : 'text-text-secondary hover:bg-surface-600'
              }`}
              data-testid="base-branch-main"
            >
              Main
            </button>
            <button
              type="button"
              onClick={() => setBaseBranch('dev')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                baseBranch === 'dev'
                  ? 'bg-gradient-brand text-white'
                  : 'text-text-secondary hover:bg-surface-600'
              }`}
              data-testid="base-branch-dev"
            >
              Dev
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Base branch to create worktree from if no branch name specified
          </p>
        </div>

        {/* Helper text */}
        <p className="text-xs text-text-muted mb-4">
          Creates a git worktree for parallel development. Specify a branch name or use the base branch.
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className="flex-1 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
            data-testid="create-env-submit"
          >
            Create Worktree
          </button>
        </div>
      </div>
    </div>
  )
}
