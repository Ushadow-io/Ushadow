# Wizard Template

All wizards follow a consistent pattern using react-hook-form + Zod.

## Creating a New Wizard

### 1. Create the Wizard File

Create `src/wizards/MyServiceWizard.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useForm, FormProvider, useFormContext, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { SomeIcon, CheckCircle } from 'lucide-react'

import { wizardApi, servicesApi } from '../services/api'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage } from '../components/wizard'
import { SecretInput } from '../components/settings'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'

// 1. Define Zod schema for ALL form data
const schema = z.object({
  field1: z.string().min(1, 'Required'),
  field2: z.string().url('Must be a valid URL').optional(),
  apiKey: z.string().min(1, 'API key is required'),
})

type FormData = z.infer<typeof schema>

// 2. Define steps
const STEPS: WizardStep[] = [
  { id: 'step1', label: 'Step 1' },
  { id: 'step2', label: 'Step 2' },
  { id: 'complete', label: 'Complete' },
] as const

// 3. Main wizard component
export default function MyServiceWizard() {
  const navigate = useNavigate()
  const wizard = useWizardSteps(STEPS)
  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 4. Initialize form with react-hook-form + Zod
  const methods = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      field1: '',
      field2: '',
      apiKey: '',
    },
    mode: 'onChange',
  })

  // 5. Load existing config on mount
  useEffect(() => {
    loadExistingConfig()
  }, [])

  const loadExistingConfig = async () => {
    try {
      const response = await wizardApi.getApiKeys()
      if (response.data.my_api_key) {
        methods.setValue('apiKey', response.data.my_api_key)
      }
    } catch (err) {
      console.error('Failed to load config:', err)
    }
  }

  // 6. Save step data to backend
  const saveStepData = async (stepId: string): Promise<boolean> => {
    const data = methods.getValues()
    try {
      if (stepId === 'step2') {
        await wizardApi.updateApiKeys({ my_api_key: data.apiKey })
      }
      return true
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save') })
      return false
    }
  }

  // 7. Final completion - install the service
  const handleComplete = async () => {
    setIsSubmitting(true)
    try {
      await servicesApi.install('my-service')
      setMessage({ type: 'success', text: 'Installed! Redirecting...' })
      setTimeout(() => navigate('/my-service'), 1500)
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to install') })
      setIsSubmitting(false)
    }
  }

  // 8. Next button handler - validate current step then advance
  const handleNext = async () => {
    setMessage(null)

    if (wizard.isLast) {
      handleComplete()
      return
    }

    // Validate fields for current step before advancing
    const fieldsToValidate = getFieldsForStep(wizard.currentStep.id)
    if (fieldsToValidate.length > 0) {
      const isValid = await methods.trigger(fieldsToValidate)
      if (!isValid) return
    }

    // Save step data if needed
    setIsSubmitting(true)
    const saved = await saveStepData(wizard.currentStep.id)
    setIsSubmitting(false)

    if (saved) {
      setMessage({ type: 'success', text: 'Saved!' })
      setTimeout(() => {
        setMessage(null)
        wizard.next()
      }, 500)
    }
  }

  // 9. Map steps to their form fields for validation
  const getFieldsForStep = (stepId: string): (keyof FormData)[] => {
    switch (stepId) {
      case 'step1': return ['field1']
      case 'step2': return ['field2', 'apiKey']
      default: return []
    }
  }

  const handleBack = () => {
    setMessage(null)
    wizard.back()
  }

  return (
    <WizardShell
      wizardId="my-service"
      title="My Service Setup"
      subtitle="Description here"
      icon={SomeIcon}
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
        {wizard.currentStep.id === 'step1' && <Step1 />}
        {wizard.currentStep.id === 'step2' && <Step2 />}
        {wizard.currentStep.id === 'complete' && <CompleteStep />}
      </FormProvider>
    </WizardShell>
  )
}

// 10. Step components use useFormContext - no props needed!
function Step1() {
  const { register, formState: { errors } } = useFormContext<FormData>()

  return (
    <div data-testid="my-service-step-step1" className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Step Title
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Step description
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Field Label
        </label>
        <input
          data-testid="my-service-field1-input"
          type="text"
          {...register('field1')}
          className="input"
          placeholder="Enter value"
        />
        {errors.field1 && (
          <p className="mt-1 text-sm text-red-600">{errors.field1.message}</p>
        )}
      </div>
    </div>
  )
}
```

