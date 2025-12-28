# Wizard Template

All wizards follow a consistent pattern using react-hook-form + Zod.

## Standard Structure

```tsx
import { useState } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { SomeIcon } from 'lucide-react'

import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage } from '../components/wizard'
import type { WizardStep } from '../types/wizard'

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
export default function MyWizard() {
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

  // 5. Form submission handler
  const handleSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    try {
      // Call API
      await someApi.save(data)
      setMessage({ type: 'success', text: 'Saved successfully!' })
      setTimeout(() => navigate('/'), 1500)
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } } }
      setMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to save'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // 6. Next button handler - validate current step then advance
  const handleNext = async () => {
    setMessage(null)

    if (wizard.isLast) {
      // Final step - submit the form
      methods.handleSubmit(handleSubmit)()
    } else {
      // Validate fields for current step before advancing
      const fieldsToValidate = getFieldsForStep(wizard.currentStep.id)
      const isValid = await methods.trigger(fieldsToValidate)
      if (isValid) {
        wizard.next()
      }
    }
  }

  // 7. Map steps to their form fields for validation
  const getFieldsForStep = (stepId: string): (keyof FormData)[] => {
    switch (stepId) {
      case 'step1': return ['field1']
      case 'step2': return ['field2', 'apiKey']
      default: return []
    }
  }

  return (
    <WizardShell
      wizardId="my-wizard"
      title="My Wizard"
      subtitle="Description here"
      icon={SomeIcon}
      progress={wizard.progress}
      steps={STEPS}
      currentStepId={wizard.currentStep.id}
      isFirstStep={wizard.isFirst}
      onBack={() => { setMessage(null); wizard.back() }}
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

// 8. Step components use useFormContext - no props needed!
function Step1() {
  const { register, formState: { errors } } = useFormContext<FormData>()

  return (
    <div id="my-wizard-step-1" className="space-y-6">
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
          id="my-wizard-field1"
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

## Key Rules

1. **Always use Zod schema** - Define all fields upfront with validation
2. **Always use FormProvider** - Step components access form via `useFormContext`
3. **Validate per-step** - Map fields to steps, validate before advancing
4. **Consistent IDs** - Use `{wizardId}-step-{stepId}` pattern for step containers
5. **Consistent error handling** - Use the typed error pattern
6. **No prop drilling** - Steps get form state from context

## File Naming

- `src/wizards/MyWizard.tsx` - Main wizard file
- Export from `src/wizards/index.ts`
- Add route in `src/App.tsx`

## Common Patterns

### API Key Field
```tsx
<div>
  <div className="flex items-center justify-between">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      API Key <span className="text-red-600">*</span>
    </label>
    <a href="https://example.com/keys" target="_blank" rel="noopener noreferrer"
       className="text-xs text-primary-600 hover:underline">
      Get API Key
    </a>
  </div>
  <input type="password" {...register('apiKey')} className="input mt-2" />
  {errors.apiKey && <p className="mt-1 text-sm text-red-600">{errors.apiKey.message}</p>}
</div>
```

### Radio Selection
```tsx
<div className="space-y-3">
  {options.map(opt => (
    <label key={opt.value}
      className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
        watch('field') === opt.value
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
      }`}>
      <input type="radio" value={opt.value} {...register('field')} className="sr-only" />
      <h4 className="font-semibold">{opt.label}</h4>
      <p className="text-sm text-gray-600">{opt.description}</p>
    </label>
  ))}
</div>
```

### Conditional Steps
```tsx
const enableFeature = methods.watch('enableFeature')
const activeSteps = enableFeature
  ? STEPS
  : STEPS.filter(s => s.id !== 'feature-config')
const wizard = useWizardSteps(activeSteps)
```
