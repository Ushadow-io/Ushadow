---
name: automate-tests
description: Generate executable test code from approved test case specifications
---

Generate executable test automation code from approved test cases.

This skill will:
1. Read approved test case specifications
2. Determine appropriate test level for each case:
   - pytest for unit/integration tests
   - Robot Framework for API tests
   - Playwright for E2E tests
3. Apply correct test markers (no_secrets vs requires_secrets)
4. Generate test code in correct locations
5. Add data-testid to frontend components (for E2E tests)
6. Update Page Object Models (for new E2E flows)

The automation agent will automatically choose the right framework based on what's being tested.

Usage:
- `/automate-tests` - Automate most recent test cases
- `/automate-tests feature-name` - Automate specific feature tests
