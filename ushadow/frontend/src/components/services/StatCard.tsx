/**
 * StatCard - Reusable stat display card
 */

interface StatCardProps {
  label: string
  value: number | string
  /** Color variant for the value text */
  variant?: 'default' | 'primary' | 'success' | 'info'
  testId?: string
}

export default function StatCard({ label, value, variant = 'default', testId }: StatCardProps) {
  const colorClass = {
    default: 'text-neutral-900 dark:text-neutral-100',
    primary: 'text-primary-600 dark:text-primary-400',
    success: 'text-success-600 dark:text-success-400',
    info: 'text-blue-600 dark:text-blue-400',
  }[variant]

  return (
    <div className="card-hover p-4" data-testid={testId}>
      <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
  )
}
