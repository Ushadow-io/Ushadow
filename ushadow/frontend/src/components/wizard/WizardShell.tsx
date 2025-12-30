import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { WizardProgress } from './WizardProgress';

/**
 * WizardShell - Consistent layout wrapper for all wizards.
 *
 * Implements the side arrow navigation pattern from CLAUDE.md:
 * - Back arrow on left (hidden on first step)
 * - Next arrow on right (blue, always visible unless explicitly hidden)
 * - Arrows positioned outside the card using translate-x-16
 *
 * @example
 * <WizardShell
 *   title="Configure Memory"
 *   subtitle="Set up your OpenMemory server"
 *   progress={wizard.progress}
 *   isFirstStep={wizard.isFirst}
 *   onBack={wizard.back}
 *   onNext={wizard.isLast ? handleComplete : wizard.next}
 *   nextDisabled={!isValid}
 *   nextLoading={isSaving}
 * >
 *   <YourStepContent />
 * </WizardShell>
 */

export interface WizardShellProps {
  /** Main title displayed at the top of the wizard */
  title: string;
  /** Optional subtitle/description below the title */
  subtitle?: string;
  /** Progress percentage (0-100) for the progress bar */
  progress: number;
  /** Callback for back button within wizard steps. */
  onBack?: () => void;
  /** Path to navigate when back is pressed on first step (e.g., '/wizard/start') */
  exitPath?: string;
  /** Whether this is the first step (used with exitPath) */
  isFirstStep?: boolean;
  /** Callback for next button. If undefined, next button is hidden. */
  onNext?: () => void;
  /** Disable the next button (e.g., validation not passed) */
  nextDisabled?: boolean;
  /** Show loading spinner on next button */
  nextLoading?: boolean;
  /** Optional step labels for the progress indicator */
  steps?: readonly { id: string; label: string }[];
  /** Current step id for highlighting in progress */
  currentStepId?: string;
  /** Optional callback when a step indicator is clicked */
  onStepClick?: (stepId: string) => void;
  /** Content to render inside the wizard card */
  children: ReactNode;
}

export function WizardShell({
  title,
  subtitle,
  progress,
  onBack,
  exitPath = '/wizard/start',
  isFirstStep = false,
  onNext,
  nextDisabled = false,
  nextLoading = false,
  steps,
  currentStepId,
  onStepClick,
  children,
}: WizardShellProps) {
  const navigate = useNavigate();

  // Back button always visible - navigates to exitPath on first step, calls onBack otherwise
  const handleBack = () => {
    if (isFirstStep) {
      navigate(exitPath);
    } else if (onBack) {
      onBack();
    }
  };

  // Show back button if: on first step with exitPath, or not first step with onBack
  const showBackButton = isFirstStep || onBack;

  return (
    <div id="wizard-container" className="max-w-4xl mx-auto">
      <div className="relative">
        {/* Back Arrow - Left Side (blue, always visible) */}
        {showBackButton && (
          <button
            id="wizard-back-button"
            onClick={handleBack}
            disabled={nextLoading}
            className="absolute left-0 top-32 -translate-x-16 w-12 h-12 rounded-full
                       bg-primary-600 hover:bg-primary-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center shadow-lg z-10
                       transition-colors"
            aria-label={isFirstStep ? "Back to Setup Wizard" : "Go back"}
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
        )}

        {/* Next Arrow - Right Side */}
        {onNext && (
          <button
            id="wizard-next-button"
            onClick={onNext}
            disabled={nextDisabled || nextLoading}
            className="absolute right-0 top-32 translate-x-16 w-12 h-12 rounded-full
                       bg-primary-600 hover:bg-primary-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center shadow-lg z-10
                       transition-colors"
            aria-label="Continue"
          >
            {nextLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            ) : (
              <ArrowRight className="w-6 h-6 text-white" />
            )}
          </button>
        )}

        {/* Main Card */}
        <div id="wizard-card" className="card">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 id="wizard-title" className="text-2xl font-bold text-gray-900 dark:text-white">
              {title}
            </h2>
            {subtitle && (
              <p id="wizard-subtitle" className="mt-2 text-gray-600 dark:text-gray-400">
                {subtitle}
              </p>
            )}
          </div>

          {/* Progress Bar */}
          <WizardProgress
            progress={progress}
            steps={steps}
            currentStepId={currentStepId}
            onStepClick={onStepClick}
          />

          {/* Content */}
          <div id="wizard-content" className="mt-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WizardShell;
