import { useState, useEffect } from 'react'
import { Folder, X, CheckCircle } from 'lucide-react'
import { dialog, invoke } from '@tauri-apps/api'
import { join } from '@tauri-apps/api/path'

interface ProjectSetupDialogProps {
  isOpen: boolean
  projectName?: string // e.g., "ushadow", "myproject" - defaults to "ushadow"
  defaultPath: string
  defaultWorktreesPath?: string
  onClose: () => void
  onSetup: (path: string, worktreesPath: string) => void
}

interface ProjectStatus {
  exists: boolean
  is_valid_repo: boolean
}

export function ProjectSetupDialog({
  isOpen,
  projectName = 'ushadow',
  defaultPath,
  defaultWorktreesPath,
  onClose,
  onSetup,
}: ProjectSetupDialogProps) {
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [fullInstallPath, setFullInstallPath] = useState<string | null>(null)
  const [worktreesPath, setWorktreesPath] = useState<string | null>(null)
  const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(null)

  const isMultiProjectMode = projectName === 'project'
  const title = isMultiProjectMode ? 'Add Project' : 'Configure Folders'
  const description = isMultiProjectMode
    ? 'Select the project folder. Worktrees will be created in ../worktrees/[projectname]/ relative to the project.'
    : 'Select a parent folder. The Ushadow project will be in ushadow/, and worktrees in worktrees/ushadow/.'

  // Reset when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setParentPath(null)
    }
  }, [isOpen])

  // Calculate the full install path and worktrees path using cross-platform path joining
  useEffect(() => {
    if (parentPath) {
      // For multi-project mode (projectName="project"), treat selected folder as the project root directly
      // For single-project mode (projectName="ushadow"), create subdirectories
      const isMultiProjectMode = projectName === 'project'

      if (isMultiProjectMode) {
        // Multi-project: selected folder IS the project root
        // Worktrees go in ../worktrees/projectname (sibling to project)
        const pathParts = parentPath.split(/[/\\]/)
        const folderName = pathParts.pop() || 'project'
        const grandParent = pathParts.join('/')

        join(grandParent, 'worktrees', folderName).then(async (worktreesPath) => {
          setFullInstallPath(parentPath)  // Use selected folder directly
          setWorktreesPath(worktreesPath)  // ../worktrees/projectname

          // For multi-project mode, just check if .git exists (don't require ushadow-specific files)
          try {
            const gitPath = await join(parentPath, '.git')
            // Use a simple file system check instead of check_project_dir
            const pathExists = await invoke('check_install_path', { path: gitPath })
            setProjectStatus({
              path: parentPath,
              exists: true,
              is_valid_repo: pathExists
            })
          } catch (err) {
            console.error('Failed to check git directory:', err)
            setProjectStatus({
              path: parentPath,
              exists: true,
              is_valid_repo: false
            })
          }
        })
      } else {
        // Single-project: create subdirectories under parent
        Promise.all([
          join(parentPath, projectName),
          join(parentPath, 'worktrees', projectName)
        ]).then(async ([installPath, defaultWorktreesPath]) => {
          setFullInstallPath(installPath)
          setWorktreesPath(defaultWorktreesPath)

          try {
            const status = await invoke<ProjectStatus>('check_project_dir', { path: installPath })
            setProjectStatus(status)
          } catch (err) {
            console.error('Failed to check project directory:', err)
            setProjectStatus(null)
          }
        })
      }
    } else {
      setFullInstallPath(null)
      setWorktreesPath(null)
      setProjectStatus(null)
    }
  }, [parentPath, projectName])

  if (!isOpen) return null

  const handleSelectFolder = async () => {
    const selected = await dialog.open({
      directory: true,
      multiple: false,
      defaultPath: parentPath || defaultPath || undefined,
      title: `Choose parent folder for ${projectName}`,
    })

    if (selected && typeof selected === 'string') {
      setParentPath(selected)
    }
  }

  const handleSubmit = async () => {
    if (!fullInstallPath && !parentPath) {
      return
    }

    // If paths aren't ready yet, compute them now
    const pathToUse = fullInstallPath || (parentPath ? await join(parentPath, projectName) : null)
    const worktreesToUse = worktreesPath || (parentPath ? await join(parentPath, 'worktrees', projectName) : null)

    if (!pathToUse || !worktreesToUse) {
      return
    }

    // Send both paths
    onSetup(pathToUse, worktreesToUse)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="project-setup-dialog">
      <div className="bg-surface-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-text-secondary mb-4">
          {description}
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
                  <p className="text-xs text-text-muted mb-1">
                    {isMultiProjectMode ? 'Project folder:' : 'Parent folder:'}
                  </p>
                  <p className="text-sm font-medium truncate">{parentPath}</p>
                </>
              ) : (
                <p className="text-sm text-text-secondary">
                  {isMultiProjectMode ? 'Click to choose project folder...' : 'Click to choose parent folder...'}
                </p>
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
                    <p className="text-xs text-green-400">
                      {isMultiProjectMode ? 'Existing git repository found:' : `Existing ${projectName} repository found:`}
                    </p>
                  </div>
                  <p className="text-sm font-mono text-green-300 break-all">{fullInstallPath}</p>
                  <p className="text-xs text-green-400/70 mt-2">Will link to this existing installation</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-primary-400 mb-1">
                    {isMultiProjectMode ? 'Project root:' : 'Project folder:'}
                  </p>
                  <p className="text-sm font-mono text-primary-300 break-all">{fullInstallPath}</p>
                  {projectStatus?.exists && !projectStatus?.is_valid_repo && (
                    <p className="text-xs text-yellow-400 mt-2">
                      {isMultiProjectMode
                        ? 'Folder exists but is not a valid git repository'
                        : `Folder exists but is not a valid ${projectName} repository`
                      }
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Show worktrees path */}
          {worktreesPath && (
            <div className="rounded-lg px-4 py-3 bg-surface-700/50 border border-surface-600">
              <p className="text-xs text-text-muted mb-1">Worktrees will be created in:</p>
              <p className="text-sm font-mono text-text-secondary break-all">{worktreesPath}</p>
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