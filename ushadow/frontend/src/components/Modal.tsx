import { ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: ReactNode
  titleIcon?: ReactNode
  children: ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  testId?: string
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
}

/**
 * Modal component that renders using React Portal to ensure it appears
 * above all other content regardless of parent overflow settings.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  titleIcon,
  children,
  maxWidth = 'md',
  testId = 'modal',
}: ModalProps) {
  // Prevent body scroll when modal is open
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

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      data-testid={testId}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid={`${testId}-backdrop`}
      />

      {/* Modal content */}
      <div
        className={`relative bg-white dark:bg-neutral-800 rounded-lg ${maxWidthClasses[maxWidth]} w-full p-6 shadow-2xl max-h-[85vh] overflow-y-auto animate-fade-in`}
        data-testid={`${testId}-content`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
          data-testid={`${testId}-close`}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Title */}
        {title && (
          <div className="flex items-center space-x-3 mb-6">
            {titleIcon}
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              {title}
            </h2>
          </div>
        )}

        {children}
      </div>
    </div>
  )

  // Render portal to document body
  return createPortal(modalContent, document.body)
}
