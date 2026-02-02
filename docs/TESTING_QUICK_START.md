# Testing Quick Start Guide

Quick reference for running tests in the Ushadow platform.

## Backend Tests (Pytest)

### Setup

```bash
cd ushadow/backend

# Install test dependencies (first time only)
pip install -e ".[dev]"
```

### Run Tests

```bash
# Run all tests
pytest tests/

# Run with coverage
pytest tests/ --cov=src --cov-report=html

# Run only unit tests
pytest tests/ -m unit

# Run only integration tests
pytest tests/ -m integration

# Run specific file
pytest tests/unit/test_services/test_auth_service.py

# Run verbose
pytest tests/ -v

# Run with output
pytest tests/ -s
```

### Common Markers

```bash
# Skip slow tests
pytest tests/ -m "not slow"

# Skip Docker-dependent tests
pytest tests/ -m "not requires_docker"

# Run only security tests (if marked)
pytest tests/ -m security
```

## Frontend Tests (Playwright)

### Setup

```bash
cd ushadow/frontend

# Install dependencies (first time only)
npm ci

# Install Playwright browsers (first time only)
npx playwright install --with-deps
```

### Run Tests

```bash
# Run all E2E tests
npm test

# Run in UI mode (recommended for development)
npm run test:ui

# Run in headed mode (see browser)
npm run test:headed

# Debug mode
npm run test:debug

# View test report
npm run test:report
```

### Run Specific Tests

```bash
# Run specific file
npx playwright test e2e/tests/auth.spec.ts

# Run by name pattern
npx playwright test -g "login"

# Run in specific browser
npx playwright test --project=chromium
```

## Test Structure

```
ushadow/
├── backend/tests/           # Backend tests
│   ├── unit/                # Fast, isolated tests
│   ├── integration/         # Tests with services
│   └── conftest.py          # Shared fixtures
│
└── frontend/e2e/            # Frontend tests
    ├── tests/               # Test files
    ├── pom/                 # Page Object Models
    └── fixtures/            # Test data
```

## Writing New Tests

### Backend (Pytest)

```python
# tests/unit/test_services/test_my_service.py
import pytest

@pytest.mark.unit
class TestMyService:
    def test_something(self):
        # Arrange
        service = MyService()

        # Act
        result = service.do_something()

        # Assert
        assert result == expected
```

### Frontend (Playwright)

```typescript
// e2e/tests/my-feature.spec.ts
import { test, expect } from '@playwright/test'

test.describe('My Feature', () => {
  test('should do something', async ({ page }) => {
    // Arrange
    await page.goto('/feature')

    // Act
    await page.getByTestId('my-button').click()

    // Assert
    await expect(page.getByTestId('result')).toBeVisible()
  })
})
```

## CI/CD Integration

Tests run automatically in CI on:
- Every push
- Every pull request
- Before merging to main

## Troubleshooting

### Backend: Import Errors
```bash
# Ensure backend src is in path
cd ushadow/backend
python -c "import sys; sys.path.insert(0, 'src'); import config"
```

### Frontend: Browser Not Installed
```bash
npx playwright install --with-deps
```

### Tests Fail Locally But Pass in CI
- Check if services are running
- Verify environment variables
- Clear caches

## Resources

- [Backend Test README](../ushadow/backend/tests/README.md)
- [Frontend E2E README](../ushadow/frontend/e2e/README.md)
- [Testing Strategy](./TESTING_STRATEGY.md)
- [Code Quality Report](./CODE_QUALITY_REPORT.md)
