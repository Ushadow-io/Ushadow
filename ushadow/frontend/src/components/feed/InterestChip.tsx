/**
 * InterestChip — clickable filter chip for a knowledge-graph interest.
 */

import type { FeedInterest } from '../../services/feedApi'

interface InterestChipProps {
  interest: FeedInterest
  active: boolean
  onClick: () => void
}

export default function InterestChip({ interest, active, onClick }: InterestChipProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        active
          ? 'bg-primary-600 text-white shadow-sm'
          : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600'
      }`}
      data-testid={`interest-chip-${interest.name.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <span>{interest.name}</span>
      <span className="opacity-60">({interest.relationship_count})</span>
    </button>
  )
}
