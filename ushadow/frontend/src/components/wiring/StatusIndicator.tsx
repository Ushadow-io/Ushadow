import { AlertCircle, Settings } from 'lucide-react'

export function StatusIndicator({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300">
          <span className="h-1.5 w-1.5 rounded-full bg-success-500 animate-pulse" />
          Running
        </span>
      )
    case 'configured':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300">
          <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
          Ready
        </span>
      )
    case 'needs_setup':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300">
          <Settings className="h-3 w-3" />
          Setup
        </span>
      )
    case 'stopped':
    case 'not_running':
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
          Stopped
        </span>
      )
    case 'error':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-300">
          <AlertCircle className="h-3 w-3" />
          Error
        </span>
      )
    default:
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
          {status}
        </span>
      )
  }
}
