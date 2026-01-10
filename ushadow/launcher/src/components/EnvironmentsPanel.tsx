import { useState } from 'react'
import { Plus, Play, Square, Settings, Loader2, AppWindow, Box, FolderOpen, X, AlertCircle, GitBranch, GitMerge } from 'lucide-react'
import type { UshadowEnvironment } from '../hooks/useTauri'
import { tauri } from '../hooks/useTauri'
import { getColors } from '../utils/colors'

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
  onDismissError?: (name: string) => void
  loadingEnv: string | null
}

export function EnvironmentsPanel({
  environments,
  creatingEnvs = [],
  onStart,
  onStop,
  onCreate,
  onOpenInApp,
  onDismissError,
  loadingEnv,
}: EnvironmentsPanelProps) {
  const [activeTab, setActiveTab] = useState<'running' | 'detected'>('running')

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
        <button
          onClick={onCreate}
          className="text-sm px-3 py-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors flex items-center gap-1.5 font-medium shadow-sm"
          data-testid="create-env-button"
        >
          <Plus className="w-4 h-4" />
          New Environment
        </button>
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
                isLoading={loadingEnv === env.name}
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
                isLoading={loadingEnv === env.name}
              />
            ))}
          </div>
        )
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
  isLoading: boolean
}

function EnvironmentCard({ environment, onStart, onStop, onOpenInApp, isLoading }: EnvironmentCardProps) {
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

      {/* Start/Stop button - bottom */}
      <div className="mt-2 flex justify-end">
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
  )
}
