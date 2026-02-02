/**
 * MessageBanner - Alert banner for success/error messages
 */

import { AlertCircle, X } from 'lucide-react'

interface MessageBannerProps {
  type: 'success' | 'error'
  message: string
  onDismiss: () => void
  testId?: string
}

export default function MessageBanner({ type, message, onDismiss, testId }: MessageBannerProps) {
  const isSuccess = type === 'success'

  return (
    <div
      role="alert"
      className={`card p-4 border ${
        isSuccess
          ? 'bg-success-50 dark:bg-success-900/20 border-success-200 text-success-700'
          : 'bg-error-50 dark:bg-error-900/20 border-error-200 text-error-700'
      }`}
      data-testid={testId || 'message-banner'}
    >
      <div className="flex items-center space-x-2">
        <AlertCircle className="h-5 w-5" />
        <span>{message}</span>
        <button onClick={onDismiss} className="ml-auto">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
