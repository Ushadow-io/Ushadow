/**
 * EmptyState - Reusable empty state component for "no items" scenarios
 */

import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  subtitle?: string
  testId?: string
}

export default function EmptyState({ icon: Icon, title, subtitle, testId }: EmptyStateProps) {
  return (
    <div className="card p-8 text-center" data-testid={testId}>
      <Icon className="h-12 w-12 mx-auto text-neutral-400 mb-4" />
      <p className="text-neutral-600 dark:text-neutral-400">{title}</p>
      {subtitle && (
        <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-2">{subtitle}</p>
      )}
    </div>
  )
}
