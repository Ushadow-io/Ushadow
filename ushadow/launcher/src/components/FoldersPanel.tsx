import { useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, Pencil } from 'lucide-react'

interface FoldersPanelProps {
  projectRoot: string
  worktreesDir: string
  onEditFolders: () => void
}

export function FoldersPanel({ projectRoot, worktreesDir, onEditFolders }: FoldersPanelProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-surface-800 rounded-lg" data-testid="folders-panel">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4"
        data-testid="folders-toggle"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium">Folders</span>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEditFolders()
          }}
          className="p-1.5 rounded hover:bg-surface-700 transition-colors text-text-muted hover:text-text-primary"
          title="Edit folder locations"
          data-testid="edit-folders-button"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3" data-testid="folders-list">
          {/* Project Folder */}
          <div>
            <p className="text-xs text-text-muted mb-1.5">Project folder</p>
            <div className="flex items-center gap-2 px-3 py-2 bg-surface-700/50 rounded text-sm">
              <FolderOpen className="w-4 h-4 text-text-muted flex-shrink-0" />
              <span className="text-text-secondary truncate flex-1" title={projectRoot}>
                {projectRoot || 'Not set'}
              </span>
            </div>
          </div>

          {/* Worktrees Folder */}
          <div>
            <p className="text-xs text-text-muted mb-1.5">Worktrees folder</p>
            <div className="flex items-center gap-2 px-3 py-2 bg-surface-700/50 rounded text-sm">
              <FolderOpen className="w-4 h-4 text-text-muted flex-shrink-0" />
              <span className="text-text-secondary truncate flex-1" title={worktreesDir}>
                {worktreesDir || 'Not set'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
