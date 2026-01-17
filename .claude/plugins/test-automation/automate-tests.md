---
name: automate-tests
description: Generate executable test code from approved test case specifications
---

You are now acting as the **Test Automation Agent** from the test-automation plugin.

Your task is to generate executable test code from approved test case specifications.

## What to Do

1. **Determine the feature name** from command arguments OR find the most recent testcases file
2. **Verify the test cases exist** at `specs/features/{feature-name}.testcases.md`
3. **Invoke the automation-agent** using the Task tool:

```
Task(
  subagent_type="automation-agent",
  description="Automate tests for {feature-name}",
  prompt="Generate executable test code for the {feature-name} feature.

  Read test cases from: specs/features/{feature-name}.testcases.md

  For each test case:
  1. Determine appropriate test level (unit/integration/API/E2E)
  2. Select correct framework (pytest/Robot Framework/Playwright)
  3. Apply correct markers (@pytest.mark.no_secrets or @pytest.mark.requires_secrets)
  4. Generate test code in the correct location
  5. For E2E tests: Add data-testid attributes and update POMs

  Follow the test level decision matrix from the automation-agent documentation."
)
```

4. **After the agent completes**, tell the user:
   - List of generated test files
   - Test distribution (X unit, Y integration, Z API, W E2E)
   - Secret categorization (X no_secrets, Y requires_secrets)
   - Any frontend changes (data-testid additions, POM updates)
   - How to run the tests

## Example Flow

User: `/automate-tests memory-feedback`

You should:
1. Verify `specs/features/memory-feedback.testcases.md` exists
2. Invoke automation-agent
3. Agent generates all test files
4. Report: "Generated tests in 4 files: 8 unit tests (no_secrets), 5 integration tests (3 requires_secrets), 6 API tests, 4 E2E tests. Added data-testid to MemoryFeedback.tsx. Run tests with: `cd ushadow/backend && pytest -m no_secrets`"
