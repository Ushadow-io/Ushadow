import { useState, useEffect } from 'react'
import { X, GitBranch } from 'lucide-react'
import { tauri } from '../hooks/useTauri'
import { BranchSelector } from './BranchSelector'

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
  onLink,
  onWorktree,
}: NewEnvironmentDialogProps) {
  const [name, setName] = useState('')
  const [branch, setBranch] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [existingWorktree, setExistingWorktree] = useState<{ path: string; name: string } | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [manualNameEdit, setManualNameEdit] = useState(false)

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setName('')
      setBranch('')
      setShowConflictDialog(false)
      setExistingWorktree(null)
      setManualNameEdit(false)
    }
  }, [isOpen])

  // Load branches when dialog opens
  useEffect(() => {
    if (isOpen && projectRoot) {
      setIsLoadingBranches(true)
      tauri.listGitBranches(projectRoot)
        .then(setBranches)
        .catch(err => {
          console.error('Failed to load branches:', err)
          setBranches([])
        })
        .finally(() => setIsLoadingBranches(false))
    }
  }, [isOpen, projectRoot])

  /**
   * Clean branch name for environment name
   * Examples:
   *   "claude/github-docker-import-SlXNo" -> "github-docker-import-slxno"
   *   "feature/auth" -> "auth"
   *   "main" -> "main"
   */
  const cleanBranchNameForEnv = (branchName: string): string => {
    // Remove "claude/" prefix if present
    let cleaned = branchName.replace(/^claude\//, '')

    // For other prefixes like "feature/", "fix/", etc., take the part after the last "/"
    const parts = cleaned.split('/')
    cleaned = parts[parts.length - 1]

    // Convert to lowercase and remove the random suffix pattern (e.g., "-SlXNo")
    cleaned = cleaned.toLowerCase().replace(/-[a-z0-9]{5}$/i, '')

    return cleaned
  }

  // Auto-fill environment name from branch if not manually edited
  const handleBranchChange = (newBranch: string) => {
    setBranch(newBranch)

    // Auto-fill name from branch if user hasn't manually edited it
    if (!manualNameEdit && newBranch) {
      setName(cleanBranchNameForEnv(newBranch))
    }
  }

  // Track manual edits to the name field
  const handleNameChange = (newName: string) => {
    setName(newName)
    setManualNameEdit(true)
  }

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!name.trim()) return
    if (isChecking) return

    const envName = name.trim()
    const branchName = branch.trim() || envName

    // Check if worktree exists for this branch
    setIsChecking(true)
    try {
      const existing = await tauri.checkWorktreeExists(projectRoot, branchName)

      if (existing) {
        // Worktree exists - show conflict dialog
        setExistingWorktree({ path: existing.path, name: existing.name })
        setShowConflictDialog(true)
      } else {
        // No conflict - create new worktree
        onWorktree(envName, branchName)
        // Reset form
        setName('')
        setBranch('')
      }
    } catch (error) {
      console.error('Error checking worktree:', error)
      // If check fails, proceed with creation anyway
      onWorktree(envName, branchName)
      setName('')
      setBranch('')
    } finally {
      setIsChecking(false)
    }
  }

  const handleLinkToExisting = () => {
    if (!existingWorktree) return
    onLink(name.trim(), existingWorktree.path)
    setShowConflictDialog(false)
    setExistingWorktree(null)
    setName('')
    setBranch('')
  }

  const handleRemakeWorktree = () => {
    onWorktree(name.trim(), branch.trim() || name.trim())
    setShowConflictDialog(false)
    setExistingWorktree(null)
    setName('')
    setBranch('')
  }

  const isValid = name.trim()

  // Show conflict dialog if there's an existing worktree
  if (showConflictDialog && existingWorktree) {
    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        data-testid="worktree-conflict-dialog"
      >
        <div className="bg-surface-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Worktree Already Exists</h2>
            <button
              onClick={() => setShowConflictDialog(false)}
              className="p-1 rounded hover:bg-surface-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-text-secondary mb-4">
            A worktree for branch <span className="font-mono text-primary-400">{branch.trim() || name.trim()}</span> already exists at:
          </p>

          <div className="mb-6 p-3 bg-surface-700/50 rounded text-xs font-mono text-text-muted break-all">
            {existingWorktree.path}
          </div>

          <p className="text-sm text-text-secondary mb-6">
            Would you like to link to the existing worktree or remake it?
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => setShowConflictDialog(false)}
              className="flex-1 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleLinkToExisting}
              className="flex-1 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 transition-colors font-medium"
              data-testid="link-to-existing"
            >
              Link Existing
            </button>
            <button
              onClick={handleRemakeWorktree}
              className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 transition-colors font-medium"
              data-testid="remake-worktree"
            >
              Remake
            </button>
          </div>
        </div>
      </div>
    )
  }

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

        {/* Branch Name - Now first to enable auto-naming */}
        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">
            Branch <span className="text-text-muted">(select existing or type new)</span>
          </label>
          <BranchSelector
            branches={branches}
            value={branch}
            onChange={handleBranchChange}
            placeholder={isLoadingBranches ? 'Loading branches...' : 'Type or select branch...'}
            testId="branch-selector"
          />
          <p className="text-xs text-text-muted mt-1">
            Select a Claude-created branch or any existing branch, or type a new name. If it doesn't exist, it will be created from main.
          </p>
        </div>

        {/* Environment Name - Auto-filled from branch */}
        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">
            Environment Name <span className="text-text-muted">(auto-filled, editable)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && isValid && !isChecking && handleSubmit()}
            className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
            placeholder="e.g., dev, staging, feature-x"
            data-testid="env-name-input"
          />
          <p className="text-xs text-text-muted mt-1">
            Auto-filled from branch name. Edit if you prefer a different name.
          </p>
        </div>

        {/* Helper text */}
        <p className="text-xs text-text-muted mb-4">
          Creates a git worktree for parallel development. If a worktree already exists for this branch, you'll be asked to link or remake it.
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
            disabled={!isValid || isChecking}
            className="flex-1 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
            data-testid="create-env-submit"
          >
            {isChecking ? 'Checking...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
