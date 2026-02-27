import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bot, Download, Code2, AppWindow, Clock, Zap, CheckCircle, AlertCircle,
  Loader2, MessageSquare, RefreshCw, ShieldQuestion, Minimize2,
  Ticket as TicketIcon, ArrowUpDown, ThumbsUp, ThumbsDown, Terminal,
} from 'lucide-react'
import { getColors } from '../utils/colors'
import type { ClaudeSession, ClaudeSessionStatus } from '../hooks/useClaudeSessions'
import type { ClaudeSessionEvent, TranscriptMessage, Ticket, UshadowEnvironment } from '../hooks/useTauri'
import { tauri } from '../hooks/useTauri'

interface ClaudeSessionsPanelProps {
  sessions: ClaudeSession[]
  hooksInstalled: boolean | null
  installing: boolean
  error: string | null
  installSuccess: string | null
  onInstallHooks: () => void
  environments: UshadowEnvironment[]
  onOpenInApp: (env: UshadowEnvironment) => void
}

// ─── helpers ────────────────────────────────────────────────────────────────

function statusIcon(status: ClaudeSessionStatus, className = 'w-3 h-3') {
  switch (status) {
    case 'Working':            return <Zap className={`${className} text-yellow-400 animate-pulse`} />
    case 'Processing':         return <RefreshCw className={`${className} text-orange-400 animate-spin`} />
    case 'WaitingForInput':    return <MessageSquare className={`${className} text-blue-400`} />
    case 'WaitingForApproval': return <ShieldQuestion className={`${className} text-red-400 animate-pulse`} />
    case 'Compacting':         return <Minimize2 className={`${className} text-purple-400 animate-pulse`} />
    case 'Ended':              return <CheckCircle className={`${className} text-green-400/60`} />
    default:                   return <AlertCircle className={`${className} text-text-muted`} />
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

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${Math.round(ms / 3_600_000)}h`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const TICKET_STATUS_STYLE: Record<string, string> = {
  backlog:     'text-text-muted/60 bg-white/5',
  todo:        'text-blue-400/80 bg-blue-400/10',
  in_progress: 'text-yellow-400/90 bg-yellow-400/10',
  in_review:   'text-purple-400/90 bg-purple-400/10',
  done:        'text-green-400/80 bg-green-400/10',
  archived:    'text-text-muted/30 bg-white/3',
}

// ─── EventRow ────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: ClaudeSessionEvent }) {
  const data = event.data as {
    tool?: string; description?: string; path?: string; message?: string
    last_message?: string; compaction_type?: string
  }

  let label = event.event_type
  let detail = ''
  let labelColor = 'text-text-muted'

  switch (event.event_type) {
    case 'UserPromptSubmit':  label = 'You';       detail = data.message ?? '';           labelColor = 'text-primary-400';     break
    case 'PreToolUse':        label = data.tool ?? 'Tool'; detail = data.description || data.path || ''; labelColor = 'text-yellow-400/80'; break
    case 'PostToolUse':       label = `✓ ${data.tool ?? 'Tool'}`;                         labelColor = 'text-green-400/60';    break
    case 'Notification':      label = 'Notice';    detail = data.message ?? '';           labelColor = 'text-blue-400/80';     break
    case 'Stop':              label = 'Done';      detail = data.last_message ?? '';      labelColor = 'text-text-muted';      break
    case 'SubagentStop':      label = 'Agent done';                                       labelColor = 'text-text-muted';      break
    case 'SessionStart':      label = 'Started';                                          labelColor = 'text-cyan-400/60';     break
    case 'SessionEnd':        label = 'Ended';                                            labelColor = 'text-text-muted/40';   break
    case 'PreCompact':        label = 'Compacting'; detail = data.compaction_type ?? '';  labelColor = 'text-purple-400/80';   break
  }

  const isToolEvent = event.event_type === 'PreToolUse' || event.event_type === 'PostToolUse'

  return (
    <div className="flex items-start gap-2 py-0.5" data-testid={`event-row-${event.event_type}`}>
      {isToolEvent && detail ? (
        <div className="flex-1 min-w-0 flex items-start gap-1.5">
          <span className={`text-xs font-mono flex-shrink-0 mt-0.5 px-1 rounded ${labelColor} bg-white/5`}>{label}</span>
          <span className="text-[13px] text-text-secondary truncate flex-1" title={detail}>{detail}</span>
        </div>
      ) : (
        <>
          <span className={`text-xs font-mono flex-shrink-0 mt-0.5 ${labelColor} w-20 truncate`}>{label}</span>
          {detail && <span className="text-[13px] text-text-secondary flex-1 min-w-0 truncate" title={detail}>{detail}</span>}
        </>
      )}
      <span className="text-xs text-text-muted/40 flex-shrink-0 ml-auto">{formatTime(event.timestamp)}</span>
    </div>
  )
}

// ─── TranscriptRow ───────────────────────────────────────────────────────────

const mdComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  p:          ({ children }) => <p className="mb-1.5 last:mb-0 leading-snug">{children}</p>,
  strong:     ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
  em:         ({ children }) => <em className="italic text-text-secondary/80">{children}</em>,
  h1:         ({ children }) => <p className="font-bold text-base mb-1 text-text-primary">{children}</p>,
  h2:         ({ children }) => <p className="font-semibold text-sm mb-1 text-text-primary">{children}</p>,
  h3:         ({ children }) => <p className="font-semibold text-sm mb-0.5 text-text-secondary">{children}</p>,
  ul:         ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5 pl-1">{children}</ul>,
  ol:         ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5 pl-1">{children}</ol>,
  li:         ({ children }) => <li className="leading-snug">{children}</li>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-white/20 pl-2 my-1 text-text-muted/70 italic">{children}</blockquote>,
  hr:         () => <hr className="border-white/10 my-2" />,
  a:          ({ href, children }) => <a href={href} className="text-primary-400 underline underline-offset-2 hover:text-primary-300">{children}</a>,
  code:       ({ children, className }) => {
    const isBlock = className?.startsWith('language-')
    return isBlock
      ? <code className={`${className} block`}>{children}</code>
      : <code className="font-mono text-xs px-1 py-0.5 rounded bg-white/10 text-yellow-300/90">{children}</code>
  },
  pre:        ({ children }) => (
    <pre className="font-mono text-xs bg-black/30 border border-white/10 rounded-lg p-2.5 overflow-x-auto mb-1.5 whitespace-pre-wrap break-words">
      {children}
    </pre>
  ),
}

function TranscriptRow({ msg }: { msg: TranscriptMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end" data-testid="transcript-user-msg">
        <div className="bg-primary-500/20 border border-primary-500/20 rounded-lg px-2.5 py-1.5 max-w-[88%]">
          <p className="text-sm text-primary-300 leading-snug">{msg.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-1.5" data-testid="transcript-assistant-msg">
      <Bot className="w-3 h-3 mt-0.5 flex-shrink-0 text-text-muted/40" />
      <div className="flex-1 min-w-0 text-sm text-text-secondary">
        {msg.text && (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {msg.text}
          </ReactMarkdown>
        )}
        {msg.tools.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {msg.tools.slice(0, 4).map((tool, i) => (
              <span
                key={i}
                className="text-xs font-mono px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400/80"
                title={tool.description ?? tool.path ?? ''}
              >
                {tool.name}
                {(tool.description || tool.path) && (
                  <span className="text-text-muted/50 font-sans ml-1">
                    {(tool.description ?? tool.path ?? '').slice(0, 25)}
                  </span>
                )}
              </span>
            ))}
            {msg.tools.length > 4 && (
              <span className="text-xs text-text-muted/40">+{msg.tools.length - 4}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TicketCard ──────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: Ticket }) {
  const statusStyle = TICKET_STATUS_STYLE[ticket.status] ?? 'text-text-muted/60 bg-white/5'
  const statusText = ticket.status.replace('_', ' ')

  return (
    <div
      className="p-2.5 rounded-lg bg-surface-700/30 border border-white/5 hover:border-white/10 transition-colors"
      data-testid={`ticket-card-${ticket.id.slice(0, 8)}`}
    >
      <div className="flex items-start gap-2">
        <TicketIcon className="w-3 h-3 mt-0.5 flex-shrink-0 text-text-muted/40" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary leading-snug truncate">{ticket.title}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${statusStyle}`}>
              {statusText}
            </span>
            {ticket.branch_name && (
              <span className="text-xs font-mono text-text-muted/50 truncate max-w-32" title={ticket.branch_name}>
                {ticket.branch_name}
              </span>
            )}
            {ticket.tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-xs px-1 rounded bg-white/5 text-text-muted/60">{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── SessionDetail (right column) ───────────────────────────────────────────

function SessionDetail({
  session,
  tickets,
  onOpenInApp,
}: {
  session: ClaudeSession
  tickets: Ticket[]
  onOpenInApp: (env: UshadowEnvironment) => void
}) {
  const [transcript, setTranscript] = useState<TranscriptMessage[] | null>(null)
  const [loadingTranscript, setLoadingTranscript] = useState(false)
  const transcriptBottomRef = useRef<HTMLDivElement>(null)

  const env = session.environment
  const colors = getColors(env?.color ?? env?.name ?? session.cwd.split('/').pop() ?? 'default')

  // Reset transcript when session changes
  useEffect(() => {
    setTranscript(null)
    setLoadingTranscript(false)
  }, [session.session_id])

  // Poll transcript for active sessions
  useEffect(() => {
    const fetch = () => {
      tauri.readClaudeTranscript(session.session_id, session.cwd)
        .then(msgs => { setTranscript(msgs); setLoadingTranscript(false) })
        .catch(() => { setTranscript([]); setLoadingTranscript(false) })
    }

    setLoadingTranscript(true)
    fetch()

    if (session.status === 'Ended') return

    const interval = setInterval(fetch, 3000)
    return () => clearInterval(interval)
  }, [session.session_id, session.cwd, session.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom when transcript updates
  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  const [approvalPending, setApprovalPending] = useState(false)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [approvedLocally, setApprovedLocally] = useState(false)

  // Reset approval state when switching sessions
  useEffect(() => {
    setApprovedLocally(false)
    setApprovalError(null)
  }, [session.session_id])

  const handleApprove = async (approve: boolean) => {
    setApprovalPending(true)
    setApprovalError(null)
    try {
      await tauri.sendClaudeApproval(session.cwd, approve)
      setApprovedLocally(true) // dismiss banner optimistically on success
    } catch (e) {
      setApprovalError(String(e))
    } finally {
      setApprovalPending(false)
    }
  }

  const handleOpenVscode = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (env?.path) tauri.openInVscode(env.path, env.name)
  }

  const handleOpenApp = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (env) onOpenInApp(env)
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-3" data-testid={`claude-session-detail-${session.session_id.slice(0, 8)}`}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: session.status === 'Ended' ? '#333' : colors.primary }}
        />
        <span className="text-base font-semibold truncate" style={{ color: session.status === 'Ended' ? '#666' : colors.primary }}>
          {env?.name ?? session.cwd.split('/').slice(-2).join('/')}
        </span>
        <span className="text-sm text-text-muted/50 flex-shrink-0 ml-auto">
          {session.cwd.split('/').slice(-2).join('/')}
        </span>
      </div>

      {/* Approval banner */}
      {session.status === 'WaitingForApproval' && !approvedLocally && (
        <div
          className="flex-shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-2"
          data-testid="approval-banner"
        >
          <div className="flex items-start gap-2">
            <ShieldQuestion className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-300">Waiting for your approval</p>
              {session.current_tool && (
                <p className="text-sm text-red-400/80 mt-0.5">
                  <span className="font-mono">{session.current_tool}</span>
                  {session.current_tool_description && (
                    <span className="text-red-400/60 ml-1.5 font-sans">{session.current_tool_description}</span>
                  )}
                  {!session.current_tool_description && session.current_tool_path && (
                    <span className="text-red-400/50 ml-1.5 font-mono">{session.current_tool_path.split('/').slice(-2).join('/')}</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleApprove(true)}
              disabled={approvalPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors text-sm font-medium disabled:opacity-50"
              data-testid="approval-allow-button"
            >
              <ThumbsUp className="w-3 h-3" />
              Allow
            </button>
            <button
              onClick={() => handleApprove(false)}
              disabled={approvalPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-sm font-medium disabled:opacity-50"
              data-testid="approval-deny-button"
            >
              <ThumbsDown className="w-3 h-3" />
              Deny
            </button>
            {env?.path && (
              <button
                onClick={() => tauri.openTmuxInTerminal(env.name, session.cwd, env.name)}
                className="ml-auto flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/5 text-text-muted/60 hover:bg-white/10 hover:text-text-muted transition-colors text-sm"
                data-testid="approval-terminal-button"
              >
                <Terminal className="w-3 h-3" />
                Terminal
              </button>
            )}
          </div>
          {approvalError && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-red-400/70 flex-1">{approvalError}</p>
              <button
                onClick={() => setApprovedLocally(true)}
                className="text-xs text-text-muted/50 hover:text-text-muted underline flex-shrink-0"
                data-testid="approval-dismiss-button"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Kanban tickets */}
      {tickets.length > 0 && (
        <div className="flex-shrink-0" data-testid="session-tickets">
          <p className="text-xs uppercase tracking-wider text-text-muted/40 mb-1.5">Tickets</p>
          <div className="space-y-1.5">
            {tickets.map(t => <TicketCard key={t.id} ticket={t} />)}
          </div>
        </div>
      )}

      {/* Conversation */}
      <div className="flex-1 min-h-0 flex flex-col">
        <p className="text-xs uppercase tracking-wider text-text-muted/40 mb-1.5 flex-shrink-0">Conversation</p>
        {loadingTranscript && (
          <div className="flex items-center gap-1.5 text-text-muted/40 text-sm py-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading…
          </div>
        )}
        {!loadingTranscript && transcript !== null && transcript.length === 0 && (
          <div className="overflow-y-auto flex-1">
            {[...session.events].reverse().slice(0, 10).map((evt, i) => (
              <EventRow key={i} event={evt} />
            ))}
          </div>
        )}
        {!loadingTranscript && transcript && transcript.length > 0 && (
          <div
            className="flex-1 overflow-y-auto space-y-2.5 pr-1"
            data-testid={`claude-session-transcript-${session.session_id.slice(0, 8)}`}
          >
            {transcript.map(msg => <TranscriptRow key={msg.message_id} msg={msg} />)}
            <div ref={transcriptBottomRef} />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-shrink-0 pt-2 border-t border-white/5">
        {env?.path && (
          <button
            onClick={handleOpenVscode}
            className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors text-sm flex items-center gap-1.5"
            data-testid={`claude-session-vscode-${session.session_id.slice(0, 8)}`}
          >
            <img src="/vscode48.png" alt="VS Code" className="w-3 h-3" />
            VS Code
          </button>
        )}
        {env?.running && (
          <button
            onClick={handleOpenApp}
            className="px-2 py-1 rounded bg-surface-600/50 text-text-secondary hover:bg-surface-600 transition-colors text-sm flex items-center gap-1.5"
            data-testid={`claude-session-open-env-${session.session_id.slice(0, 8)}`}
          >
            <AppWindow className="w-3 h-3" />
            Open Env
          </button>
        )}
      </div>
    </div>
  )
}

// ─── SessionTile (left column) ───────────────────────────────────────────────

function SessionTile({
  session,
  selected,
  onSelect,
}: {
  session: ClaudeSession
  selected: boolean
  onSelect: () => void
}) {
  const env = session.environment
  const colors = getColors(env?.color ?? env?.name ?? session.cwd.split('/').pop() ?? 'default')
  const isEnded = session.status === 'Ended'

  return (
    <div
      className={`rounded-lg cursor-pointer select-none transition-all relative ${
        selected ? 'ring-1 ring-white/20 bg-white/5' : 'hover:bg-white/3'
      }`}
      style={{
        borderLeft: `3px solid ${isEnded ? '#333' : colors.primary}`,
        backgroundColor: selected
          ? `${colors.dark}25`
          : isEnded ? 'rgba(45,45,55,0.15)' : `${colors.dark}12`,
      }}
      data-testid={`session-tile-${session.session_id.slice(0, 8)}`}
      onClick={onSelect}
    >
      <div className="p-2.5">
        {/* Name + status row */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${!isEnded ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: isEnded ? '#444' : colors.primary }}
          />
          <span className="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: isEnded ? '#555' : colors.primary }}>
            {env?.name ?? session.cwd.split('/').slice(-1)[0]}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0" data-testid={`session-tile-status-${session.session_id.slice(0, 8)}`}>
            {statusIcon(session.status)}
            <span className="text-xs text-text-muted/70 hidden sm:inline">{statusLabel(session.status)}</span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0 text-text-muted/40">
            <Clock className="w-2.5 h-2.5" />
            <span className="text-xs">{formatAge(session.last_event_at)}</span>
          </div>
        </div>

        {/* Task preview */}
        {session.user_message && session.status !== 'Ended' && (
          <p
            className="text-[13px] text-text-muted/70 mt-1 line-clamp-1 pl-3"
            data-testid={`session-tile-task-${session.session_id.slice(0, 8)}`}
          >
            {session.user_message}
          </p>
        )}

        {/* Current tool */}
        {session.current_tool && session.status === 'Working' && (
          <p className="text-xs font-mono text-yellow-400/70 mt-0.5 pl-3 truncate">
            {session.current_tool}
            {session.current_tool_description && (
              <span className="text-text-muted/40 font-sans ml-1">
                {session.current_tool_description.slice(0, 40)}
              </span>
            )}
          </p>
        )}

        {session.status === 'WaitingForApproval' && (
          <div className="mt-0.5 pl-3" data-testid={`session-tile-approval-${session.session_id.slice(0, 8)}`}>
            <p className="text-xs text-red-400/80">
              ⚠ Approve{session.current_tool ? `: ${session.current_tool}` : ''}
              {session.current_tool_description && (
                <span className="text-red-400/50 ml-1">{session.current_tool_description.slice(0, 40)}</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── InstallHooksCard ────────────────────────────────────────────────────────

function InstallHooksCard({ installing, error, onInstall }: {
  installing: boolean; error: string | null; onInstall: () => void
}) {
  return (
    <div className="bg-surface-800 rounded-lg p-6 text-center col-span-2" data-testid="install-hooks-card">
      <div className="w-14 h-14 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto mb-4">
        <Bot className="w-7 h-7 text-primary-400" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Connect Claude Code Sessions</h3>
      <p className="text-base text-text-muted mb-5 max-w-sm mx-auto">
        Install lightweight hooks that capture Claude Code session activity into the launcher.
        Hooks run asynchronously and never block Claude.
      </p>
      {error && <p className="text-sm text-error-400 mb-3 px-4">{error}</p>}
      <button
        onClick={onInstall}
        disabled={installing}
        className="px-5 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 transition-colors font-medium text-base flex items-center gap-2 mx-auto disabled:opacity-60"
        data-testid="install-hooks-button"
      >
        {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {installing ? 'Installing...' : 'Install Session Hooks'}
      </button>
      <p className="text-sm text-text-muted/60 mt-3">
        Adds entries to ~/.claude/settings.json · Writes ~/.claude/hooks/ushadow_launcher_hook.py
      </p>
    </div>
  )
}

// ─── ClaudeSessionsPanel ────────────────────────────────────────────────────

export function ClaudeSessionsPanel({
  sessions, hooksInstalled, installing, error, installSuccess, onInstallHooks, onOpenInApp,
}: ClaudeSessionsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortInverted, setSortInverted] = useState(false)
  const [allTickets, setAllTickets] = useState<Ticket[]>([])

  // Fetch kanban tickets once on mount
  useEffect(() => {
    tauri.getTickets().then(setAllTickets).catch(() => {})
  }, [])

  // Apply sort inversion before splitting into active/ended
  const allSessions = sortInverted ? [...sessions].reverse() : sessions
  const active = allSessions.filter(s => s.status !== 'Ended')
  const ended = allSessions.filter(s => s.status === 'Ended').slice(0, 5)
  const selectedSession =
    allSessions.find(s => s.session_id === selectedId) ??
    active[0] ??
    ended[0] ??
    null

  // Update selectedId when the auto-selected session changes (new session appears)
  useEffect(() => {
    if (!selectedId && active.length > 0) {
      setSelectedId(active[0].session_id)
    }
  }, [active, selectedId])

  // Tickets for the selected session: match by environment name or worktree path
  const sessionTickets = selectedSession
    ? allTickets.filter(t =>
        (t.environment_name && t.environment_name === selectedSession.environment?.name) ||
        (t.worktree_path && selectedSession.cwd.startsWith(t.worktree_path))
      )
    : []

  return (
    <div className="h-full flex flex-col gap-3 min-h-0" data-testid="claude-sessions-panel">
      {/* Header — full width */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary-400" />
          <h2 className="text-xl font-semibold">Claude Sessions</h2>
          {active.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-sm font-medium">
              {active.length} active
            </span>
          )}
        </div>
        {hooksInstalled && (
          <div className="flex items-center gap-2">
            {installSuccess && !installing && (
              <span className="text-sm text-green-400 flex items-center gap-1" data-testid="install-success-msg">
                <CheckCircle className="w-3 h-3" />
                Updated
              </span>
            )}
            {error && !installing && (
              <span className="text-sm text-red-400 truncate max-w-32" title={error} data-testid="install-error-msg">
                {error}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-sm text-green-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Hooks active
            </div>
            <button
              onClick={onInstallHooks}
              disabled={installing}
              className="px-2 py-1 rounded bg-surface-700 hover:bg-surface-600 transition-colors text-sm text-text-muted flex items-center gap-1 disabled:opacity-50"
              title="Re-install hooks to pick up the latest version"
              data-testid="reinstall-hooks-button"
            >
              {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              {installing ? 'Updating…' : 'Update'}
            </button>
          </div>
        )}
      </div>

      {/* Loading / not-installed states — span both columns */}
      {hooksInstalled === null && (
        <div className="flex items-center justify-center py-12 text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-base">Checking hooks…</span>
        </div>
      )}
      {hooksInstalled === false && (
        <InstallHooksCard installing={installing} error={error} onInstall={onInstallHooks} />
      )}

      {/* Two-column body */}
      {hooksInstalled && (
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-3">
          {/* ── Left: session tiles ── */}
          <div className="flex flex-col gap-2 overflow-y-auto min-h-0 pr-1" data-testid="sessions-list">
            <div className="flex items-center justify-between flex-shrink-0">
              <span className="text-xs text-text-muted/40 uppercase tracking-wider">Sessions</span>
              <button
                onClick={() => setSortInverted(v => !v)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors ${
                  sortInverted
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'text-text-muted/40 hover:text-text-muted/70 hover:bg-white/5'
                }`}
                title={sortInverted ? 'Showing oldest wait first — click to reset' : 'Showing most recent wait first — click to invert'}
                data-testid="sort-sessions-button"
              >
                <ArrowUpDown className="w-3 h-3" />
                {sortInverted ? 'Oldest first' : 'Recent first'}
              </button>
            </div>
            {active.length === 0 && ended.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted" data-testid="claude-sessions-empty">
                <Bot className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-base">No sessions yet.</p>
                <p className="text-sm mt-1 opacity-60">
                  Run <code className="font-mono">claude</code> in any worktree.
                </p>
              </div>
            )}

            {active.length > 0 && (
              <div data-testid="active-sessions">
                <p className="text-xs font-medium text-text-muted/50 uppercase tracking-wider mb-1.5 px-0.5">Active</p>
                <div className="space-y-1.5">
                  {active.map(s => (
                    <SessionTile
                      key={s.session_id}
                      session={s}
                      selected={s.session_id === selectedSession?.session_id}
                      onSelect={() => setSelectedId(s.session_id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {ended.length > 0 && (
              <div data-testid="completed-sessions">
                <p className="text-xs font-medium text-text-muted/30 uppercase tracking-wider mb-1.5 mt-2 px-0.5">Ended</p>
                <div className="space-y-1.5">
                  {ended.map(s => (
                    <SessionTile
                      key={s.session_id}
                      session={s}
                      selected={s.session_id === selectedSession?.session_id}
                      onSelect={() => setSelectedId(s.session_id)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-xs text-text-muted/30 mt-auto pt-2">
              <Code2 className="w-3 h-3" />
              <span>Last 24 hours</span>
            </div>
          </div>

          {/* ── Right: session detail ── */}
          <div className="min-h-0 overflow-hidden border-l border-white/5 pl-3" data-testid="session-detail-column">
            {selectedSession ? (
              <SessionDetail
                key={selectedSession.session_id}
                session={selectedSession}
                tickets={sessionTickets}
                onOpenInApp={onOpenInApp}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-text-muted/30">
                <Bot className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Select a session</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
