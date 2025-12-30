/**
 * Shared wizard types for consistent wizard implementation across the app.
 *
 * Architecture:
 * - WizardStep: Definition of a single step in a wizard
 * - ServiceStatus: Backend-derived state for a configured service
 * - WizardMode: The overall setup approach (quickstart/local/custom)
 */

/** A single step in a wizard */
export interface WizardStep {
  id: string;
  label: string;
}

/** Extended step with component reference for dynamic rendering */
export interface WizardStepWithComponent<TData = unknown> extends WizardStep {
  component: React.ComponentType<WizardStepProps<TData>>;
  /** Optional validation before proceeding to next step */
  validate?: (data: TData) => boolean | Promise<boolean>;
}

/** Props passed to each wizard step component */
export interface WizardStepProps<TData = unknown> {
  data: TData;
  setData: (data: Partial<TData>) => void;
  onNext?: () => void;
  onBack?: () => void;
}

/** Service configuration status from backend */
export interface ServiceStatus {
  configured: boolean;
  running: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

/** Overall setup mode - determines which services are required/optional */
export type WizardMode = 'quickstart' | 'local' | 'custom' | null;

/** Configuration summary item for ConfiguredSummary component */
export interface ConfigSummaryItem {
  label: string;
  value: string | boolean | number;
  masked?: boolean;  // For sensitive values like API keys
}

/** Result from useWizardSteps hook */
export interface WizardStepsResult<T extends WizardStep> {
  currentIndex: number;
  currentStep: T;
  steps: readonly T[];
  next: () => void;
  back: () => void;
  goTo: (id: string) => void;
  isFirst: boolean;
  isLast: boolean;
  progress: number;
}
