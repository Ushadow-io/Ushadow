/**
 * Network Settings Tab
 *
 * Controls for Tailscale Funnel and network configuration
 */

import { useState, useEffect } from 'react'
import { Globe, Wifi, AlertCircle, CheckCircle, ExternalLink, Lock } from 'lucide-react'
import { api } from '../../services/api'

interface FunnelStatus {
  enabled: boolean
  port: number | null
  public_url: string | null
  error?: string
}

export function NetworkTab() {
  const [funnelStatus, setFunnelStatus] = useState<FunnelStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadFunnelStatus()
  }, [])

  const loadFunnelStatus = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get('/api/tailscale/funnel/status')
      setFunnelStatus(response.data)
    } catch (err: any) {
      console.error('Failed to load funnel status:', err)
      setError(err?.response?.data?.detail || 'Failed to load Tailscale Funnel status')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleFunnel = async () => {
    setToggling(true)
    setError(null)
    try {
      if (funnelStatus?.enabled) {
        // Disable funnel
        await api.post('/api/tailscale/funnel/disable')
      } else {
        // Enable funnel
        await api.post('/api/tailscale/funnel/enable')
      }
      // Reload status
      await loadFunnelStatus()
    } catch (err: any) {
      console.error('Failed to toggle funnel:', err)
      setError(err?.response?.data?.detail || 'Failed to toggle Tailscale Funnel')
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="network-tab">
      {/* Tailscale Funnel Section */}
      <div className="card p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Globe className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Tailscale Funnel
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Expose ushadow to the public internet for remote access
              </p>
            </div>
          </div>

          {funnelStatus && (
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
              funnelStatus.enabled
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {funnelStatus.enabled ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>Active</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Tailnet Only</span>
                </>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Funnel Status Details */}
        {funnelStatus?.enabled && funnelStatus.public_url && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-3">
              <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                  Public URL
                </p>
                <a
                  href={funnelStatus.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 break-all"
                >
                  {funnelStatus.public_url}
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                  This URL is accessible from anywhere on the internet
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Information Box */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div className="flex gap-3">
            <Wifi className="h-5 w-5 text-gray-600 dark:text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
              <p>
                <strong>Tailnet Only (Default):</strong> Only accessible via Tailscale VPN.
                Most secure, recommended for personal use.
              </p>
              <p>
                <strong>Funnel Enabled:</strong> Publicly accessible on the internet.
                Anyone with the URL can access (requires authentication). Use for sharing with people outside your Tailnet.
              </p>
            </div>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={handleToggleFunnel}
          disabled={toggling || !funnelStatus}
          className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
            funnelStatus?.enabled
              ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50'
              : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600'
          }`}
          data-testid="toggle-funnel-button"
        >
          {toggling ? (
            'Updating...'
          ) : funnelStatus?.enabled ? (
            'Disable Funnel (Restrict to Tailnet)'
          ) : (
            'Enable Funnel (Make Publicly Accessible)'
          )}
        </button>

        {/* Warning for public access */}
        {!funnelStatus?.enabled && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex gap-2 text-amber-800 dark:text-amber-300 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>
                Enabling Funnel will make your ushadow instance accessible to anyone on the internet.
                Ensure authentication is properly configured before enabling.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
