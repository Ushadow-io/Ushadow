import { useState, useEffect } from 'react'
import { X, GitBranch } from 'lucide-react'
import type { UshadowEnvironment } from '../hooks/useTauri'

interface NewEnvironmentDialogProps {
  isOpen: boolean
  projectRoot: string
  onClose: () => void
  onLink: (name: string, path: string) => void
  onWorktree: (name: string, branch: string, baseBranch?: string) => void
}

type BaseType = 'main' | 'dev' | 'worktree'

export function NewEnvironmentDialog({
  isOpen,
  projectRoot,
  onClose,
  onWorktree,
}: NewEnvironmentDialogProps) {
  const [name, setName] = useState('')
  const [branch, setBranch] = useState('')
  const [baseType, setBaseType] = useState<BaseType>('main')
  const [selectedWorktree, setSelectedWorktree] = useState<string>('')
  const [environments, setEnvironments] = useState<UshadowEnvironment[]>([])
  const [loadingEnvs, setLoadingEnvs] = useState(false)

  // Load environments when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadEnvironments()
    } else {
      // Reset form when dialog closes
      setName('')
      setBranch('')
      setBaseType('main')
      setSelectedWorktree('')
    }
  }, [isOpen])

  const loadEnvironments = async () => {
    setLoadingEnvs(true)
    try {
      const { tauri } = await import('../hooks/useTauri')
      const discovery = await tauri.discoverEnvironments()
      // Only show worktree environments that have a branch
      const worktreeEnvs = discovery.environments.filter((env) => env.is_worktree && env.branch)
      setEnvironments(worktreeEnvs)
      if (worktreeEnvs.length > 0 && !selectedWorktree) {
        setSelectedWorktree(worktreeEnvs[0].branch!)
      }
    } catch (err) {
      console.error('Failed to load environments:', err)
    } finally {
      setLoadingEnvs(false)
    }
  }

  if (!isOpen) return null

  const handleSubmit = () => {
    if (!name.trim()) return
    if (baseType === 'worktree' && !selectedWorktree) return

    const envName = name.trim()
    const branchSuffix = branch.trim() || 'base'

    // Branch name format: envname/branchname-basebranch (if main/dev)
    // or: envname/branchname (if branching from another worktree)
    let branchName: string
    let baseBranch: string | undefined

    if (baseType === 'worktree') {
      branchName = `${envName}/${branchSuffix}`
      baseBranch = selectedWorktree // Full branch name like "rouge/feature-dev"
    } else {
      branchName = `${envName}/${branchSuffix}-${baseType}`
      baseBranch = baseType // 'main' or 'dev'
    }

    onWorktree(envName, branchName, baseBranch)
  }

  const isValid = name.trim() && (baseType !== 'worktree' || selectedWorktree)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-testid="new-env-dialog"
      onClick={onClose}
    >
      <div
        className="bg-surface-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
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
            placeholder="e.g., myfeature, auth, bugfix-123"
            data-testid="branch-name-input"
          />
          <p className="text-xs text-text-muted mt-1">
            {(() => {
              const envName = name.trim()
              const branchSuffix = branch.trim() || 'base'
              if (!envName) return 'Enter environment name first'

              if (baseType === 'worktree') {
                return `Will create: ${envName}/${branchSuffix} from ${selectedWorktree || '(select worktree)'}`
              } else {
                return `Will create: ${envName}/${branchSuffix}-${baseType} from origin/${baseType}`
              }
            })()}
          </p>
        </div>

        {/* Base Branch Selection */}
        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">
            Branch From
          </label>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-700 p-1">
            <button
              type="button"
              onClick={() => setBaseType('main')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                baseType === 'main'
                  ? 'bg-gradient-brand text-white'
                  : 'text-text-secondary hover:bg-surface-600'
              }`}
              data-testid="base-branch-main"
            >
              Main
            </button>
            <button
              type="button"
              onClick={() => setBaseType('dev')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                baseType === 'dev'
                  ? 'bg-gradient-brand text-white'
                  : 'text-text-secondary hover:bg-surface-600'
              }`}
              data-testid="base-branch-dev"
            >
              Dev
            </button>
            <button
              type="button"
              onClick={() => setBaseType('worktree')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                baseType === 'worktree'
                  ? 'bg-gradient-brand text-white'
                  : 'text-text-secondary hover:bg-surface-600'
              }`}
              data-testid="base-branch-worktree"
            >
              Worktree
            </button>
          </div>

          {/* Worktree selection dropdown */}
          {baseType === 'worktree' && (
            <div className="mt-3">
              <label className="block text-xs text-text-secondary mb-2">
                Select Worktree
              </label>
              {loadingEnvs ? (
                <div className="text-xs text-text-muted p-2 bg-surface-700/50 rounded">
                  Loading worktrees...
                </div>
              ) : environments.length === 0 ? (
                <div className="text-xs text-text-muted p-2 bg-surface-700/50 rounded">
                  No worktrees available
                </div>
              ) : (
                <select
                  value={selectedWorktree}
                  onChange={(e) => setSelectedWorktree(e.target.value)}
                  className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
                  data-testid="select-base-worktree"
                >
                  {environments.map((env) => (
                    <option key={env.name} value={env.branch!}>
                      {env.name} ({env.branch})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <p className="text-xs text-text-muted mt-2">
            {baseType === 'worktree'
              ? `Creates worktree branching from selected worktree`
              : `Creates worktree from origin/${baseType}`}
          </p>
        </div>

        {/* Helper text */}
        <p className="text-xs text-text-muted mb-4">
          {baseType === 'worktree'
            ? 'Creates a git worktree branching from the selected worktree'
            : `Creates a git worktree with branch name: envname/branchname-${baseType} from origin/${baseType}`}
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
