/**
 * FunnelRouteManager - Manage Tailscale Funnel routes for public access
 *
 * Allows adding, updating, and removing public routes on funnel-enabled unodes.
 * Routes are stored in service_configs.yaml for future deployments.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, ExternalLink, Copy, Check } from 'lucide-react'
import { deploymentsApi } from '../../services/api'
import type { Deployment } from '../../services/api'
import Modal from '../Modal'
import ConfirmDialog from '../ConfirmDialog'

interface FunnelRouteManagerProps {
  deployment: Deployment
  unodeFunnelEnabled: boolean
}

export default function FunnelRouteManager({ deployment, unodeFunnelEnabled }: FunnelRouteManagerProps) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [route, setRoute] = useState('')
  const [saveToConfig, setSaveToConfig] = useState(true)
  const [copied, setCopied] = useState(false)

  // Fetch current funnel configuration
  const { data: funnelConfig, isLoading } = useQuery({
    queryKey: ['funnel-config', deployment.id],
    queryFn: () => deploymentsApi.getFunnelConfiguration(deployment.id),
    enabled: unodeFunnelEnabled,
  })

  // Configure funnel route mutation
  const configureMutation = useMutation({
    mutationFn: ({ deploymentId, route, saveToConfig }: { deploymentId: string; route: string; saveToConfig: boolean }) =>
      deploymentsApi.configureFunnelRoute(deploymentId, route, saveToConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funnel-config', deployment.id] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      setIsEditing(false)
      setRoute('')
    },
  })

  // Remove funnel route mutation
  const removeMutation = useMutation({
    mutationFn: ({ deploymentId, saveToConfig }: { deploymentId: string; saveToConfig: boolean }) =>
      deploymentsApi.removeFunnelRoute(deploymentId, saveToConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funnel-config', deployment.id] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      setShowRemoveConfirm(false)
    },
  })

  const handleConfigure = () => {
    if (!route || !route.startsWith('/')) {
      return
    }
    configureMutation.mutate({
      deploymentId: deployment.id,
      route,
      saveToConfig,
    })
  }

  const handleRemove = () => {
    removeMutation.mutate({
      deploymentId: deployment.id,
      saveToConfig,
    })
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleStartEditing = () => {
    setRoute(funnelConfig?.route || '')
    setIsEditing(true)
  }

  if (!unodeFunnelEnabled) {
    return null
  }

  if (isLoading) {
    return (
      <div className="card p-4" data-testid="funnel-route-manager">
        <div className="animate-pulse">
          <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-32 mb-2" />
          <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded w-48" />
        </div>
      </div>
    )
  }

  const hasRoute = !!funnelConfig?.route
  const publicUrl = funnelConfig?.public_url

  return (
    <>
      <div className="card p-4" data-testid="funnel-route-manager">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary-500" />
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Public Access</h3>
          </div>
          {hasRoute ? (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400">
              Public
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
              Private
            </span>
          )}
        </div>

        {!hasRoute && !isEditing && (
          <div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
              This service is not publicly accessible. Only accessible within your Tailnet.
            </p>
            <button
              onClick={() => setIsEditing(true)}
              className="btn-primary"
              data-testid="funnel-make-public-btn"
            >
              Make Public
            </button>
          </div>
        )}

        {hasRoute && !isEditing && (
          <div>
            <div className="space-y-2 mb-3">
              <div>
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Route
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-sm font-mono text-neutral-900 dark:text-neutral-100">
                    {funnelConfig.route}
                  </code>
                </div>
              </div>

              {publicUrl && (
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Public URL
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-sm font-mono text-neutral-900 dark:text-neutral-100 truncate">
                      {publicUrl}
                    </code>
                    <button
                      onClick={() => handleCopy(publicUrl)}
                      className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                      title="Copy URL"
                      data-testid="funnel-copy-url-btn"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-success-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                      title="Open in new tab"
                      data-testid="funnel-open-url-btn"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleStartEditing}
                className="btn-secondary text-sm"
                data-testid="funnel-change-route-btn"
              >
                Change Route
              </button>
              <button
                onClick={() => setShowRemoveConfirm(true)}
                className="btn-secondary text-sm text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20"
                data-testid="funnel-remove-access-btn"
              >
                Remove Public Access
              </button>
            </div>
          </div>
        )}

        {isEditing && (
          <Modal
            isOpen={isEditing}
            onClose={() => setIsEditing(false)}
            title={hasRoute ? 'Change Public Route' : 'Configure Public Access'}
            maxWidth="md"
            testId="funnel-route-modal"
          >
            <div className="space-y-4">
              <div>
                <label htmlFor="funnel-route-input" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Public Path
                </label>
                <input
                  id="funnel-route-input"
                  type="text"
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                  placeholder="/myservice"
                  pattern="^/[a-z0-9-/]+$"
                  className="input w-full"
                  data-testid="funnel-route-input"
                />
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Service will be accessible at: <code className="font-mono">https://&lt;hostname&gt;{route || '/path'}</code>
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToConfig}
                  onChange={(e) => setSaveToConfig(e.target.checked)}
                  className="rounded border-neutral-300 dark:border-neutral-600"
                  data-testid="funnel-save-config-checkbox"
                />
                <span className="text-sm text-neutral-700 dark:text-neutral-300">
                  Save as default for this service
                </span>
              </label>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleConfigure}
                  disabled={!route || !route.startsWith('/') || configureMutation.isPending}
                  className="btn-primary flex-1"
                  data-testid="funnel-configure-btn"
                >
                  {configureMutation.isPending ? 'Configuring...' : (hasRoute ? 'Update Route' : 'Add Route')}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="btn-secondary"
                  data-testid="funnel-cancel-btn"
                >
                  Cancel
                </button>
              </div>

              {configureMutation.isError && (
                <div className="p-3 rounded bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800">
                  <p className="text-sm text-error-700 dark:text-error-400">
                    {configureMutation.error instanceof Error ? configureMutation.error.message : 'Failed to configure route'}
                  </p>
                </div>
              )}
            </div>
          </Modal>
        )}
      </div>

      <ConfirmDialog
        isOpen={showRemoveConfirm}
        onCancel={() => setShowRemoveConfirm(false)}
        onConfirm={handleRemove}
        title="Remove Public Access?"
        message="This will make the service private (Tailnet-only). The service will continue running but won't be accessible from the public internet."
        variant="warning"
        confirmLabel={removeMutation.isPending ? 'Removing...' : 'Remove Access'}
      />
    </>
  )
}
