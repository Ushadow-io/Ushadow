import { Terminal } from 'lucide-react'
import { getColors } from '../utils/colors'

interface EnvironmentBadgeProps {
  name: string
  variant?: 'badge' | 'label' | 'text'
  showIcon?: boolean
  className?: string
  testId?: string
}

/**
 * Reusable component for displaying environment names with consistent color styling.
 * Uses the getColors() utility to map environment names to their theme colors.
 */
export function EnvironmentBadge({
  name,
  variant = 'badge',
  showIcon = true,
  className = '',
  testId,
}: EnvironmentBadgeProps) {
  const colors = getColors(name)

  // Badge variant: Small inline badge with background
  if (variant === 'badge') {
    return (
      <div
        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded font-medium ${className}`}
        style={{
          backgroundColor: `${colors.primary}20`,
          color: colors.primary,
        }}
        data-testid={testId}
      >
        {showIcon && <Terminal className="w-3 h-3" />}
        <span>{name}</span>
      </div>
    )
  }

  // Label variant: Larger text with icon, no background
  if (variant === 'label') {
    return (
      <div
        className={`flex items-center gap-2 text-lg font-semibold ${className}`}
        style={{ color: colors.primary }}
        data-testid={testId}
      >
        {showIcon && <Terminal className="w-5 h-5" />}
        <span>{name}</span>
      </div>
    )
  }

  // Text variant: Plain text with color, no background or icon
  return (
    <span
      className={`font-medium ${className}`}
      style={{ color: colors.primary }}
      data-testid={testId}
    >
      {name}
    </span>
  )
}
