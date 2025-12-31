# Adding New Services to Ushadow

This guide explains how to add a new service to the Ushadow platform, using Speaker Recognition as a reference implementation.

## Overview

Ushadow uses a modular architecture where each service consists of:

1. **Compose File** (`compose/*.yaml`) - Docker service definitions with metadata
2. **Setup Wizard** (`frontend/src/wizards/*Wizard.tsx`) - User-guided setup
3. **Wizard Registry** (`frontend/src/wizards/registry.ts`) - Register for discovery
4. **Service Page** (`frontend/src/pages/*Page.tsx`) - Service UI/dashboard
5. **Routes & Navigation** - Integration into the app

## Quick Reference

| Component | Location | Template |
|-----------|----------|----------|
| Compose file | `compose/{service}-compose.yaml` | `compose/chronicle-compose.yaml` |
| Setup wizard | `ushadow/frontend/src/wizards/{Service}Wizard.tsx` | `SpeakerRecognitionWizard.tsx` |
| Wizard registry | `ushadow/frontend/src/wizards/registry.ts` | See existing entries |
| Wizard exports | `ushadow/frontend/src/wizards/index.ts` | See existing exports |
| Service page | `ushadow/frontend/src/pages/{Service}Page.tsx` | `SpeakerRecognitionPage.tsx` |
| Routes | `ushadow/frontend/src/App.tsx` | See existing routes |
| Navigation | `ushadow/frontend/src/components/layout/Layout.tsx` | See `navigationItems` |

---

## Step 1: Create the Compose File

Create `compose/{service-name}-compose.yaml`:

```yaml
# =============================================================================
# USHADOW METADATA (ignored by Docker, read by ushadow backend)
# =============================================================================
x-ushadow:
  my-service:
    description: "Short description of what this service does"
    requires: [llm, transcription]  # Capabilities it needs (optional)
    tags: ["tag1", "tag2"]

services:
  my-service:
    image: my-service:latest
    container_name: ${COMPOSE_PROJECT_NAME:-ushadow}-my-service
    ports:
      - "${MY_SERVICE_PORT:-8080}:8080"
    environment:
      - MY_API_KEY=${MY_API_KEY}
    networks:
      - infra-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

networks:
  infra-network:
    name: infra-network
    external: true
```

### Key Patterns

- **`x-ushadow` metadata**: Describes the service for the UI (capabilities, tags, description)
- **Environment variables**: Use `${VAR:-default}` pattern, NOT `env_file`
- **Container naming**: Use `${COMPOSE_PROJECT_NAME:-ushadow}-{service}`
- **Networks**: Connect to `infra-network` for inter-service communication
- **Health checks**: Always include for status monitoring

### Important: Environment Variables

Ushadow passes environment variables directly to containers - do NOT use `env_file` in compose files. The backend reads settings from the config store and injects them as environment variables when starting services.

---

## Step 2: Create Setup Wizard

Create `ushadow/frontend/src/wizards/{Service}Wizard.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useForm, FormProvider, useFormContext, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { YourIcon, CheckCircle } from 'lucide-react'

import { wizardApi, composeServicesApi } from '../services/api'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage } from '../components/wizard'
import { SecretInput } from '../components/settings'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'

// Form schema
const myServiceSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
})

type MyServiceFormData = z.infer<typeof myServiceSchema>

// Wizard steps
const STEPS: WizardStep[] = [
  { id: 'config', label: 'Configuration' },
  { id: 'complete', label: 'Complete' },
] as const

export default function MyServiceWizard() {
  const navigate = useNavigate()
  const wizard = useWizardSteps(STEPS)
  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const methods = useForm<MyServiceFormData>({
    resolver: zodResolver(myServiceSchema),
    defaultValues: { apiKey: '' },
    mode: 'onChange',
  })

  // Save API keys via wizard API
  const saveConfig = async () => {
    const data = methods.getValues()
    await wizardApi.updateApiKeys({
      my_api_key: data.apiKey,
    })
  }

  // Install service on completion
  const handleComplete = async () => {
    setIsSubmitting(true)
    try {
      await composeServicesApi.install('my-service')
      setMessage({ type: 'success', text: 'Service installed! Redirecting...' })
      setTimeout(() => navigate('/my-service'), 1500)
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to install') })
      setIsSubmitting(false)
    }
  }

  // ... implement step handlers following SpeakerRecognitionWizard pattern

  return (
    <WizardShell
      wizardId="my-service"
      title="My Service Setup"
      subtitle="Configure your service"
      icon={YourIcon}
      progress={wizard.progress}
      steps={STEPS}
      currentStepId={wizard.currentStep.id}
      isFirstStep={wizard.isFirst}
      onBack={handleBack}
      onNext={handleNext}
      nextLoading={isSubmitting}
      message={message}
    >
      <FormProvider {...methods}>
        {wizard.currentStep.id === 'config' && <ConfigStep />}
        {wizard.currentStep.id === 'complete' && <CompleteStep />}
      </FormProvider>
    </WizardShell>
  )
}
```

