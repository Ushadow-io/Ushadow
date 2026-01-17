# Test Automation Plugin

Multi-agent test automation workflow for UShadow - from specification to executable tests.

## Overview

This plugin provides a complete test automation workflow using three specialized agents:

1. **spec-agent** - Creates feature specifications from discussions
2. **qa-agent** - Generates comprehensive test case specifications
3. **automation-agent** - Produces executable test code in appropriate frameworks

## Quick Start

### Step 1: Create a Specification

When discussing a new feature, run:

```
/spec
```

This will:
- Analyze the conversation to extract requirements
- Ask clarifying questions if needed
- Create a structured specification in `specs/features/{feature}.md`

### Step 2: Generate Test Cases

Once the spec is approved, run:

```
/qa-test-cases
```

This will:
- Read the specification
- Generate comprehensive test scenarios (happy path, edge cases, negative tests)
- Categorize by test type (unit, integration, API, E2E)
- Mark which tests require secrets
- Output to `specs/features/{feature}.testcases.md`

### Step 3: Automate Tests

After reviewing test cases, run:

```
/automate-tests
```

This will:
- Read approved test cases
- Determine appropriate test level for each
- Generate executable test code in correct frameworks:
  - **pytest** for unit/integration tests
  - **Robot Framework** for API tests
  - **Playwright** for E2E tests
- Apply correct test markers (`@pytest.mark.no_secrets` or `@pytest.mark.requires_secrets`)
- Add `data-testid` attributes to frontend components
- Update Page Object Models for E2E tests

## Test Level Decision Matrix

The automation-agent automatically determines the appropriate test framework:

```
What are you testing?
│
├─→ Individual function/class logic?
│   ✅ pytest (Unit Test)
│   📁 ushadow/backend/tests/test_*.py
│
├─→ API endpoint behavior?
│   ✅ Robot Framework (API Test)
│   📁 robot_tests/api/
│
├─→ Service integration?
│   ✅ pytest (Integration Test)
│   📁 ushadow/backend/tests/integration/
│
└─→ Full user workflow across UI?
    ✅ Playwright E2E + POM
    📁 frontend/e2e/
```

## Secret Categorization

All pytest tests are automatically categorized by secret requirements:

### No Secrets Required (`@pytest.mark.no_secrets`)
- Pure logic/algorithm tests
- Tests with mocked external services
- Tests that can run offline
- **Runs automatically on every PR**

### Requires Secrets (`@pytest.mark.requires_secrets`)
- Tests calling actual external APIs (OpenAI, etc.)
- Tests using real authentication credentials
- Tests connecting to protected services
- **Only runs when manually triggered**

This separation allows:
- ✅ Fast feedback on PRs without exposing secrets
- ✅ Comprehensive testing when secrets are available
- ✅ Safe CI/CD pipelines

## Example Workflow

```bash
# 1. During feature discussion
User: "I want users to be able to upload profile images"
> /spec user-profile-images

# Output: specs/features/user-profile-images.md created
# - 5 functional requirements
# - 3 non-functional requirements
# - Integration with S3 identified

# 2. Generate test cases
> /qa-test-cases user-profile-images

# Output: specs/features/user-profile-images.testcases.md created
# - 12 test cases total
# - 5 unit tests (no secrets)
# - 4 API tests (2 require secrets)
# - 3 E2E tests (no secrets)

# 3. Review and approve test cases
# (Manual review step)

# 4. Generate executable tests
> /automate-tests user-profile-images

# Output:
# - ushadow/backend/tests/test_image_validation.py (5 unit tests)
# - ushadow/backend/tests/integration/test_s3_upload.py (2 tests, requires_secrets)
# - robot_tests/api/image_upload.robot (4 API tests)
# - frontend/e2e/profile-image.spec.ts (3 E2E tests)
# - frontend/e2e/pom/ProfilePage.ts updated
# - data-testid added to ProfileImageUpload.tsx
```

## Frontend Testing Integration

When generating E2E tests, the automation-agent:

### Ensures data-testid Attributes
All interactive elements get `data-testid` attributes:

```tsx
// BEFORE (automation-agent will add)
<button onClick={handleUpload}>Upload</button>

// AFTER
<button data-testid="upload-button" onClick={handleUpload}>
  Upload
</button>
```

### Updates Page Object Models
Creates or updates POM classes in `frontend/e2e/pom/`:

```typescript
export class ProfilePage extends BasePage {
  async uploadProfileImage(filePath: string) {
    await this.getByTestId('upload-button').click()
    // ... upload logic
  }

  getProfileImage() {
    return this.getByTestId('profile-image')
  }
}
```

### Verifies Test IDs
Runs `./scripts/verify-frontend-testids.sh` to ensure all interactive elements are properly marked.

## Agent Descriptions

### spec-agent (Green)
**Purpose**: Extract requirements from discussions and create structured specifications

**Output**: `specs/features/{feature}.md`

**Key Features**:
- Analyzes conversation context
- Asks clarifying questions
- Creates measurable, testable requirements
- Identifies integration points and dependencies
- Notes security considerations

