import { useState, useEffect } from 'react'
import { X, ExternalLink, RefreshCw, ArrowLeft, Terminal, AlertCircle, Loader2 } from 'lucide-react'
import { tauri } from '../hooks/useTauri'

interface EmbeddedViewProps {
  url: string
  envName: string
  envColor?: string
  envPath: string | null
  onClose: () => void
}

export function EmbeddedView({ url, envName, envColor, envPath, onClose }: EmbeddedViewProps) {
  const [iframeError, setIframeError] = useState(false)
  const [iframeLoading, setIframeLoading] = useState(true)

  // Add launcher query param so frontend knows to hide footer
  // Add timestamp to force reload and avoid cookie conflicts
  const displayUrl = url
  const timestamp = Date.now()
  const iframeUrl = url
    ? url.includes('?')
      ? `${url}&launcher=true&_t=${timestamp}`
      : `${url}?launcher=true&_t=${timestamp}`
    : ''

  // Reset error state when environment changes
  useEffect(() => {
    setIframeError(false)
    setIframeLoading(true)
  }, [envName, iframeUrl])

  const handleIframeLoad = () => {
    console.log(`[EmbeddedView] Iframe loaded successfully for ${envName}`)
    setIframeLoading(false)
    setIframeError(false)

    // Notify the iframe to check for tokens (in case user logged in before opening this view)
    const iframe = document.getElementById('embedded-iframe') as HTMLIFrameElement
    if (iframe && iframe.contentWindow) {
      console.log('[EmbeddedView] Sending KC_TOKENS_UPDATED to newly loaded iframe')
      iframe.contentWindow.postMessage(
        { type: 'KC_TOKENS_UPDATED' },
        '*'
      )
    }
  }

  const handleIframeError = () => {
    console.error(`[EmbeddedView] Iframe failed to load for ${envName}`)
    setIframeLoading(false)
    setIframeError(true)
  }

  const handleOpenExternal = () => {
    tauri.openBrowser(displayUrl)
  }

  const handleRefresh = () => {
    const iframe = document.getElementById('embedded-iframe') as HTMLIFrameElement
    if (iframe) {
      iframe.src = iframe.src
    }
  }

  const handleOpenVscode = async () => {
    if (envPath) {
      await tauri.openInVscode(envPath, envName)
    }
  }

  const handleOpenTerminal = async () => {
    if (envPath) {
      // Pass empty window name — backend attaches to the session's current window
      await tauri.openTmuxInTerminal('', envPath, envName)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-900" data-testid="embedded-view">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-surface-800 border-b border-surface-700"
        style={{ borderLeftColor: envColor, borderLeftWidth: envColor ? '4px' : '0' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface-700 transition-colors text-text-muted hover:text-text-primary"
            title="Back to launcher"
            data-testid="embedded-view-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-text-primary">{envName}</span>
          <button
            onClick={handleOpenExternal}
            className="text-xs text-text-muted hover:text-primary-400 truncate max-w-[300px] transition-colors cursor-pointer underline decoration-dotted"
            title="Open in external browser"
            data-testid="embedded-view-url"
          >
            {displayUrl}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded hover:bg-surface-700 transition-colors text-text-muted hover:text-text-primary"
            title="Refresh"
            data-testid="embedded-view-refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* VSCode and Terminal buttons - only show if envPath exists */}
          {envPath && (
            <>
              <button
                onClick={handleOpenTerminal}
                className="p-1.5 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                title="Open in Terminal"
                data-testid="embedded-view-terminal"
              >
                <img src="/iterm-icon.png" alt="Terminal" className="w-4 h-4" />
              </button>
              <button
                onClick={handleOpenVscode}
                className="p-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                title="Open in VS Code"
                data-testid="embedded-view-vscode"
              >
                <img src="/vscode48.png" alt="VS Code" className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            onClick={handleOpenExternal}
            className="p-1.5 rounded hover:bg-surface-700 transition-colors text-text-muted hover:text-text-primary"
            title="Open in browser"
            data-testid="embedded-view-external"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface-700 transition-colors text-text-muted hover:text-text-primary"
            title="Close"
            data-testid="embedded-view-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* iframe container */}
      <div className="flex-1 relative">
        {iframeLoading && !iframeError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-900 z-10">
            <Loader2 className="w-16 h-16 text-primary-400 animate-spin mb-4" />
            <p className="text-lg font-semibold text-text-primary mb-2">Loading {envName}...</p>
            <p className="text-sm text-text-muted font-mono">{displayUrl}</p>
          </div>
        )}
        {iframeError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-900 z-10">
            <AlertCircle className="w-16 h-16 text-error-400 mb-4" />
            <p className="text-lg font-semibold text-text-primary mb-2">Failed to load {envName}</p>
            <p className="text-sm text-text-muted mb-4 font-mono">{displayUrl}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </button>
          </div>
        )}
        <iframe
          key={envName}
          id="embedded-iframe"
          src={iframeUrl}
          className="absolute inset-0 w-full h-full border-0"
          title={`${envName} environment`}
          data-testid="embedded-iframe"
          allow="microphone; camera; autoplay; clipboard-write"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
      </div>
    </div>
  )
}
