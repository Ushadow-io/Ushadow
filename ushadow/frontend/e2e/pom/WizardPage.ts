/**
 * WizardPage - Page Object Model for wizard flows.
 *
 * Provides methods for interacting with wizard UIs including:
 * - Step navigation
 * - Form filling
 * - Service configuration
 */

import { type Page, type Locator, expect } from '@playwright/test'
import { BasePage } from './BasePage'

export class WizardPage extends BasePage {
  readonly page: Page

  constructor(page: Page) {
    super(page)
    this.page = page
  }

  async goto(): Promise<void> {
    await this.page.goto('/wizard')
  }

  async waitForLoad(): Promise<void> {
    // Wait for wizard shell to be visible
    await this.page.locator('[data-testid^="wizard-"]').first().waitFor({ state: 'visible' })
  }

  // Navigation

  /**
   * Click the Next/Continue button
   */
  async next(): Promise<void> {
    const nextButton = this.page.getByRole('button', { name: /next|continue|save/i })
    await nextButton.click()
  }

  /**
   * Click the Back button
   */
  async back(): Promise<void> {
    const backButton = this.page.getByRole('button', { name: /back|previous/i })
    await backButton.click()
  }

  /**
   * Click the Skip button if available
   */
  async skip(): Promise<void> {
    const skipButton = this.page.getByRole('button', { name: /skip/i })
    await skipButton.click()
  }

  // Wizard-specific navigation

  /**
   * Start the Quickstart wizard
   */
  async startQuickstart(): Promise<void> {
    await this.page.goto('/wizard/quickstart')
  }

  /**
   * Start the Local Services wizard
   */
  async startLocalServices(): Promise<void> {
    await this.page.goto('/wizard/local-services')
  }

  /**
   * Start the Chronicle wizard
   */
  async startChronicle(): Promise<void> {
    await this.page.goto('/wizard/chronicle')
  }

  // Form filling

  /**
   * Fill an API key in a wizard form
   */
  async fillApiKey(keyName: string, value: string): Promise<void> {
    // Try secret input first, fall back to regular input
    const secretField = this.page.getByTestId(`secret-input-${keyName}-field`)
    if (await secretField.isVisible()) {
      await secretField.fill(value)
    } else {
      // Try by input name or label
      const input = this.page.locator(`input[name="${keyName}"], input[id="${keyName}"]`)
      await input.fill(value)
    }
  }

  /**
   * Fill a form field by name
   */
  async fillField(fieldName: string, value: string): Promise<void> {
    const input = this.page.locator(`input[name="${fieldName}"], input[id="${fieldName}"]`)
    await input.fill(value)
  }

  /**
   * Select a provider
   */
  async selectProvider(providerId: string): Promise<void> {
    const providerCard = this.page.getByTestId(`provider-card-${providerId}`)
    await providerCard.click()
  }

  // Step-specific locators

  /**
   * Get the Quickstart wizard API keys step
   */
  getQuickstartApiKeysStep() {
    return this.page.getByTestId('quickstart-step-api-keys')
  }

  /**
   * Get the Quickstart wizard start services step
   */
  getQuickstartStartServicesStep() {
    return this.page.getByTestId('quickstart-step-start-services')
  }

  /**
   * Get the Chronicle LLM step
   */
  getChronicleLlmStep() {
    return this.page.getByTestId('chronicle-step-llm')
  }

  /**
   * Get the Chronicle transcription step
   */
  getChronicleTranscriptionStep() {
    return this.page.getByTestId('chronicle-step-transcription')
  }

  /**
   * Get the Memory Neo4j step
   */
  getMemoryNeo4jStep() {
    return this.page.getByTestId('memory-step-neo4j')
  }

  // Status checking

  /**
   * Wait for a success message
   */
  async waitForSuccess(): Promise<void> {
    await this.page.locator('.text-green-600, .text-green-500, [class*="success"]').waitFor({ state: 'visible' })
  }

  /**
   * Wait for an error message
   */
  async waitForError(): Promise<void> {
    await this.page.locator('.text-red-600, .text-red-500, [class*="error"]').waitFor({ state: 'visible' })
  }

  /**
   * Check if wizard is on a specific step
   */
  async isOnStep(stepId: string): Promise<boolean> {
    // Check for step indicator or content
    const stepIndicator = this.page.locator(`[data-step="${stepId}"], [data-testid="step-${stepId}"]`)
    return await stepIndicator.isVisible()
  }

  // Assertions

  async expectOnStep(stepId: string): Promise<void> {
    const stepElement = this.page.locator(`[data-step="${stepId}"], [data-testid="step-${stepId}"]`)
    await expect(stepElement).toBeVisible()
  }

  async expectComplete(): Promise<void> {
    // Look for completion indicators
    const completeIndicator = this.page.locator('text=/complete|done|finished|success/i')
    await expect(completeIndicator).toBeVisible()
  }
}
