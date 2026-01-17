# Specifications Directory

This directory contains feature specifications and test case documents for the UShadow project.

## Directory Structure

```
specs/
├── features/           # Feature specifications and test cases
│   ├── {feature}.md           # Feature specification
│   └── {feature}.testcases.md # Test case specifications
└── templates/          # Document templates
    ├── spec-template.md       # Feature spec template
    └── testcase-template.md   # Test case template
```

## Workflow

### 1. Create Specification

Use the `/spec` command to create a feature specification from conversation:

```
/spec user-authentication
```

This creates `specs/features/user-authentication.md` with structured requirements.

### 2. Generate Test Cases

Use the `/qa-test-cases` command to generate test scenarios:

```
/qa-test-cases user-authentication
```

This creates `specs/features/user-authentication.testcases.md` with comprehensive test coverage.

### 3. Automate Tests

Use the `/automate-tests` command to generate executable test code:

```
/automate-tests user-authentication
```

This generates:
- pytest tests in `ushadow/backend/tests/`
- Robot Framework tests in `robot_tests/api/`
- Playwright E2E tests in `frontend/e2e/`

## Test Automation Agents

The test automation workflow uses three specialized agents:

### spec-agent
Extracts requirements from feature discussions and creates structured specification documents.

**Invoked by**: `/spec` command

**Output**: `specs/features/{feature}.md`

### qa-agent
Generates comprehensive test case specifications from feature specs, including happy paths, edge cases, and negative tests.

**Invoked by**: `/qa-test-cases` command

**Output**: `specs/features/{feature}.testcases.md`

### automation-agent
Generates executable test code in appropriate frameworks (pytest, Robot Framework, Playwright) with correct test level and secret categorization.

**Invoked by**: `/automate-tests` command

**Output**: Test files in appropriate directories

## Test Level Decision

The automation-agent automatically determines the appropriate test level:

| What's Being Tested | Framework | Location |
|---------------------|-----------|----------|
| Individual function/class logic | pytest (unit) | `ushadow/backend/tests/` |
| API endpoint behavior | Robot Framework | `robot_tests/api/` |
| Service integration | pytest (integration) | `ushadow/backend/tests/integration/` |
| Frontend component logic | Playwright CT | `frontend/tests/` |
| Full user workflow | Playwright E2E | `frontend/e2e/` |

## Secret Categorization

All pytest tests are marked with secret requirements:

- `@pytest.mark.no_secrets` - Can run in PR CI without secrets
- `@pytest.mark.requires_secrets` - Only runs when manually triggered with secrets configured

This allows PRs to run fast feedback tests while protecting API keys.

## References

- [Testing Strategy](../docs/TESTING_STRATEGY.md)
- [Frontend Testing Guide](../CLAUDE.md#frontend-testing-data-testid-and-playwright-pom)
