import { useTheme } from '../../contexts/ThemeContext';

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
  const { isDark } = useTheme();
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
      <div
        className="w-full rounded-full h-2"
        style={{ backgroundColor: isDark ? 'var(--surface-600)' : '#e4e4e7' }}
      >
        <div
          id="wizard-progress-bar"
          className="h-2 rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
            backgroundImage: 'linear-gradient(135deg, #4ade80 0%, #a855f7 100%)',
          }}
        />
      </div>

      {/* Step Labels (optional) */}
      {steps && steps.length > 0 && (
        <div className="flex items-center justify-between text-xs">
          {steps.map((step, index) => {
            const isCurrent = step.id === currentStepId;
            const isCompleted = isStepCompleted(step, index);
            const isClickable = isCurrent || isCompleted;

            const getStepStyles = () => {
              if (isCurrent) {
                return {
                  color: '#4ade80',
                  backgroundColor: isDark ? 'rgba(74, 222, 128, 0.15)' : 'rgba(74, 222, 128, 0.1)',
                  fontWeight: 600,
                };
              }
              if (isCompleted) {
                return {
                  color: '#4ade80',
                  cursor: 'pointer',
                };
              }
              return {
                color: isDark ? 'var(--surface-400)' : '#a1a1aa',
                cursor: 'not-allowed',
              };
            };

            return (
              <button
                key={step.id}
                id={`wizard-step-${step.id}`}
                onClick={() => isClickable && onStepClick?.(step.id)}
                disabled={!isClickable}
                className="px-2 py-1 rounded transition-all"
                style={getStepStyles()}
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
