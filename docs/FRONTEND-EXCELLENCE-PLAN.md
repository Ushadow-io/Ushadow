# Frontend Excellence Plan

> A strategy for modular, consistent frontend code that AI agents can reliably reference and reuse.

## Problem Statement

AI agents currently:
1. Re-implement features instead of reusing existing components
2. Generate inconsistent code styles across pages
3. Create messy, sprawling code that's expensive to reference (high token usage)
4. Miss existing patterns and conventions

## Goals

1. **Component Reuse**: Agents discover and use existing components 90%+ of the time
2. **Consistency**: Generated code follows established patterns automatically
3. **Token Efficiency**: Reference docs fit in ~2K tokens, not 20K
4. **First-Time Quality**: Code passes review without major restructuring

---

## Phase 1: Component Registry (Foundation)

### 1.1 Create Component Index

Create a single source of truth that agents can quickly scan:

**File**: `frontend/src/components/COMPONENT_REGISTRY.md`

```markdown
# Component Registry

## Form Components
| Component | Import | Use Case | Example |
|-----------|--------|----------|---------|
| SecretInput | `@/components/settings/SecretInput` | API keys, passwords | `<SecretInput id="api-key" value={v} onChange={fn} />` |
| SettingField | `@/components/settings/SettingField` | Generic fields | `<SettingField id="url" type="url" label="Endpoint" />` |

## Layout Components
| Component | Import | Use Case |
|-----------|--------|----------|
| Modal | `@/components/Modal` | All modals - REQUIRED |
| ConfirmDialog | `@/components/ConfirmDialog` | Destructive actions |
| SettingsSection | `@/components/settings/SettingsSection` | Group related settings |

## Forbidden Patterns
- ❌ `fixed inset-0` DIVs → Use `Modal` component
- ❌ Custom input with eye icon → Use `SecretInput`
- ❌ Inline modal state → Use `useModal` hook
```

