import { useState, useEffect } from 'react'
import { X, Terminal, Trash2, AlertTriangle } from 'lucide-react'
import { tauri, TmuxSessionInfo } from '../hooks/useTauri'

interface TmuxManagerDialogProps {
  isOpen: boolean
  onClose: () => void
  onRefresh?: () => void
}

export function TmuxManagerDialog({ isOpen, onClose, onRefresh }: TmuxManagerDialogProps) {
  const [sessions, setSessions] = useState<TmuxSessionInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmKillServer, setConfirmKillServer] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadSessions()
    }
  }, [isOpen])

  const loadSessions = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await tauri.getTmuxSessions()
      setSessions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleKillWindow = async (windowName: string) => {
    try {
      await tauri.killTmuxWindow(windowName)
      await loadSessions()
      onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleKillSession = async (sessionName: string) => {
    try {
      // Kill all windows in the session by killing the session
      const session = sessions.find(s => s.name === sessionName)
      if (session) {
        for (const window of session.windows) {
          await tauri.killTmuxWindow(window.name)
        }
      }
      await loadSessions()
      onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleKillServer = async () => {
    try {
      await tauri.killTmuxServer()
      setSessions([])
      setConfirmKillServer(false)
      onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setConfirmKillServer(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-testid="tmux-manager-dialog"
    >
      <div className="bg-surface-800 rounded-xl p-6 w-full max-w-2xl mx-4 shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold">Tmux Session Manager</h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-400 hover:text-text-200 transition-colors"
            data-testid="close-tmux-manager"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Confirm kill server dialog */}
        {confirmKillServer && (
          <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-yellow-400 mb-3">
                  This will kill ALL tmux sessions and windows. Are you sure?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleKillServer}
                    className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors text-sm font-medium"
                    data-testid="confirm-kill-server"
                  >
                    Yes, Kill Server
                  </button>
                  <button
                    onClick={() => setConfirmKillServer(false)}
                    className="px-3 py-1.5 bg-surface-700 text-text-300 rounded hover:bg-surface-600 transition-colors text-sm"
                    data-testid="cancel-kill-server"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="text-center py-8 text-text-400">
              Loading tmux sessions...
            </div>
          )}

          {!loading && sessions.length === 0 && (
            <div className="text-center py-8 text-text-400">
              No tmux sessions found. Create an environment to start one.
            </div>
          )}

          {!loading && sessions.length > 0 && (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.name}
                  className="border border-surface-600 rounded-lg p-4"
                  data-testid={`tmux-session-${session.name}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-purple-400" />
                      <h3 className="font-medium">{session.name}</h3>
                      <span className="text-xs text-text-400">
                        ({session.window_count} {session.window_count === 1 ? 'window' : 'windows'})
                      </span>
                    </div>
                    <button
                      onClick={() => handleKillSession(session.name)}
                      className="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-xs font-medium flex items-center gap-1"
                      title="Kill all windows in this session"
                      data-testid={`kill-session-${session.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                      Kill Session
                    </button>
                  </div>

                  {session.windows.length === 0 && (
                    <div className="text-sm text-text-500 italic">No windows in this session</div>
                  )}

                  <div className="space-y-2">
                    {session.windows.map((window) => (
                      <div
                        key={window.index}
                        className="flex items-center justify-between bg-surface-700/50 rounded p-2 text-sm"
                        data-testid={`tmux-window-${window.name}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-text-400 font-mono">{window.index}</span>
                          <span className={window.active ? 'text-purple-400 font-medium' : 'text-text-300'}>
                            {window.name}
                          </span>
                          {window.active && (
                            <span className="text-xs text-purple-400">(active)</span>
                          )}
                          <span className="text-xs text-text-500">
                            {window.panes} {window.panes === 1 ? 'pane' : 'panes'}
                          </span>
                        </div>
                        <button
                          onClick={() => handleKillWindow(window.name)}
                          className="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-xs font-medium flex items-center gap-1"
                          title="Kill this window"
                          data-testid={`kill-window-${window.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                          Kill
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-surface-600 flex justify-between items-center">
          <button
            onClick={loadSessions}
            disabled={loading}
            className="px-4 py-2 bg-surface-700 text-text-300 rounded-lg hover:bg-surface-600 transition-colors disabled:opacity-50"
            data-testid="refresh-tmux-sessions"
          >
            Refresh
          </button>
          <div className="flex gap-2">
            {sessions.length > 0 && (
              <button
                onClick={() => setConfirmKillServer(true)}
                disabled={loading}
                className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
                data-testid="kill-tmux-server-button"
              >
                Kill All Sessions
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
              data-testid="close-tmux-manager-button"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
