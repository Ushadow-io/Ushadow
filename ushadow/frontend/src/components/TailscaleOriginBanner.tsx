import { useState, useEffect } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { api } from '../services/api'

interface TailscaleStatus {
  authenticated: boolean
  hostname: string | null
}

/**
 * Shows a banner when user is on localhost but Tailscale is configured.
 * Suggests switching to the Tailscale URL for consistent auth across devices.
 */
export default function TailscaleOriginBanner() {
  const [show, setShow] = useState(false)
  const [tailscaleHostname, setTailscaleHostname] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    checkOriginMismatch()
  }, [])

  const checkOriginMismatch = async () => {
    // Check if user dismissed this session
    if (dismissed) return

    // Only show on localhost/127.0.0.1
    const isLocalhost = window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1'
    if (!isLocalhost) return

    try {
      // Check if Tailscale is configured
      const response = await api.get<TailscaleStatus>('/api/tailscale/container/status')

      if (response.data.authenticated && response.data.hostname) {
        setTailscaleHostname(response.data.hostname)
        setShow(true)
      }
    } catch (error) {
      // Tailscale not configured or error - don't show banner
      console.debug('Tailscale status check failed:', error)
    }
  }

  const handleSwitchToTailscale = () => {
    if (!tailscaleHostname) return

    // Transfer to Tailscale URL, preserving the current path
    const tailscaleUrl = `https://${tailscaleHostname}${window.location.pathname}${window.location.search}`
    window.location.href = tailscaleUrl
  }

  const handleDismiss = () => {
    setDismissed(true)
    setShow(false)
  }

  if (!show || !tailscaleHostname) return null

  return (
    <div
      className="bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-primary-900/20 dark:to-indigo-900/20 border-b border-primary-200 dark:border-primary-800"
      data-testid="tailscale-origin-banner"
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <ExternalLink className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-primary-900 dark:text-primary-100">
                <span className="font-semibold">Tailscale is configured.</span>{' '}
                Switch to <code className="px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/40 rounded font-mono text-xs">
                  https://{tailscaleHostname}
                </code> for secure access from any device.
              </p>
              <p className="text-xs text-primary-700 dark:text-primary-300 mt-0.5">
                Your auth token on localhost won't work on the Tailscale URL (browser security).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSwitchToTailscale}
              className="btn-primary text-sm px-3 py-1.5 flex items-center gap-2"
              data-testid="switch-to-tailscale"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Switch Now
            </button>
            <button
              onClick={handleDismiss}
              className="p-1.5 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded"
              aria-label="Dismiss"
              data-testid="dismiss-banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
