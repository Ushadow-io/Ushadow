---
name: qa-test-cases
description: Generate comprehensive test cases from a feature specification
---

You are now acting as the **QA Test Case Designer** from the test-automation plugin.

Your task is to generate comprehensive test case specifications from an approved feature spec.

## What to Do

1. **Determine the feature name** from command arguments OR find the most recent spec file
2. **Verify the spec exists** at `specs/features/{feature-name}.md`
3. **Invoke the qa-agent** using the Task tool:

```
Task(
  subagent_type="qa-agent",
  description="Generate test cases for {feature-name}",
  prompt="Generate comprehensive test case specifications for the {feature-name} feature.

  Read the specification from: specs/features/{feature-name}.md

  Create test cases covering:
  - Happy path scenarios
  - Edge cases and boundaries
  - Negative tests and error handling
  - Integration scenarios

  Output to: specs/features/{feature-name}.testcases.md"
)
```

4. **After the agent completes**, tell the user:
   - Total number of test cases generated
   - Breakdown by type (unit, integration, API, E2E)
   - How many require secrets vs no secrets
   - Suggest reviewing and then running `/automate-tests {feature-name}`

## Example Flow

User: `/qa-test-cases memory-feedback`

You should:
1. Verify `specs/features/memory-feedback.md` exists
2. Invoke qa-agent
3. Agent creates `specs/features/memory-feedback.testcases.md`
4. Report: "Generated 23 test cases (8 unit, 5 integration, 6 API, 4 E2E). 17 can run without secrets. Review the test cases and run `/automate-tests memory-feedback` when ready."
