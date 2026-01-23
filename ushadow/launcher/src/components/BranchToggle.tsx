import { GitBranch } from 'lucide-react'
import type { BranchType } from '../store/appStore'

interface BranchToggleProps {
  activeBranch: BranchType
  onSwitch: (branch: BranchType) => void
  disabled?: boolean
}

export function BranchToggle({ activeBranch, onSwitch, disabled }: BranchToggleProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-4" data-testid="branch-toggle">
      <GitBranch className="w-4 h-4 text-text-muted" />
      <div className="flex rounded-lg bg-surface-800 p-1">
        <button
          onClick={() => onSwitch('main')}
          disabled={disabled}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeBranch === 'main'
              ? 'bg-gradient-brand text-white'
              : 'text-text-secondary hover:bg-surface-700'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          data-testid="branch-toggle-main"
        >
          Main
        </button>
        <button
          onClick={() => onSwitch('dev')}
          disabled={disabled}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeBranch === 'dev'
              ? 'bg-gradient-brand text-white'
              : 'text-text-secondary hover:bg-surface-700'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          data-testid="branch-toggle-dev"
        >
          Dev
        </button>
      </div>
    </div>
  )
}
