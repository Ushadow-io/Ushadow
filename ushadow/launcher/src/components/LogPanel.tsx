import { useEffect, useRef, useState } from 'react'
import { Trash2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'

export type LogLevel = 'info' | 'warning' | 'error' | 'success' | 'step'

export interface LogEntry {
  id: number
  timestamp: Date
  message: string
  level: LogLevel
  detailed?: boolean  // If true, only show in Detail view
}

interface LogPanelProps {
  logs: LogEntry[]
  onClear: () => void
  expanded?: boolean
  onToggleExpand?: () => void
}

export function LogPanel({ logs, onClear, expanded = true, onToggleExpand }: LogPanelProps) {
  const logAreaRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<'state' | 'detail'>('state')

  // Auto-scroll to top when new logs arrive (since most recent is at top)
  useEffect(() => {
    if (logAreaRef.current && autoScrollRef.current) {
      logAreaRef.current.scrollTop = 0
    }
  }, [logs])

  // Detect if user scrolled down (disable auto-scroll)
  const handleScroll = () => {
    if (logAreaRef.current) {
      const { scrollTop } = logAreaRef.current
      // If user is within 50px of top, enable auto-scroll
      autoScrollRef.current = scrollTop < 50
    }
  }

  // Filter logs based on view mode
  const filteredLogs = viewMode === 'state'
    ? logs.filter(log => log.level !== 'info' && !log.detailed) // State view: hide info and detailed logs
    : logs // Detail view: show all logs

  // Reverse logs to show most recent at top
  const displayLogs = [...filteredLogs].reverse()

  // Copy all logs to clipboard
  const handleCopy = async () => {
    const text = logs.map(entry => {
      const time = entry.timestamp.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      const icons: Record<LogLevel, string> = {
        info: '',
        warning: '⚠️ ',
        error: '❌ ',
        success: '✅ ',
        step: '→ ',
      }
      return `[${time}] ${icons[entry.level]}${entry.message}`
    }).join('\n')

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy logs:', err)
    }
  }

  return (
    <div className="bg-surface-800 rounded-lg flex flex-col overflow-hidden" data-testid="log-panel">
      {/* Header - entire bar is clickable */}
      <div
        onClick={onToggleExpand}
        className="flex items-center justify-center p-3 cursor-pointer hover:bg-surface-700/50 transition-colors relative"
        data-testid="log-panel-header"
      >
        {onToggleExpand && (
          <span className="absolute left-3">
            {expanded ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronUp className="w-4 h-4 text-text-muted" />}
          </span>
        )}
        <span className="text-sm font-medium text-text-secondary">Activity Log</span>
        <div className="absolute right-3 flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleCopy() }}
            className="p-1.5 rounded hover:bg-surface-600 transition-colors text-text-muted hover:text-text-primary"
            title="Copy logs"
            data-testid="copy-logs-button"
          >
            {copied ? <Check className="w-4 h-4 text-success-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClear() }}
            className="p-1.5 rounded hover:bg-surface-600 transition-colors text-text-muted hover:text-text-primary"
            title="Clear logs"
            data-testid="clear-logs-button"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      {expanded && (
        <div className="flex gap-1 px-3 pb-2 bg-surface-700/50">
          <button
            onClick={() => setViewMode('state')}
            className={`flex-1 px-3 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === 'state'
                ? 'bg-surface-600 text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            data-testid="log-tab-state"
          >
            State
          </button>
          <button
            onClick={() => setViewMode('detail')}
            className={`flex-1 px-3 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === 'detail'
                ? 'bg-surface-600 text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            data-testid="log-tab-detail"
          >
            Detail
          </button>
        </div>
      )}

      {/* Log Area - animated collapse */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: expanded ? '200px' : '0px', opacity: expanded ? 1 : 0 }}
      >
        <div
          ref={logAreaRef}
          onScroll={handleScroll}
          className="overflow-y-auto p-3 font-mono text-xs leading-relaxed max-h-[200px] border-t border-surface-700 select-text"
          data-testid="log-area"
        >
          {displayLogs.length === 0 ? (
            <p className="text-text-muted text-center">No activity yet...</p>
          ) : (
            displayLogs.map((entry) => <LogLine key={entry.id} entry={entry} />)
          )}
        </div>
      </div>
    </div>
  )
}

function LogLine({ entry }: { entry: LogEntry }) {
  const [copied, setCopied] = useState(false)

  const colors: Record<LogLevel, string> = {
    info: 'text-text-secondary',
    warning: 'text-warning-400',
    error: 'text-error-400',
    success: 'text-success-400',
    step: 'text-accent-400 font-semibold',
  }

  const icons: Record<LogLevel, string> = {
    info: '',
    warning: '⚠️ ',
    error: '❌ ',
    success: '✅ ',
    step: '→ ',
  }

  const time = entry.timestamp.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const handleClick = async () => {
    const text = `[${time}] ${icons[entry.level]}${entry.message}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Split message by newlines for proper rendering
  const lines = entry.message.split('\n')

  return (
    <div
      onClick={handleClick}
      className={`${colors[entry.level]} break-words whitespace-pre-wrap py-0.5 cursor-pointer hover:bg-surface-700/50 rounded px-1 -mx-1 transition-colors ${copied ? 'bg-success-400/20' : ''}`}
      title="Click to copy"
    >
      <span className="text-text-muted opacity-60">[{time}]</span>{' '}
      {icons[entry.level]}
      {lines.length === 1 ? (
        <span>{entry.message}</span>
      ) : (
        <span className="block">
          {lines.map((line, idx) => (
            <span key={idx} className="block">{line}</span>
          ))}
        </span>
      )}
      {copied && <span className="ml-2 text-success-400 text-[10px]">copied!</span>}
    </div>
  )
}

// Helper hook for managing logs
export function useLogger() {
  const logsRef = useRef<LogEntry[]>([])
  const idRef = useRef(0)
  const lastStateRef = useRef<string>('')

  const log = (message: string, level: LogLevel = 'info', detailed: boolean = false) => {
    const entry: LogEntry = {
      id: idRef.current++,
      timestamp: new Date(),
      message,
      level,
      detailed,
    }
    logsRef.current = [...logsRef.current, entry]
    return logsRef.current
  }

  // Log only if state changed (prevents polling noise)
  const logStateChange = (stateKey: string, message: string, level: LogLevel = 'info') => {
    if (lastStateRef.current !== stateKey) {
      lastStateRef.current = stateKey
      return log(message, level, false)
    }
    return logsRef.current
  }

  const clear = () => {
    logsRef.current = []
    lastStateRef.current = ''
    return logsRef.current
  }

  return { log, logStateChange, clear, logs: logsRef.current }
}
