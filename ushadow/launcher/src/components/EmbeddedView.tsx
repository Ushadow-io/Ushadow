import { X, ExternalLink, RefreshCw, ArrowLeft } from 'lucide-react'
import { tauri } from '../hooks/useTauri'

interface EmbeddedViewProps {
  url: string
  envName: string
  envColor?: string
  onClose: () => void
}

export function EmbeddedView({ url, envName, envColor, onClose }: EmbeddedViewProps) {
  const handleOpenExternal = () => {
    tauri.openBrowser(url)
  }

  const handleRefresh = () => {
    const iframe = document.getElementById('embedded-iframe') as HTMLIFrameElement
    if (iframe) {
      iframe.src = iframe.src
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
          <span className="text-xs text-text-muted truncate max-w-[300px]">{url}</span>
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
        <iframe
          id="embedded-iframe"
          src={url}
          className="absolute inset-0 w-full h-full border-0"
          title={`${envName} environment`}
          data-testid="embedded-iframe"
        />
      </div>
    </div>
  )
}
