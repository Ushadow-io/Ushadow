import { useState } from 'react'
import { Plus, Play, Square, Settings, Loader2, AppWindow, Box, FolderOpen, X, AlertCircle, GitBranch, GitMerge, Trash2, Terminal } from 'lucide-react'
import type { UshadowEnvironment, TmuxStatus } from '../hooks/useTauri'
import { tauri } from '../hooks/useTauri'
import { getColors } from '../utils/colors'
import { getTmuxStatusIcon, getTmuxStatusText } from '../hooks/useTmuxMonitoring'

interface CreatingEnv {
  name: string
  status: 'cloning' | 'starting' | 'error'
  path?: string
  error?: string
}

interface EnvironmentsPanelProps {
  environments: UshadowEnvironment[]
  creatingEnvs?: CreatingEnv[]
  onStart: (envName: string) => void
  onStop: (envName: string) => void
  onCreate: () => void
  onOpenInApp: (env: UshadowEnvironment) => void
  onMerge?: (envName: string) => void
  onDelete?: (envName: string) => void
  onDismissError?: (name: string) => void
  onAttachTmux?: (env: UshadowEnvironment) => void
  loadingEnv: string | null
  tmuxStatuses?: { [envName: string]: TmuxStatus }
}

export function EnvironmentsPanel({
  environments,
  creatingEnvs = [],
  onStart,
  onStop,
  onCreate,
  onOpenInApp,
  onMerge,
  onDelete,
  onDismissError,
  onAttachTmux,
  loadingEnv,
  tmuxStatuses = {},
}: EnvironmentsPanelProps) {
  const [activeTab, setActiveTab] = useState<'running' | 'detected'>('running')
  const [showTmuxInfo, setShowTmuxInfo] = useState(false)
  const [tmuxInfo, setTmuxInfo] = useState<string>('')

  const handleShowTmux = async () => {
    try {
      const info = await tauri.getTmuxInfo()
      setTmuxInfo(info)
      setShowTmuxInfo(true)
    } catch (err) {
      setTmuxInfo(`Error fetching tmux info: ${err}`)
      setShowTmuxInfo(true)
    }
  }

  const handleStartTmux = async () => {
    try {
      const result = await tauri.ensureTmuxRunning()
      setTmuxInfo(`${result}\n\nTmux server is now ready for worktrees.`)
      // Refresh the info
      const info = await tauri.getTmuxInfo()
      setTmuxInfo(info)
    } catch (err) {
      setTmuxInfo(`Error starting tmux: ${err}`)
    }
  }

  // Sort environments: worktrees first, then reverse to show newest first
  const sortedEnvironments = [...environments].sort((a, b) => {
    // Worktrees come first
    if (a.is_worktree && !b.is_worktree) return -1
    if (!a.is_worktree && b.is_worktree) return 1
    return 0
  }).reverse()

  const runningEnvs = sortedEnvironments.filter(env => env.running)
  const stoppedEnvs = sortedEnvironments.filter(env => !env.running)

  return (
    <div className="bg-surface-800 rounded-lg p-4" data-testid="environments-panel">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Ushadow Environments</h3>
        <div className="flex gap-2">
          <button
            onClick={handleShowTmux}
            className="text-sm px-3 py-1.5 rounded-lg bg-surface-700 text-text-secondary hover:bg-surface-600 hover:text-text-primary transition-colors flex items-center gap-1.5 font-medium"
            data-testid="show-tmux-button"
            title="Show tmux sessions and windows"
          >
            <Terminal className="w-4 h-4" />
            Tmux
          </button>
          <button
            onClick={onCreate}
            className="text-sm px-3 py-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors flex items-center gap-1.5 font-medium shadow-sm"
            data-testid="create-env-button"
          >
            <Plus className="w-4 h-4" />
            New Environment
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 bg-surface-700/50 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('running')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            activeTab === 'running'
              ? 'bg-surface-600 text-text-primary'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Running ({runningEnvs.length})
        </button>
        <button
          onClick={() => setActiveTab('detected')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            activeTab === 'detected'
              ? 'bg-surface-600 text-text-primary'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Detected ({stoppedEnvs.length})
        </button>
      </div>

      {/* Creating Environments - always show at top */}
      {creatingEnvs.length > 0 && (
        <div className="space-y-2 mb-3">
          {creatingEnvs.map((env) => (
            <CreatingEnvironmentCard
              key={env.name}
              name={env.name}
              status={env.status}
              path={env.path}
              error={env.error}
              onDismiss={onDismissError ? () => onDismissError(env.name) : undefined}
            />
          ))}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'running' ? (
        runningEnvs.length === 0 && creatingEnvs.length === 0 ? (
          <RunningEmptyState onCreate={onCreate} hasDetected={stoppedEnvs.length > 0} />
        ) : (
          <div className="space-y-2">
            {runningEnvs.map((env) => (
              <EnvironmentCard
                key={env.name}
                environment={env}
                onStart={() => onStart(env.name)}
                onStop={() => onStop(env.name)}
                onOpenInApp={() => onOpenInApp(env)}
                onMerge={onMerge ? () => onMerge(env.name) : undefined}
                onDelete={onDelete ? () => onDelete(env.name) : undefined}
                onAttachTmux={onAttachTmux ? () => onAttachTmux(env) : undefined}
                isLoading={loadingEnv === env.name}
                tmuxStatus={tmuxStatuses[env.name]}
              />
            ))}
          </div>
        )
      ) : (
        stoppedEnvs.length === 0 ? (
          <EmptyState onCreate={onCreate} />
        ) : (
          <div className="space-y-2">
            {stoppedEnvs.map((env) => (
              <EnvironmentCard
                key={env.name}
                environment={env}
                onStart={() => onStart(env.name)}
                onStop={() => onStop(env.name)}
                onOpenInApp={() => onOpenInApp(env)}
                onMerge={onMerge ? () => onMerge(env.name) : undefined}
                onDelete={onDelete ? () => onDelete(env.name) : undefined}
                onAttachTmux={onAttachTmux ? () => onAttachTmux(env) : undefined}
                isLoading={loadingEnv === env.name}
                tmuxStatus={tmuxStatuses[env.name]}
              />
            ))}
          </div>
        )
      )}

      {/* Tmux Info Dialog */}
      {showTmuxInfo && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowTmuxInfo(false)}
        >
          <div
            className="bg-surface-800 rounded-xl p-6 w-full max-w-2xl mx-4 shadow-xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Terminal className="w-5 h-5" />
                Tmux Sessions
              </h2>
              <button
                onClick={() => setShowTmuxInfo(false)}
                className="p-1 rounded hover:bg-surface-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <pre className="text-xs font-mono bg-surface-900 p-4 rounded whitespace-pre-wrap break-words">
                {tmuxInfo}
              </pre>
            </div>
            <div className="mt-4 flex justify-between items-center">
              {tmuxInfo.includes('No tmux server running') && (
                <button
                  onClick={handleStartTmux}
                  className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 transition-colors flex items-center gap-2"
                >
                  <Terminal className="w-4 h-4" />
                  Start Tmux Server
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setShowTmuxInfo(false)}
                className="px-4 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RunningEmptyState({ onCreate, hasDetected }: { onCreate: () => void; hasDetected: boolean }) {
  return (
    <div className="text-center py-8" data-testid="running-empty-state">
      <div className="w-16 h-16 rounded-full bg-surface-700 flex items-center justify-center mx-auto mb-4">
        <Box className="w-8 h-8 text-text-muted" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-2">No Running Environments</h3>
      <p className="text-sm text-text-muted mb-6 max-w-xs mx-auto">
        {hasDetected
          ? 'Start a detected environment from the "Detected" tab or create a new one.'
          : 'Create a new environment to get started.'}
      </p>
      <button
        onClick={onCreate}
        className="px-6 py-3 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors font-semibold shadow-lg shadow-primary-500/20"
        data-testid="create-env-empty-button"
      >
        <Plus className="w-5 h-5 inline mr-2" />
        New Environment
      </button>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-8" data-testid="env-empty-state">
      <div className="w-12 h-12 rounded-full bg-surface-700 flex items-center justify-center mx-auto mb-3">
        <Settings className="w-6 h-6 text-text-muted" />
      </div>
      <p className="text-sm text-text-secondary mb-4">No environments detected</p>
      <button
        onClick={onCreate}
        className="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors font-medium"
      >
        Create Your First Environment
      </button>
    </div>
  )
}

interface CreatingEnvironmentCardProps {
  name: string
  status: 'cloning' | 'starting' | 'error'
  path?: string
  error?: string
  onDismiss?: () => void
}

function CreatingEnvironmentCard({ name, status, path, error, onDismiss }: CreatingEnvironmentCardProps) {
  const colors = getColors(name)
  const isError = status === 'error'

  return (
    <div
      className="p-3 rounded-lg transition-all"
      style={{
        backgroundColor: isError ? 'rgba(239, 68, 68, 0.1)' : `${colors.dark}15`,
        borderLeft: `3px solid ${isError ? '#ef4444' : colors.primary}`,
      }}
      data-testid={`creating-env-${name}`}
    >
      <div className="flex items-center gap-3">
        {isError ? (
          <AlertCircle className="w-4 h-4 text-error-400 flex-shrink-0" />
        ) : (
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: colors.primary }} />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold" style={{ color: isError ? '#ef4444' : colors.primary }}>
            {name}
          </span>
          <p className="text-xs text-text-muted mt-0.5">
            {status === 'cloning' && 'Cloning repository...'}
            {status === 'starting' && 'Starting containers...'}
            {status === 'error' && (error || 'Failed to create environment')}
          </p>
          {path && (
            <div className="flex items-center gap-1 mt-1 text-xs text-text-muted">
              <FolderOpen className="w-3 h-3" />
              <span className="truncate">{path}</span>
            </div>
          )}
        </div>
        {isError && onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-surface-700 transition-colors text-text-muted"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

interface EnvironmentCardProps {
  environment: UshadowEnvironment
  onStart: () => void
  onStop: () => void
  onOpenInApp: () => void
  onMerge?: () => void
  onDelete?: () => void
  onAttachTmux?: () => void
  isLoading: boolean
  tmuxStatus?: TmuxStatus
}

function EnvironmentCard({ environment, onStart, onStop, onOpenInApp, onMerge, onDelete, onAttachTmux, isLoading, tmuxStatus }: EnvironmentCardProps) {
  const [showTmuxWindows, setShowTmuxWindows] = useState(false)
  const [tmuxWindows, setTmuxWindows] = useState<Array<{ name: string; index: string; active: boolean }>>([])
  const colors = getColors(environment.color || environment.name)

  const localhostUrl = environment.localhost_url || (environment.backend_port ? `http://localhost:${environment.webui_port || environment.backend_port}` : null)

  const handleOpenUrl = (url: string) => {
    tauri.openBrowser(url)
  }

  const handleOpenVscode = () => {
    if (environment.path) {
      // Pass environment name to setup VSCode colors
      tauri.openInVscode(environment.path, environment.name)
    }
  }

  const loadTmuxWindows = async () => {
    try {
      const sessions = await tauri.getTmuxSessions()
      const workmuxSession = sessions.find(s => s.name === 'workmux')
      if (workmuxSession) {
        // Filter windows for this environment
        const envWindowPrefix = `ushadow-${environment.name.toLowerCase()}`
        const envWindows = workmuxSession.windows.filter(w =>
          w.name.toLowerCase().startsWith(envWindowPrefix)
        )
        setTmuxWindows(envWindows)
      } else {
        setTmuxWindows([])
      }
    } catch (err) {
      console.error('Failed to load tmux windows:', err)
      setTmuxWindows([])
    }
  }

  const handleToggleTmuxWindows = async () => {
    if (!showTmuxWindows) {
      await loadTmuxWindows()
    }
    setShowTmuxWindows(!showTmuxWindows)
  }

  const handleKillWindow = async (windowName: string) => {
    try {
      await tauri.killTmuxWindow(windowName)
      await loadTmuxWindows()
    } catch (err) {
      console.error('Failed to kill window:', err)
    }
  }

  return (
    <div
      className="p-3 rounded-lg transition-all"
      style={{
        backgroundColor: environment.running ? `${colors.dark}15` : 'transparent',
        borderLeft: `3px solid ${environment.running ? colors.primary : '#4a4a4a'}`,
      }}
      data-testid={`env-${environment.name}`}
    >
      {/* Main content */}
      <div className="flex items-start gap-3">
        <div
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${environment.running ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: environment.running ? colors.primary : '#4a4a4a' }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold" style={{ color: environment.running ? colors.primary : '#888' }}>
              {environment.name}
            </span>
            {environment.is_worktree && (
              <span
                className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30"
                title="Git worktree environment"
              >
                <GitMerge className="w-3 h-3" />
                <span>Worktree</span>
              </span>
            )}
            {environment.branch && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-surface-600/30 text-text-muted">
                <GitBranch className="w-3 h-3" />
                {environment.branch}
              </span>
            )}
            {/* Tmux status badge */}
            {tmuxStatus && tmuxStatus.exists && (
              <span
                className="text-xs px-1.5 py-0.5 rounded bg-surface-600/30 text-text-muted"
                title={getTmuxStatusText(tmuxStatus)}
              >
                {getTmuxStatusIcon(tmuxStatus)} {tmuxStatus.current_command || 'tmux'}
              </span>
            )}
          </div>
          {/* Container tags */}
          {environment.containers.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {environment.containers.map((container) => (
                <span
                  key={container}
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    environment.running ? 'bg-surface-600/50 text-text-muted' : 'bg-surface-700/30 text-text-muted/60'
                  }`}
                >
                  {container.replace('ushadow-', '').replace(`${environment.name}-`, '')}
                </span>
              ))}
            </div>
          )}
          {/* Path */}
          {environment.path && (
            <div className="flex items-center gap-1 mt-1 text-xs text-text-muted">
              <FolderOpen className="w-3 h-3 flex-shrink-0" />
              <span className="truncate" title={environment.path}>{environment.path}</span>
            </div>
          )}
          {/* URLs when running */}
          {environment.running && localhostUrl && (
            <div className="mt-2 space-y-0.5">
              <button
                onClick={() => handleOpenUrl(localhostUrl)}
                className="text-xs text-text-muted hover:text-primary-400 hover:underline truncate block w-full text-left"
                data-testid={`url-local-${environment.name}`}
              >
                {localhostUrl}
              </button>
              {environment.tailscale_url && (
                <button
                  onClick={() => handleOpenUrl(environment.tailscale_url!)}
                  className="text-xs text-cyan-500/70 hover:text-cyan-400 hover:underline truncate block w-full text-left"
                  data-testid={`url-tailscale-${environment.name}`}
                >
                  {environment.tailscale_url}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Top right buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Tmux windows toggle - for worktrees */}
          {environment.is_worktree && tmuxStatus && tmuxStatus.exists && (
            <button
              onClick={handleToggleTmuxWindows}
              className={`p-2 rounded transition-colors ${
                showTmuxWindows
                  ? 'bg-purple-500/30 text-purple-400'
                  : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              }`}
              title="Show/hide tmux windows"
              data-testid={`tmux-windows-${environment.name}`}
            >
              <Terminal className="w-4 h-4" />
            </button>
          )}

          {/* Tmux attach button - for worktrees without existing tmux */}
          {environment.is_worktree && environment.path && onAttachTmux && (!tmuxStatus || !tmuxStatus.exists) && (
            <button
              onClick={onAttachTmux}
              className="p-2 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
              title="Open VS Code with tmux terminal"
              data-testid={`tmux-${environment.name}`}
            >
              <Terminal className="w-4 h-4" />
            </button>
          )}

          {/* VS Code button - small */}
          {environment.path && (
            <button
              onClick={handleOpenVscode}
              className="p-2 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
              title="Open in VS Code"
              data-testid={`vscode-${environment.name}`}
            >
              <img src="/vscode48.png" alt="VS Code" className="w-4 h-4" />
            </button>
          )}

          {/* Open in App - only when running */}
          {environment.running && (
            <button
              onClick={onOpenInApp}
              className="px-3 py-1.5 rounded-lg bg-success-500/20 text-success-400 hover:bg-success-500/30 transition-colors flex items-center gap-1.5 font-medium"
              data-testid={`open-in-app-${environment.name}`}
            >
              <AppWindow className="w-4 h-4" />
              <span className="text-sm">Open</span>
            </button>
          )}
        </div>
      </div>

      {/* Tmux windows list */}
      {showTmuxWindows && (
        <div className="mt-3 pt-3 border-t border-surface-600/50">
          <div className="text-xs font-medium text-text-muted mb-2">Tmux Windows:</div>
          {tmuxWindows.length === 0 ? (
            <div className="text-xs text-text-muted italic">No tmux windows found for this environment</div>
          ) : (
            <div className="space-y-1">
              {tmuxWindows.map((window) => (
                <div
                  key={window.name}
                  className="flex items-center justify-between bg-surface-700/30 rounded p-2 text-xs"
                  data-testid={`tmux-window-${window.name}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-text-400 font-mono">{window.index}</span>
                    <span className={window.active ? 'text-purple-400 font-medium' : 'text-text-300'}>
                      {window.name}
                    </span>
                    {window.active && <span className="text-purple-400">(active)</span>}
                  </div>
                  <button
                    onClick={() => handleKillWindow(window.name)}
                    className="px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-xs font-medium"
                    title="Kill this window"
                    data-testid={`kill-window-${window.name}`}
                  >
                    Kill
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Start/Stop and Merge buttons - bottom */}
      <div className="mt-2 flex justify-between items-center">
        {/* Merge and Delete buttons - left side, only for worktrees */}
        <div className="flex gap-2">
          {environment.is_worktree && onMerge && (
            <button
              onClick={onMerge}
              disabled={isLoading || environment.running}
              className="px-3 py-1.5 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-sm font-medium"
              title="Merge worktree to main with rebase and cleanup"
              data-testid={`merge-${environment.name}`}
            >
              <GitMerge className="w-4 h-4" />
              <span>Merge & Cleanup</span>
            </button>
          )}
          {environment.is_worktree && onDelete && (
            <button
              onClick={onDelete}
              disabled={isLoading}
              className="px-3 py-1.5 rounded bg-error-500/20 text-error-400 hover:bg-error-500/30 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-sm font-medium"
              title="Delete environment (stop containers, remove worktree, close tmux)"
              data-testid={`delete-${environment.name}`}
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          )}
        </div>

        {/* Start/Stop button - right side */}
        <div>
          {environment.running ? (
            <button
              onClick={onStop}
              disabled={isLoading}
              className="px-3 py-1.5 rounded bg-error-500/20 text-error-400 hover:bg-error-500/30 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-sm font-medium"
              title="Stop environment"
              data-testid={`stop-${environment.name}`}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={onStart}
              disabled={isLoading}
              className="px-3 py-1.5 rounded bg-success-500/20 text-success-400 hover:bg-success-500/30 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-sm font-medium"
              title="Start environment"
              data-testid={`start-${environment.name}`}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>Start</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
