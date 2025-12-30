import { useState, useCallback, useMemo } from 'react';
import type { WizardStep, WizardStepsResult } from '../types/wizard';

/**
 * Headless hook for managing wizard step navigation.
 *
 * This hook handles:
 * - Current step tracking
 * - Next/back/goTo navigation
 * - Progress calculation
 * - First/last step detection
 *
 * It does NOT handle:
 * - Form data (use useState or react-hook-form in your wizard)
 * - Validation (implement in your step components or wizard)
 * - Persistence (derive state from backend service status instead)
 *
 * @example
 * const steps = [
 *   { id: 'welcome', label: 'Welcome' },
 *   { id: 'config', label: 'Configuration' },
 *   { id: 'complete', label: 'Complete' },
 * ];
 *
 * function MyWizard() {
 *   const wizard = useWizardSteps(steps);
 *
 *   return (
 *     <WizardShell
 *       title={wizard.currentStep.label}
 *       progress={wizard.progress}
 *       onBack={wizard.isFirst ? undefined : wizard.back}
 *       onNext={wizard.isLast ? handleComplete : wizard.next}
 *     >
 *       {wizard.currentStep.id === 'welcome' && <WelcomeStep />}
 *       {wizard.currentStep.id === 'config' && <ConfigStep />}
 *       {wizard.currentStep.id === 'complete' && <CompleteStep />}
 *     </WizardShell>
 *   );
 * }
 */
export function useWizardSteps<T extends WizardStep>(
  steps: readonly T[],
  initialStepId?: string
): WizardStepsResult<T> {
  const initialIndex = initialStepId
    ? Math.max(0, steps.findIndex((s) => s.id === initialStepId))
    : 0;

  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const next = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [steps.length]);

  const back = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback(
    (id: string) => {
      const idx = steps.findIndex((s) => s.id === id);
      if (idx >= 0) {
        setCurrentIndex(idx);
      }
    },
    [steps]
  );

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === steps.length - 1;

  // Progress as percentage (0-100)
  const progress = useMemo(() => {
    if (steps.length <= 1) return 100;
    return Math.round(((currentIndex + 1) / steps.length) * 100);
  }, [currentIndex, steps.length]);

  return {
    currentIndex,
    currentStep: steps[currentIndex],
    steps,
    next,
    back,
    goTo,
    isFirst,
    isLast,
    progress,
  };
}

export default useWizardSteps;
