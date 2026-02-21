import { useState } from 'react'

export interface UseShareOptions {
  resourceType: 'conversation' | 'memory' | 'collection'
  resourceId: string
}

export interface UseShareReturn {
  isOpen: boolean
  onClose: () => void
  openShareDialog: () => void
  resourceType: 'conversation' | 'memory' | 'collection'
  resourceId: string
}

/**
 * Hook for managing share dialog state.
 * Returns props compatible with ShareDialog component.
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
  const [isOpen, setIsOpen] = useState(false)

  return {
    isOpen,
    onClose: () => setIsOpen(false),
    openShareDialog: () => setIsOpen(true),
    resourceType,
    resourceId,
  }
}
