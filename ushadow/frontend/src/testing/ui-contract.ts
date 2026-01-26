/**
 * UI Contract - Single source of truth for component testid patterns.
 *
 * This file defines the contract between:
 * - React components (which generate data-testid attributes)
 * - Playwright POMs (which locate elements by testid)
 * - AI agents (which reference these patterns when writing code)
 *
 * If you change a pattern here, TypeScript will surface breakages.
 *
 * @example
 * // In React component:
 * import { modal } from '@/testing/ui-contract'
 * <div data-testid={modal.container('my-modal')}>
 *
 * // In Playwright POM:
 * import { modal } from '../../src/testing/ui-contract'
 * page.getByTestId(modal.container('my-modal'))
 */

// =============================================================================
// MODAL
// =============================================================================

/**
 * Modal component - REQUIRED for all modal dialogs.
 *
 * Import: `import Modal from '@/components/Modal'`
 *
 * @example
 * <Modal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Confirm Action"
 *   maxWidth="sm"  // 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl'
 *   testId="confirm-delete"
 * >
 *   <p>Are you sure?</p>
 *   <button onClick={handleConfirm}>Yes</button>
 * </Modal>
 *
 * @forbidden Do NOT create custom modals with `fixed inset-0` divs.
 */
export const modal = {
  /** The root container: `data-testid="my-modal"` */
  container: (id: string) => id,
  /** Clickable backdrop: `data-testid="my-modal-backdrop"` */
  backdrop: (id: string) => `${id}-backdrop`,
  /** Inner content wrapper: `data-testid="my-modal-content"` */
  content: (id: string) => `${id}-content`,
  /** Close X button: `data-testid="my-modal-close"` */
  close: (id: string) => `${id}-close`,
} as const

// =============================================================================
// SERVICE CARD
// =============================================================================

/**
 * ServiceCard component - Displays a service with status, toggle, and config.
 *
 * Import: `import { ServiceCard } from '@/components/services/ServiceCard'`
 *
 * @example
 * <ServiceCard
 *   service={service}
 *   config={serviceConfigs[service.service_id]}
 *   containerStatus={serviceStatuses[service.service_id]}
 *   isExpanded={expandedConfigs.has(service.service_id)}
 *   isEditing={editingService === service.service_id}
 *   editForm={editForm}
 *   validationErrors={validationErrors}
 *   isSaving={saving}
 *   isStarting={startingService === service.service_id}
 *   isTogglingEnabled={togglingEnabled === service.service_id}
 *   onToggleExpand={() => toggleExpanded(service.service_id)}
 *   onStart={() => startService(service.service_id)}
 *   onStop={() => stopService(service.service_id)}
 *   onToggleEnabled={() => toggleEnabled(service.service_id)}
 *   onStartEdit={() => startEditing(service.service_id)}
 *   onSave={() => saveConfig(service.service_id)}
 *   onCancelEdit={cancelEditing}
 *   onFieldChange={setEditFormField}
 *   onRemoveField={removeField}
 * />
 *
 * @note Currently uses `id=` instead of `data-testid=` - migration pending
 */
export const serviceCard = {
  /** Card container: `id="service-card-{serviceId}"` */
  container: (serviceId: string) => `service-card-${serviceId}`,
  /** Enable/disable toggle: `id="toggle-enabled-{serviceId}"` */
  toggleEnabled: (serviceId: string) => `toggle-enabled-${serviceId}`,
} as const

// =============================================================================
// ENV VAR EDITOR
// =============================================================================

/**
 * EnvVarEditor component - Edit environment variable mappings.
 *
 * Import: `import EnvVarEditor from '@/components/EnvVarEditor'`
 *
 * Used for:
 * - Docker service configuration (ServicesPage)
 * - K8s deployment configuration (DeployToK8sModal)
 * - Instance configuration (ServiceConfigsPage)
 *
 * @example
 * <EnvVarEditor
 *   envVar={envVarInfo}
 *   config={envVarConfig}
 *   onChange={(updates) => setConfig({ ...config, ...updates })}
 * />
 */
export const envVarEditor = {
  /** Row container: `data-testid="env-var-editor-{varName}"` */
  container: (varName: string) => `env-var-editor-${varName}`,
  /** Map to setting button: `data-testid="map-button-{varName}"` */
  mapButton: (varName: string) => `map-button-${varName}`,
  /** Setting path dropdown: `data-testid="map-select-{varName}"` */
  mapSelect: (varName: string) => `map-select-${varName}`,
  /** Value text input: `data-testid="value-input-{varName}"` */
  valueInput: (varName: string) => `value-input-${varName}`,
} as const

// =============================================================================
// FORM COMPONENTS (from settings/)
// =============================================================================

/**
 * SecretInput - API key/password input with visibility toggle.
 *
 * Import: `import { SecretInput } from '@/components/settings/SecretInput'`
 *
 * @example
 * // Standalone
 * <SecretInput
 *   id="openai-key"
 *   name="openaiKey"
 *   value={apiKey}
 *   onChange={setApiKey}
 *   error={errors.apiKey}
 * />
 *
 * @example
 * // With react-hook-form
 * <Controller
 *   name="apiKey"
 *   control={control}
 *   render={({ field }) => (
 *     <SecretInput id="api-key" {...field} error={errors.apiKey?.message} />
 *   )}
 * />
 */
export const secretInput = {
  container: (id: string) => `secret-input-${id}`,
  field: (id: string) => `secret-input-${id}-field`,
  toggle: (id: string) => `secret-input-${id}-toggle`,
  error: (id: string) => `secret-input-${id}-error`,
} as const

/**
 * SettingField - Generic setting field supporting multiple input types.
 *
 * Import: `import { SettingField } from '@/components/settings/SettingField'`
 *
 * @example
 * <SettingField
 *   id="endpoint-url"
 *   type="url"        // 'text' | 'secret' | 'url' | 'select' | 'toggle'
 *   label="API Endpoint"
 *   value={endpoint}
 *   onChange={setEndpoint}
 *   options={[]}      // Required for type="select"
 * />
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
 * SettingsSection - Container for grouping related settings.
 *
 * Import: `import { SettingsSection } from '@/components/settings/SettingsSection'`
 *
 * @example
 * <SettingsSection id="api-keys" title="API Keys" description="Configure your API keys">
 *   <SecretInput id="openai" ... />
 *   <SecretInput id="anthropic" ... />
 * </SettingsSection>
 */
export const settingsSection = {
  container: (id: string) => `settings-section-${id}`,
  header: (id: string) => `settings-section-${id}-header`,
  content: (id: string) => `settings-section-${id}-content`,
} as const

// =============================================================================
// PAGE-LEVEL PATTERNS
// =============================================================================

/**
 * Standard page container testid.
 * Every page should have a root element with this testid.
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
// GENERIC PATTERNS
// =============================================================================

/**
 * Confirm dialog patterns.
 * Use ConfirmDialog component from '@/components/ConfirmDialog'
 */
export const confirmDialog = {
  container: (id: string) => `${id}-dialog`,
  title: (id: string) => `${id}-title`,
  message: (id: string) => `${id}-message`,
  confirmButton: (id: string) => `${id}-confirm`,
  cancelButton: (id: string) => `${id}-cancel`,
} as const

/**
 * Action button pattern - for any clickable action within a context.
 *
 * @example
 * <button data-testid={actionButton('settings', 'save')}>Save</button>
 * // Results in: "settings-save"
 */
export const actionButton = (context: string, action: string) =>
  `${context}-${action}` as const
