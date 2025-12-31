/**
 * SettingField - Reusable setting input field with label.
 *
 * Supports different field types: text, secret, url, select, toggle.
 * Provides consistent styling and test IDs across all settings UIs.
 */

import { forwardRef, type ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import { SecretInput } from './SecretInput'

export type SettingType = 'text' | 'secret' | 'url' | 'select' | 'toggle'

export interface SelectOption {
  value: string
  label: string
}

export interface SettingFieldProps {
  /** Unique identifier (used in test IDs) */
  id: string
  /** Field name */
  name: string
  /** Display label */
  label: string
  /** Field type */
  type: SettingType
  /** Current value */
  value: string | boolean
  /** Change handler */
  onChange: (value: string | boolean) => void
  /** Optional description/help text */
  description?: string
  /** Placeholder for text inputs */
  placeholder?: string
  /** Whether the field is required */
  required?: boolean
  /** Whether the field is disabled */
  disabled?: boolean
  /** Error message */
  error?: string
  /** Select options (for type='select') */
  options?: SelectOption[]
  /** Additional content to render after the input */
  suffix?: ReactNode
}

export const SettingField = forwardRef<HTMLInputElement, SettingFieldProps>(
  (
    {
      id,
      name,
      label,
      type,
      value,
      onChange,
      description,
      placeholder,
      required = false,
      disabled = false,
      error,
      options = [],
      suffix,
    },
    ref
  ) => {
    const testId = `setting-field-${id}`

    const renderInput = () => {
      switch (type) {
        case 'secret':
          return (
            <SecretInput
              ref={ref}
              id={id}
              name={name}
              value={value as string}
              onChange={(v) => onChange(v)}
              placeholder={placeholder}
              disabled={disabled}
              error={error}
            />
          )

        case 'toggle':
          return (
            <button
              type="button"
              role="switch"
              aria-checked={value as boolean}
              onClick={() => onChange(!(value as boolean))}
              disabled={disabled}
              data-testid={`${testId}-toggle`}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${value ? 'bg-primary-600' : 'bg-neutral-300 dark:bg-neutral-600'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${value ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          )

        case 'select':
          return (
            <select
              id={id}
              name={name}
              value={value as string}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              data-testid={`${testId}-select`}
              className={`
                w-full rounded-lg border px-3 py-2
                ${error
                  ? 'border-red-300 dark:border-red-700'
                  : 'border-neutral-300 dark:border-neutral-600'
                }
                bg-white dark:bg-neutral-800
                text-neutral-900 dark:text-neutral-100
                focus:outline-none focus:ring-2 focus:ring-primary-500
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )

        case 'url':
        case 'text':
        default:
          return (
            <input
              ref={ref}
              type={type === 'url' ? 'url' : 'text'}
              id={id}
              name={name}
              value={value as string}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              data-testid={`${testId}-input`}
              className={`
                w-full rounded-lg border px-3 py-2
                ${error
                  ? 'border-red-300 dark:border-red-700'
                  : 'border-neutral-300 dark:border-neutral-600'
                }
                bg-white dark:bg-neutral-800
                text-neutral-900 dark:text-neutral-100
                placeholder-neutral-400 dark:placeholder-neutral-500
                focus:outline-none focus:ring-2 focus:ring-primary-500
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            />
          )
      }
    }

    return (
      <div className="space-y-1" data-testid={testId}>
        <div className="flex items-center justify-between">
          <label
            htmlFor={id}
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            data-testid={`${testId}-label`}
          >
            {required && <span className="text-red-500 mr-1">*</span>}
            {label}
          </label>
          {description && (
            <div className="group relative">
              <HelpCircle className="h-4 w-4 text-neutral-400" />
              <div className="absolute right-0 top-6 z-10 hidden group-hover:block w-64 p-2 bg-neutral-800 text-white text-xs rounded shadow-lg">
                {description}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">{renderInput()}</div>
          {suffix}
        </div>
        {error && type !== 'secret' && (
          <p className="text-sm text-red-600 dark:text-red-400" data-testid={`${testId}-error`}>
            {error}
          </p>
        )}
      </div>
    )
  }
)

SettingField.displayName = 'SettingField'

export default SettingField
