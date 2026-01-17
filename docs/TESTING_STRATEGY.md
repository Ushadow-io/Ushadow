# Testing Strategy for Ushadow Platform

## Executive Summary

This document outlines the comprehensive testing strategy for the Ushadow platform, addressing test framework selection, organization, and implementation approach for backend and frontend testing.

## Current State Analysis

### Existing Tests
1. **Robot Framework Tests** (`tests_old/`)
   - Comprehensive API test coverage for Chronicle
   - Well-organized with resource files and keywords
   - **Status**: Legacy tests from Chronicle project
   - **Issues**:
     - Designed for a different application (Chronicle)
     - Heavy dependency on Robot Framework ecosystem
     - Slower execution compared to native Python/TypeScript tests
     - Harder to debug and maintain for developers unfamiliar with Robot Framework

2. **Backend Pytest Tests** (`ushadow/backend/tests/`)
   - Limited coverage (3 test files)
   - Good: test_secrets.py, test_yaml_parser.py, test_omegaconf_settings.py
   - Uses modern pytest with async support

3. **Frontend Tests** (`ushadow/frontend/e2e/`)
   - Page Object Model (POM) structure exists
   - **No actual test files yet**
   - POMs created: BasePage, WizardPage, SettingsPage

## Recommended Testing Strategy

### Framework Selection

#### Backend Testing: **Pytest** ✅
- **Rationale**:
  - Native Python testing framework
  - Excellent async support (pytest-asyncio)
  - Better IDE integration and debugging
  - Faster execution
  - Easier for Python developers to write and maintain
  - FastAPI has built-in test client support

- **Migrate Away From Robot Framework**:
  - Robot Framework adds unnecessary complexity
  - Requires separate skill set
  - Slower execution
  - Better suited for acceptance testing, not unit/integration tests

#### Frontend Testing: **Playwright** ✅
- **Rationale**:
  - Modern, fast, and reliable
  - Multi-browser support
  - Auto-waiting and retry mechanisms
  - Excellent debugging tools
  - TypeScript support
  - Already referenced in CLAUDE.md

### Test Organization Structure

```
ushadow/
├── backend/
│   ├── src/
│   │   ├── routers/
│   │   ├── services/
│   │   └── ...
│   └── tests/               # Tests co-located with backend code
│       ├── unit/            # Pure unit tests (no external dependencies)
│       │   ├── test_services/
│       │   ├── test_utils/
│       │   └── test_models/
│       ├── integration/     # Integration tests (database, Redis, etc.)
│       │   ├── test_routers/
│       │   ├── test_auth/
│       │   └── test_services/
│       ├── fixtures/        # Shared test fixtures
│       │   ├── __init__.py
│       │   ├── database.py
│       │   ├── auth.py
│       │   └── services.py
│       ├── conftest.py      # Pytest configuration
│       └── README.md        # Testing documentation
│
├── frontend/
│   ├── src/
│   └── e2e/                 # E2E tests co-located with frontend
│       ├── tests/           # Test files
│       │   ├── auth.spec.ts
│       │   ├── wizard.spec.ts
│       │   ├── settings.spec.ts
│       │   └── chat.spec.ts
│       ├── pom/             # Page Object Models (already exists)
│       │   ├── BasePage.ts
│       │   ├── WizardPage.ts
│       │   └── SettingsPage.ts
│       ├── fixtures/        # Test data and fixtures
│       │   └── test-data.ts
│       ├── playwright.config.ts
│       └── README.md
│
└── tests_old/               # Archive (keep for reference, don't use)
    └── README_DEPRECATED.md
```

**Key Decision: Tests Live With Code** ✅
- Tests co-located with their respective applications
- Easier to maintain (change code + tests together)
- Clear ownership (backend team owns backend/tests, frontend team owns frontend/e2e)
- Follows modern best practices (pytest, Jest, Vitest all recommend this)

### Test Pyramid Strategy

```
        /\
       /  \
      / E2E \          10% - Full user flows, critical paths
     /--------\
    /          \
   / Integration \     30% - API endpoints, service interactions
  /--------------\
 /                \
/   Unit Tests     \   60% - Business logic, utilities, models
--------------------
```

## Implementation Phases

### Phase 1: Backend Testing Foundation ⚡ (Current Priority)

**Goals:**
- Set up pytest infrastructure
- Create reusable fixtures
- Test critical services and routers

**Tasks:**
1. ✅ Create `ushadow/backend/tests/` structure
2. ✅ Set up pytest configuration (`conftest.py`)
3. ✅ Create test fixtures (database, auth, test client)
4. ✅ Write tests for critical services:
   - Authentication (auth.py)
   - Settings/Configuration (omegaconf_settings)
   - Docker/Kubernetes managers
   - Service orchestrator
5. ✅ Write tests for key API routers:
   - `/auth` endpoints
   - `/api/services` endpoints
   - `/health` endpoints
   - `/api/wizard` endpoints

