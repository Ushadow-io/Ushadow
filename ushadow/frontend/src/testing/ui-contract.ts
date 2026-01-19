/**
 * UI Contract - Single source of truth for component testid patterns.
 *
 * This file defines the contract between:
 * - React components (which generate data-testid attributes)
 * - Playwright POMs (which locate elements by testid)
 * - Agent documentation (which references these patterns)
 *
 * If you change a pattern here, TypeScript will surface all breakages.
 */

// =============================================================================
// TESTID PATTERN BUILDERS
// =============================================================================

/**
 * Secret input component testid patterns.
 * Used by: SecretInput.tsx, BasePage.ts
 *
 * @example
 * // In React component:
 * <div data-testid={secretInput.container('api-key')}>
 *   <input data-testid={secretInput.field('api-key')} />
 *   <button data-testid={secretInput.toggle('api-key')} />
 * </div>
 *
 * @example
 * // In Playwright POM:
 * page.getByTestId(secretInput.field('api-key'))
 */
export const secretInput = {
  container: (id: string) => `secret-input-${id}`,
  field: (id: string) => `secret-input-${id}-field`,
  toggle: (id: string) => `secret-input-${id}-toggle`,
  error: (id: string) => `secret-input-${id}-error`,
} as const

/**
 * Setting field component testid patterns.
 * Used by: SettingField.tsx, BasePage.ts
 */
export const settingField = {
  container: (id: string) => `setting-field-${id}`,
  input: (id: string) => `setting-field-${id}-input`,
  select: (id: string) => `setting-field-${id}-select`,
  toggle: (id: string) => `setting-field-${id}-toggle`,
  error: (id: string) => `setting-field-${id}-error`,
  label: (id: string) => `setting-field-${id}-label`,
} as const

/**
 * Settings section component testid patterns.
 * Used by: SettingsSection.tsx
 */
export const settingsSection = {
  container: (id: string) => `settings-section-${id}`,
  header: (id: string) => `settings-section-${id}-header`,
  content: (id: string) => `settings-section-${id}-content`,
} as const

/**
 * Modal component testid patterns.
 * Used by: Modal.tsx
 */
export const modal = {
  overlay: (id: string) => `${id}-overlay`,
  container: (id: string) => `${id}-modal`,
  title: (id: string) => `${id}-title`,
  closeButton: (id: string) => `${id}-close`,
  content: (id: string) => `${id}-content`,
} as const

/**
 * Confirm dialog testid patterns.
 * Used by: ConfirmDialog.tsx
 */
export const confirmDialog = {
  container: (id: string) => `${id}-dialog`,
  title: (id: string) => `${id}-title`,
  message: (id: string) => `${id}-message`,
  confirmButton: (id: string) => `${id}-confirm`,
  cancelButton: (id: string) => `${id}-cancel`,
} as const

// =============================================================================
// PAGE-LEVEL PATTERNS
// =============================================================================

/**
 * Standard page container testid.
 * Convention: Every page has a root element with this testid.
 */
export const page = {
  container: (name: string) => `${name}-page`,
} as const

/**
 * Tab navigation patterns.
 */
export const tabs = {
  button: (id: string) => `tab-${id}`,
  panel: (id: string) => `tab-panel-${id}`,
} as const

/**
 * Wizard step patterns.
 */
export const wizard = {
  step: (wizardId: string, stepId: string) => `${wizardId}-step-${stepId}`,
  nextButton: (wizardId: string) => `${wizardId}-next`,
  backButton: (wizardId: string) => `${wizardId}-back`,
  submitButton: (wizardId: string) => `${wizardId}-submit`,
} as const

// =============================================================================
// ACTION BUTTON PATTERNS
// =============================================================================

/**
 * Standard action button pattern.
 * Use for any clickable action within a context.
 *
 * @example
 * <button data-testid={actionButton('settings', 'save')}>Save</button>
 * // Results in: "settings-save"
 */
export const actionButton = (context: string, action: string) =>
  `${context}-${action}` as const

// =============================================================================
// COMPONENT REGISTRY
// =============================================================================

/**
 * Component registry - documents available components and their usage.
 *
 * TODO: You need to decide how detailed this registry should be.
 * See the function stub below.
 */
export interface ComponentInfo {
  /** Import path using @/ alias */
  import: string
  /** Brief description */
  description: string
  /** Which testid pattern object to use */
  testIdPattern: string
  /** Key props that must be provided */
  requiredProps: string[]
}

/**
 * Registry of reusable components.
 *
 * This serves as both documentation and a programmatic lookup.
 * Agents can read this to discover available components.
 */
export const componentRegistry: Record<string, ComponentInfo> = {
  // TODO: You'll implement the registry entries below
}

// =============================================================================
// YOUR DECISION POINT
// =============================================================================

/**
 * getComponentUsageExample - Generates a code example for using a component.
 *
 * This function helps agents understand how to use a component correctly.
 * The question is: how much detail should the example include?
 *
 * Option A: Minimal - just the import and basic JSX
 * Option B: Full - includes react-hook-form Controller wrapper pattern
 * Option C: Contextual - returns different examples based on a 'context' param
 *
 * @param componentName - Name from componentRegistry (e.g., 'SecretInput')
 * @param id - The id that will be used for the component instance
 * @returns A string containing a code example
 */
export function getComponentUsageExample(
  componentName: string,
  id: string
): string {
  // TODO: Implement this function
  // Consider:
  // - Should examples show standalone usage or form-integrated usage?
  // - Should examples include error handling patterns?
  // - How verbose should examples be for agent consumption?
  //
  // The trade-off: More detailed examples = better agent output,
  // but also more tokens consumed when agents read this file.

  throw new Error('Not implemented - see TODO above')
}
