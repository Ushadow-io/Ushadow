/**
 * Wizard Framework Types
 *
 * Shared type definitions for the wizard component system.
 */

/**
 * Represents a single step in a wizard flow.
 */
export interface WizardStep {
  /** Unique identifier for the step (used for navigation and routing) */
  id: string;
  /** Human-readable label displayed in progress indicators */
  label: string;
}

/**
 * Item displayed in the ConfiguredSummary component.
 * Shows current configuration values when a service is already set up.
 */
export interface ConfigSummaryItem {
  /** Label for the configuration item (e.g., "Server URL", "API Key") */
  label: string;
  /** The value to display - can be string, number, or boolean */
  value: string | number | boolean;
  /** If true, value is partially hidden (for sensitive data like API keys) */
  masked?: boolean;
}

/**
 * Return type for the useWizardSteps hook.
 */
export interface UseWizardStepsReturn<T extends readonly WizardStep[]> {
  /** All steps in the wizard */
  steps: T;
  /** Current step object */
  currentStep: T[number];
  /** Current step index (0-based) */
  currentIndex: number;
  /** Progress percentage (0-100) */
  progress: number;
  /** Whether currently on the first step */
  isFirst: boolean;
  /** Whether currently on the last step */
  isLast: boolean;
  /** Navigate to next step */
  next: () => void;
  /** Navigate to previous step */
  back: () => void;
  /** Navigate to a specific step by ID */
  goTo: (stepId: string) => void;
  /** Reset to first step */
  reset: () => void;
}
