import { useState, useEffect, useRef } from 'react'
import { Zap, MessageSquare, CheckCircle, RefreshCw, X, Code2, AppWindow, ShieldQuestion, Minimize2 } from 'lucide-react'
import { getColors } from '../utils/colors'
import type { ClaudeSession, ClaudeSessionStatus } from '../hooks/useClaudeSessions'
import type { UshadowEnvironment } from '../hooks/useTauri'
import { tauri } from '../hooks/useTauri'

interface LauncherNotchProps {
  sessions: ClaudeSession[]
  onOpenInApp: (env: UshadowEnvironment) => void
}

function statusIcon(status: ClaudeSessionStatus, size = 'w-3.5 h-3.5') {
  switch (status) {
    case 'Working':            return <Zap className={`${size} text-yellow-300 animate-pulse`} />
    case 'Processing':         return <RefreshCw className={`${size} text-orange-300 animate-spin`} />
    case 'WaitingForInput':    return <MessageSquare className={`${size} text-blue-300`} />
    case 'WaitingForApproval': return <ShieldQuestion className={`${size} text-red-300 animate-pulse`} />
    case 'Compacting':         return <Minimize2 className={`${size} text-purple-300 animate-pulse`} />
    case 'Ended':              return <CheckCircle className={`${size} text-green-300/60`} />
    default:                   return null
  }
}

function statusLabel(status: ClaudeSessionStatus): string {
  switch (status) {
    case 'Working':            return 'Working'
    case 'Processing':         return 'Processing'
    case 'WaitingForInput':    return 'Waiting'
    case 'WaitingForApproval': return 'Needs approval'
    case 'Compacting':         return 'Compacting'
    case 'Ended':              return 'Ended'
  }
}

/** Pick the most relevant session to show in the notch */
function getMostRelevantSession(sessions: ClaudeSession[]): ClaudeSession | null {
  // Prefer: WaitingForApproval > Working > Processing > Compacting > WaitingForInput > Ended
  const order: ClaudeSessionStatus[] = ['WaitingForApproval', 'Working', 'Processing', 'Compacting', 'WaitingForInput', 'Ended']
  for (const status of order) {
    const match = sessions.find(s => s.status === status)
    if (match) return match
  }
  return null
}

export function LauncherNotch({ sessions, onOpenInApp }: LauncherNotchProps) {
  const [expanded, setExpanded] = useState(false)
  const [visible, setVisible] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevSessionKeyRef = useRef<string>('')

  const session = getMostRelevantSession(sessions)
  const colors = session
    ? getColors(session.environment?.color ?? session.environment?.name ?? 'default')
    : null

  // Show/re-animate notch when relevant session changes
  const sessionKey = session
    ? `${session.session_id}-${session.status}-${session.last_event_at}`
    : ''

  useEffect(() => {
    if (!session) {
      setVisible(false)
      setExpanded(false)
      return
    }

    // Always show notch when there's a session
    setVisible(true)

    // Auto-expand on new significant events
    if (sessionKey !== prevSessionKeyRef.current) {
      prevSessionKeyRef.current = sessionKey
      const shouldExpand = session.status === 'Working'
        || session.status === 'Processing'
        || session.status === 'WaitingForApproval'
      if (shouldExpand) {
        setExpanded(true)
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
        dismissTimerRef.current = setTimeout(() => setExpanded(false), 6000)
      }
    }

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [session, sessionKey])

  if (!visible || !session || !colors) return null

  const envName = session.environment?.name ?? session.cwd.split('/').pop() ?? 'Claude'
  const isEnded = session.status === 'Ended'

  const handleVscode = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (session.environment?.path) {
      tauri.openInVscode(session.environment.path, session.environment.name ?? '')
    }
  }

  const handleOpenEnv = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (session.environment) onOpenInApp(session.environment)
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setVisible(false)
    setExpanded(false)
  }

  return (
    <div
      className="fixed top-2 left-[17%] z-[9999] pointer-events-none"
      data-testid="launcher-notch"
    >
      <div
        className={`
          pointer-events-auto
          rounded-2xl shadow-2xl shadow-black/40
          transition-all duration-300 ease-in-out overflow-hidden
          cursor-pointer select-none
          ${expanded ? 'backdrop-blur-md' : ''}
        `}
        style={{
          backgroundColor: expanded
            ? `color-mix(in srgb, ${colors.dark} 90%, transparent)`
            : `color-mix(in srgb, ${colors.dark} 80%, transparent)`,
          border: `1px solid ${colors.primary}40`,
          boxShadow: `0 0 20px ${colors.primary}30, 0 4px 20px rgba(0,0,0,0.5)`,
          minWidth: expanded ? '360px' : '0',
          maxWidth: expanded ? '420px' : '240px',
        }}
        onClick={() => setExpanded(prev => !prev)}
        data-testid="notch-expand-toggle"
      >
        {/* Collapsed row — always visible */}
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Color dot */}
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${isEnded ? '' : 'animate-pulse'}`}
            style={{
              backgroundColor: isEnded ? '#666' : colors.primary,
              boxShadow: isEnded ? 'none' : `0 0 8px ${colors.primary}`,
            }}
          />
          {/* Env name */}
          <span
            className="text-xs font-semibold truncate flex-1"
            style={{ color: isEnded ? '#888' : colors.primary }}
          >
            {envName}
          </span>
          {/* Status icon + label */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {statusIcon(session.status)}
            <span className="text-xs text-white/70">{statusLabel(session.status)}</span>
          </div>
          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="ml-1 p-0.5 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
            title="Dismiss"
            data-testid="notch-dismiss"
          >
            <X className="w-3 h-3 text-white/40 hover:text-white/80" />
          </button>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="px-3 pb-3 border-t border-white/10 mt-1 pt-2">
            {/* User's task */}
            {session.user_message && (
              <p className="text-xs text-white/70 line-clamp-2 mb-1.5">
                {session.user_message.slice(0, 150)}
              </p>
            )}
            {/* Current tool */}
            {session.current_tool && (
              <p className="text-xs text-white/50 truncate mb-1.5">
                <span className="font-mono text-yellow-300/80">{session.current_tool}</span>
                {session.current_tool_description && (
                  <span className="ml-1.5">{session.current_tool_description.slice(0, 80)}</span>
                )}
              </p>
            )}
            {/* Fallback path */}
            {!session.user_message && !session.current_tool && (
              <p className="text-xs text-white/40 mb-1.5">{session.cwd.split('/').slice(-3).join('/')}</p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-2">
              {session.environment?.path && (
                <button
                  onClick={handleVscode}
                  className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors text-xs flex items-center gap-1.5"
                  title="Open in VS Code"
                  data-testid="notch-vscode-btn"
                >
                  <img src="/vscode48.png" alt="VS Code" className="w-3 h-3" />
                  VS Code
                </button>
              )}
              {session.environment?.running && (
                <button
                  onClick={handleOpenEnv}
                  className="px-2 py-1 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 transition-colors text-xs flex items-center gap-1.5"
                  title="Open environment"
                  data-testid="notch-open-env-btn"
                >
                  <AppWindow className="w-3 h-3" />
                  Open App
                </button>
              )}
              <span className="ml-auto text-xs text-white/30 flex items-center gap-1">
                <Code2 className="w-3 h-3" />
                {sessions.filter(s => s.status !== 'Ended').length} active
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
