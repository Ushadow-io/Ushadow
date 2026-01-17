import { test, expect } from '@playwright/test'

/**
 * Authentication Flow Tests
 *
 * Tests the login, logout, and authentication flows.
 */
test.describe('Authentication', () => {
  test('should display login page for unauthenticated users', async ({ page }) => {
    await page.goto('/')

    // Should redirect to login or show login form
    await expect(page).toHaveURL(/\/(login|auth)/)
  })

  test('should show login form elements', async ({ page }) => {
    await page.goto('/login')

    // Check for login form elements using data-testid
    await expect(page.getByTestId('login-form')).toBeVisible()
    await expect(page.getByTestId('field-email')).toBeVisible()
    await expect(page.getByTestId('field-password')).toBeVisible()
    await expect(page.getByTestId('login-submit')).toBeVisible()
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login')

    // Fill in invalid credentials
    await page.getByTestId('field-email').fill('invalid@example.com')
    await page.getByTestId('field-password').fill('wrongpassword')
    await page.getByTestId('login-submit').click()

    // Should show error message
    await expect(page.getByTestId('login-error')).toBeVisible()
  })

  test('should require email and password', async ({ page }) => {
    await page.goto('/login')

    // Try to submit without credentials
    await page.getByTestId('login-submit').click()

    // Should show validation errors
    await expect(page.getByText(/email.*required/i)).toBeVisible()
  })

  test.skip('should login successfully with valid credentials', async ({ page }) => {
    // TODO: Implement with test user credentials
    // This test is skipped until we have test environment setup
    await page.goto('/login')

    await page.getByTestId('field-email').fill(process.env.TEST_EMAIL || 'test@example.com')
    await page.getByTestId('field-password').fill(process.env.TEST_PASSWORD || 'password')
    await page.getByTestId('login-submit').click()

    // Should redirect to dashboard or home
    await expect(page).toHaveURL(/\/(dashboard|home)/)
  })

  test.skip('should logout successfully', async ({ page }) => {
    // TODO: Implement after login test is working
    // This requires authenticated state
  })
})
