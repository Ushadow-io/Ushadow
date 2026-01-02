import { useNavigate } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import { getMainFlowWizards, getNextLevelWizard, type WizardMetadata } from '../../wizards/registry'

export interface WhatsNextProps {
  /** The level that was just completed */
  currentLevel: number
  /** Callback when user clicks "Go to Dashboard" */
  onGoHome?: () => void
  /** Override the default "Continue to Level X" action */
  onContinue?: () => void
}

/**
 * WhatsNext - Reusable completion component showing setup progress.
 *
 * Displays:
 * - Completed levels with checkmarks
 * - Current level as just completed
 * - Upcoming levels as pending
 * - Action buttons for next steps
 *
 * @example
 * <WhatsNext currentLevel={1} onGoHome={() => navigate('/')} />
 */
export function WhatsNext({ currentLevel, onGoHome, onContinue }: WhatsNextProps) {
  const navigate = useNavigate()
  const mainFlowWizards = getMainFlowWizards()
  const nextWizard = getNextLevelWizard(currentLevel)

  const handleContinue = () => {
    if (onContinue) {
      onContinue()
    } else if (nextWizard) {
      navigate(nextWizard.path)
    }
  }

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome()
    } else {
      navigate('/')
    }
  }

  return (
    <div data-testid="whats-next" className="space-y-6">
      {/* Level Progress */}
      <div className="p-6 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-200 dark:border-primary-800">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Setup Progress</h3>
        <ul className="text-left text-sm text-gray-700 dark:text-gray-300 space-y-2">
          {mainFlowWizards.map((wizard) => (
            <LevelItem
              key={wizard.id}
              wizard={wizard}
              currentLevel={currentLevel}
            />
          ))}
        </ul>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
        <button
          onClick={handleGoHome}
          data-testid="whats-next-go-home"
          className="btn-secondary px-6 py-3"
        >
          Go to Dashboard
        </button>
        {nextWizard && (
          <button
            onClick={handleContinue}
            data-testid="whats-next-continue"
            className="btn-primary px-6 py-3 flex items-center justify-center gap-2"
          >
            Continue to Level {nextWizard.level}
            <span className="text-xs opacity-75">({nextWizard.label})</span>
          </button>
        )}
      </div>
    </div>
  )
}

interface LevelItemProps {
  wizard: WizardMetadata
  currentLevel: number
}

function LevelItem({ wizard, currentLevel }: LevelItemProps) {
  const level = wizard.level ?? 0
  const isCompleted = level <= currentLevel
  const isCurrent = level === currentLevel

  return (
    <li
      data-testid={`whats-next-level-${level}`}
      className={`flex items-center gap-2 ${isCurrent ? 'font-medium' : ''}`}
    >
      {isCompleted ? (
        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
      ) : (
        <span className="w-4 h-4 rounded-full border-2 border-gray-400 flex-shrink-0" />
      )}
      <span>
        Level {level}: {wizard.label} {wizard.description}
        {wizard.completionMessage && isCompleted && (
          <span className="text-gray-500 dark:text-gray-400 ml-1">
            — {wizard.completionMessage}
          </span>
        )}
      </span>
    </li>
  )
}

export default WhatsNext
