/**
 * WizardFormContext - Handles react-hook-form integration with settings paths.
 *
 * Problem: react-hook-form creates nested objects from dotted field names.
 * e.g., field name "api_keys.openai_api_key" creates { api_keys: { openai_api_key: "..." } }
 *
 * This context provides:
 * - Wrapper around FormProvider that handles the transformation
 * - getValue(settingsPath) - get value by dot-path from nested form data
 * - getValuesFlat() - get all values as flat { settings_path: value } for API
 * - saveToApi(saveFn) - flatten and save via provided API function
 */

import { createContext, useContext, useCallback, ReactNode } from 'react'
import {
  useForm,
  FormProvider,
  useFormContext,
  UseFormReturn,
  FieldValues,
  DefaultValues,
} from 'react-hook-form'

// =============================================================================
// Utilities
// =============================================================================

/**
 * Get a nested value from an object using dot-path notation.
 * e.g., getNestedValue(obj, "api_keys.openai_api_key")
 */
export function getNestedValue(obj: Record<string, any>, path: string): string | undefined {
  const keys = path.split('.')
  let current: any = obj
  for (const key of keys) {
    if (current === undefined || current === null) return undefined
    current = current[key]
  }
  return typeof current === 'string' ? current : undefined
}

/**
 * Flatten a nested object to dot-path keys.
 * e.g., { api_keys: { openai_api_key: "sk-..." } } -> { "api_keys.openai_api_key": "sk-..." }
 */
export function flattenToDotPaths(obj: Record<string, any>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenToDotPaths(value, fullPath))
    } else if (typeof value === 'string' && value.trim() !== '') {
      result[fullPath] = value
    }
  }
  return result
}

// =============================================================================
// Context
// =============================================================================

interface WizardFormContextValue<T extends FieldValues = FieldValues> {
  /** The react-hook-form methods */
  form: UseFormReturn<T>

  /** Get a value by settings path (handles nested form data) */
  getValue: (settingsPath: string) => string | undefined

  /** Get all non-empty values as flat { settings_path: value } for API calls */
  getValuesFlat: () => Record<string, string>

  /** Validate that all required settings paths have values */
  validateRequired: (settingsPaths: string[]) => { valid: boolean; missing?: string }

  /** Save values via provided API function */
  saveToApi: <R>(
    saveFn: (values: Record<string, string>) => Promise<R>
  ) => Promise<{ success: boolean; result?: R; error?: string }>
}

const WizardFormContext = createContext<WizardFormContextValue | undefined>(undefined)

// =============================================================================
// Provider
// =============================================================================

interface WizardFormProviderProps<T extends FieldValues> {
  children: ReactNode
  defaultValues?: DefaultValues<T>
  mode?: 'onChange' | 'onBlur' | 'onSubmit' | 'onTouched' | 'all'
}

export function WizardFormProvider<T extends FieldValues = FieldValues>({
  children,
  defaultValues,
  mode = 'onChange',
}: WizardFormProviderProps<T>) {
  const form = useForm<T>({
    defaultValues,
    mode,
  })

  const getValue = useCallback(
    (settingsPath: string): string | undefined => {
      const data = form.getValues()
      return getNestedValue(data as Record<string, any>, settingsPath)
    },
    [form]
  )

  const getValuesFlat = useCallback((): Record<string, string> => {
    const data = form.getValues()
    return flattenToDotPaths(data as Record<string, any>)
  }, [form])

  const validateRequired = useCallback(
    (settingsPaths: string[]): { valid: boolean; missing?: string } => {
      for (const path of settingsPaths) {
        const value = getValue(path)
        if (!value || value.trim() === '') {
          return { valid: false, missing: path }
        }
      }
      return { valid: true }
    },
    [getValue]
  )

  const saveToApi = useCallback(
    async <R,>(
      saveFn: (values: Record<string, string>) => Promise<R>
    ): Promise<{ success: boolean; result?: R; error?: string }> => {
      try {
        const values = getValuesFlat()
        if (Object.keys(values).length === 0) {
          return { success: true } // Nothing to save
        }
        const result = await saveFn(values)
        return { success: true, result }
      } catch (error: any) {
        const message = error?.response?.data?.detail || error?.message || 'Failed to save'
        return { success: false, error: message }
      }
    },
    [getValuesFlat]
  )

  const contextValue: WizardFormContextValue = {
    form: form as UseFormReturn<FieldValues>,
    getValue,
    getValuesFlat,
    validateRequired,
    saveToApi,
  }

  return (
    <WizardFormContext.Provider value={contextValue}>
      <FormProvider {...form}>{children}</FormProvider>
    </WizardFormContext.Provider>
  )
}

// =============================================================================
// Hook
// =============================================================================

export function useWizardForm<T extends FieldValues = FieldValues>(): WizardFormContextValue<T> {
  const context = useContext(WizardFormContext)
  if (context === undefined) {
    throw new Error('useWizardForm must be used within a WizardFormProvider')
  }
  return context as WizardFormContextValue<T>
}

/**
 * Convenience hook that provides both WizardFormContext and react-hook-form's useFormContext.
 * Use this in child components that need to register fields.
 */
export function useWizardFormField<T extends FieldValues = FieldValues>() {
  const wizardForm = useWizardForm<T>()
  const formContext = useFormContext<T>()
  return {
    ...wizardForm,
    ...formContext,
  }
}
