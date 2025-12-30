import { AlertCircle, X } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { isDark } = useTheme()

  if (!isOpen) return null

  const variantStyles = {
    danger: {
      iconColor: '#f87171',
      buttonBg: '#dc2626',
      buttonHoverBg: '#b91c1c',
    },
    warning: {
      iconColor: '#fbbf24',
      buttonBg: '#d97706',
      buttonHoverBg: '#b45309',
    },
    info: {
      iconColor: '#4ade80',
      buttonBg: '#4ade80',
      buttonHoverBg: '#22c55e',
    },
  }

  const styles = variantStyles[variant]

  return (
    <div
      id="confirm-dialog-overlay"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        id="confirm-dialog"
        className="rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        style={{
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
          border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0" style={{ color: styles.iconColor }}>
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3
              id="confirm-dialog-title"
              className="text-lg font-semibold"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              {title}
            </h3>
            <p
              id="confirm-dialog-message"
              className="mt-2 text-sm"
              style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
            >
              {message}
            </p>
          </div>
          <button
            id="confirm-dialog-close"
            onClick={onCancel}
            className="flex-shrink-0 transition-colors"
            style={{ color: isDark ? 'var(--surface-400)' : '#a1a1aa' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            id="confirm-dialog-cancel"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{
              backgroundColor: isDark ? 'var(--surface-600)' : '#e4e4e7',
              color: isDark ? 'var(--text-primary)' : '#0f0f13',
            }}
          >
            {cancelLabel}
          </button>
          <button
            id="confirm-dialog-confirm"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors text-white"
            style={{
              backgroundColor: styles.buttonBg,
              color: variant === 'info' ? '#0f0f13' : '#ffffff',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
