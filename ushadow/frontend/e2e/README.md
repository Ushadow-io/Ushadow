# Frontend E2E Tests

End-to-end tests for the Ushadow frontend using Playwright.

## Directory Structure

```
e2e/
├── tests/               # Test files
│   ├── auth.spec.ts     # Authentication tests
│   ├── wizard.spec.ts   # Setup wizard tests
│   ├── settings.spec.ts # Settings management tests
│   └── ...
├── pom/                 # Page Object Models
│   ├── BasePage.ts      # Base page class
│   ├── WizardPage.ts    # Wizard page object
│   ├── SettingsPage.ts  # Settings page object
│   └── index.ts         # Export all POMs
├── fixtures/            # Test data and utilities
│   └── test-data.ts     # Centralized test data
├── playwright.config.ts # Playwright configuration
└── README.md           # This file
```

## Running Tests

### Install Dependencies

```bash
cd ushadow/frontend

# Install Playwright browsers (first time only)
npx playwright install --with-deps
```

### Run All Tests

```bash
# Run all tests in headless mode
npx playwright test

# Run with UI mode (recommended for development)
npx playwright test --ui

# Run in headed mode (see browser)
npx playwright test --headed
```

### Run Specific Tests

```bash
# Run specific test file
npx playwright test e2e/tests/auth.spec.ts

# Run tests matching pattern
npx playwright test auth

# Run single test
npx playwright test -g "should display login page"
```

### Run in Different Browsers

```bash
# Run in specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Run in all browsers
npx playwright test --project=chromium --project=firefox --project=webkit
```

### Debug Tests

```bash
# Debug mode with inspector
npx playwright test --debug

# Debug specific test
npx playwright test auth.spec.ts --debug

# Debug in UI mode
npx playwright test --ui
```

### View Test Report

```bash
# Generate and open HTML report
npx playwright show-report
```

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test'

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup before each test
    await page.goto('/feature')
  })

  test('should do something', async ({ page }) => {
    // Arrange
    const button = page.getByTestId('my-button')

    // Act
    await button.click()

    // Assert
    await expect(page.getByTestId('result')).toBeVisible()
  })
})
```

### Using Page Object Model

```typescript
import { test, expect } from '@playwright/test'
import { WizardPage } from '../pom/WizardPage'

test('should complete wizard', async ({ page }) => {
  const wizard = new WizardPage(page)

  await wizard.goto()
  await wizard.startQuickstart()
  await wizard.fillField('api-key', 'test-key')
  await wizard.next()

  await expect(wizard.successMessage).toBeVisible()
})
```

### Using data-testid Selectors

**IMPORTANT**: Always use `data-testid` attributes for selecting elements (per CLAUDE.md).

```typescript
// Good - Using data-testid
await page.getByTestId('login-submit').click()

// Bad - Using brittle selectors
await page.locator('button.primary').click()
await page.locator('#submit-btn').click()
```

### Stubbing API Responses

```typescript
import { createMockApiHandlers } from '../fixtures/test-data'

test('should handle API responses', async ({ page }) => {
  const mocks = createMockApiHandlers(page)

  // Mock API responses
  await mocks.mockHealthCheck()
  await mocks.mockServices()

  await page.goto('/')

  // Test with mocked data
  await expect(page.getByTestId('service-list')).toBeVisible()
})
```

## Test Data

Use centralized test data from `fixtures/test-data.ts`:

```typescript
import { testUsers, testApiKeys, stubbedResponses } from '../fixtures/test-data'

test('login test', async ({ page }) => {
  await page.fill('[data-testid="email"]', testUsers.admin.email)
  await page.fill('[data-testid="password"]', testUsers.admin.password)
})
```

## Best Practices

### 1. Use data-testid Attributes

Always add `data-testid` to interactive elements in your React components:

```tsx
<button data-testid="submit-button" onClick={handleClick}>
  Submit
</button>
```

Follow naming conventions from CLAUDE.md:
- Page container: `{page}-page`
- Tab buttons: `tab-{tabId}`
- Form fields: `{context}-field-{name}`
- Buttons: `{context}-{action}`

### 2. Write Independent Tests

Each test should be independent and not rely on other tests:

```typescript
// Good - Independent
test('should login', async ({ page }) => {
  await page.goto('/login')
  // ... test logic
})

// Bad - Dependent on previous test
test('should show dashboard after login', async ({ page }) => {
  // Assumes already logged in from previous test
})
```

### 3. Use beforeEach for Common Setup

```typescript
test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Common setup for all tests
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
  })

  test('test 1', async ({ page }) => {
    // Test starts at /settings
  })
})
```

### 4. Use Appropriate Assertions

```typescript
// Wait for element to be visible
await expect(page.getByTestId('result')).toBeVisible()

// Check text content
await expect(page.getByTestId('title')).toHaveText('Welcome')

// Check URL
await expect(page).toHaveURL('/dashboard')

// Check attribute
await expect(page.getByTestId('input')).toHaveAttribute('type', 'password')
```

### 5. Handle Async Operations

Playwright auto-waits for elements, but sometimes you need explicit waits:

```typescript
// Wait for navigation
await page.getByTestId('link').click()
await page.waitForURL('/new-page')

// Wait for network to be idle
await page.waitForLoadState('networkidle')

// Wait for specific element
await page.waitForSelector('[data-testid="loaded"]')
```

### 6. Test User Journeys, Not Implementation

```typescript
// Good - Tests user journey
test('user can complete checkout', async ({ page }) => {
  await page.goto('/shop')
  await page.getByTestId('add-to-cart').click()
  await page.getByTestId('checkout').click()
  await page.getByTestId('confirm-order').click()
  await expect(page.getByTestId('order-success')).toBeVisible()
})

// Bad - Tests implementation details
test('state updates correctly', async ({ page }) => {
  // Testing internal state
})
```

## Environment Variables

Set environment variables for tests:

```bash
# .env.test
FRONTEND_URL=http://localhost:3001
TEST_EMAIL=test@example.com
TEST_PASSWORD=test-password-123
```

Load in tests:

```typescript
const email = process.env.TEST_EMAIL || 'default@example.com'
```

## CI/CD Integration

Tests run in CI automatically. See `.github/workflows/test.yml` for configuration.

## Common Issues

### Tests Fail Locally But Pass in CI

- Check if services are running locally
- Verify environment variables
- Clear browser cache: `npx playwright clean`

### Flaky Tests

- Use Playwright's auto-waiting (avoid manual timeouts)
- Use `test.fail()` for known flaky tests
- Add retries in `playwright.config.ts`

### Slow Tests

- Use `test.slow()` to mark slow tests
- Run slow tests separately: `npx playwright test --grep-invert @slow`
- Use API to set up state instead of UI

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Page Object Model Guide](https://playwright.dev/docs/pom)
- [Test Data Management](https://playwright.dev/docs/test-fixtures)
