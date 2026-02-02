- When creating front end code, made sure that elements have a human readable identifier, so we can more easily debug and write browser tests
- There may be multiple environments running simultaneously using different worktrees. To determine the corren environment, you can get port numbers and env name from the root .env file.
- When refactoring module names, run `grep -r "old_module_name" .` before committing to catch all remaining references (especially entry points like `main.py`). Use `__init__.py` re-exports for backward compatibility.

## Backend Development Workflow

**BEFORE writing ANY backend code, follow this workflow:**

### Step 1: Read Backend Quick Reference
Read `ushadow/backend/BACKEND_QUICK_REF.md` - it's ~1000 tokens and covers all available services, patterns, and architecture rules.

### Step 2: Search for Existing Code
```bash
# Search for existing methods before creating new ones
grep -rn "async def method_name" ushadow/backend/src/services/
grep -rn "class ClassName" ushadow/backend/src/

# Check available services
cat ushadow/backend/src/services/__init__.py

# Check backend index (method/class reference)
cat ushadow/backend/src/backend_index.py
```

### Step 3: Check Architecture
Read `ushadow/backend/src/ARCHITECTURE.md` for:
- Layer definitions (router/service/store)
- Naming conventions (Manager/Registry/Store)
- Data flow patterns

### Step 4: Follow Patterns
- **Routers**: Thin HTTP adapters (max 30 lines per endpoint, max 500 lines per file)
- **Services**: Business logic, return data not HTTP responses (max 800 lines per file)
- **Stores**: Data persistence (YAML/DB access)
- **Utils**: Pure functions, stateless (max 300 lines per file)

### File Size Limits (Ruff enforced)
- **Routers**: Max 500 lines → Split by resource domain
- **Services**: Max 800 lines → Extract helper services
- **Utils**: Max 300 lines → Split into focused modules
- **Complexity**: Max 10 (McCabe), max 5 parameters per function

### What NOT to Do
- ❌ Business logic in routers → Move to services
- ❌ `raise HTTPException` in services → Return data/None, let router handle HTTP
- ❌ Direct DB/file access in routers → Use services/stores
- ❌ Nested functions >50 lines → Extract to methods/utilities
- ❌ Methods with >5 params → Use Pydantic models
- ❌ Skip layer architecture → Follow router→service→store flow

## Frontend Development Workflow

**BEFORE writing ANY frontend code, follow this workflow:**

### Step 1: Read Quick Reference
Read `ushadow/frontend/AGENT_QUICK_REF.md` - it's ~800 tokens and covers all reusable components.

### Step 2: Search for Existing Components
```bash
# Search for components before creating new ones
grep -r "ComponentName" ushadow/frontend/src/components/

# Check available hooks
cat ushadow/frontend/src/hooks/index.ts

# Check available contexts
ls ushadow/frontend/src/contexts/
```

### Step 3: Check UI Contract
Read `ushadow/frontend/src/testing/ui-contract.ts` for:
- Component documentation and examples
- TestID patterns (use these, don't invent new ones)
- Import paths

### Step 4: Follow Patterns
- **Hooks**: See `ushadow/frontend/src/hooks/HOOK_PATTERNS.md`
- **State**: Use existing contexts, React Query for server state
- **Forms**: Use react-hook-form + Controller pattern

### File Size Limits (ESLint enforced)
- **Pages**: Max 600 lines → Extract logic to hooks, UI to components
- **Components**: Max 300 lines → Split into smaller components
- **Hooks**: Max 100 lines → Compose from smaller hooks

### What NOT to Do
- ❌ Create custom modals → Use `Modal` component
- ❌ Create custom secret inputs → Use `SecretInput`
- ❌ Create new state management → Use existing contexts
- ❌ Hardcode testid strings → Import from `ui-contract.ts`
- ❌ Put business logic in components → Extract to hooks

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
