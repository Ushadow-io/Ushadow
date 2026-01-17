/**
 * E2E Tests: Memory Feedback
 *
 * Generated from: specs/features/memory-feedback.testcases.md
 *
 * Test Cases Covered:
 * - TC-MF-017: User Marks Memory as True
 * - TC-MF-018: User Provides Correction
 * - TC-MF-019: Cancel Correction Modal
 */

import { test, expect } from '@playwright/test'

test.describe('Memory Feedback', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Login and navigate to memories page
    await page.goto('/login')
    await page.fill('[data-testid="email-field"]', 'test@example.com')
    await page.fill('[data-testid="password-field"]', 'testpass123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/memories')
  })

  /**
   * TC-MF-017: User Marks Memory as True
   *
   * Priority: Critical
   * Requires Secrets: No
   */
  test('TC-MF-017: user can mark memory as true', async ({ page }) => {
    // Given: Memory is visible
    const memory = page.locator('[data-testid="memory-item"]').first()
    await expect(memory).toBeVisible()

    // When: User clicks True button
    await memory.locator('[data-testid="memory-feedback-true"]').click()

    // Then: Success feedback shown
    await expect(page.locator('[data-testid="feedback-success-toast"]')).toBeVisible()
    await expect(page.locator('[data-testid="feedback-success-toast"]')).toContainText(
      'Feedback submitted'
    )

    // And: Button state updates
    const trueButton = memory.locator('[data-testid="memory-feedback-true"]')
    await expect(trueButton).toHaveClass(/active|selected/)
  })

  /**
   * TC-MF-018: User Provides Correction
   *
   * Priority: Critical
   * Requires Secrets: No
   */
  test('TC-MF-018: user can provide correction', async ({ page }) => {
    // Given: Memory is visible
    const memory = page.locator('[data-testid="memory-item"]').first()
    const originalText = await memory.locator('[data-testid="memory-text"]').textContent()

    // When: User clicks Almost button
    await memory.locator('[data-testid="memory-feedback-almost"]').click()

    // Then: Correction modal opens
    const modal = page.locator('[data-testid="correction-modal"]')
    await expect(modal).toBeVisible()

    // And: Original text is displayed
    const displayedOriginal = await modal.locator('[data-testid="original-text"]').textContent()
    expect(displayedOriginal).toContain(originalText)

    // When: User enters correction
    const correctionText = 'The meeting was on Tuesday, not Monday'
    await modal.locator('[data-testid="correction-text-field"]').fill(correctionText)

    // And: User clicks Submit
    await modal.locator('[data-testid="correction-submit"]').click()

    // Then: Success message shown
    await expect(page.locator('[data-testid="feedback-success-toast"]')).toBeVisible()

    // And: Modal closes
    await expect(modal).not.toBeVisible()

    // And: Memory status may update
    // (Status update depends on backend calculation, just verify no error)
    await expect(page.locator('[data-testid="error-toast"]')).not.toBeVisible()
  })

  /**
   * TC-MF-019: Cancel Correction Modal
   *
   * Priority: Medium
   * Requires Secrets: No
   */
  test('TC-MF-019: user can cancel correction modal', async ({ page }) => {
    // Given: Memory is visible
    const memory = page.locator('[data-testid="memory-item"]').first()

    // When: User clicks Almost button
    await memory.locator('[data-testid="memory-feedback-almost"]').click()

    // Then: Modal opens
    const modal = page.locator('[data-testid="correction-modal"]')
    await expect(modal).toBeVisible()

    // When: User types some text
    await modal
      .locator('[data-testid="correction-text-field"]')
      .fill('Some partial correction')

    // And: User clicks Cancel
    await modal.locator('[data-testid="correction-cancel"]').click()

    // Then: Modal closes
    await expect(modal).not.toBeVisible()

    // And: No API request was made (verify by checking no success toast)
    await expect(page.locator('[data-testid="feedback-success-toast"]')).not.toBeVisible()

    // And: Memory state unchanged (Almost button still clickable)
    await expect(memory.locator('[data-testid="memory-feedback-almost"]')).toBeVisible()
  })

  /**
   * Additional test: Verify data-testid attributes exist
   */
  test('all required test IDs are present', async ({ page }) => {
    const memory = page.locator('[data-testid="memory-item"]').first()
    await expect(memory).toBeVisible()

    // Verify all feedback buttons have test IDs
    await expect(memory.locator('[data-testid="memory-feedback-true"]')).toBeVisible()
    await expect(memory.locator('[data-testid="memory-feedback-false"]')).toBeVisible()
    await expect(memory.locator('[data-testid="memory-feedback-almost"]')).toBeVisible()

    // Open modal to verify its test IDs
    await memory.locator('[data-testid="memory-feedback-almost"]').click()
    const modal = page.locator('[data-testid="correction-modal"]')

    await expect(modal.locator('[data-testid="original-text"]')).toBeVisible()
    await expect(modal.locator('[data-testid="correction-text-field"]')).toBeVisible()
    await expect(modal.locator('[data-testid="correction-submit"]')).toBeVisible()
    await expect(modal.locator('[data-testid="correction-cancel"]')).toBeVisible()
  })
})
