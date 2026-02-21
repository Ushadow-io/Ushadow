/**
 * Settings Components
 *
 * Reusable components for displaying and editing settings across the app:
 * - Wizard steps (QuickstartWizard, LocalServicesWizard, etc.)
 * - Settings page
 * - Service configuration panels
 *
 * All components use consistent data-testid attributes for Playwright testing.
 *
 * Test ID Conventions:
 * - secret-input-{id}           - SecretInput container
 * - secret-input-{id}-field     - The actual input element
 * - secret-input-{id}-toggle    - Show/hide visibility button
 * - setting-field-{id}          - SettingField container
 * - setting-field-{id}-input    - Text/URL input element
 * - setting-field-{id}-select   - Select dropdown element
 * - setting-field-{id}-toggle   - Toggle switch element
 * - settings-section-{id}       - SettingsSection container
 * - settings-section-{id}-title - Section title
 */

export { SecretInput, type SecretInputProps } from './SecretInput'
export { SettingField, type SettingFieldProps, type SettingType, type SelectOption } from './SettingField'
export { SettingsSection, type SettingsSectionProps } from './SettingsSection'
export { RequiredFieldsSection } from './RequiredFieldsSection'
export { UnifiedServiceSettings } from './UnifiedServiceSettings'
export { NetworkTab } from './NetworkTab'
