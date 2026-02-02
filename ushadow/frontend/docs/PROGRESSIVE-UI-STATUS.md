# Progressive Provider Configuration UI - Status

## Core Design Principle
**"Wires = great for understanding, dropdowns = better for configuring"**

Replace drag-drop wiring with dropdown-based provider selection while keeping visual overview for understanding.

---

## UX Design (from plan)

### Single-config service (FlatServiceCard)
```
┌─────────────────────────────────────────────────┐
│ Chronicle                           [▸] [⚙️] [+] │
│ ──────────────────────────────────────────────── │
│ LLM:           [OpenAI (default)      ▼] [→]    │
│ Transcription: [Deepgram (default)    ▼] [→]    │
│ Memory:        [OpenMemory            ▼] [→]    │
└─────────────────────────────────────────────────┘
```
- Each capability has a dropdown to select provider
- **[→] arrow** opens provider config to edit or create new preset instance

### Multi-config service (2+ configs)
```
┌─────────────────────────────────────────────────┐
│ Chronicle                                   [+] │
│ ├─ production        [▸ Running] [⚙️]           │
│ │   └─ LLM: OpenAI, Memory: OpenMemory         │
│ └─ staging           [■ Stopped] [⚙️]           │
│     └─ LLM: Ollama (local)                     │
└─────────────────────────────────────────────────┘
```
- Collapsed view showing config variants
- Each variant has its own wiring

### Dropdown structure with cascading submenu
```
LLM Provider: [OpenAI (default)          ▼]
┌─────────────────────────────────┬──────────────────────────┐
│ Defaults                        │                          │
│ ├─ OpenAI - gpt-4o-mini    [→] │ API Key: [__________]    │
│ ├─ Anthropic - claude      [→] │ Base URL: [openai.com]   │
│ └─ Ollama - llama3.1       [→] │ Model: [gpt-4o-mini]     │
├─────────────────────────────────┤                          │
│ Saved Configurations            │    [Cancel] [Save as...] │
│ └─ OpenAI (fast)                │                          │
├─────────────────────────────────┴──────────────────────────┘
│ + Create new configuration...
└─────────────────────────────────
```
- Click provider name → selects it immediately
- Click **[→]** arrow → opens cascading submenu showing provider settings
- Change any value → prompts for configuration name → saves as new config

### Two tabs
- **Configuration** - Service cards with dropdown-based provider selection
- **System Overview** - Read-only visualization of wiring

---

## What's Built

| Component | Status | Location |
|-----------|--------|----------|
| `useProviderConfigs` hook | ✅ Done | `src/hooks/useProviderConfigs.ts` |
| `useServiceHierarchy` hook | ✅ Done | `src/hooks/useServiceHierarchy.ts` |
| `useWiringActions` hook | ✅ Done | `src/hooks/useWiringActions.ts` |
| `ProviderConfigDropdown` | ✅ Done | `src/components/wiring/ProviderConfigDropdown.tsx` (w/ cascading submenu) |
| `EnvVarMappingRow` | ✅ Done | `src/components/wiring/EnvVarMappingRow.tsx` |
| `CapabilitySlot` (dropdown mode) | ✅ Done | `src/components/wiring/CapabilitySlot.tsx` |
| `ProviderConfigForm` | ✅ Done | `src/components/wiring/ProviderConfigForm.tsx` |
| `FlatServiceCard` | ✅ Done | `src/components/wiring/FlatServiceCard.tsx` |
| `SystemOverview` | ✅ Done | `src/components/wiring/SystemOverview.tsx` |
| `SlideOutPanel` | ✅ Done | `src/components/SlideOutPanel.tsx` |
| ServiceConfigsPage integration | ✅ Done | Tabs + FlatServiceCard grid |
| **[→] Arrow button** | ✅ Done | Opens slide-out drawer for provider config |
| **Preset instance flow** | ✅ Done | Create new config from arrow or dropdown |

---

## What's Missing

### 1. Multi-config view
When a service has 2+ ServiceConfig instances:
- Show hierarchical/nested view instead of FlatServiceCard
- Each config variant shown as collapsible row
- Summary of wiring shown inline

### 2. Env vars preview in service card
Quick view of what env vars will be set when service runs
(Note: Full env var editing happens in Deploy modal - this is just preview)

---

## Current Issues Fixed

1. ✅ Dropdown menus appearing behind cards - removed `overflow-hidden`
2. ✅ Provider section added with edit capability chips
3. ✅ Deploy button added to FlatServiceCard
4. ✅ [→] arrow button added to CapabilitySlot dropdown mode
5. ✅ Arrow click opens slide-out drawer with pre-populated provider config
6. ✅ Dropdown menus clipped by parent overflow - fixed with React Portal (`createPortal`)
7. ✅ Converted from screen-level slide-out to inline progressive expansion within card
8. ✅ **Cascading submenu** - Arrow on each provider opens settings panel to the right
9. ✅ **Save-as flow** - Changing values prompts for config name before saving
10. ✅ **Env var mapping** - Submenu shows actual env vars with mapping status (like EnvVarEditor)
11. ✅ **Simplified env var row UI** - Replaced 3 icon buttons with single dropdown (default/mapped/override)

---

## Files to Modify for Remaining Features

### For multi-config view:
- `src/components/wiring/MultiConfigServiceCard.tsx` - NEW component
- `src/pages/ServiceConfigsPage.tsx` - Use `useServiceHierarchy` to switch between Flat/Multi

### For env vars preview:
- `src/components/wiring/FlatServiceCard.tsx` - Add collapsible env vars section
