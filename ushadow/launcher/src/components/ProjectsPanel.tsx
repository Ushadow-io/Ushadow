import { useState } from 'react'
import { Plus, FolderOpen, Trash2, Check } from 'lucide-react'
import type { ProjectConfig } from '../store/appStore'

interface ProjectsPanelProps {
  projects: ProjectConfig[]
  activeProjectId: string | null
  onAddProject: () => void
  onSelectProject: (projectId: string) => void
  onRemoveProject: (projectId: string) => void
}

export function ProjectsPanel({
  projects,
  activeProjectId,
  onAddProject,
  onSelectProject,
  onRemoveProject,
}: ProjectsPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const handleRemoveClick = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    if (confirmDelete === projectId) {
      // Second click - confirm deletion
      onRemoveProject(projectId)
      setConfirmDelete(null)
    } else {
      // First click - show confirmation
      setConfirmDelete(projectId)
      // Reset after 3 seconds
      setTimeout(() => setConfirmDelete(null), 3000)
    }
  }

  return (
    <div className="bg-surface-800 rounded-lg" data-testid="projects-panel">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-surface-700">
        <h3 className="font-medium text-text-primary">Projects</h3>
        <button
          onClick={onAddProject}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 transition-colors text-sm"
          title="Add project"
          data-testid="add-project-button"
        >
          <Plus className="w-4 h-4" />
          <span>Add Project</span>
        </button>
      </div>

      {/* Projects List */}
      <div className="p-2 space-y-1" data-testid="projects-list">
        {projects.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No projects configured</p>
            <p className="text-xs mt-1">Click "Add Project" to get started</p>
          </div>
        ) : (
          projects.map((project) => {
            const isActive = project.id === activeProjectId
            const isConfirmingDelete = confirmDelete === project.id

            return (
              <div
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors
                  ${isActive
                    ? 'bg-primary-600/20 border border-primary-500/40'
                    : 'hover:bg-surface-700/50 border border-transparent'
                  }
                `}
                data-testid={`project-item-${project.id}`}
              >
                {/* Active Indicator */}
                <div className="flex-shrink-0">
                  {isActive ? (
                    <div className="w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-surface-600" />
                  )}
                </div>

                {/* Project Info */}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${isActive ? 'text-primary-300' : 'text-text-primary'}`}>
                    {project.displayName}
                  </p>
                  <p className="text-xs text-text-muted truncate" title={project.rootPath}>
                    {project.rootPath}
                  </p>
                </div>

                {/* Remove Button */}
                {!isActive && (
                  <button
                    onClick={(e) => handleRemoveClick(project.id, e)}
                    className={`
                      p-1.5 rounded transition-colors flex-shrink-0
                      ${isConfirmingDelete
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        : 'text-text-muted hover:text-red-400 hover:bg-red-500/10'
                      }
                    `}
                    title={isConfirmingDelete ? 'Click again to confirm' : 'Remove project'}
                    data-testid={`remove-project-${project.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
