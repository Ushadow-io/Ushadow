import { useState, useEffect } from 'react'
import { Folder, X, CheckCircle } from 'lucide-react'
import { dialog, invoke } from '@tauri-apps/api'
import { join } from '@tauri-apps/api/path'

interface ProjectSetupDialogProps {
  isOpen: boolean
  defaultPath: string
  onClose: () => void
  onSetup: (path: string) => void
}

interface ProjectStatus {
  exists: boolean
  is_valid_repo: boolean
}

export function ProjectSetupDialog({
  isOpen,
  defaultPath,
  onClose,
  onSetup,
}: ProjectSetupDialogProps) {
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [fullInstallPath, setFullInstallPath] = useState<string | null>(null)
  const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(null)

  // Calculate the full install path using cross-platform path joining
  useEffect(() => {
    if (parentPath) {
      join(parentPath, 'ushadow').then(async (path) => {
        setFullInstallPath(path)

        // Check if this path already has a ushadow repo
        try {
          const status = await invoke<ProjectStatus>('check_project_dir', { path })
          setProjectStatus(status)
        } catch (err) {
          console.error('Failed to check project directory:', err)
          setProjectStatus(null)
        }
      })
    } else {
      setFullInstallPath(null)
      setProjectStatus(null)
    }
  }, [parentPath])

  if (!isOpen) return null

  const handleSelectFolder = async () => {
    const selected = await dialog.open({
      directory: true,
      multiple: false,
      defaultPath: parentPath || defaultPath || undefined,
      title: 'Choose where to install Ushadow',
    })

    if (selected && typeof selected === 'string') {
      setParentPath(selected)
    }
  }

  const handleSubmit = async () => {
    if (!fullInstallPath && !parentPath) {
      return
    }

    // If fullInstallPath isn't ready yet, compute it now
    const pathToUse = fullInstallPath || (parentPath ? await join(parentPath, 'ushadow') : null)

    if (!pathToUse) {
      return
    }

    // Send the full path with ushadow appended
    onSetup(pathToUse)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="project-setup-dialog">
      <div className="bg-surface-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Choose Installation Location</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-text-secondary mb-4">
          Select a parent folder. Ushadow will be installed in a subfolder called <code className="text-primary-400 bg-surface-900/50 px-1 py-0.5 rounded">ushadow</code>.
        </p>

        {/* Folder Picker */}
        <div className="mb-6 space-y-3">
          <button
            onClick={handleSelectFolder}
            className="w-full flex items-center gap-3 bg-surface-700 hover:bg-surface-600 rounded-lg px-4 py-3 transition-colors"
            data-testid="select-folder-button"
          >
            <Folder className="w-5 h-5 text-primary-400" />
            <div className="flex-1 text-left">
              {parentPath ? (
                <>
                  <p className="text-xs text-text-muted mb-1">Parent folder:</p>
                  <p className="text-sm font-medium truncate">{parentPath}</p>
                </>
              ) : (
                <p className="text-sm text-text-secondary">Click to choose parent folder...</p>
              )}
            </div>
          </button>

          {/* Show full install path after selection */}
          {fullInstallPath && (
            <div className={`rounded-lg px-4 py-3 ${
              projectStatus?.exists && projectStatus?.is_valid_repo
                ? 'bg-green-500/10 border border-green-500/30'
                : 'bg-primary-500/10 border border-primary-500/30'
            }`}>
              {projectStatus?.exists && projectStatus?.is_valid_repo ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <p className="text-xs text-green-400">Existing Ushadow repository found:</p>
                  </div>
                  <p className="text-sm font-mono text-green-300 break-all">{fullInstallPath}</p>
                  <p className="text-xs text-green-400/70 mt-2">Will link to this existing installation</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-primary-400 mb-1">Ushadow will be installed at:</p>
                  <p className="text-sm font-mono text-primary-300 break-all">{fullInstallPath}</p>
                  {projectStatus?.exists && !projectStatus?.is_valid_repo && (
                    <p className="text-xs text-yellow-400 mt-2">Folder exists but is not a valid Ushadow repository</p>
                  )}
                </>
              )}
            </div>
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
            disabled={!parentPath}
            className={`flex-1 py-2 rounded-lg font-medium transition-opacity ${
              !parentPath
                ? 'bg-surface-600 text-text-muted cursor-not-allowed opacity-50'
                : 'bg-gradient-brand hover:opacity-90'
            }`}
            data-testid="project-setup-submit"
          >
            {projectStatus?.exists && projectStatus?.is_valid_repo ? 'Link to Existing' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}