import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Loader2, AlertCircle, LucideIcon } from 'lucide-react';
import { WizardProgress } from './WizardProgress';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Message type for success/error/info banners
 */
export interface WizardMessage {
  type: 'success' | 'error' | 'info';
  text: string;
}

/**
 * WizardShell - Consistent layout wrapper for all wizards.
 *
 * Implements the side arrow navigation pattern from CLAUDE.md:
 * - Back arrow on left (always visible, navigates to exitPath on first step)
 * - Next arrow on right (blue, always visible unless explicitly hidden)
 * - Arrows positioned outside the card using translate-x-16
 *
 * @example
 * <WizardShell
 *   wizardId="tailscale"
 *   title="Tailscale Setup"
 *   subtitle="Seamless HTTPS access"
 *   icon={Shield}
 *   progress={wizard.progress}
 *   isFirstStep={wizard.isFirst}
 *   onBack={wizard.back}
 *   onNext={handleNext}
 *   nextDisabled={!canProceed()}
 *   nextLoading={loading}
 *   message={message}
 *   headerActions={<button onClick={skip}>Skip</button>}
 * >
 *   <YourStepContent />
 * </WizardShell>
 */

export interface WizardShellProps {
  /** Unique identifier for this wizard (used for element IDs) */
  wizardId?: string;
  /** Main title displayed at the top of the wizard */
  title: string;
  /** Optional subtitle/description below the title */
  subtitle?: string;
  /** Optional icon component to display next to the title */
  icon?: LucideIcon;
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
  /** Optional set of explicitly completed step IDs */
  completedSteps?: Set<string>;
  /** Optional message to display (success/error/info banner) */
  message?: WizardMessage | null;
  /** Optional actions to render in the header (e.g., Skip button) */
  headerActions?: ReactNode;
  /** Content to render inside the wizard card */
  children: ReactNode;
}

export function WizardShell({
  wizardId = 'wizard',
  title,
  subtitle,
  icon: Icon,
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
  completedSteps,
  message,
  headerActions,
  children,
}: WizardShellProps) {
  const navigate = useNavigate();
  const { isDark } = useTheme();

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

  // Message styling based on type
  const getMessageStyles = (type: 'success' | 'error' | 'info') => {
    switch (type) {
      case 'success':
        return {
          backgroundColor: 'rgba(74, 222, 128, 0.1)',
          border: '1px solid rgba(74, 222, 128, 0.3)',
          color: '#4ade80',
        };
      case 'error':
        return {
          backgroundColor: 'rgba(248, 113, 113, 0.1)',
          border: '1px solid rgba(248, 113, 113, 0.3)',
          color: '#f87171',
        };
      case 'info':
        return {
          backgroundColor: 'rgba(96, 165, 250, 0.1)',
          border: '1px solid rgba(96, 165, 250, 0.3)',
          color: '#60a5fa',
        };
    }
  };

  return (
    <div id={`${wizardId}-container`} className="max-w-4xl mx-auto">
      <div className="relative">
        {/* Back Arrow - Left Side (green, always visible) */}
        {showBackButton && (
          <button
            id={`${wizardId}-back-button`}
            onClick={handleBack}
            disabled={nextLoading}
            className="absolute left-0 top-32 -translate-x-16 w-12 h-12 rounded-full
                       disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center shadow-lg z-10
                       transition-all hover:scale-105"
            style={{
              backgroundColor: '#4ade80',
              boxShadow: isDark ? '0 0 20px rgba(74, 222, 128, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
            aria-label={isFirstStep ? "Back to Setup Wizard" : "Go back"}
          >
            <ArrowLeft className="w-6 h-6" style={{ color: isDark ? '#0f0f13' : '#ffffff' }} />
          </button>
        )}

        {/* Next Arrow - Right Side (purple) */}
        {onNext && (
          <button
            id={`${wizardId}-next-button`}
            onClick={onNext}
            disabled={nextDisabled || nextLoading}
            className="absolute right-0 top-32 translate-x-16 w-12 h-12 rounded-full
                       disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center shadow-lg z-10
                       transition-all hover:scale-105"
            style={{
              backgroundColor: '#a855f7',
              boxShadow: isDark ? '0 0 20px rgba(168, 85, 247, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
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
        <div
          id={`${wizardId}-card`}
          className="rounded-xl"
          style={{
            backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
            border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
            boxShadow: isDark
              ? '0 4px 6px rgba(0, 0, 0, 0.4)'
              : '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Header */}
          <div
            className="p-8"
            style={{
              borderBottom: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {Icon && <Icon className="w-8 h-8" style={{ color: '#4ade80' }} />}
                <h1
                  id={`${wizardId}-title`}
                  className="text-2xl font-semibold"
                  style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                >
                  {title}
                </h1>
              </div>
              {headerActions && (
                <div className="flex items-center gap-2">
                  {headerActions}
                </div>
              )}
            </div>
            {subtitle && (
              <p
                id={`${wizardId}-subtitle`}
                style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
              >
                {subtitle}
              </p>
            )}

            {/* Progress Bar */}
            <div className="mt-6">
              <WizardProgress
                progress={progress}
                steps={steps}
                currentStepId={currentStepId}
                completedSteps={completedSteps}
                onStepClick={onStepClick}
              />
            </div>
          </div>

          {/* Message Banner */}
          {message && (
            <div
              id={`${wizardId}-message`}
              className="p-4 mx-8 mt-4 rounded-lg flex items-center gap-2"
              style={getMessageStyles(message.type)}
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{message.text}</span>
            </div>
          )}

          {/* Content */}
          <div id={`${wizardId}-content`} className="p-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WizardShell;
