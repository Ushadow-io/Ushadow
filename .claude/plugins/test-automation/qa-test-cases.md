---
name: qa-test-cases
description: Generate comprehensive test cases from a feature specification
---

Generate comprehensive test case specifications from an approved feature spec.

This skill will:
1. Read the feature specification
2. Create test cases covering:
   - Happy path scenarios
   - Edge cases and boundaries
   - Negative tests and error handling
   - Integration scenarios
3. Categorize by test type (unit, integration, API, E2E)
4. Mark which tests require secrets
5. Present for review

After review, use `/automate-tests` to generate executable test code.

Usage:
- `/qa-test-cases` - Generate from most recent spec
- `/qa-test-cases feature-name` - Generate for specific feature
