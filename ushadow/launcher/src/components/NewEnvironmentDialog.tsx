import { useState, useEffect } from 'react'
import { X, Download, FolderOpen, GitBranch } from 'lucide-react'

type CreateMode = 'clone' | 'link' | 'worktree'

interface NewEnvironmentDialogProps {
  isOpen: boolean
  projectRoot: string
  onClose: () => void
  onClone: (name: string) => void
  onLink: (name: string, path: string) => void
  onWorktree: (name: string, branch: string) => void
}

export function NewEnvironmentDialog({
  isOpen,
  projectRoot,
  onClose,
  onClone,
  onLink,
  onWorktree,
}: NewEnvironmentDialogProps) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<CreateMode>('clone')
  const [linkPath, setLinkPath] = useState('')
  const [branch, setBranch] = useState('')

  // Set default link path when mode changes to 'link'
  useEffect(() => {
    if (mode === 'link' && !linkPath && projectRoot) {
      // Default to parent directory + /ushadow (sibling to current repo)
      const parentDir = projectRoot.split('/').slice(0, -1).join('/')
      setLinkPath(parentDir ? `${parentDir}/ushadow` : '')
    }
  }, [mode, projectRoot, linkPath])

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setName('')
      setLinkPath('')
      setBranch('')
      setMode('clone')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = () => {
    if (!name.trim()) return

    switch (mode) {
      case 'clone':
        onClone(name.trim())
        break
      case 'link':
        onLink(name.trim(), linkPath.trim())
        break
      case 'worktree':
        onWorktree(name.trim(), branch.trim() || name.trim())
        break
    }

    // Reset form
    setName('')
    setLinkPath('')
    setBranch('')
  }

  const isValid = name.trim() && (mode !== 'link' || linkPath.trim())

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-testid="new-env-dialog"
    >
      <div className="bg-surface-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Environment</h2>
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
            className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
            placeholder="e.g., dev, staging, feature-x"
            autoFocus
            data-testid="env-name-input"
          />
        </div>

        {/* Mode Selection */}
        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">
            Setup Method
          </label>
          <div className="grid grid-cols-3 gap-2">
            <ModeButton
              icon={Download}
              label="Clone"
              active={mode === 'clone'}
              onClick={() => setMode('clone')}
            />
            <ModeButton
              icon={FolderOpen}
              label="Link"
              active={mode === 'link'}
              onClick={() => setMode('link')}
            />
            <ModeButton
              icon={GitBranch}
              label="Worktree"
              active={mode === 'worktree'}
              onClick={() => setMode('worktree')}
            />
          </div>
        </div>

        {/* Mode-specific inputs */}
        {mode === 'link' && (
          <div className="mb-4">
            <label className="block text-sm text-text-secondary mb-2">
              Existing Folder Path
            </label>
            <input
              type="text"
              value={linkPath}
              onChange={(e) => setLinkPath(e.target.value)}
              className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
              placeholder="/path/to/existing/ushadow"
              data-testid="link-path-input"
            />
          </div>
        )}

        {mode === 'worktree' && (
          <div className="mb-4">
            <label className="block text-sm text-text-secondary mb-2">
              Branch Name <span className="text-text-muted">(optional, defaults to env name)</span>
            </label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
              placeholder={name || 'feature/my-branch'}
              data-testid="branch-input"
            />
          </div>
        )}

        {/* Helper text */}
        <p className="text-xs text-text-muted mb-4">
          {mode === 'clone' && 'Creates a fresh clone of the repository'}
          {mode === 'link' && 'Links to an existing Ushadow folder'}
          {mode === 'worktree' && 'Creates a git worktree for parallel development'}
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
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Download
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg text-center transition-all ${
        active
          ? 'bg-primary-500/20 border-2 border-primary-500'
          : 'bg-surface-700 border-2 border-transparent hover:bg-surface-600'
      }`}
    >
      <Icon className={`w-5 h-5 mx-auto mb-1 ${active ? 'text-primary-400' : 'text-text-muted'}`} />
      <p className="text-xs font-medium">{label}</p>
    </button>
  )
}