### 1.2 Add Path Aliases

Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/contexts/*": ["./src/contexts/*"]
    }
  }
}
```

**Why**: Agents produce cleaner imports, easier to grep/find.

---

## Phase 2: ESLint Enforcement

### 2.1 Install Additional ESLint Plugins

```bash
npm install -D \
  eslint-plugin-import \
  eslint-plugin-jsx-a11y \
  eslint-plugin-react \
  eslint-plugin-boundaries \
  @tanstack/eslint-plugin-query
```

### 2.2 Create Flat Config

**File**: `frontend/eslint.config.js`

```javascript
import js from '@eslint/js'
import typescript from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import importPlugin from 'eslint-plugin-import'
import boundaries from 'eslint-plugin-boundaries'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      'react': react,
      'react-hooks': reactHooks,
      'import': importPlugin,
      'boundaries': boundaries,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      'boundaries/elements': [
        { type: 'components', pattern: 'src/components/*' },
        { type: 'pages', pattern: 'src/pages/*' },
        { type: 'hooks', pattern: 'src/hooks/*' },
        { type: 'contexts', pattern: 'src/contexts/*' },
        { type: 'services', pattern: 'src/services/*' },
      ],
    },
    rules: {
      // === COMPONENT REUSE ENFORCEMENT ===

      // Prevent pages from having 300+ lines (force extraction)
      'max-lines': ['warn', { max: 300, skipComments: true, skipBlankLines: true }],

      // Force components to be small and focused
      'max-lines-per-function': ['warn', { max: 80, skipComments: true }],

      // === IMPORT ORGANIZATION ===
      'import/order': ['error', {
        'groups': [
          'builtin',
          'external',
          'internal',
          ['parent', 'sibling'],
          'index'
        ],
        'pathGroups': [
          { pattern: 'react', group: 'builtin', position: 'before' },
          { pattern: '@/**', group: 'internal' }
        ],
        'newlines-between': 'always',
        'alphabetize': { order: 'asc' }
      }],

      // === ARCHITECTURE BOUNDARIES ===
      'boundaries/element-types': ['error', {
        default: 'disallow',
        rules: [
          // Pages can import components, hooks, contexts, services
          { from: 'pages', allow: ['components', 'hooks', 'contexts', 'services'] },
          // Components can import other components and hooks
          { from: 'components', allow: ['components', 'hooks'] },
          // Hooks can import other hooks and services
          { from: 'hooks', allow: ['hooks', 'services', 'contexts'] },
        ]
      }],

      // === REACT BEST PRACTICES ===
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-key': 'error',

      // === ACCESSIBILITY ===
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/click-events-have-key-events': 'warn',

      // === PREVENT COMMON AGENT MISTAKES ===
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]
```

### 2.3 Add Custom Rule for Forbidden Patterns

Create `frontend/eslint-rules/no-inline-modals.js`:

```javascript
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow inline modal implementations - use Modal component',
    },
    messages: {
      useModalComponent: 'Use <Modal> from @/components/Modal instead of inline fixed positioning',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (
          node.name.name === 'className' &&
          node.value?.value?.includes('fixed inset-0')
        ) {
          context.report({ node, messageId: 'useModalComponent' })
        }
      },
    }
  },
}
```

---

## Phase 3: Hook & Context Patterns

### 3.1 Create Standard Hook Templates

**File**: `frontend/src/hooks/HOOK_PATTERNS.md`

```markdown
# Hook Patterns

## Data Fetching Hook Pattern
Use for any API data with caching:

\`\`\`typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useResource(id: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['resource', id],
    queryFn: () => api.getResource(id),
    staleTime: 30_000,
  })

  const mutation = useMutation({
    mutationFn: api.updateResource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resource', id] })
    },
  })

  return { ...query, update: mutation.mutate }
}
\`\`\`

## Form State Hook Pattern
Use for forms with validation:

\`\`\`typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

const schema = z.object({ ... })

export function useMyForm(defaults: FormData) {
  return useForm({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })
}
\`\`\`
```

### 3.2 Add Missing Utility Hooks

Create commonly needed hooks that agents keep re-implementing:

```typescript
// frontend/src/hooks/useModal.ts
export function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(v => !v),
  }
}

// frontend/src/hooks/useClipboard.ts
export function useClipboard(timeout = 2000) {
  const [copied, setCopied] = useState(false)

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), timeout)
  }

  return { copied, copy }
}

// frontend/src/hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
```

---

## Phase 4: Agent-Readable Documentation

### 4.1 Create Compact Reference Files

The key insight: **Agents need scannable, compact references—not verbose docs.**

**File**: `frontend/AGENT_QUICK_REF.md` (~1500 tokens)

```markdown
# Frontend Quick Reference for AI Agents

## Before You Code
1. Check COMPONENT_REGISTRY.md for existing components
2. Check hooks/index.ts for existing hooks
3. Use @/ path aliases

## Component Patterns

### Modal (ALWAYS use this)
\`\`\`tsx
import Modal from '@/components/Modal'
<Modal isOpen={open} onClose={close} title="Title" testId="my-modal">
  {content}
</Modal>
\`\`\`

### Form with Validation
\`\`\`tsx
import { useForm, Controller } from 'react-hook-form'
import { SecretInput } from '@/components/settings/SecretInput'

const { control, handleSubmit } = useForm()

<Controller name="apiKey" control={control} render={({ field }) => (
  <SecretInput id="api-key" {...field} />
)} />
\`\`\`

### Data Fetching
\`\`\`tsx
import { useQuery } from '@tanstack/react-query'
const { data, isLoading } = useQuery({ queryKey: ['x'], queryFn: fetchX })
\`\`\`

## Test IDs (REQUIRED)
- All interactive elements need `data-testid`
- Pattern: `{context}-{element}` e.g., `settings-save-btn`

## Styling
- Use Tailwind classes
- Dark mode: prefix with `dark:`
- Colors: primary-*, accent-*, surface-*, semantic (success/warning/error/info)

## Don't
- ❌ Create custom modals with `fixed inset-0`
- ❌ Skip data-testid attributes
- ❌ Create new state management (use existing contexts)
- ❌ Inline long className strings (extract to component)
```

### 4.2 Add Component JSDoc Examples

Every reusable component should have a clear JSDoc with example:

```typescript
/**
 * SecretInput - API key/password input with visibility toggle
 *
 * @example
 * // With react-hook-form
 * <Controller
 *   name="apiKey"
 *   control={control}
 *   render={({ field }) => (
 *     <SecretInput id="my-key" {...field} error={errors.apiKey?.message} />
 *   )}
 * />
 *
 * @example
 * // Standalone
 * <SecretInput id="token" name="token" value={value} onChange={setValue} />
 */
```

---

## Phase 5: Pre-Commit Checks

### 5.1 Add Husky + lint-staged

```bash
npm install -D husky lint-staged
npx husky init
```

**File**: `.husky/pre-commit`

```bash
#!/bin/sh
npx lint-staged
```

**File**: `package.json` (add)

```json
{
  "lint-staged": {
    "src/**/*.{ts,tsx}": [
      "eslint --fix --max-warnings 0",
      "prettier --write"
    ]
  }
}
```

### 5.2 Add data-testid Checker

**File**: `scripts/check-testids.js`

```javascript
#!/usr/bin/env node
/**
 * Verify all interactive elements have data-testid
 */
