import { useEffect, useRef, useState } from 'react'
import { Trash2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'

export type LogLevel = 'info' | 'warning' | 'error' | 'success' | 'step'

export interface LogEntry {
  id: number
  timestamp: Date
  message: string
  level: LogLevel
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

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logAreaRef.current && autoScrollRef.current) {
      logAreaRef.current.scrollTop = logAreaRef.current.scrollHeight
    }
  }, [logs])

  // Detect if user scrolled up (disable auto-scroll)
  const handleScroll = () => {
    if (logAreaRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logAreaRef.current
      // If user is within 50px of bottom, enable auto-scroll
      autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50
    }
  }

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
          {logs.length === 0 ? (
            <p className="text-text-muted text-center">No activity yet...</p>
          ) : (
            logs.map((entry) => <LogLine key={entry.id} entry={entry} />)
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

  return (
    <div
      onClick={handleClick}
      className={`${colors[entry.level]} break-words py-0.5 cursor-pointer hover:bg-surface-700/50 rounded px-1 -mx-1 transition-colors ${copied ? 'bg-success-400/20' : ''}`}
      title="Click to copy"
    >
      <span className="text-text-muted opacity-60">[{time}]</span>{' '}
      {icons[entry.level]}{entry.message}
      {copied && <span className="ml-2 text-success-400 text-[10px]">copied!</span>}
    </div>
  )
}

// Helper hook for managing logs
export function useLogger() {
  const logsRef = useRef<LogEntry[]>([])
  const idRef = useRef(0)
  const lastStateRef = useRef<string>('')

  const log = (message: string, level: LogLevel = 'info') => {
    const entry: LogEntry = {
      id: idRef.current++,
      timestamp: new Date(),
      message,
      level,
    }
    logsRef.current = [...logsRef.current, entry]
    return logsRef.current
  }

  // Log only if state changed (prevents polling noise)
  const logStateChange = (stateKey: string, message: string, level: LogLevel = 'info') => {
    if (lastStateRef.current !== stateKey) {
      lastStateRef.current = stateKey
      return log(message, level)
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
