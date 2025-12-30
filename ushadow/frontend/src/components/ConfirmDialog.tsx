import { AlertTriangle, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isOpen) {
      // Focus the cancel button by default (safer)
      confirmButtonRef.current?.focus()
      
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
      
      // Handle Escape key
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onCancel()
        }
      }
      
      document.addEventListener('keydown', handleEscape)
      
      return () => {
        document.body.style.overflow = ''
        document.removeEventListener('keydown', handleEscape)
      }
    }
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const variantStyles = {
    danger: {
      icon: 'text-error-600 dark:text-error-400',
      button: 'bg-error-600 hover:bg-error-700 text-white'
    },
    warning: {
      icon: 'text-warning-600 dark:text-warning-400',
      button: 'bg-warning-600 hover:bg-warning-700 text-white'
    },
    info: {
      icon: 'text-primary-600 dark:text-primary-400',
      button: 'bg-primary-600 hover:bg-primary-700 text-white'
    }
  }

  const styles = variantStyles[variant]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className={`h-6 w-6 ${styles.icon}`} />
            <h2
              id="confirm-dialog-title"
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
          </button>
        </div>

        {/* Message */}
        <p
          id="confirm-dialog-description"
          className="text-neutral-600 dark:text-neutral-400 mb-6"
        >
          {message}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="btn-ghost"
            autoFocus
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg transition-colors ${styles.button}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
