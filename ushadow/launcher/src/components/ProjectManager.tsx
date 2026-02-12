import { useState } from 'react'
import { nanoid } from 'nanoid'
import { ProjectsPanel } from './ProjectsPanel'
import { ProjectSetupDialog } from './ProjectSetupDialog'
import { StartupConfigPanel } from './StartupConfigPanel'
import { useAppStore, type ProjectConfig } from '../store/appStore'
import { tauri } from '../hooks/useTauri'

export function ProjectManager() {
  const { projects, activeProjectId, addProject, removeProject, setActiveProject } = useAppStore()
  const [showSetupDialog, setShowSetupDialog] = useState(false)

  const handleAddProject = () => {
    setShowSetupDialog(true)
  }

  const handleSetupComplete = async (rootPath: string, worktreesPath: string) => {
    try {
      // Load the config to get project name and display name
      const configPath = `${rootPath}/.launcher-config.yaml`

      let projectName = 'unknown'
      let displayName = 'Unknown Project'

      try {
        // Try to load config from the project root
        const config = await tauri.loadProjectConfig(rootPath)
        projectName = config.project.name
        displayName = config.project.display_name
      } catch (err) {
        // Config doesn't exist or is invalid - fall back to folder name
        console.warn('Failed to load config, using folder name:', err)
        const folderName = rootPath.split('/').pop() || 'unknown'
        projectName = folderName
        displayName = folderName.charAt(0).toUpperCase() + folderName.slice(1)
      }

      const newProject: ProjectConfig = {
        id: nanoid(),
        name: projectName,
        displayName,
        rootPath,
        worktreesPath,
        configPath,
        addedAt: Date.now(),
      }

      addProject(newProject)
      setActiveProject(newProject.id)
      setShowSetupDialog(false)
    } catch (err) {
      console.error('Failed to add project:', err)
    }
  }

  const handleSelectProject = (projectId: string) => {
    setActiveProject(projectId)
  }

  const handleRemoveProject = (projectId: string) => {
    // Don't allow removing the active project
    if (projectId === activeProjectId) {
      return
    }
    removeProject(projectId)
  }

  // Get the active project for dialog defaults
  const activeProject = projects.find(p => p.id === activeProjectId)
  const defaultPath = activeProject?.rootPath || ''

  return (
    <div className="space-y-4">
      <ProjectsPanel
        projects={projects}
        activeProjectId={activeProjectId}
        onAddProject={handleAddProject}
        onSelectProject={handleSelectProject}
        onRemoveProject={handleRemoveProject}
      />

      {/* Show startup configuration for active project */}
      {activeProject && (
        <StartupConfigPanel
          projectRoot={activeProject.rootPath}
          onSave={(config) => {
            console.log('Startup config saved:', config)
            // TODO: Save to backend
          }}
        />
      )}

      <ProjectSetupDialog
        isOpen={showSetupDialog}
        projectName="project" // Generic name for multi-project mode
        defaultPath={defaultPath}
        onClose={() => setShowSetupDialog(false)}
        onSetup={handleSetupComplete}
      />
    </div>
  )
}
