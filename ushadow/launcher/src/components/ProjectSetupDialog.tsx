import { useState } from 'react'
import { Folder, Download, Link, X } from 'lucide-react'

interface ProjectSetupDialogProps {
  isOpen: boolean
  defaultPath: string
  onClose: () => void
  onClone: (path: string) => void
  onLink: (path: string) => void
}

export function ProjectSetupDialog({
  isOpen,
  defaultPath,
  onClose,
  onClone,
  onLink,
}: ProjectSetupDialogProps) {
  const [path, setPath] = useState(defaultPath)
  const [mode, setMode] = useState<'clone' | 'link'>('clone')

  if (!isOpen) return null

  const handleSubmit = () => {
    if (mode === 'clone') {
      onClone(path)
    } else {
      onLink(path)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="project-setup-dialog">
      <div className="bg-surface-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Setup Ushadow Project</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selection */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <ModeButton
            icon={Download}
            label="Clone New"
            description="Download fresh copy"
            active={mode === 'clone'}
            onClick={() => setMode('clone')}
          />
          <ModeButton
            icon={Link}
            label="Link Existing"
            description="Use existing folder"
            active={mode === 'link'}
            onClick={() => setMode('link')}
          />
        </div>

        {/* Path Input */}
        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">
            {mode === 'clone' ? 'Clone to folder:' : 'Existing Ushadow folder:'}
          </label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-surface-700 rounded-lg px-3 py-2">
              <Folder className="w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm"
                placeholder={mode === 'clone' ? '~/ushadow' : '~/existing/ushadow'}
                data-testid="project-path-input"
              />
            </div>
          </div>
          {mode === 'clone' && (
            <p className="text-xs text-text-muted mt-2">
              Will clone to: {path}/ushadow
            </p>
          )}
        </div>

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
            className="flex-1 py-2 rounded-lg bg-gradient-brand hover:opacity-90 transition-opacity font-medium"
            data-testid="project-setup-submit"
          >
            {mode === 'clone' ? 'Clone & Setup' : 'Link Project'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeButton({
  icon: Icon,
  label,
  description,
  active,
  onClick,
}: {
  icon: typeof Download
  label: string
  description: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg text-left transition-all ${
        active
          ? 'bg-primary-500/20 border-2 border-primary-500'
          : 'bg-surface-700 border-2 border-transparent hover:bg-surface-600'
      }`}
    >
      <Icon className={`w-5 h-5 mb-2 ${active ? 'text-primary-400' : 'text-text-muted'}`} />
      <p className="font-medium text-sm">{label}</p>
      <p className="text-xs text-text-muted">{description}</p>
    </button>
  )
}
