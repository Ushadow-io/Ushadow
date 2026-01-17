import React from 'react'

export type BadgeVariant = 'beta' | 'not-implemented' | 'needs-updating'

interface StatusBadgeProps {
  variant: BadgeVariant
  className?: string
  testId?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  'beta': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'not-implemented': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  'needs-updating': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const variantLabels: Record<BadgeVariant, string> = {
  'beta': 'Beta',
  'not-implemented': 'Not Implemented',
  'needs-updating': 'Needs Updating',
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ variant, className = '', testId }) => {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantStyles[variant]} ${className}`}
      data-testid={testId}
    >
      {variantLabels[variant]}
    </span>
  )
}
// Test change
