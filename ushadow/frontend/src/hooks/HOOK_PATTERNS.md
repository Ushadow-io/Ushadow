# Hook Patterns

> Patterns for separating logic from presentation. Follow these to keep components thin.

## Core Principle

**Components render, hooks decide.**

```
┌─────────────────┐     ┌─────────────────┐
│   Component     │────▶│      Hook       │
│  (presentation) │     │    (logic)      │
│                 │◀────│                 │
│  - JSX layout   │     │  - State        │
│  - Styling      │     │  - API calls    │
│  - Event wiring │     │  - Computed     │
└─────────────────┘     └─────────────────┘
```

## Pattern 1: Derived State Hook

Use when: Component needs to make decisions based on multiple inputs.

**Example**: `useServiceStatus` - decides icon, color, label from raw data.

```typescript
// hooks/useServiceStatus.ts
export function useServiceStatus(
  service: ServiceConfig,
  config: Record<string, any> | undefined,
  containerStatus: ContainerStatus | undefined
): ServiceStatusResult {
  return useMemo(() => {
    // All decision logic here
    if (!isConfigured) {
      return { state: 'not_configured', label: 'Missing Config', icon: AlertCircle }
    }
    // ... more decisions
  }, [service, config, containerStatus])
}

// Component just renders what the hook returns
function ServiceCard({ service, config, status }) {
  const { label, icon: Icon, color } = useServiceStatus(service, config, status)
  return <Badge color={color}><Icon />{label}</Badge>
}
```

## Pattern 2: Data Fetching Hook

Use when: Component needs server data with loading/error states.

```typescript
// hooks/useResource.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useResource(id: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['resource', id],
    queryFn: () => api.getResource(id),
    staleTime: 30_000,
  })

  const updateMutation = useMutation({
    mutationFn: api.updateResource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resource', id] })
    },
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    update: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  }
}

// Component stays simple
function ResourcePage({ id }) {
  const { data, isLoading, update } = useResource(id)
  if (isLoading) return <Spinner />
  return <ResourceForm data={data} onSave={update} />
}
```

## Pattern 3: Form Logic Hook

Use when: Form has validation, submission, and error handling.

```typescript
// hooks/useSettingsForm.ts
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  apiKey: z.string().min(1, 'Required'),
  endpoint: z.string().url('Must be a valid URL'),
})

export function useSettingsForm(defaults: SettingsData) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })

  const onSubmit = async (data: SettingsData) => {
    await api.saveSettings(data)
    toast.success('Saved')
  }

  return {
    ...form,
    onSubmit: form.handleSubmit(onSubmit),
  }
}

// Component wires up the form
function SettingsPage() {
  const { control, onSubmit, formState: { errors } } = useSettingsForm(defaults)

  return (
    <form onSubmit={onSubmit}>
      <Controller name="apiKey" control={control} render={({ field }) => (
        <SecretInput id="api-key" {...field} error={errors.apiKey?.message} />
      )} />
    </form>
  )
}
```

## Pattern 4: Action Hook with Confirmation

Use when: Action needs confirmation dialog and async handling.

```typescript
// hooks/useDeleteWithConfirm.ts
export function useDeleteWithConfirm(onDelete: (id: string) => Promise<void>) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const requestDelete = (id: string) => setPendingId(id)
  const cancelDelete = () => setPendingId(null)

  const confirmDelete = async () => {
    if (!pendingId) return
    setIsDeleting(true)
    try {
      await onDelete(pendingId)
    } finally {
      setIsDeleting(false)
      setPendingId(null)
    }
  }

  return {
    pendingId,
    isDeleting,
    isConfirmOpen: pendingId !== null,
    requestDelete,
    cancelDelete,
    confirmDelete,
  }
}
```

## Pattern 5: UI State Hook

Use when: Component has complex UI state (modals, tabs, expansion).

```typescript
// hooks/useExpandableList.ts
export function useExpandableList<T extends { id: string }>(items: T[]) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setExpandedIds(new Set(items.map(i => i.id)))
  const collapseAll = () => setExpandedIds(new Set())
  const isExpanded = (id: string) => expandedIds.has(id)

  return { isExpanded, toggle, expandAll, collapseAll }
}
```

## When to Extract a Hook

Extract when you see:
- `useState` + `useEffect` together doing something reusable
- Complex conditional rendering logic (if/else chains)
- API call + loading + error handling
- Multiple pieces of state that change together
- Same logic duplicated across components

## Hook Composition

Build complex hooks from simpler ones:

```typescript
// Compose multiple concerns
export function useServiceManager(serviceId: string) {
  const status = useServiceStatus(serviceId)
  const { start, stop } = useServiceControls(serviceId)
  const { config, updateConfig } = useServiceConfig(serviceId)
  const deleteConfirm = useDeleteWithConfirm(deleteService)

  return {
    ...status,
    start,
    stop,
    config,
    updateConfig,
    ...deleteConfirm,
  }
}
```

## File Size Guide

- **Hooks**: Max 100 lines each
- **If larger**: Split into multiple hooks and compose them
- **Export**: Always export from `hooks/index.ts`
