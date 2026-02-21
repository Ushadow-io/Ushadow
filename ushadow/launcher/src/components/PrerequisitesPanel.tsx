import { useState, useMemo } from 'react'
import { CheckCircle, XCircle, AlertCircle, Loader2, ChevronDown, ChevronRight, ChevronUp, Download } from 'lucide-react'
import type { Prerequisites, PlatformPrerequisitesConfig } from '../hooks/useTauri'

interface PrerequisitesPanelProps {
  prerequisites: Prerequisites | null
  prerequisitesConfig: PlatformPrerequisitesConfig | null
  isInstalling: boolean
  installingItem: string | null
  onInstall: (item: string) => void
  onStartDocker: () => void
  showDevTools: boolean
  onToggleDevTools: () => void
}

export function PrerequisitesPanel({
  prerequisites,
  prerequisitesConfig,
  isInstalling,
  installingItem,
  onInstall,
  onStartDocker,
  showDevTools,
  onToggleDevTools,
}: PrerequisitesPanelProps) {

  // Group prerequisites by category
  const categorizedPrereqs = useMemo(() => {
    if (!prerequisitesConfig) return {}

    const grouped: Record<string, typeof prerequisitesConfig.prerequisites> = {}
    prerequisitesConfig.prerequisites.forEach(prereq => {
      if (!grouped[prereq.category]) {
        grouped[prereq.category] = []
      }
      grouped[prereq.category].push(prereq)
    })
    return grouped
  }, [prerequisitesConfig])

  // Calculate overall status based on required prerequisites
  const getOverallStatus = () => {
    if (!prerequisites || !prerequisitesConfig) return 'checking'

    // Check all non-optional prerequisites
    const requiredPrereqs = prerequisitesConfig.prerequisites.filter(p => !p.optional)
    const allInstalled = requiredPrereqs.every(prereq => {
      const installedKey = `${prereq.id}_installed` as keyof Prerequisites
      return prerequisites[installedKey] === true
    })

    // Also check services (like Docker) are running
    const servicesOk = requiredPrereqs
      .filter(p => p.has_service)
      .every(prereq => {
        const runningKey = `${prereq.id}_running` as keyof Prerequisites
        return prerequisites[runningKey] === true
      })

    if (allInstalled && servicesOk) return 'ready'
    return 'action-needed'
  }

  const status = getOverallStatus()
  // Always start expanded
  const [expanded, setExpanded] = useState(true)

  // Helper to get prerequisite status from Prerequisites object
  const getPrereqStatus = (prereqId: string): { installed: boolean | null; running: boolean | undefined; version: string | null } => {
    if (!prerequisites) return { installed: null, running: undefined, version: null }

    const installedKey = `${prereqId}_installed` as keyof Prerequisites
    const runningKey = `${prereqId}_running` as keyof Prerequisites
    const versionKey = `${prereqId}_version` as keyof Prerequisites

    const installedValue = prerequisites[installedKey]
    const runningValue = prerequisites[runningKey]
    const versionValue = prerequisites[versionKey]

    return {
      installed: typeof installedValue === 'boolean' ? installedValue : null,
      running: typeof runningValue === 'boolean' ? runningValue : undefined,
      version: typeof versionValue === 'string' ? versionValue : null,
    }
  }

  const categoryOrder = ['package_manager', 'development', 'infrastructure', 'networking']
  const categoryLabels: Record<string, string> = {
    package_manager: 'Package Manager',
    development: 'Development Tools',
    infrastructure: 'Infrastructure',
    networking: 'Networking',
  }

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
      {expanded && prerequisitesConfig && (
        <div className="px-4 pb-4" data-testid="prerequisites-list">
          {categoryOrder.map((category, idx) => {
            const prereqsInCategory = categorizedPrereqs[category]
            if (!prereqsInCategory || prereqsInCategory.length === 0) return null

            return (
              <div key={category}>
                {idx > 0 && <div className="pt-2 border-t border-surface-600 mb-2" />}
                <p className="text-xs text-text-muted mb-3">{categoryLabels[category] || category}</p>
                <div className="space-y-3">
                  {prereqsInCategory.map(prereq => {
                    const status = getPrereqStatus(prereq.id)
                    const showStart = prereq.has_service && status.installed === true && status.running === false
                    const isTailscale = prereq.id === 'tailscale'
                    const tailscaleInstalled = isTailscale && status.installed

                    return (
                      <div key={prereq.id}>
                        <PrereqItem
                          label={prereq.display_name}
                          installed={status.installed}
                          running={status.running}
                          optional={prereq.optional}
                          showInstall={!status.installed}
                          showStart={showStart}
                          onInstall={() => onInstall(prereq.id)}
                          onStart={prereq.id === 'docker' ? onStartDocker : undefined}
                          isInstalling={isInstalling}
                          installing={installingItem === prereq.id}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
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