### qa-agent (Purple)
**Purpose**: Generate comprehensive test case specifications

**Output**: `specs/features/{feature}.testcases.md`

**Key Features**:
- Covers happy path, edge cases, negative tests
- Categorizes by test type
- Identifies secret requirements
- Creates test coverage matrix
- Provides realistic test data

### automation-agent (Blue)
**Purpose**: Generate executable test code in appropriate frameworks

**Output**: Test files in `ushadow/backend/tests/`, `robot_tests/api/`, `frontend/e2e/`

**Key Features**:
- Intelligent test level selection
- Framework-specific code generation
- Automatic secret categorization
- Frontend data-testid enforcement
- POM pattern for E2E tests

## Directory Structure

```
project/
├── .claude/plugins/test-automation/
│   ├── plugin.json
│   ├── spec-agent.md
│   ├── qa-agent.md
│   ├── automation-agent.md
│   ├── spec.md (skill)
│   ├── qa-test-cases.md (skill)
│   └── automate-tests.md (skill)
├── specs/
│   ├── features/
│   │   ├── {feature}.md
│   │   └── {feature}.testcases.md
│   └── templates/
├── ushadow/backend/tests/
│   ├── conftest.py (pytest configuration)
│   ├── test_*.py (unit tests)
│   └── integration/
│       └── test_*.py (integration tests)
├── robot_tests/api/
│   └── *.robot (API tests)
└── frontend/e2e/
    ├── pom/ (Page Object Models)
    └── *.spec.ts (E2E tests)
```

## GitHub Actions Integration

The plugin integrates with CI/CD via `.github/workflows/pr-tests.yml`:

### Automatic PR Checks
```yaml
# Runs on every PR
pytest -m "no_secrets"  # Fast feedback without secrets
npm run type-check      # TypeScript validation
npm run build           # Build verification
```

### Manual Integration Tests
```yaml
# Only runs when manually triggered
pytest -m "requires_secrets or integration"
```

## Configuration Files

### pytest Markers (`ushadow/backend/pyproject.toml`)
```toml
[tool.pytest.ini_options]
markers = [
    "unit: Unit tests",
    "integration: Integration tests",
    "e2e: End-to-end tests",
    "requires_secrets: Tests requiring API keys",
    "no_secrets: Tests safe for PR checks",
]
```

### Auto-Marking Logic (`ushadow/backend/tests/conftest.py`)
- Tests using fixtures with "secret", "api_key", or "token" → `requires_secrets`
- Tests in `integration/` directory → `integration`
- Tests without secret/integration markers → `no_secrets`

## Running Tests

### Local Development
```bash
# All tests without secrets (fast)
cd ushadow/backend && pytest -m "no_secrets"

# All unit tests
pytest -m "unit"

# Integration tests (may need services)
pytest -m "integration"

# Tests requiring secrets
export OPENAI_API_KEY="sk-..."
pytest -m "requires_secrets"

# E2E tests
cd frontend && npx playwright test

# Robot Framework API tests
cd robot_tests && robot api/
```

### CI/CD
```bash
# On PR (automatic)
pytest -m "no_secrets"

# Manual trigger (requires secrets configured)
pytest -m "requires_secrets or integration"
```

## Best Practices

### When to Use Each Agent

**spec-agent**:
- During feature planning discussions
- When requirements are unclear or informal
- Before starting development
- When you need stakeholder alignment

**qa-agent**:
- After spec is approved
- Before writing any code
- When you need comprehensive test coverage
- To identify edge cases early

**automation-agent**:
- After test cases are reviewed
- When implementing the feature
- To ensure consistent test patterns
- To maintain test/code ratio

### Tips for Success

1. **Start with spec-agent** - Good specs lead to good tests
2. **Review test cases** - Don't automate bad test designs
3. **Follow the pyramid** - 70% unit, 20% integration/API, 10% E2E
4. **Mark secrets correctly** - Enables fast PR feedback
5. **Use POMs for E2E** - Makes tests maintainable

## Troubleshooting

### Tests Skipped in CI
- Check if marked with `@pytest.mark.requires_secrets`
- Verify `CI=true` environment variable
- Ensure tests are marked with `@pytest.mark.no_secrets` for PR runs

### Frontend E2E Tests Failing
- Verify `data-testid` attributes exist on elements
- Run `./scripts/verify-frontend-testids.sh`
- Check POM methods use `getByTestId()`
- Ensure naming follows kebab-case convention

### Test Markers Not Working
- Run `pytest --markers` to see registered markers
- Check `pyproject.toml` marker definitions
- Ensure `--strict-markers` flag is enabled

## References

- [Testing Strategy](../../../docs/TESTING_STRATEGY.md)
- [Frontend Testing Guide](../../../CLAUDE.md#frontend-testing-data-testid-and-playwright-pom)
- [Pytest Documentation](https://docs.pytest.org/)
- [Robot Framework Browser Library](https://github.com/MarketSquare/robotframework-browser)
- [Playwright Documentation](https://playwright.dev/)
