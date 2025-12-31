/**
 * Page Object Models for Playwright E2E tests.
 *
 * Usage:
 * ```typescript
 * import { SettingsPage, WizardPage } from './pom'
 *
 * test('configure API keys', async ({ page }) => {
 *   const settings = new SettingsPage(page)
 *   await settings.goto()
 *   await settings.waitForLoad()
 *
 *   await settings.goToApiKeysTab()
 *   await settings.expectApiKeyConfigured('openai_api_key')
 * })
 *
 * test('complete quickstart wizard', async ({ page }) => {
 *   const wizard = new WizardPage(page)
 *   await wizard.startQuickstart()
 *
 *   await wizard.fillApiKey('openai_api_key', 'sk-test-key')
 *   await wizard.next()
 *   await wizard.waitForSuccess()
 * })
 * ```
 *
 * Test ID Conventions:
 * - settings-page                    - Main settings page container
 * - tab-{tabId}                      - Tab buttons
 * - api-key-{keyName}                - API key rows
 * - toggle-visibility-{keyName}      - API key visibility toggles
 * - provider-{capability}            - Provider rows
 * - service-config-{serviceId}       - Service config sections
 * - secret-input-{id}                - Secret input containers
 * - setting-field-{id}               - Setting field containers
 * - settings-section-{id}            - Setting section containers
 */

export { BasePage } from './BasePage'
export { SettingsPage } from './SettingsPage'
export { WizardPage } from './WizardPage'
