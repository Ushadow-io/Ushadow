/**
 * Wizard Component Library
 *
 * A consistent framework for building multi-step wizards with:
 * - Side arrow navigation (per CLAUDE.md)
 * - Progress tracking
 * - Service-state-driven "already configured" views
 *
 * Usage:
 *
 * import { WizardShell, WizardProgress, ConfiguredSummary } from '@/components/wizard';
 * import { useWizardSteps } from '@/hooks/useWizardSteps';
 *
 * const steps = [
 *   { id: 'welcome', label: 'Welcome' },
 *   { id: 'config', label: 'Configuration' },
 *   { id: 'complete', label: 'Complete' },
 * ];
 *
 * function MyWizard() {
 *   const wizard = useWizardSteps(steps);
 *
 *   // Check if already configured (from backend)
 *   if (serviceStatus?.configured) {
 *     return <ConfiguredSummary title="My Service" items={...} />;
 *   }
 *
 *   return (
 *     <WizardShell
 *       title={wizard.currentStep.label}
 *       progress={wizard.progress}
 *       onBack={wizard.isFirst ? undefined : wizard.back}
 *       onNext={wizard.next}
 *     >
 *       {wizard.currentStep.id === 'welcome' && <WelcomeStep />}
 *       ...
 *     </WizardShell>
 *   );
 * }
 */

export { WizardShell } from './WizardShell';
export type { WizardShellProps, WizardMessage } from './WizardShell';

export { WizardProgress } from './WizardProgress';
export type { WizardProgressProps } from './WizardProgress';

export { ConfiguredSummary } from './ConfiguredSummary';
export type { ConfiguredSummaryProps } from './ConfiguredSummary';

export { ProviderSelector } from './ProviderSelector';
export type { ProviderSelectorProps } from './ProviderSelector';
