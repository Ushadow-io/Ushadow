import { useState } from 'react'

export interface UseShareOptions {
  resourceType: 'conversation' | 'memory' | 'collection'
  resourceId: string
}

export interface UseShareReturn {
  isShareDialogOpen: boolean
  openShareDialog: () => void
  closeShareDialog: () => void
  resourceType: 'conversation' | 'memory' | 'collection'
  resourceId: string
}

/**
 * Hook for managing share dialog state.
 *
 * Usage:
 * ```tsx
 * const shareProps = useShare({
 *   resourceType: 'conversation',
 *   resourceId: conversationId
 * })
 *
 * <button onClick={shareProps.openShareDialog}>Share</button>
 * <ShareDialog {...shareProps} />
 * ```
 */
export function useShare({ resourceType, resourceId }: UseShareOptions): UseShareReturn {
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)

  return {
    isShareDialogOpen,
    openShareDialog: () => setIsShareDialogOpen(true),
    closeShareDialog: () => setIsShareDialogOpen(false),
    resourceType,
    resourceId,
  }
}
