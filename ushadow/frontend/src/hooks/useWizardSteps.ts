import { useState, useCallback, useMemo } from 'react';
import type { WizardStep, UseWizardStepsReturn } from '../types/wizard';

/**
 * useWizardSteps - Hook for managing wizard step navigation.
 *
 * Provides state and navigation methods for multi-step wizard flows.
 * Works with WizardShell and WizardProgress components.
 *
 * @example
 * const STEPS = [
 *   { id: 'welcome', label: 'Welcome' },
 *   { id: 'config', label: 'Configuration' },
 *   { id: 'complete', label: 'Complete' },
 * ] as const;
 *
 * function MyWizard() {
 *   const wizard = useWizardSteps(STEPS);
 *
 *   return (
 *     <WizardShell
 *       title={wizard.currentStep.label}
 *       progress={wizard.progress}
 *       isFirstStep={wizard.isFirst}
 *       onBack={wizard.back}
 *       onNext={wizard.isLast ? handleComplete : wizard.next}
 *     >
 *       {wizard.currentStep.id === 'welcome' && <WelcomeStep />}
 *       {wizard.currentStep.id === 'config' && <ConfigStep />}
 *       {wizard.currentStep.id === 'complete' && <CompleteStep />}
 *     </WizardShell>
 *   );
 * }
 */
export function useWizardSteps<T extends readonly WizardStep[]>(
  steps: T,
  initialStepId?: string
): UseWizardStepsReturn<T> {
  // Find initial index
  const initialIndex = initialStepId
    ? Math.max(0, steps.findIndex((s) => s.id === initialStepId))
    : 0;

  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Derived values
  const currentStep = steps[currentIndex] as T[number];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === steps.length - 1;
  const progress = steps.length > 1 ? (currentIndex / (steps.length - 1)) * 100 : 100;

  // Navigation methods
  const next = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, steps.length - 1));
  }, [steps.length]);

  const back = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goTo = useCallback(
    (stepId: string) => {
      const index = steps.findIndex((s) => s.id === stepId);
      if (index >= 0) {
        setCurrentIndex(index);
      }
    },
    [steps]
  );

  const reset = useCallback(() => {
    setCurrentIndex(0);
  }, []);

  // Memoize the return object to prevent unnecessary re-renders
  return useMemo(
    () => ({
      steps,
      currentStep,
      currentIndex,
      progress,
      isFirst,
      isLast,
      next,
      back,
      goTo,
      reset,
    }),
    [steps, currentStep, currentIndex, progress, isFirst, isLast, next, back, goTo, reset]
  );
}

export default useWizardSteps;
