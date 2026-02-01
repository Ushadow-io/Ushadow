/**
 * SlideOutPanel - Panel that slides in from the right side
 *
 * Used for creating/editing configurations without leaving the current page.
 */

import { ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface SlideOutPanelProps {
  isOpen: boolean
  onClose: () => void
  title?: ReactNode
  titleIcon?: ReactNode
  children: ReactNode
  width?: 'sm' | 'md' | 'lg'
  testId?: string
  /** Optional footer content (e.g., action buttons) */
  footer?: ReactNode
}

const widthClasses = {
  sm: 'w-80',   // 320px
  md: 'w-96',   // 384px ~400px
  lg: 'w-[480px]',
}

/**
 * SlideOutPanel component that renders using React Portal.
 * Slides in from the right side of the screen.
 */
export default function SlideOutPanel({
  isOpen,
  onClose,
  title,
  titleIcon,
  children,
  width = 'md',
  testId = 'slide-out-panel',
  footer,
}: SlideOutPanelProps) {
  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const panelContent = (
    <div
      className="fixed inset-0 z-[9999] flex justify-end"
      data-testid={testId}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        data-testid={`${testId}-backdrop`}
      />

      {/* Panel */}
      <div
        className={`
          relative ${widthClasses[width]} h-full bg-white dark:bg-neutral-800
          shadow-2xl flex flex-col
          animate-slide-in-right
        `}
        data-testid={`${testId}-content`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-3">
            {titleIcon}
            {title && (
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                {title}
              </h2>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
            data-testid={`${testId}-close`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  // Render portal to document body
  return createPortal(panelContent, document.body)
}
