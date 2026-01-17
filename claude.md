- When creating front end code, made sure that elements have a human readable identifier, so we can more easily debug and write browser tests
- There may be multiple environments running simultaneously using different worktrees. To determine the corren environment, you can get port numbers and env name from the root .env file.
- When refactoring module names, run `grep -r "old_module_name" .` before committing to catch all remaining references (especially entry points like `main.py`). Use `__init__.py` re-exports for backward compatibility.

## CRITICAL Frontend Development Rules

**MANDATORY: Every frontend change MUST include `data-testid` attributes for ALL interactive elements.**

### Pre-Flight Checklist for Frontend Code

Before completing ANY frontend development task, you MUST:

1. ✅ **Add `data-testid` to ALL interactive elements** (buttons, inputs, links, tabs, forms, modals)
2. ✅ **Update corresponding POM** if adding new pages/workflows (in `frontend/e2e/pom/`)
3. ✅ **Follow naming conventions** (see table below - use kebab-case, not camelCase)
4. ✅ **Verify test IDs are present** by running: `grep -r "data-testid" <your-new-file.tsx>`

### Enforcement

- **DO NOT** mark frontend tasks as complete without data-testid attributes
- **DO NOT** use `id` attributes for testing - only `data-testid`
- **DO NOT** skip this even for "quick fixes" or "simple changes"

### Why This Matters

Without `data-testid`:
- E2E tests break when UI text changes
- Tests become fragile and flaky
- Debugging is harder (no semantic selectors)
- Our automation agents can't write reliable tests
## Service Integration

**CRITICAL**: Before adding any service integration endpoints, read `docs/SERVICE-INTEGRATION-CHECKLIST.md`.

- ushadow uses a **generic proxy** at `/api/services/{name}/proxy/{path}` that automatically forwards all requests
- **DO NOT** add custom service endpoints unless absolutely necessary (transformation, aggregation, special auth)
- Always check swagger docs first: `http://localhost:${BACKEND_PORT}/docs`
- Test if the generic proxy already works before writing custom code
- Service cards have an "API" button to view each service's swagger documentation

## Frontend Testing: data-testid and Playwright POM

### Test ID Conventions

Always use `data-testid` attributes (not `id`) for test automation. Follow these naming patterns:

| Component Type | Pattern | Example |
|----------------|---------|---------|
| Page container | `{page}-page` | `settings-page` |
| Tab buttons | `tab-{tabId}` | `tab-api-keys` |
| Wizard steps | `{wizard}-step-{stepId}` | `chronicle-step-llm` |
| Form fields | `{context}-field-{name}` | `quickstart-field-openai-key` |
| Secret inputs | `secret-input-{id}`, `secret-input-{id}-field`, `secret-input-{id}-toggle` | |
| Setting fields | `setting-field-{id}`, `setting-field-{id}-input`, `setting-field-{id}-select` | |
| Buttons/Actions | `{context}-{action}` | `quickstart-refresh-status` |

### Reusable UI Components

**Modals**: Always use the `Modal` component from `frontend/src/components/Modal.tsx`. Never create custom modal markup with `fixed inset-0` divs.

```tsx
import Modal from '../components/Modal'

<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title="Modal Title"
  maxWidth="sm"  // 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  testId="my-modal"
>
  {/* Modal content */}
</Modal>
```

**Confirm Dialogs**: Use `ConfirmDialog` from `frontend/src/components/ConfirmDialog.tsx` for confirmation prompts.

**Settings Components**: Use components from `frontend/src/components/settings/`:
- `SecretInput` - API keys and passwords with visibility toggle
- `SettingField` - Generic field (text, secret, url, select, toggle types)
- `SettingsSection` - Container for grouping related settings

For react-hook-form integration, use `Controller`:
```tsx
<Controller
  name="apiKey"
  control={control}
  render={({ field }) => (
    <SecretInput
      id="my-api-key"
      name={field.name}
      value={field.value}
      onChange={field.onChange}
      error={errors.apiKey?.message}
    />
  )}
/>
```

### Playwright Page Object Model (POM)

POMs are in `frontend/e2e/pom/`. When adding new pages or components:

1. Add `data-testid` to all interactive elements
2. Update or create POM class in `e2e/pom/`
3. Export from `e2e/pom/index.ts`
4. Use `getByTestId()` in POM methods

Example POM usage:
```typescript
const wizard = new WizardPage(page)
await wizard.startQuickstart()
await wizard.fillApiKey('openai_api_key', 'sk-test')
await wizard.next()
```