### Testing Conventions

Follow `CLAUDE.md` for `data-testid` patterns:
- Step containers: `{wizard}-step-{stepId}` (e.g., `my-service-step-config`)
- Option buttons: `{wizard}-{field}-{value}-option`
- Secret inputs: Use `SecretInput` component with proper `id`

---

## Step 3: Register in Wizard Registry

Add your wizard to `ushadow/frontend/src/wizards/registry.ts`:

```tsx
export const wizardRegistry: WizardMetadata[] = [
  // ... existing wizards
  {
    id: 'my-service',
    path: '/wizard/my-service',
    label: 'My Service',
    description: 'Brief description for testing page',
  },
]
```

This enables automatic discovery on the wizard start page (behind the `show_wizard_testing` feature flag).

---

## Step 4: Export the Wizard

In `ushadow/frontend/src/wizards/index.ts`:

```tsx
export { default as MyServiceWizard } from './MyServiceWizard'
```

---

## Step 5: Create Service Page

Create `ushadow/frontend/src/pages/{Service}Page.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { YourIcon, Settings, ExternalLink } from 'lucide-react'

export default function MyServicePage() {
  const navigate = useNavigate()
  const [isConnected, setIsConnected] = useState(false)

  // If not configured, show setup prompt
  if (!isConnected) {
    return (
      <div data-testid="my-service-setup-prompt">
        {/* Setup card with button to navigate to wizard */}
        <button onClick={() => navigate('/wizard/my-service')}>
          Set Up My Service
        </button>
      </div>
    )
  }

  // Main connected view with tabs
  return (
    <div data-testid="my-service-page">
      {/* Header, status cards, tabs, content */}
    </div>
  )
}
```

---

## Step 6: Add Routes

In `ushadow/frontend/src/App.tsx`:

```tsx
// Import the new components
import MyServicePage from './pages/MyServicePage'
import { MyServiceWizard } from './wizards'

// Add routes inside the protected routes section
<Route path="wizard/my-service" element={<MyServiceWizard />} />
<Route path="my-service" element={<MyServicePage />} />
```

---

## Step 7: Add Navigation

In `ushadow/frontend/src/components/layout/Layout.tsx`:

```tsx
const navigationItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  // Add your service (consider logical grouping)
  { path: '/my-service', label: 'My Service', icon: YourIcon },
  // ... other items
]
```

---

## Step 8: Add Backend API (if needed)

If your wizard needs custom backend endpoints (e.g., to validate external APIs), add them to `ushadow/backend/src/routers/wizard.py`:

```python
@router.get("/my-service/status")
async def check_my_service_status():
    """Check if external service is accessible."""
    # Validate API key, check connectivity, etc.
    return {"connected": True, "status": "ok"}
```

And add corresponding types/functions to `ushadow/frontend/src/services/api.ts`.

---

## Checklist

- [ ] Compose file with `x-ushadow` metadata (no `env_file`)
- [ ] Setup wizard with step-by-step configuration
- [ ] Wizard registered in `registry.ts`
- [ ] Wizard exported from `index.ts`
- [ ] Service page with connected/disconnected states
- [ ] Routes in App.tsx
- [ ] Navigation item in Layout.tsx
- [ ] All interactive elements have `data-testid` attributes
- [ ] Backend API endpoints if external validation needed

---

## Example: Speaker Recognition

For a complete reference implementation, see:

- `compose/speaker-recognition-compose.yaml`
- `ushadow/frontend/src/wizards/SpeakerRecognitionWizard.tsx`
- `ushadow/frontend/src/wizards/registry.ts` (entry for speaker-recognition)
- `ushadow/frontend/src/pages/SpeakerRecognitionPage.tsx`
- `ushadow/backend/src/routers/wizard.py` (HuggingFace validation endpoints)

This service demonstrates:
- Token-first wizard flow with external API validation
- Model access checking (gated HuggingFace models)
- CPU/GPU compute mode selection
- Optional capabilities (Deepgram transcription)
- Tab-based page with status, speakers, enrollment views