### 2. Register in Wizard Registry

Add to `src/wizards/registry.ts`:

```tsx
export const wizardRegistry: WizardMetadata[] = [
  // ... existing wizards
  {
    id: 'my-service',
    path: '/wizard/my-service',
    label: 'My Service',
    description: 'Brief description',
  },
]
```

### 3. Export from Index

Add to `src/wizards/index.ts`:

```tsx
export { default as MyServiceWizard } from './MyServiceWizard'
```

### 4. Add Route

In `src/App.tsx`:

```tsx
import { MyServiceWizard } from './wizards'

<Route path="wizard/my-service" element={<MyServiceWizard />} />
```

---

## Key Rules

1. **Always use Zod schema** - Define all fields upfront with validation
2. **Always use FormProvider** - Step components access form via `useFormContext`
3. **Validate per-step** - Map fields to steps, validate before advancing
4. **Save incrementally** - Save data after each step, not just at the end
5. **Use `data-testid`** - Follow `{wizardId}-step-{stepId}` pattern for step containers
6. **No prop drilling** - Steps get form state from context
7. **Register in registry** - Add to `registry.ts` for automatic discovery

---

## Common Patterns

### API Key Field with SecretInput

```tsx
import { Controller } from 'react-hook-form'
import { SecretInput } from '../components/settings'

function ApiKeyStep() {
  const { control, formState: { errors } } = useFormContext<FormData>()

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          API Key <span className="text-red-600">*</span>
        </label>
        <a
          href="https://example.com/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-600 hover:underline flex items-center space-x-1"
        >
          <span>Get API Key</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <Controller
        name="apiKey"
        control={control}
        render={({ field }) => (
          <SecretInput
            id="my-service-api-key"
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            placeholder="Enter API key"
            error={errors.apiKey?.message}
          />
        )}
      />
    </div>
  )
}
```

### Radio Selection Cards

```tsx
function ModeStep() {
  const { register, watch } = useFormContext<FormData>()
  const selectedMode = watch('mode')

  const modes = [
    { value: 'option1', label: 'Option 1', description: 'Description' },
    { value: 'option2', label: 'Option 2', description: 'Description' },
  ]

  return (
    <div className="space-y-3">
      {modes.map(mode => (
        <label
          key={mode.value}
          data-testid={`my-service-mode-${mode.value}-option`}
          className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
            selectedMode === mode.value
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
          }`}
        >
          <input
            type="radio"
            value={mode.value}
            {...register('mode')}
            className="sr-only"
          />
          <h4 className="font-semibold">{mode.label}</h4>
          <p className="text-sm text-gray-600">{mode.description}</p>
        </label>
      ))}
    </div>
  )
}
```

### Loading State with External API Check

```tsx
function ExternalServiceStep({ isChecking, status, onRefresh }) {
  if (isChecking) {
    return (
      <div className="flex flex-col items-center py-12">
        <Loader2 className="h-12 w-12 text-primary-600 animate-spin" />
        <p className="text-gray-600 mt-4">Checking service status...</p>
      </div>
    )
  }

  if (status?.connected) {
    return (
      <div className="p-4 rounded-lg border-2 border-green-200 bg-green-50">
        <div className="flex items-center space-x-3">
          <CheckCircle className="h-6 w-6 text-green-600" />
          <span className="font-medium text-green-800">Connected!</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 rounded-lg border-2 border-amber-200 bg-amber-50">
      <div className="flex items-center justify-between">
        <span className="text-amber-800">Not connected</span>
        <button onClick={onRefresh} className="text-sm text-amber-700 hover:underline">
          Retry
        </button>
      </div>
    </div>
  )
}
```

### Conditional Next Button Disabled

```tsx
// In main wizard component
const isNextDisabled = () => {
  if (wizard.currentStep.id === 'external-check') {
    return isChecking || !status?.connected
  }
  return false
}

<WizardShell
  // ...
  nextDisabled={isNextDisabled()}
>
```

---

## File Naming Conventions

- Wizard file: `src/wizards/{Service}Wizard.tsx` (PascalCase)
- Step test IDs: `{service}-step-{stepId}` (kebab-case)
- Input test IDs: `{service}-{field}-input` (kebab-case)
- Option test IDs: `{service}-{field}-{value}-option` (kebab-case)
