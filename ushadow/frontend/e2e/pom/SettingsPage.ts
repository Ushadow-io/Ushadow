/**
 * SettingsPage - Page Object Model for the Settings page.
 *
 * Provides methods for interacting with the settings UI including:
 * - Tab navigation (API Keys, Providers, Service Config)
 * - API key management
 * - Provider selection viewing
 * - Reset functionality
 */

import { type Page, type Locator, expect } from '@playwright/test'
import { BasePage } from './BasePage'

export class SettingsPage extends BasePage {
  // Page locators
  readonly page: Page
  readonly pageContainer: Locator
  readonly refreshButton: Locator
  readonly resetButton: Locator

  // Tab locators
  readonly apiKeysTab: Locator
  readonly providersTab: Locator
  readonly serviceConfigTab: Locator

  // Tab content locators
  readonly apiKeysContent: Locator
  readonly providersContent: Locator
  readonly serviceConfigContent: Locator

  constructor(page: Page) {
    super(page)
    this.page = page

    // Main page elements
    this.pageContainer = this.getByTestId('settings-page')
    this.refreshButton = this.getByTestId('refresh-settings')
    this.resetButton = this.getByTestId('reset-settings')

    // Tabs
    this.apiKeysTab = this.getByTestId('tab-api-keys')
    this.providersTab = this.getByTestId('tab-providers')
    this.serviceConfigTab = this.getByTestId('tab-service-config')

    // Tab content
    this.apiKeysContent = this.getByTestId('api-keys-tab')
    this.providersContent = this.getByTestId('providers-tab')
    this.serviceConfigContent = this.getByTestId('service-config-tab')
  }

  async goto(): Promise<void> {
    await this.page.goto('/settings')
  }

  async waitForLoad(): Promise<void> {
    await this.pageContainer.waitFor({ state: 'visible' })
  }

  // Tab navigation

  async goToApiKeysTab(): Promise<void> {
    await this.apiKeysTab.click()
    await this.apiKeysContent.waitFor({ state: 'visible' })
  }

  async goToProvidersTab(): Promise<void> {
    await this.providersTab.click()
    await this.providersContent.waitFor({ state: 'visible' })
  }

  async goToServiceConfigTab(): Promise<void> {
    await this.serviceConfigTab.click()
    await this.serviceConfigContent.waitFor({ state: 'visible' })
  }

  // API Keys

  /**
   * Get an API key row by name
   */
  getApiKeyRow(keyName: string): Locator {
    return this.getByTestId(`api-key-${keyName}`)
  }

  /**
   * Toggle API key visibility
   */
  async toggleApiKeyVisibility(keyName: string): Promise<void> {
    const toggle = this.getByTestId(`toggle-visibility-${keyName}`)
    await toggle.click()
  }

  /**
   * Check if an API key is configured
   */
  async hasApiKey(keyName: string): Promise<boolean> {
    const row = this.getApiKeyRow(keyName)
    return await row.isVisible()
  }

  // Providers

  /**
   * Get a provider row by capability
   */
  getProviderRow(capability: string): Locator {
    return this.getByTestId(`provider-${capability}`)
  }

  /**
   * Get the selected provider for a capability
   */
  async getSelectedProvider(capability: string): Promise<string | null> {
    const row = this.getProviderRow(capability)
    if (!(await row.isVisible())) {
      return null
    }
    const providerText = await row.locator('.font-mono').textContent()
    return providerText
  }

  // Service Config

  /**
   * Get a service config section
   */
  getServiceConfig(serviceId: string): Locator {
    return this.getByTestId(`service-config-${serviceId}`)
  }

  // Actions

  async refresh(): Promise<void> {
    await this.refreshButton.click()
    // Wait for loading to complete
    await this.page.waitForLoadState('networkidle')
  }

  async reset(): Promise<void> {
    await this.resetButton.click()
    // Confirm in modal
    await this.page.getByRole('button', { name: 'Reset' }).click()
    await this.page.waitForLoadState('networkidle')
  }

  // Assertions

  async expectApiKeyConfigured(keyName: string): Promise<void> {
    const row = this.getApiKeyRow(keyName)
    await expect(row).toBeVisible()
  }

  async expectNoApiKeys(): Promise<void> {
    const emptyMessage = this.apiKeysContent.locator('text=No API keys saved yet')
    await expect(emptyMessage).toBeVisible()
  }
}
