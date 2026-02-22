import { useState, useEffect } from 'react'
import { X, Settings, Save, FolderGit2, Terminal, Trello, Bot } from 'lucide-react'
import { tauri, type LauncherSettings } from '../hooks/useTauri'
import { useAppStore } from '../store/appStore'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { multiProjectMode, setMultiProjectMode, kanbanEnabled, setKanbanEnabled, claudeEnabled, setClaudeEnabled } = useAppStore()
  const [settings, setSettings] = useState<LauncherSettings>({
    default_admin_email: null,
    default_admin_password: null,
    default_admin_name: null,
    coding_agent: {
      agent_type: 'claude',
      command: 'claude',
      args: ['--dangerously-skip-permissions'],
      auto_start: true,
    },
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Load settings when dialog opens
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true)
      setSaveSuccess(false)
      tauri.loadLauncherSettings()
        .then(loaded => {
          setSettings(loaded)
        })
        .catch(err => {
          console.error('Failed to load settings:', err)
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSave = async () => {
    setIsSaving(true)
    setSaveSuccess(false)

    try {
      await tauri.saveLauncherSettings(settings)
      setSaveSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1000)
    } catch (error) {
      console.error('Failed to save settings:', error)
      alert(`Failed to save settings: ${error}`)
    } finally {
      setIsSaving(false)
    }
  }

  const isValid = settings.coding_agent.command.trim().length > 0

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-testid="settings-dialog"
    >
      <div className="bg-surface-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary-400" />
            Launcher Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-700 transition-colors"
            data-testid="close-settings-dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-text-muted">
            Loading settings...
          </div>
        ) : (
          <>
            {/* Coding Agent Section */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4 text-primary-400" />
                <h3 className="text-sm font-medium">Coding Agent</h3>
              </div>
              <p className="text-xs text-text-muted mb-4">
                Configure which coding agent CLI to use when working on tickets
              </p>

              {/* Agent Type */}
              <div className="mb-3">
                <label className="block text-xs text-text-secondary mb-1">
                  Agent Type
                </label>
                <input
                  type="text"
                  value={settings.coding_agent.agent_type}
                  onChange={(e) => setSettings({
                    ...settings,
                    coding_agent: { ...settings.coding_agent, agent_type: e.target.value }
                  })}
                  className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
                  placeholder="claude"
                  data-testid="settings-agent-type"
                />
              </div>

              {/* Command */}
              <div className="mb-3">
                <label className="block text-xs text-text-secondary mb-1">
                  Command
                </label>
                <input
                  type="text"
                  value={settings.coding_agent.command}
                  onChange={(e) => setSettings({
                    ...settings,
                    coding_agent: { ...settings.coding_agent, command: e.target.value }
                  })}
                  className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
                  placeholder="claude"
                  data-testid="settings-agent-command"
                />
              </div>

              {/* Arguments */}
              <div className="mb-3">
                <label className="block text-xs text-text-secondary mb-1">
                  Arguments (comma-separated)
                </label>
                <input
                  type="text"
                  value={settings.coding_agent.args.join(', ')}
                  onChange={(e) => setSettings({
                    ...settings,
                    coding_agent: {
                      ...settings.coding_agent,
                      args: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    }
                  })}
                  className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
                  placeholder="--dangerously-skip-permissions"
                  data-testid="settings-agent-args"
                />
              </div>

              {/* Auto-start Toggle */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-text-secondary">
                  Auto-start agent when ticket is assigned
                </label>
                <button
                  onClick={() => setSettings({
                    ...settings,
                    coding_agent: { ...settings.coding_agent, auto_start: !settings.coding_agent.auto_start }
                  })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    settings.coding_agent.auto_start ? 'bg-primary-500' : 'bg-surface-600'
                  }`}
                  data-testid="toggle-auto-start"
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.coding_agent.auto_start ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="my-6 border-t border-surface-700" />

            {/* Multi-Project Mode Toggle */}
            <div className="mb-6">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-primary-400" />
                  <label className="text-sm font-medium">Multi-Project Mode</label>
                  <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded">
                    Experimental
                  </span>
                </div>
                <button
                  onClick={() => setMultiProjectMode(!multiProjectMode)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    multiProjectMode ? 'bg-primary-500' : 'bg-surface-600'
                  }`}
                  data-testid="toggle-multi-project-mode"
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      multiProjectMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-text-muted">
                Manage multiple codebases beyond ushadow. Each project can have its own configuration and worktrees.
              </p>
            </div>

            {/* Kanban Board Toggle */}
            <div className="mb-6">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Trello className="w-4 h-4 text-primary-400" />
                  <label className="text-sm font-medium">Kanban Board</label>
                  <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded">
                    Experimental
                  </span>
                </div>
                <button
                  onClick={() => setKanbanEnabled(!kanbanEnabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    kanbanEnabled ? 'bg-primary-500' : 'bg-surface-600'
                  }`}
                  data-testid="toggle-kanban-enabled"
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      kanbanEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-text-muted">
                Enable ticket tracking with a Kanban board. Create tickets, link them to worktrees, and manage development workflows.
              </p>
            </div>

            {/* Claude Sessions */}
            <div className="p-4 bg-surface-800/50 rounded-lg border border-white/5">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary-400" />
                  <label className="text-sm font-medium">Claude Sessions</label>
                  <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded">
                    Experimental
                  </span>
                </div>
                <button
                  onClick={() => setClaudeEnabled(!claudeEnabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    claudeEnabled ? 'bg-primary-500' : 'bg-surface-600'
                  }`}
                  data-testid="toggle-claude-enabled"
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      claudeEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-text-muted">
                Monitor Claude Code sessions across all worktrees. View live transcripts, approve tool requests, and track progress.
              </p>
            </div>

            {/* Success Message */}
            {saveSuccess && (
              <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm">
                Settings saved successfully!
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!isValid || isSaving}
                className="flex-1 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
                data-testid="save-settings"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Settings
                  </>
                )}
              </button>
            </div>

            {/* Helper text */}
            <p className="text-xs text-text-muted mt-4">
              💡 The coding agent will be automatically started in the tmux window when you assign a ticket to an environment.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
