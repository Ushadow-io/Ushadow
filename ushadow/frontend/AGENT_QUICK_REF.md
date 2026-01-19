# Frontend Quick Reference

> Read this BEFORE writing any frontend code. ~800 tokens.

## Workflow

1. **Search first** - `grep -r "ComponentName" src/components/`
2. **Check hooks** - Read `src/hooks/index.ts`
3. **Check contexts** - Read `src/contexts/` for global state
4. **Use existing patterns** - Copy from similar pages

## Reusable Components

### Modal (REQUIRED for all dialogs)
```tsx
import Modal from '@/components/Modal'

<Modal isOpen={open} onClose={close} title="Title" testId="my-modal">
  {content}
</Modal>
```
❌ **NEVER** use `fixed inset-0` divs - always use Modal component

### SecretInput (API keys, passwords)
```tsx
import { SecretInput } from '@/components/settings/SecretInput'

<SecretInput id="api-key" name="apiKey" value={v} onChange={setV} error={err} />
```

### SettingField (generic form field)
```tsx
import { SettingField } from '@/components/settings/SettingField'

<SettingField id="url" type="url" label="Endpoint" value={v} onChange={setV} />
// Types: 'text' | 'secret' | 'url' | 'select' | 'toggle'
```

### ConfirmDialog (destructive actions)
```tsx
import ConfirmDialog from '@/components/ConfirmDialog'

<ConfirmDialog
  isOpen={open}
  onClose={close}
  onConfirm={handleDelete}
  title="Delete?"
  message="This cannot be undone."
  variant="danger"
/>
```

### SettingsSection (group related settings)
```tsx
import { SettingsSection } from '@/components/settings/SettingsSection'

<SettingsSection id="api-keys" title="API Keys" description="Configure keys">
  <SecretInput ... />
</SettingsSection>
```

## Hooks

| Hook | Use Case |
|------|----------|
| `useModal()` | Modal open/close state |
| `useServiceStatus()` | Service health polling |
| `useServiceStart()` | Start service with port conflict handling |
| `useMemories()` | Memory CRUD operations |
| `useQrCode()` | Generate QR codes |

## State Management

- **Server state**: Use `@tanstack/react-query`
- **Form state**: Use `react-hook-form` + `zod`
- **Global state**: Use existing contexts (Auth, Theme, Services, Wizard)
- **Local UI state**: Use `useState`

### React Query pattern
```tsx
const { data, isLoading } = useQuery({
  queryKey: ['resource', id],
  queryFn: () => api.getResource(id),
})
```

### Form pattern
```tsx
import { useForm, Controller } from 'react-hook-form'

const { control, handleSubmit } = useForm({ defaultValues })

<Controller name="field" control={control} render={({ field }) => (
  <SecretInput id="x" {...field} />
)} />
```

## Styling

- Use Tailwind classes
- Dark mode: `dark:` prefix
- Colors: `primary-*`, `accent-*`, `surface-*`
- Semantic: `text-success-*`, `text-warning-*`, `text-error-*`

## Required: data-testid

ALL interactive elements need `data-testid`:
```tsx
<button data-testid="settings-save">Save</button>
<input data-testid="secret-input-api-key-field" />
```

See `src/testing/ui-contract.ts` for patterns.

## File Size Limits

- Pages: **max 300 lines** (extract components if larger)
- Components: **max 150 lines** (split if larger)
- Hooks: **max 100 lines** (compose smaller hooks)

## Don't

- ❌ Create custom modals - use `Modal`
- ❌ Create custom secret inputs - use `SecretInput`
- ❌ Skip data-testid attributes
- ❌ Create new contexts without checking existing ones
- ❌ Inline 20+ line className strings - extract component
