/**
 * BasePage - Base class for all Page Object Models.
 *
 * Provides common navigation and utility methods.
 * Uses testid patterns from ui-contract.ts for consistency.
 */

import { type Page, type Locator } from '@playwright/test'
import {
  secretInput,
  settingField,
  settingsSection,
  envVarEditor,
  modal,
} from '../../src/testing/ui-contract'

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

  // ===========================================================================
  // Setting Field helpers (uses ui-contract patterns)
  // ===========================================================================

  protected getSettingField(id: string): Locator {
    return this.getByTestId(settingField.container(id))
  }

  async fillSetting(id: string, value: string): Promise<void> {
    const input = this.getByTestId(settingField.input(id))
    await input.fill(value)
  }

  async selectSetting(id: string, value: string): Promise<void> {
    const select = this.getByTestId(settingField.select(id))
    await select.selectOption(value)
  }

  async toggleSetting(id: string): Promise<void> {
    const toggle = this.getByTestId(settingField.toggle(id))
    await toggle.click()
  }

  // ===========================================================================
  // Secret Input helpers (uses ui-contract patterns)
  // ===========================================================================

  protected getSecretInput(id: string): Locator {
    return this.getByTestId(secretInput.container(id))
  }

  async fillSecret(id: string, value: string): Promise<void> {
    const field = this.getByTestId(secretInput.field(id))
    await field.fill(value)
  }

  async toggleSecretVisibility(id: string): Promise<void> {
    const toggle = this.getByTestId(secretInput.toggle(id))
    await toggle.click()
  }

  // ===========================================================================
  // Settings Section helpers (uses ui-contract patterns)
  // ===========================================================================

  protected getSettingsSection(id: string): Locator {
    return this.getByTestId(settingsSection.container(id))
  }

  // ===========================================================================
  // Env Var Editor helpers (uses ui-contract patterns)
  // ===========================================================================

  protected getEnvVarEditor(varName: string): Locator {
    return this.getByTestId(envVarEditor.container(varName))
  }

  async fillEnvVarValue(varName: string, value: string): Promise<void> {
    const input = this.getByTestId(envVarEditor.valueInput(varName))
    await input.fill(value)
  }

  async selectEnvVarMapping(varName: string, settingPath: string): Promise<void> {
    // First click the Map button to show the dropdown
    const mapBtn = this.getByTestId(envVarEditor.mapButton(varName))
    await mapBtn.click()
    // Then select the setting
    const select = this.getByTestId(envVarEditor.mapSelect(varName))
    await select.selectOption(settingPath)
  }

  // ===========================================================================
  // Modal helpers (uses ui-contract patterns)
  // ===========================================================================

  protected getModal(id: string): Locator {
    return this.getByTestId(modal.container(id))
  }

  async closeModal(id: string): Promise<void> {
    const closeBtn = this.getByTestId(modal.close(id))
    await closeBtn.click()
  }

  async clickModalBackdrop(id: string): Promise<void> {
    const backdrop = this.getByTestId(modal.backdrop(id))
    await backdrop.click()
  }
}
