# Testing Strategy

This document outlines the comprehensive testing strategy for the UShadow project, including test level selection, categorization, and automation workflows.

## Table of Contents

1. [Test Pyramid](#test-pyramid)
2. [Test Level Decision Matrix](#test-level-decision-matrix)
3. [Test Categorization (Secrets vs No Secrets)](#test-categorization)
4. [Running Tests](#running-tests)
5. [CI/CD Integration](#cicd-integration)
6. [Frontend Testing with POM](#frontend-testing-with-pom)

## Test Pyramid

We follow the industry-standard 70/20/10 test distribution:

```
        ╱╲
       ╱  ╲  10% E2E Tests (Playwright)
      ╱────╲
     ╱      ╲  20% Integration/API Tests (Robot Framework + pytest)
    ╱────────╲
   ╱          ╲  70% Unit Tests (pytest)
  ╱────────────╲
```

**Why this distribution?**
- **Unit tests** are fast, isolated, and catch most bugs early
- **Integration tests** verify components work together correctly
- **E2E tests** validate critical user workflows end-to-end

## Test Level Decision Matrix

Use this decision tree when writing tests:

```
┌─────────────────────────────────────┐
│ What are you testing?               │
└──────────┬──────────────────────────┘
           │
           ├─→ Individual function/class logic?
           │   ✅ pytest (Unit Test)
           │   📁 Location: ushadow/backend/tests/test_*.py
           │   🏷️  Marker: @pytest.mark.unit @pytest.mark.no_secrets
           │
           ├─→ API endpoint behavior?
           │   ✅ Robot Framework (API Test)
           │   📁 Location: robot_tests/api/
           │   🔧 Uses: RequestsLibrary
           │   🏷️  Marker: requires_backend
           │
           ├─→ Service integration (DB, Redis, etc.)?
           │   ✅ pytest (Integration Test)
           │   📁 Location: ushadow/backend/tests/integration/
           │   🏷️  Marker: @pytest.mark.integration
           │
           ├─→ Frontend component rendering/logic?
           │   ✅ Playwright Component Test
           │   📁 Location: frontend/tests/
           │   🔧 Uses: @playwright/experimental-ct-react
           │
           └─→ Full user workflow across UI?
               ✅ Playwright E2E + POM
               📁 Location: frontend/e2e/
               🔧 Uses: Page Object Models (frontend/e2e/pom/)
               🏷️  Marker: @pytest.mark.e2e
```

### Framework Selection Guide

| Test Type | Framework | Why? |
|-----------|-----------|------|
| Backend Unit | pytest | Fast, native Python, async support |
| Backend Integration | pytest | Can mock services, test DB/Redis integration |
| API Tests | Robot Framework | Keyword-driven, readable, BDD-friendly |
| Frontend Component | Playwright CT | Type-safe, matches frontend stack |
| Frontend E2E | Playwright | Best debugging tools, your POM is already built for it |

**Why NOT Robot Framework for frontend?**
- Playwright is native TypeScript (matches your stack)
- Better IDE support and type safety
- Your POM infrastructure is already in Playwright
- Playwright Inspector provides superior debugging

## Test Categorization

Tests are categorized using pytest markers to separate tests requiring secrets from those that don't.

### Available Markers

```python
@pytest.mark.unit              # Unit tests (no external dependencies)
@pytest.mark.integration       # Integration tests (DB, Redis, etc.)
@pytest.mark.e2e              # End-to-end tests (full workflows)
@pytest.mark.requires_secrets  # Needs API keys/secrets
@pytest.mark.no_secrets       # Safe to run without secrets (PR checks)
@pytest.mark.requires_backend  # Needs backend services running
@pytest.mark.requires_frontend # Needs frontend running
```

### Auto-Marking Logic

Tests are automatically marked based on their characteristics (see `tests/conftest.py`):

1. **Auto `requires_secrets`**: Tests using fixtures with "secret", "api_key", or "token" in the name
2. **Auto `integration`**: Tests in `tests/integration/` directory
3. **Auto `no_secrets`**: Tests without secret/integration markers

### Example Test Categorization

```python
# ✅ Runs on every PR (no secrets needed)
@pytest.mark.unit
@pytest.mark.no_secrets
def test_string_masking():
    from ushadow.backend.src.utils.secrets import mask_value
    assert mask_value("sk-1234567890") == "sk-...7890"

# ⚠️ Only runs when manually triggered (needs secrets)
@pytest.mark.integration
@pytest.mark.requires_secrets
async def test_openai_api_connection():
    import os
    api_key = os.getenv("OPENAI_API_KEY")
    # Test actual API connection...
```

## Running Tests

### Local Development

```bash
# Run all tests without secrets (fast, safe for local dev)
cd ushadow/backend
pytest -m "no_secrets"

# Run all unit tests
pytest -m "unit"

# Run integration tests (may need services running)
pytest -m "integration"

# Run tests requiring secrets (set env vars first)
export OPENAI_API_KEY="sk-..."
pytest -m "requires_secrets"

# Run all tests
pytest
```

### Test Commands by Type

```bash
# Backend unit tests only
cd ushadow/backend && pytest -m "unit and no_secrets"

# Frontend type checking and linting
cd ushadow/frontend && npm run type-check && npm run lint

# Frontend build verification
cd ushadow/frontend && npm run build

# E2E tests (Playwright)
cd ushadow/frontend && npx playwright test

# Robot Framework API tests
cd robot_tests && robot --variable BACKEND_URL:http://localhost:8000 api/
```

## CI/CD Integration

### GitHub Actions Workflow

**PR Checks (Automatic)** - Runs on every PR:
- ✅ Backend unit tests (`@pytest.mark.no_secrets`)
- ✅ Frontend build verification
- ✅ TypeScript type checking
- ✅ Linting

**Integration Tests (Manual)** - Only runs when manually triggered:
- ⚠️ Tests marked with `@pytest.mark.requires_secrets`
- ⚠️ Tests requiring live services (MongoDB, Redis)

### Configuration

See `.github/workflows/pr-tests.yml`:

```yaml
# Runs automatically on PRs
- name: Run unit tests (no secrets required)
  env:
    CI: "true"
  run: pytest -m "no_secrets"

# Only runs when manually triggered
- name: Run integration tests
  if: github.event_name == 'workflow_dispatch'
  env:
    CI: "true"
    RUN_SECRET_TESTS: "true"
  run: pytest -m "requires_secrets or integration"
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `CI` | Indicates CI environment | `false` |
| `RUN_SECRET_TESTS` | Allow tests requiring secrets in CI | `false` |
| `SKIP_INTEGRATION` | Skip integration tests | `false` |

## Frontend Testing with POM

### Page Object Model Pattern

All Playwright E2E tests use the Page Object Model pattern for maintainability.

**Directory Structure:**
```
frontend/
├── e2e/
│   ├── pom/
│   │   ├── BasePage.ts          # Base class with common utilities
│   │   ├── SettingsPage.ts      # Settings page interactions
│   │   ├── WizardPage.ts        # Wizard flow interactions
│   │   └── index.ts             # Exports and conventions
│   └── tests/
│       └── *.spec.ts            # Test files using POMs
```

### Test ID Conventions

**CRITICAL:** All interactive frontend elements MUST have `data-testid` attributes:

```tsx
// ✅ CORRECT: Using data-testid
<button data-testid="submit-button">Submit</button>
<input data-testid="email-field" type="email" />
<div data-testid="settings-page">...</div>

// ❌ WRONG: Using id or no identifier
<button id="submit">Submit</button>
<input type="email" />
```

### Naming Patterns

| Component Type | Pattern | Example |
|----------------|---------|---------|
| Page container | `{page}-page` | `settings-page` |
| Tab buttons | `tab-{tabId}` | `tab-api-keys` |
| Wizard steps | `{wizard}-step-{stepId}` | `chronicle-step-llm` |
| Form fields | `{context}-field-{name}` | `quickstart-field-openai-key` |
| Secret inputs | `secret-input-{id}` | `secret-input-openai-key` |
| Setting fields | `setting-field-{id}` | `setting-field-model-name` |
| Buttons/Actions | `{context}-{action}` | `quickstart-refresh-status` |

### Example POM Usage

```typescript
import { SettingsPage, WizardPage } from './pom'

test('configure API keys', async ({ page }) => {
  const settings = new SettingsPage(page)
  await settings.goto()
  await settings.waitForLoad()

  await settings.goToApiKeysTab()
  await settings.fillSecret('openai_api_key', 'sk-test-key')
  await settings.expectApiKeyConfigured('openai_api_key')
})

test('complete quickstart wizard', async ({ page }) => {
  const wizard = new WizardPage(page)
  await wizard.startQuickstart()

  await wizard.fillApiKey('openai_api_key', 'sk-test-key')
  await wizard.next()
  await wizard.waitForSuccess()
})
```

## Test Creation Workflow

When implementing a new feature:

1. **Specification Phase**: Use `/spec-agent` to create feature specification
2. **Test Case Design**: Use `/qa-agent` to generate test scenarios
3. **Test Automation**: Use `/automation-agent` to generate test code at appropriate levels

The automation agent will:
- Determine correct test level (unit/integration/e2e)
- Choose appropriate framework (pytest/Robot/Playwright)
- Apply correct markers (`@pytest.mark.no_secrets` vs `@pytest.mark.requires_secrets`)
- Add `data-testid` attributes to frontend code
- Generate POM methods for E2E tests

---

## References

- [Test Pyramid Strategy Guide 2025](https://fullscale.io/blog/modern-test-pyramid-guide/)
- [Playwright vs Robot Framework Comparison](https://www.browserstack.com/guide/playwright-vs-robot-framework)
- [Robot Framework Browser Library Documentation](https://github.com/MarketSquare/robotframework-browser)
