import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import Modal from './Modal'

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
  const variantConfig = {
    danger: {
      icon: AlertCircle,
      iconClass: 'text-red-500',
      buttonClass: 'bg-red-600 hover:bg-red-700 text-white',
    },
    warning: {
      icon: AlertTriangle,
      iconClass: 'text-amber-500',
      buttonClass: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
    info: {
      icon: Info,
      iconClass: 'text-green-500',
      buttonClass: 'bg-green-600 hover:bg-green-700 text-white',
    },
  }

  const config = variantConfig[variant]
  const IconComponent = config.icon

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      maxWidth="sm"
      testId="confirm-dialog"
    >
      <div className="flex items-start gap-4">
        <div className={`flex-shrink-0 ${config.iconClass}`}>
          <IconComponent className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3
            className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            data-testid="confirm-dialog-title"
          >
            {title}
          </h3>
          <p
            className="mt-2 text-sm text-neutral-600 dark:text-neutral-400"
            data-testid="confirm-dialog-message"
          >
            {message}
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-300 dark:hover:bg-neutral-600"
          data-testid="confirm-dialog-cancel"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${config.buttonClass}`}
          data-testid="confirm-dialog-confirm"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
