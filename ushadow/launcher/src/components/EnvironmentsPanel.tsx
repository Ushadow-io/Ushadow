import { useState, useEffect } from 'react'
import { Plus, Play, Square, Settings, Loader2, AppWindow, Box, X, AlertCircle, GitMerge, Terminal, FolderOpen, ArrowLeft } from 'lucide-react'
import type { UshadowEnvironment, TmuxStatus } from '../hooks/useTauri'
import { tauri } from '../hooks/useTauri'
import { getColors } from '../utils/colors'
import { TmuxManagerDialog } from './TmuxManagerDialog'

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
  const [showTmuxManager, setShowTmuxManager] = useState(false)
  const [selectedEnv, setSelectedEnv] = useState<UshadowEnvironment | null>(null)
  const [showBrowserView, setShowBrowserView] = useState(false)
  const [leftColumnWidth, setLeftColumnWidth] = useState(320)
  const [isResizing, setIsResizing] = useState(false)

  // Sort environments: worktrees first, then reverse to show newest first
  const sortedEnvironments = [...environments].sort((a, b) => {
    // Worktrees come first
    if (a.is_worktree && !b.is_worktree) return -1
    if (!a.is_worktree && b.is_worktree) return 1
    return 0
  }).reverse()

  const runningEnvs = sortedEnvironments.filter(env => env.running)
  const stoppedEnvs = sortedEnvironments.filter(env => !env.running)

  // Auto-select first running environment if none selected
  if (!selectedEnv && runningEnvs.length > 0) {
    setSelectedEnv(runningEnvs[0])
  }

  // Resize handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true)
    e.preventDefault()
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (isResizing) {
      const newWidth = e.clientX - 16 // Account for padding
      if (newWidth >= 250 && newWidth <= 500) {
        setLeftColumnWidth(newWidth)
      }
    }
  }

  const handleMouseUp = () => {
    setIsResizing(false)
  }

  // Set up mouse event listeners
  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isResizing])

  // Auto-open browser view when selecting running environment
  useEffect(() => {
    if (selectedEnv) {
      setShowBrowserView(selectedEnv.running)
    }
  }, [selectedEnv?.name, selectedEnv?.running])

  // Handle environment selection
  const handleEnvSelect = (env: UshadowEnvironment) => {
    setSelectedEnv(env)
  }

  // Handle opening in browser view
  const handleOpenInBrowser = () => {
    setShowBrowserView(true)
  }

  return (
    <div className="h-full flex gap-0" data-testid="environments-panel">
      {/* Left Column - Environment Cards */}
      <div
        className="flex-shrink-0 flex flex-col gap-4 pr-4"
        style={{ width: `${leftColumnWidth}px` }}
      >
        <div className="bg-surface-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Environments</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTmuxManager(true)}
                className="text-sm px-2 py-1 rounded-lg bg-surface-700 text-text-secondary hover:bg-surface-600 hover:text-text-primary transition-colors"
                data-testid="show-tmux-button"
                title="Manage tmux sessions"
              >
                <Terminal className="w-4 h-4" />
              </button>
              <button
                onClick={onCreate}
                className="text-sm px-3 py-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors flex items-center gap-1.5 font-medium shadow-sm"
                data-testid="create-env-button"
              >
                <Plus className="w-4 h-4" />
                New
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
              data-testid="tab-running"
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
              data-testid="tab-detected"
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

          {/* Environment Cards */}
          <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
            {activeTab === 'running' ? (
              runningEnvs.length === 0 && creatingEnvs.length === 0 ? (
                <RunningEmptyState onCreate={onCreate} hasDetected={stoppedEnvs.length > 0} />
              ) : (
                runningEnvs.map((env) => (
                  <EnvironmentCard
                    key={env.name}
                    environment={env}
                    onStart={() => onStart(env.name)}
                    onStop={() => onStop(env.name)}
                    onOpenInApp={() => onOpenInApp(env)}
                    isLoading={loadingEnv === env.name}
                    isSelected={selectedEnv?.name === env.name}
                    onSelect={() => handleEnvSelect(env)}
                  />
                ))
              )
            ) : (
              stoppedEnvs.length === 0 ? (
                <EmptyState onCreate={onCreate} />
              ) : (
                stoppedEnvs.map((env) => (
                  <EnvironmentCard
                    key={env.name}
                    environment={env}
                    onStart={() => onStart(env.name)}
                    onStop={() => onStop(env.name)}
                    onOpenInApp={() => onOpenInApp(env)}
                    isLoading={loadingEnv === env.name}
                    isSelected={selectedEnv?.name === env.name}
                    onSelect={() => handleEnvSelect(env)}
                  />
                ))
              )
            )}
          </div>
        </div>
      </div>

      {/* Resize handle */}
      <div
        className={`w-1 bg-surface-700 hover:bg-primary-500 cursor-col-resize transition-colors ${
          isResizing ? 'bg-primary-500' : ''
        }`}
        onMouseDown={handleMouseDown}
        style={{ userSelect: 'none' }}
      />

      {/* Right Column - Detail Panel or Browser View */}
      <div className="flex-1 bg-surface-800 rounded-lg overflow-hidden ml-4">
        {selectedEnv ? (
          showBrowserView && selectedEnv.running ? (
            <BrowserView
              environment={selectedEnv}
              onClose={() => setShowBrowserView(false)}
              onStop={() => onStop(selectedEnv.name)}
              isLoading={loadingEnv === selectedEnv.name}
              tmuxStatus={tmuxStatuses[selectedEnv.name]}
            />
          ) : (
            <div className="p-6 h-full overflow-auto">
              <EnvironmentDetailPanel
                environment={selectedEnv}
                onStart={() => onStart(selectedEnv.name)}
                onStop={() => onStop(selectedEnv.name)}
                onOpenInApp={handleOpenInBrowser}
                onMerge={onMerge ? () => onMerge(selectedEnv.name) : undefined}
                onDelete={onDelete ? () => onDelete(selectedEnv.name) : undefined}
                onAttachTmux={onAttachTmux ? () => onAttachTmux(selectedEnv) : undefined}
                isLoading={loadingEnv === selectedEnv.name}
                tmuxStatus={tmuxStatuses[selectedEnv.name]}
              />
            </div>
          )
        ) : (
          <div className="h-full flex items-center justify-center text-text-muted p-6">
            <div className="text-center">
              <Box className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Select an environment to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Tmux Manager Dialog */}
      <TmuxManagerDialog
        isOpen={showTmuxManager}
        onClose={() => setShowTmuxManager(false)}
      />
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

interface BrowserViewProps {
  environment: UshadowEnvironment
  onClose: () => void
  onStop: () => void
  isLoading: boolean
  tmuxStatus?: TmuxStatus
}

function BrowserView({ environment, onClose, onStop, isLoading, tmuxStatus }: BrowserViewProps) {
  const colors = getColors(environment.color || environment.name)
  const url = environment.localhost_url || (environment.backend_port ? `http://localhost:${environment.webui_port || environment.backend_port}` : '')

  const handleOpenVscode = () => {
    if (environment.path) {
      tauri.openInVscode(environment.path, environment.name)
    }
  }

  const handleOpenTerminal = async () => {
    if (environment.path) {
      const windowName = `ushadow-${environment.name}`
      await tauri.openTmuxInTerminal(windowName, environment.path)
    }
  }

  const handleOpenInNewTab = () => {
    if (url) {
      window.open(url, '_blank')
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Enhanced Header */}
      <div className="border-b border-surface-700" data-testid="browser-view-header">
        {/* Top Row - Environment Info */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface-750">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
              title="Back to details"
              data-testid="browser-view-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ backgroundColor: colors.primary, boxShadow: `0 0 10px ${colors.primary}` }}
              />
              <span className="font-semibold text-lg" style={{ color: colors.primary }}>
                {environment.name}
              </span>
              {environment.is_worktree && (
                <span className="px-2 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  Worktree
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenInNewTab}
              className="px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors text-sm flex items-center gap-2"
              title="Open in browser tab"
              data-testid="browser-view-new-tab"
            >
              <AppWindow className="w-4 h-4" />
              <span className="hidden sm:inline">New Tab</span>
            </button>
            {environment.path && (
              <>
                <button
                  onClick={handleOpenVscode}
                  className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors text-sm flex items-center gap-2"
                  title="Open in VS Code"
                  data-testid="browser-view-vscode"
                >
                  <img src="/vscode48.png" alt="VS Code" className="w-4 h-4" />
                  <span className="hidden sm:inline">VS Code</span>
                </button>
                {environment.is_worktree && (
                  <button
                    onClick={handleOpenTerminal}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors text-sm flex items-center gap-2"
                    title="Open Terminal"
                    data-testid="browser-view-terminal"
                  >
                    <Terminal className="w-4 h-4" />
                    <span className="hidden sm:inline">Terminal</span>
                  </button>
                )}
              </>
            )}
            <button
              onClick={onStop}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg bg-surface-600/50 text-text-secondary hover:bg-surface-600 transition-colors disabled:opacity-50 text-sm flex items-center gap-2"
              title="Stop environment"
              data-testid="browser-view-stop"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              <span className="hidden sm:inline">Stop</span>
            </button>
          </div>
        </div>

        {/* Bottom Row - URL and Details */}
        <div className="flex items-center justify-between px-4 py-2 bg-surface-800">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-text-muted font-mono">{url}</span>
            {environment.branch && (
              <span className="text-text-muted">
                Branch: <span className="text-text-secondary font-medium">{environment.branch}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            {environment.backend_port && (
              <span>Backend: <span className="font-mono text-text-secondary">{environment.backend_port}</span></span>
            )}
            {environment.webui_port && (
              <span>WebUI: <span className="font-mono text-text-secondary">{environment.webui_port}</span></span>
            )}
          </div>
        </div>
      </div>

      {/* iframe */}
      <div className="flex-1 relative">
        <iframe
          src={url}
          className="absolute inset-0 w-full h-full border-0"
          title={`${environment.name} web interface`}
          data-testid="browser-view-iframe"
        />
      </div>
    </div>
  )
}

interface EnvironmentDetailPanelProps {
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

function EnvironmentDetailPanel({
  environment,
  onStart,
  onStop,
  onOpenInApp,
  onMerge,
  onDelete,
  isLoading,
  tmuxStatus
}: EnvironmentDetailPanelProps) {
  const colors = getColors(environment.color || environment.name)
  const localhostUrl = environment.localhost_url || (environment.backend_port ? `http://localhost:${environment.webui_port || environment.backend_port}` : null)

  const handleOpenVscode = () => {
    if (environment.path) {
      tauri.openInVscode(environment.path, environment.name)
    }
  }

  const handleOpenTerminal = async () => {
    if (environment.path) {
      const windowName = `ushadow-${environment.name}`
      await tauri.openTmuxInTerminal(windowName, environment.path)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div
            className={`w-3 h-3 rounded-full ${environment.running ? 'animate-pulse' : ''}`}
            style={{
              backgroundColor: environment.running ? colors.primary : '#4a4a4a',
              boxShadow: environment.running ? `0 0 12px ${colors.primary}` : undefined,
            }}
          />
          <h2 className="text-2xl font-bold" style={{ color: environment.running ? colors.primary : '#888' }}>
            {environment.name}
          </h2>
          {environment.is_worktree && (
            <span className="px-2 py-1 text-xs rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
              Worktree
            </span>
          )}
        </div>
        {environment.branch && (
          <p className="text-sm text-text-muted">Branch: {environment.branch}</p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        {environment.running ? (
          <>
            <button
              onClick={onOpenInApp}
              className="px-4 py-2 rounded-lg bg-success-500/20 text-success-400 hover:bg-success-500/30 transition-colors flex items-center gap-2 font-medium"
            >
              <AppWindow className="w-5 h-5" />
              View in Panel
            </button>
            <button
              onClick={onStop}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg bg-surface-600/50 text-text-secondary hover:bg-surface-600 transition-colors disabled:opacity-50 flex items-center gap-2 font-medium"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Square className="w-5 h-5" />}
              Stop
            </button>
          </>
        ) : (
          <button
            onClick={onStart}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-success-500/20 text-success-400 hover:bg-success-500/30 transition-colors disabled:opacity-50 flex items-center gap-2 font-medium"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            Start Environment
          </button>
        )}
      </div>

      {/* Details Grid */}
      <div className="flex-1 space-y-4 overflow-y-auto">
        {/* URLs */}
        {environment.running && (
          <div className="bg-surface-700/30 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 text-text-secondary">URLs</h3>
            <div className="space-y-2">
              {localhostUrl && (
                <div className="w-full text-left px-3 py-2 rounded bg-surface-600/50 text-sm text-primary-400 font-mono">
                  {localhostUrl}
                </div>
              )}
              {environment.tailscale_url && (
                <div className="w-full text-left px-3 py-2 rounded bg-surface-600/50 text-sm text-cyan-400 font-mono">
                  {environment.tailscale_url}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Containers */}
        {environment.containers.length > 0 && (
          <div className="bg-surface-700/30 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 text-text-secondary">Containers</h3>
            <div className="flex flex-wrap gap-2">
              {environment.containers.map((container) => (
                <span
                  key={container}
                  className="px-3 py-1.5 rounded bg-surface-600/50 text-text-muted text-sm"
                >
                  {container.replace('ushadow-', '').replace(`${environment.name}-`, '')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Path */}
        {environment.path && (
          <div className="bg-surface-700/30 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 text-text-secondary">Location</h3>
            <p className="text-sm text-text-muted font-mono">{environment.path}</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleOpenVscode}
                className="px-3 py-2 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors flex items-center gap-2 text-sm"
              >
                <img src="/vscode48.png" alt="VS Code" className="w-4 h-4" />
                Open in VS Code
              </button>
              {environment.is_worktree && (
                <button
                  onClick={handleOpenTerminal}
                  className="px-3 py-2 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors flex items-center gap-2 text-sm"
                >
                  <img src="/iterm-icon.png" alt="Terminal" className="w-4 h-4" />
                  Open Terminal
                </button>
              )}
            </div>
          </div>
        )}

        {/* Ports */}
        {(environment.backend_port || environment.webui_port) && (
          <div className="bg-surface-700/30 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 text-text-secondary">Ports</h3>
            <div className="space-y-1 text-sm">
              {environment.backend_port && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Backend:</span>
                  <span className="text-text-primary font-mono">{environment.backend_port}</span>
                </div>
              )}
              {environment.webui_port && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Web UI:</span>
                  <span className="text-text-primary font-mono">{environment.webui_port}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Advanced Actions */}
        <div className="bg-surface-700/30 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 text-text-secondary">Advanced</h3>
          <div className="flex gap-2">
            {environment.is_worktree && onMerge && (
              <button
                onClick={onMerge}
                disabled={isLoading || environment.running}
                className="px-3 py-2 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                <GitMerge className="w-4 h-4" />
                Merge & Cleanup
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                disabled={isLoading}
                className="px-3 py-2 rounded bg-error-500/20 text-error-400 hover:bg-error-500/30 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                <X className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
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
  isLoading: boolean
  isSelected: boolean
  onSelect: () => void
}

function EnvironmentCard({ environment, onStart, onStop, isLoading, isSelected, onSelect }: EnvironmentCardProps) {
  const colors = getColors(environment.color || environment.name)

  return (
    <div
      onClick={onSelect}
      className={`group p-3 rounded-lg transition-all duration-300 ease-out cursor-pointer relative border ${
        isSelected
          ? 'ml-4 scale-105 border-surface-500'
          : 'hover:scale-105 ml-0 border-surface-700'
      }`}
      style={{
        backgroundColor: environment.running ? `${colors.dark}15` : 'rgba(45, 45, 55, 0.3)',
        borderLeftWidth: '3px',
        borderLeftColor: environment.running ? colors.primary : '#4a4a4a',
        boxShadow: isSelected
          ? `0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.08)`
          : environment.running
            ? `0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)`
            : '0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.02)',
      }}
      data-testid={`env-${environment.name}`}
    >
      {/* Diffuse glow overlay - contained within card bounds */}
      {environment.running && (
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-300 rounded-lg ${
            isSelected ? 'opacity-25' : 'opacity-15 group-hover:opacity-20'
          }`}
          style={{
            background: `radial-gradient(ellipse 120% 100% at 30% 50%, ${colors.primary}80, transparent 60%)`,
          }}
        />
      )}

      {/* Selection highlight overlay */}
      {isSelected && (
        <div
          className="absolute inset-0 pointer-events-none opacity-10 rounded-lg"
          style={{
            background: `linear-gradient(120deg, ${colors.primary}60, transparent 70%)`,
          }}
        />
      )}

      {/* Hover glow effect */}
      <div
        className={`absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg ${
          isSelected ? 'hidden' : ''
        }`}
        style={{
          background: `radial-gradient(ellipse 100% 100% at 50% 50%, ${colors.primary}20, transparent 65%)`,
        }}
      />

      <div className="flex items-center gap-3 relative z-10">
        <div
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all duration-300 ${
            environment.running ? 'animate-pulse' : ''
          } ${isSelected ? 'scale-150' : 'group-hover:scale-125'}`}
          style={{
            backgroundColor: environment.running ? colors.primary : '#4a4a4a',
            boxShadow: environment.running
              ? isSelected
                ? `0 0 16px ${colors.primary}, 0 0 8px ${colors.primary}`
                : `0 0 10px ${colors.primary}`
              : undefined,
          }}
        />
        <div className="flex-1 min-w-0">
          <span
            className="text-sm font-semibold transition-all duration-300"
            style={{
              color: isSelected
                ? colors.primary
                : environment.running
                  ? colors.primary
                  : '#888',
              filter: isSelected ? 'brightness(1.3)' : undefined,
            }}
          >
            {environment.name}
          </span>
        </div>
      </div>
    </div>
  )
}
