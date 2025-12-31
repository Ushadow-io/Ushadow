/**
 * SecretInput - Reusable secret/API key input with visibility toggle.
 *
 * Features:
 * - Show/hide toggle for secret values
 * - Masked display for sensitive data
 * - Consistent test IDs for Playwright automation
 */

import { useState, forwardRef } from 'react'
import { Eye, EyeOff, Key } from 'lucide-react'

export interface SecretInputProps {
  /** Unique identifier for the input (used in test IDs) */
  id: string
  /** Input name attribute */
  name: string
  /** Input value */
  value: string
  /** Change handler */
  onChange: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Whether the input is disabled */
  disabled?: boolean
  /** Additional CSS classes */
  className?: string
  /** Show key icon */
  showIcon?: boolean
  /** Error message to display */
  error?: string
}

export const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(
  (
    {
      id,
      name,
      value,
      onChange,
      placeholder = 'Enter API key...',
      disabled = false,
      className = '',
      showIcon = true,
      error,
    },
    ref
  ) => {
    const [visible, setVisible] = useState(false)

    const testId = `secret-input-${id}`

    return (
      <div className="relative" data-testid={testId}>
        <div className="relative">
          {showIcon && (
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          )}
          <input
            ref={ref}
            type={visible ? 'text' : 'password'}
            id={id}
            name={name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            data-testid={`${testId}-field`}
            className={`
              w-full rounded-lg border px-3 py-2 pr-10
              ${showIcon ? 'pl-10' : 'pl-3'}
              ${error
                ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                : 'border-neutral-300 dark:border-neutral-600 focus:ring-primary-500'
              }
              bg-white dark:bg-neutral-800
              text-neutral-900 dark:text-neutral-100
              placeholder-neutral-400 dark:placeholder-neutral-500
              focus:outline-none focus:ring-2 focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
              ${className}
            `}
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            disabled={disabled}
            data-testid={`${testId}-toggle`}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 disabled:opacity-50"
            aria-label={visible ? 'Hide value' : 'Show value'}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400" data-testid={`${testId}-error`}>
            {error}
          </p>
        )}
      </div>
    )
  }
)

SecretInput.displayName = 'SecretInput'

export default SecretInput
