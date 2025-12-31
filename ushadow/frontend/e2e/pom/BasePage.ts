/**
 * BasePage - Base class for all Page Object Models.
 *
 * Provides common navigation and utility methods.
 */

import { type Page, type Locator } from '@playwright/test'

export abstract class BasePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /**
   * Navigate to this page's URL
   */
  abstract goto(): Promise<void>

  /**
   * Wait for the page to be fully loaded
   */
  abstract waitForLoad(): Promise<void>

  /**
   * Get a locator by data-testid
   */
  protected getByTestId(testId: string): Locator {
    return this.page.getByTestId(testId)
  }

  /**
   * Get a locator for a setting field by ID
   */
  protected getSettingField(id: string): Locator {
    return this.getByTestId(`setting-field-${id}`)
  }

  /**
   * Get a locator for a secret input by ID
   */
  protected getSecretInput(id: string): Locator {
    return this.getByTestId(`secret-input-${id}`)
  }

  /**
   * Get a locator for a settings section by ID
   */
  protected getSettingsSection(id: string): Locator {
    return this.getByTestId(`settings-section-${id}`)
  }

  /**
   * Fill a secret input field
   */
  async fillSecret(id: string, value: string): Promise<void> {
    const field = this.getByTestId(`secret-input-${id}-field`)
    await field.fill(value)
  }

  /**
   * Fill a text/url setting field
   */
  async fillSetting(id: string, value: string): Promise<void> {
    const input = this.getByTestId(`setting-field-${id}-input`)
    await input.fill(value)
  }

  /**
   * Select an option in a setting field
   */
  async selectSetting(id: string, value: string): Promise<void> {
    const select = this.getByTestId(`setting-field-${id}-select`)
    await select.selectOption(value)
  }

  /**
   * Toggle a setting switch
   */
  async toggleSetting(id: string): Promise<void> {
    const toggle = this.getByTestId(`setting-field-${id}-toggle`)
    await toggle.click()
  }

  /**
   * Toggle secret visibility
   */
  async toggleSecretVisibility(id: string): Promise<void> {
    const toggle = this.getByTestId(`secret-input-${id}-toggle`)
    await toggle.click()
  }
}
