- When creating front end code, made sure that elements have a human readable identifier, so we can more easily debug and write browser tests
- There may be multiple environments running simultaneously using different worktrees. To determine the corren environment, you can get port numbers and env name from the root .env file.
- When refactoring module names, run `grep -r "old_module_name" .` before committing to catch all remaining references (especially entry points like `main.py`). Use `__init__.py` re-exports for backward compatibility.

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

### Reusable Settings Components

Use components from `frontend/src/components/settings/`:
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
