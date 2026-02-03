import React, { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {  Copy, Check, Trash2 } from 'lucide-react'
import Modal from './Modal'
import { SettingField } from './settings/SettingField'
import ConfirmDialog from './ConfirmDialog'

interface ShareToken {
  token: string
  share_url: string
  resource_type: string
  resource_id: string
  permissions: string[]
  expires_at: string | null
  max_views: number | null
  view_count: number
  require_auth: boolean
  tailscale_only: boolean
  created_at: string
}

interface ShareDialogProps {
  isOpen: boolean
  onClose: () => void
  resourceType: 'conversation' | 'memory' | 'collection'
  resourceId: string
}

interface ShareFormData {
  expires_in_days: number | null
  max_views: number | null
  require_auth: boolean
  tailscale_only: boolean
  permissions: string[]
}

const ShareDialog: React.FC<ShareDialogProps> = ({
  isOpen,
  onClose,
  resourceType,
  resourceId,
}) => {
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [revokeToken, setRevokeToken] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { control, handleSubmit, reset } = useForm<ShareFormData>({
    defaultValues: {
      expires_in_days: 7,
      max_views: null,
      require_auth: false,
      tailscale_only: false,
      permissions: ['read'],
    },
  })

  // Fetch existing shares for this resource
  const { data: shares, isLoading: loadingShares } = useQuery<ShareToken[]>({
    queryKey: ['shares', resourceType, resourceId],
    queryFn: async () => {
      const response = await fetch(
        `/api/share/resource/${resourceType}/${resourceId}`,
        {
          credentials: 'include',
        }
      )
      if (!response.ok) {
        throw new Error('Failed to fetch shares')
      }
      return response.json()
    },
    enabled: isOpen,
  })

  // Create share token mutation
  const createShareMutation = useMutation({
    mutationFn: async (data: ShareFormData) => {
      const response = await fetch('/api/share/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          ...data,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to create share link')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares', resourceType, resourceId] })
      reset()
    },
  })

  // Revoke share token mutation
  const revokeShareMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch(`/api/share/${token}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to revoke share link')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares', resourceType, resourceId] })
      setRevokeToken(null)
    },
  })

  const handleCopyLink = async (shareUrl: string, token: string) => {
    await navigator.clipboard.writeText(shareUrl)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const handleCreateShare = handleSubmit(async (data) => {
    await createShareMutation.mutateAsync(data)
  })

  const handleRevokeShare = async () => {
    if (revokeToken) {
      await revokeShareMutation.mutateAsync(revokeToken)
    }
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Share ${resourceType}`}
        maxWidth="lg"
        testId="share-dialog"
      >
        <div className="space-y-6">
          {/* Create new share section */}
          <div className="border-b border-gray-200 dark:border-gray-700 pb-6">
            <h3
              className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4"
              data-testid="share-dialog-create-title"
            >
              Create New Share Link
            </h3>

            <form onSubmit={handleCreateShare} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Controller
                  name="expires_in_days"
                  control={control}
                  render={({ field }) => (
                    <SettingField
                      id="share-expires-in-days"
                      type="select"
                      label="Expires In"
                      value={field.value?.toString() || ''}
                      onChange={(v) => field.onChange(v ? Number(v) : null)}
                      options={[
                        { value: '', label: 'Never' },
                        { value: '1', label: '1 day' },
                        { value: '7', label: '7 days' },
                        { value: '30', label: '30 days' },
                        { value: '90', label: '90 days' },
                      ]}
                    />
                  )}
                />

                <Controller
                  name="max_views"
                  control={control}
                  render={({ field }) => (
                    <SettingField
                      id="share-max-views"
                      type="text"
                      label="Max Views"
                      placeholder="Unlimited"
                      value={field.value?.toString() || ''}
                      onChange={(v) => field.onChange(v ? Number(v) : null)}
                    />
                  )}
                />
              </div>

              <div className="space-y-2">
                <Controller
                  name="require_auth"
                  control={control}
                  render={({ field }) => (
                    <SettingField
                      id="share-require-auth"
                      type="toggle"
                      label="Require Authentication"
                      description="Users must log in to access"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />

                <Controller
                  name="tailscale_only"
                  control={control}
                  render={({ field }) => (
                    <SettingField
                      id="share-tailscale-only"
                      type="toggle"
                      label="Tailscale Only"
                      description="Only accessible from your Tailscale network"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>

              <button
                type="submit"
                disabled={createShareMutation.isPending}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="share-dialog-create-button"
              >
                {createShareMutation.isPending ? 'Creating...' : 'Create Share Link'}
              </button>

              {createShareMutation.isError && (
                <p className="text-sm text-red-600 dark:text-red-400" data-testid="share-dialog-error">
                  {createShareMutation.error?.message}
                </p>
              )}
            </form>
          </div>

          {/* Existing shares section */}
          <div>
            <h3
              className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4"
              data-testid="share-dialog-existing-title"
            >
              Existing Share Links
            </h3>

            {loadingShares ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">Loading shares...</p>
            ) : shares && shares.length > 0 ? (
              <div className="space-y-3" data-testid="share-dialog-existing-list">
                {shares.map((share) => (
                  <div
                    key={share.token}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2"
                    data-testid={`share-item-${share.token}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono text-gray-900 dark:text-gray-100 truncate">
                          {share.share_url}
                        </p>
                        <div className="flex gap-3 mt-1 text-xs text-gray-600 dark:text-gray-400">
                          <span>Views: {share.view_count}{share.max_views ? `/${share.max_views}` : ''}</span>
                          {share.expires_at && (
                            <span>
                              Expires: {new Date(share.expires_at).toLocaleDateString()}
                            </span>
                          )}
                          {share.tailscale_only && <span className="text-blue-600">Tailscale Only</span>}
                        </div>
                      </div>

                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleCopyLink(share.share_url, share.token)}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                          data-testid={`share-item-${share.token}-copy`}
                          title="Copy link"
                        >
                          {copiedToken === share.token ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          )}
                        </button>

                        <button
                          onClick={() => setRevokeToken(share.token)}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                          data-testid={`share-item-${share.token}-revoke`}
                          title="Revoke access"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="share-dialog-no-shares">
                No active share links. Create one above to get started.
              </p>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={revokeToken !== null}
        onClose={() => setRevokeToken(null)}
        onConfirm={handleRevokeShare}
        title="Revoke Share Link?"
        message="Anyone with this link will lose access immediately. This action cannot be undone."
        variant="danger"
        confirmText="Revoke Access"
        testId="share-dialog-revoke-confirm"
      />
    </>
  )
}

export default ShareDialog
