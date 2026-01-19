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

- Pages: **max 600 lines** (extract components if larger)
- Components: **max 300 lines** (split if larger)
- Hooks: **max 100 lines** (compose smaller hooks)

## Common UI Bugs (AVOID THESE)

### 1. Z-Index / Stacking Issues
```tsx
// ❌ BAD - arbitrary z-index values
className="z-[999]"
className="z-50"

// ✅ GOOD - use defined scale from tailwind.config.js
className="z-dropdown"  // 50 - menus, dropdowns
className="z-modal"     // 60 - modals, dialogs
className="z-toast"     // 70 - notifications
```
**Rule**: Modals must use portal (Modal component does this). Dropdowns need `z-dropdown`.

### 2. Menus/Dropdowns Getting Cutoff
```tsx
// ❌ BAD - dropdown trapped in overflow:hidden parent
<div className="overflow-hidden">
  <Dropdown />  // Gets clipped!
</div>

// ✅ GOOD - use overflow-visible or portal for dropdowns
<div className="overflow-visible">
  <Dropdown />
</div>
// Or render dropdown in a portal
```

### 3. Text Not Truncating
```tsx
// ❌ BAD - text overflows container
<span>{longText}</span>

// ✅ GOOD - truncate with ellipsis
<span className="truncate">{longText}</span>

// ✅ GOOD - multi-line truncate (2 lines)
<p className="line-clamp-2">{longText}</p>
```
**Note**: `truncate` requires a width constraint (parent with `w-*` or `flex` with `min-w-0`)

### 4. Layout Shift When Content Expands
```tsx
// ❌ BAD - drawer/panel pushes siblings
<div>
  <Sidebar />      // When this expands...
  <MainContent />  // ...this shifts!
</div>

// ✅ GOOD - use fixed dimensions or absolute positioning
<div className="flex">
  <aside className="w-64 shrink-0">  // Fixed width, won't collapse
    <Sidebar />
  </aside>
  <main className="flex-1 min-w-0">  // Takes remaining space
    <MainContent />
  </main>
</div>

// ✅ GOOD - overlay doesn't affect layout
<div className="relative">
  <MainContent />
  <Drawer className="absolute right-0 top-0" />  // Overlays, doesn't push
</div>
```

### 5. State Not Reflecting Status (Start/Stop bugs)
```tsx
// ❌ BAD - optimistic update without error handling
const handleStart = () => {
  setStatus('running')  // Assumes success!
  api.startService()
}

// ✅ GOOD - update state AFTER confirmation
const handleStart = async () => {
  setIsStarting(true)
  try {
    await api.startService()
    // Don't manually set status - let the query refetch
    await queryClient.invalidateQueries(['service', id])
  } finally {
    setIsStarting(false)
  }
}

// ✅ BEST - use the useServiceStatus hook
const status = useServiceStatus(service, config, containerStatus)
// Status derived from actual data, not local state
```

## Don't

- ❌ Create custom modals - use `Modal`
- ❌ Create custom secret inputs - use `SecretInput`
- ❌ Skip data-testid attributes
- ❌ Create new contexts without checking existing ones
- ❌ Inline 20+ line className strings - extract component
- ❌ Use arbitrary z-index values - use `z-dropdown`, `z-modal`, `z-toast`
- ❌ Optimistically update status - fetch actual state after actions
