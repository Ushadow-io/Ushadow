/**
 * WizardProgress - Progress bar with optional step indicators.
 *
 * Shows a horizontal progress bar and optionally clickable step labels.
 * Supports three states for each step:
 * - Current: highlighted with primary color
 * - Completed: green with checkmark, clickable
 * - Future: grayed out, not clickable
 */

export interface WizardProgressProps {
  /** Progress percentage (0-100) */
  progress: number;
  /** Optional array of steps to show as labels below the bar */
  steps?: readonly { id: string; label: string }[];
  /** Current step id for highlighting */
  currentStepId?: string;
  /** Optional set of explicitly completed step IDs (for save-then-advance patterns) */
  completedSteps?: Set<string>;
  /** Callback when a step is clicked (only fires for completed/current steps) */
  onStepClick?: (stepId: string) => void;
}

export function WizardProgress({
  progress,
  steps,
  currentStepId,
  completedSteps,
  onStepClick,
}: WizardProgressProps) {
  const currentIndex = steps?.findIndex((s) => s.id === currentStepId) ?? -1;

  // Determine if a step is completed:
  // - If completedSteps is provided, use it (explicit tracking for save-then-advance)
  // - Otherwise, use index-based logic (visited = completed)
  const isStepCompleted = (step: { id: string }, index: number): boolean => {
    if (completedSteps) {
      return completedSteps.has(step.id);
    }
    return index < currentIndex;
  };

  return (
    <div id="wizard-progress" className="space-y-2">
      {/* Progress Bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          id="wizard-progress-bar"
          className="bg-primary-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      {/* Step Labels (optional) */}
      {steps && steps.length > 0 && (
        <div className="flex items-center justify-between text-xs">
          {steps.map((step, index) => {
            const isCurrent = step.id === currentStepId;
            const isCompleted = isStepCompleted(step, index);
            const isClickable = isCurrent || isCompleted;

            return (
              <button
                key={step.id}
                id={`wizard-step-${step.id}`}
                onClick={() => isClickable && onStepClick?.(step.id)}
                disabled={!isClickable}
                className={`
                  px-2 py-1 rounded transition-all
                  ${
                    isCurrent
                      ? 'text-primary-600 dark:text-primary-400 font-semibold bg-primary-50 dark:bg-primary-900/30'
                      : isCompleted
                        ? 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer'
                        : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  }
                `}
              >
                {isCompleted && <span className="mr-1">✓</span>}
                {step.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WizardProgress;
