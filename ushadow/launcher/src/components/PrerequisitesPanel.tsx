import { useState } from 'react'
import { CheckCircle, XCircle, AlertCircle, Loader2, ChevronDown, ChevronRight, ChevronUp, Download } from 'lucide-react'
import type { Prerequisites } from '../hooks/useTauri'

interface PrerequisitesPanelProps {
  prerequisites: Prerequisites | null
  platform: string
  isInstalling: boolean
  installingItem: string | null
  onInstall: (item: 'git' | 'docker' | 'tailscale' | 'homebrew' | 'python') => void
  onStartDocker: () => void
  showDevTools: boolean
  onToggleDevTools: () => void
}

export function PrerequisitesPanel({
  prerequisites,
  platform,
  isInstalling,
  installingItem,
  onInstall,
  onStartDocker,
  showDevTools,
  onToggleDevTools,
}: PrerequisitesPanelProps) {
  const getOverallStatus = () => {
    if (!prerequisites) return 'checking'
    const { docker_installed, docker_running, git_installed, python_installed } = prerequisites
    if (docker_installed && docker_running && git_installed && python_installed) return 'ready'
    return 'action-needed'
  }

  const status = getOverallStatus()
  // Start collapsed if everything is ready (all green)
  const [expanded, setExpanded] = useState(status !== 'ready')

  return (
    <div className="bg-surface-800 rounded-lg" data-testid="prerequisites-panel">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 flex-1"
          data-testid="prerequisites-toggle"
        >
          <span className="font-medium">Prerequisites</span>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <StatusBadge status={status} />
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3" data-testid="prerequisites-list">
          {/* Homebrew (macOS only) */}
          {platform === 'macos' && (
            <>
              <p className="text-xs text-text-muted mb-1">Package Manager</p>
              <PrereqItem
                label="Homebrew"
                installed={prerequisites?.homebrew_installed ?? null}
                showInstall={!prerequisites?.homebrew_installed}
                onInstall={() => onInstall('homebrew')}
                isInstalling={isInstalling}
                installing={installingItem === 'homebrew'}
              />
              <div className="pt-2 border-t border-surface-600 mb-2" />
            </>
          )}

          {/* Git */}
          <PrereqItem
            label="Git"
            installed={prerequisites?.git_installed ?? null}
            showInstall={!prerequisites?.git_installed}
            onInstall={() => onInstall('git')}
            isInstalling={isInstalling}
            installing={installingItem === 'git'}
          />

          {/* Python */}
          <PrereqItem
            label="Python 3"
            installed={prerequisites?.python_installed ?? null}
            showInstall={!prerequisites?.python_installed}
            onInstall={() => onInstall('python')}
            isInstalling={isInstalling}
            installing={installingItem === 'python'}
          />

          {/* Docker */}
          <PrereqItem
            label="Docker"
            installed={prerequisites?.docker_installed ?? null}
            running={prerequisites?.docker_running}
            showInstall={!prerequisites?.docker_installed}
            showStart={prerequisites?.docker_installed && !prerequisites?.docker_running}
            onInstall={() => onInstall('docker')}
            onStart={onStartDocker}
            isInstalling={isInstalling}
            installing={installingItem === 'docker'}
          />

          {/* Tailscale */}
          <PrereqItem
            label="Tailscale"
            installed={prerequisites?.tailscale_installed ?? null}
            optional
            showInstall={!prerequisites?.tailscale_installed}
            onInstall={() => onInstall('tailscale')}
            isInstalling={isInstalling}
            installing={installingItem === 'tailscale'}
          />
        </div>
      )}

      {/* Drawer toggle - centered at bottom */}
      <div className="flex justify-center pb-2">
        <button
          onClick={onToggleDevTools}
          className="p-1 bg-surface-800 rounded-full hover:bg-surface-700 transition-colors border border-surface-600"
          title={showDevTools ? "Hide dev tools" : "Show dev tools"}
          data-testid="toggle-devtools"
        >
          {showDevTools ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: 'checking' | 'ready' | 'action-needed' }) {
  switch (status) {
    case 'checking':
      return (
        <span className="text-xs px-2 py-1 rounded-full bg-surface-600 text-text-muted flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Checking
        </span>
      )
    case 'ready':
      return (
        <span className="text-xs px-2 py-1 rounded-full bg-success-500/20 text-success-400">
          Ready
        </span>
      )
    case 'action-needed':
      return (
        <span className="text-xs px-2 py-1 rounded-full bg-warning-500/20 text-warning-400">
          Action needed
        </span>
      )
  }
}

interface PrereqItemProps {
  label: string
  installed: boolean | null
  running?: boolean
  optional?: boolean
  showInstall?: boolean
  showStart?: boolean
  onInstall?: () => void
  onStart?: () => void
  isInstalling?: boolean
  installing?: boolean  // True when this specific item is being installed
}

function PrereqItem({
  label,
  installed,
  running,
  optional,
  showInstall,
  showStart,
  onInstall,
  onStart,
  isInstalling,
  installing,
}: PrereqItemProps) {
  const getIcon = () => {
    if (installed === null) {
      return <Loader2 className="w-4 h-4 text-text-muted animate-spin" />
    }
    if (!installed) {
      return optional
        ? <AlertCircle className="w-4 h-4 text-text-muted" />
        : <XCircle className="w-4 h-4 text-error-400" />
    }
    if (running === false) {
      return <AlertCircle className="w-4 h-4 text-warning-400" />
    }
    return <CheckCircle className="w-4 h-4 text-success-400" />
  }

  const getStatus = () => {
    if (installed === null) return 'Checking...'
    if (!installed) return optional ? '(optional)' : ''
    if (running === false) return 'Not running'
    return running === undefined ? 'Installed' : 'Running'
  }

  return (
    <div
      className={`flex items-center justify-between py-1 px-2 -mx-2 rounded transition-all ${
        installing ? 'bg-primary-500/10 ring-1 ring-primary-500/30 animate-pulse' : ''
      }`}
      data-testid={`prereq-${label.toLowerCase()}`}
    >
      <div className="flex items-center gap-2">
        {installing ? <Loader2 className="w-4 h-4 text-primary-400 animate-spin" /> : getIcon()}
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted">{getStatus()}</span>
        {showInstall && onInstall && (
          <button
            onClick={onInstall}
            disabled={isInstalling}
            className="text-xs px-2 py-1 rounded bg-error-500/20 text-error-400 hover:bg-error-500/30 transition-colors disabled:opacity-50 flex items-center gap-1"
            data-testid={`install-${label.toLowerCase()}`}
          >
            <Download className="w-3 h-3" />
            Install
          </button>
        )}
        {showStart && onStart && (
          <button
            onClick={onStart}
            disabled={isInstalling}
            className="text-xs px-2 py-1 rounded bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors disabled:opacity-50"
            data-testid={`start-${label.toLowerCase()}`}
          >
            Start
          </button>
        )}
      </div>
    </div>
  )
}