**Test Coverage Targets:**
- Critical services: 80%+
- API routers: 70%+
- Utilities: 90%+

### Phase 2: Frontend Testing with Playwright

**Goals:**
- Set up Playwright
- Create E2E tests using existing POMs
- Test critical user journeys

**Tasks:**
1. ✅ Install and configure Playwright
2. ✅ Create `playwright.config.ts`
3. ✅ Write E2E tests:
   - Authentication flow
   - Wizard (quickstart + advanced setup)
   - Settings management
   - Service deployment
4. ✅ Implement data-testid strategy (per CLAUDE.md)
5. ✅ Set up CI/CD integration

**Test Coverage Targets:**
- Critical user paths: 100%
- Settings pages: 80%+

### Phase 3: Integration & API Testing

**Goals:**
- Comprehensive API testing
- Service integration testing
- Database integration tests

**Tasks:**
1. Test all API endpoints with FastAPI TestClient
2. Test database operations (MongoDB, Redis)
3. Test service-to-service communication
4. Test Docker/Kubernetes integration

### Phase 4: Migration & Cleanup

**Goals:**
- Archive old Robot Framework tests
- Document migration

**Tasks:**
1. Extract valuable test cases from `tests_old/`
2. Rewrite in pytest/Playwright
3. Archive `tests_old/` directory
4. Update documentation

## Testing Best Practices

### Backend (Pytest)

```python
# Example test structure
import pytest
from fastapi.testclient import TestClient
from src.main import app

@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)

@pytest.fixture
async def db_session():
    """Database session for testing."""
    # Setup test database
    yield session
    # Cleanup

def test_health_endpoint(client):
    """Test health check returns 200."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
```

**Principles:**
- Use fixtures for setup/teardown
- Test one thing per test
- Use descriptive test names
- Mock external services
- Use async tests for async code
- Parametrize tests for multiple scenarios

### Frontend (Playwright)

```typescript
// Example test structure
import { test, expect } from '@playwright/test'
import { WizardPage } from './pom/WizardPage'

test.describe('Wizard Flow', () => {
  test('should complete quickstart setup', async ({ page }) => {
    const wizard = new WizardPage(page)

    await wizard.startQuickstart()
    await wizard.fillApiKey('openai_api_key', process.env.TEST_OPENAI_KEY!)
    await wizard.next()

    await expect(page.getByTestId('quickstart-success')).toBeVisible()
  })
})
```

**Principles:**
- Use Page Object Model (POM) pattern
- Use `data-testid` attributes (never brittle selectors)
- Test user journeys, not implementation
- Use Playwright's auto-waiting
- Test critical paths thoroughly

## Test Data Strategy

### Backend
- **Unit Tests**: Use in-memory test data
- **Integration Tests**: Use test database with fixtures
- **API Tests**: Use FastAPI TestClient with mocked services

### Frontend
- **E2E Tests**: Use stubbed API responses where possible
- **Integration Tests**: Use test backend instance
- **Critical Paths**: Use real backend for smoke tests

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.12'
      - name: Install dependencies
        run: |
          cd ushadow/backend
          pip install -e ".[dev]"
      - name: Run tests
        run: |
          cd ushadow/backend
          pytest tests/ -v --cov=src --cov-report=xml

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install dependencies
        run: |
          cd ushadow/frontend
          npm ci
      - name: Install Playwright
        run: npx playwright install --with-deps
      - name: Run E2E tests
        run: |
          cd ushadow/frontend
          npx playwright test
```

## Code Quality & Coverage Goals

### Backend
- **Unit Test Coverage**: 80%+
- **Integration Test Coverage**: 70%+
- **Critical Services**: 90%+

### Frontend
- **E2E Coverage**: Critical paths 100%
- **Component Coverage**: Key components 80%+

## Next Steps (Immediate Actions)

1. ✅ Create backend test infrastructure (Phase 1)
2. ✅ Write initial backend tests for auth and services
3. ✅ Set up Playwright configuration
4. ✅ Create initial frontend E2E tests
5. ✅ Set up CI/CD pipelines
6. 📋 Generate code quality report

## Success Metrics

- ✅ All critical paths tested
- ✅ CI/CD pipeline running tests on every PR
- ✅ Test execution time < 5 minutes
- ✅ 80%+ code coverage on critical services
- ✅ Zero Robot Framework dependencies (migrated to pytest/Playwright)
- ✅ Clear testing documentation for contributors

## Conclusion

This strategy prioritizes:
1. **Modern tooling** (pytest, Playwright over Robot Framework)
2. **Developer experience** (co-located tests, familiar tools)
3. **Fast feedback** (quick test execution)
4. **Maintainability** (clear structure, good practices)

The Robot Framework tests in `tests_old/` should be treated as **reference material** during migration, then archived. They represent a valuable investment but are not the right tool for ongoing development.