import { glob } from 'glob'
import fs from 'fs'

const INTERACTIVE_PATTERNS = [
  /<button[^>]*(?!data-testid)/gi,
  /<input[^>]*(?!data-testid)/gi,
  /<select[^>]*(?!data-testid)/gi,
  /onClick=\{[^}]+\}[^>]*(?!data-testid)/gi,
]

const files = await glob('src/**/*.tsx')
let errors = []

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  // Check for interactive elements without testid
  // ... implementation
}

if (errors.length > 0) {
  console.error('Missing data-testid attributes:')
  errors.forEach(e => console.error(`  ${e}`))
  process.exit(1)
}
```

---

## Phase 6: Directory Structure Conventions

### 6.1 Enforce Flat Component Organization

```
src/
├── components/
│   ├── COMPONENT_REGISTRY.md     # Agent-readable index
│   ├── common/                   # Truly shared (Modal, Button, etc.)
│   │   ├── Modal.tsx
│   │   ├── ConfirmDialog.tsx
│   │   └── index.ts
│   ├── forms/                    # Form-related components
│   │   ├── SecretInput.tsx
│   │   ├── SettingField.tsx
│   │   └── index.ts
│   ├── layout/                   # Layout components
│   │   └── index.ts
│   └── [feature]/               # Feature-specific components
│       └── index.ts              # Always export from index
├── hooks/
│   ├── HOOK_PATTERNS.md          # Agent-readable patterns
│   ├── index.ts                  # Central export
│   ├── useModal.ts
│   └── use[Feature].ts
├── contexts/
│   └── index.ts                  # Central export
├── pages/
│   └── [Page].tsx                # Max 300 lines
└── AGENT_QUICK_REF.md            # Top-level agent reference
```

### 6.2 Index File Convention

Every directory MUST have an `index.ts` that exports all public APIs:

```typescript
// components/forms/index.ts
export { SecretInput } from './SecretInput'
export { SettingField } from './SettingField'
export type { SecretInputProps } from './SecretInput'
```

---

## Phase 7: Agent Instructions (CLAUDE.md Updates)

### 7.1 Add to CLAUDE.md

```markdown
## Frontend Development Workflow

### Before Creating ANY Component
1. **Search first**: `grep -r "ComponentName" src/components/`
2. **Check registry**: Read `src/components/COMPONENT_REGISTRY.md`
3. **Check hooks**: Read `src/hooks/index.ts`

### When Creating New Components
1. Add to appropriate directory under `src/components/`
2. Export from directory's `index.ts`
3. Add entry to `COMPONENT_REGISTRY.md`
4. Include JSDoc with @example

### Required Patterns
- All modals: Use `<Modal>` from `@/components/common/Modal`
- All forms: Use react-hook-form + Controller pattern
- All API calls: Use @tanstack/react-query hooks
- All interactive elements: Include `data-testid`

### File Size Limits
- Pages: Max 300 lines (extract to components)
- Components: Max 150 lines (split if larger)
- Hooks: Max 100 lines (compose smaller hooks)
```

---

## Implementation Priority

| Phase | Effort | Impact | Do First? |
|-------|--------|--------|-----------|
| 1. Component Registry | Low | High | ✅ Yes |
| 2. ESLint Rules | Medium | High | ✅ Yes |
| 4. Agent Quick Ref | Low | High | ✅ Yes |
| 3. Hook Patterns | Low | Medium | Week 2 |
| 5. Pre-Commit | Medium | Medium | Week 2 |
| 6. Directory Cleanup | Medium | Medium | Week 3 |
| 7. CLAUDE.md Updates | Low | High | ✅ Yes |

---

## Measuring Success

### Before Metrics
- How often do agents re-implement existing components?
- Average lines per page file?
- ESLint warnings per PR?

### After Metrics (Targets)
- Component reuse: 90%+ of PRs use existing components
- Page file size: 95% under 300 lines
- ESLint: 0 warnings on all PRs
- First-pass review: 80%+ PRs pass without "extract this" comments

---

## Quick Wins (Do Today)

1. **Create `AGENT_QUICK_REF.md`** - Takes 30 min, immediate impact
2. **Create `COMPONENT_REGISTRY.md`** - Takes 1 hour, agents use it immediately
3. **Add `max-lines` ESLint rule** - 5 min config change, forces extraction
4. **Update CLAUDE.md** - Add "search before creating" instructions

These four changes will immediately improve agent output quality without major refactoring.
