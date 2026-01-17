/**
 * RequiredFieldsForm - Reusable component for rendering and managing required configuration fields
 *
 * This is the single source of truth for required fields logic, used by:
 * - QuickstartWizard (setup flow)
 * - SettingsPage (configuration management)
 * - Any future consumers needing required fields UI
 *
 * Architecture:
 * - Uses react-hook-form Controller for form integration
 * - Displays capabilities grouped by provider
 * - Handles secret/text/url field types
 * - Provides external links to obtain API keys
 */

import { useFormContext, Controller } from 'react-hook-form'
import { ExternalLink, AlertCircle, CheckCircle } from 'lucide-react'
import type { CapabilityRequirement, MissingKey } from '../../services/api'
import { SecretInput, SettingField } from '../settings'

// =============================================================================
// Main Component
// =============================================================================

export interface RequiredFieldsFormProps {
  /** List of capabilities that need configuration */
  capabilities: CapabilityRequirement[]
  /** Prefix for test IDs (e.g., 'quickstart' or 'settings') */
  testIdPrefix: string
  /** Optional custom empty state message */
  emptyMessage?: {
    title: string
    description: string
  }
  /** Optional className for the container */
  className?: string
  /** Show a header with title and description */
  showHeader?: boolean
  /** Custom header title */
  headerTitle?: string
  /** Custom header description */
  headerDescription?: string
}

export function RequiredFieldsForm({
  capabilities,
  testIdPrefix,
  emptyMessage = {
    title: 'All Set!',
    description: 'All required configuration is complete.'
  },
  className = '',
  showHeader = false,
  headerTitle = 'Configure Required Fields',
  headerDescription = 'Enter the required information to enable features.'
}: RequiredFieldsFormProps) {
  // Filter to only capabilities that actually need setup
  const capabilitiesNeedingSetup = capabilities.filter(
    cap => !cap.configured && cap.missing_keys.length > 0
  )

  // Empty state - all configured
  if (capabilitiesNeedingSetup.length === 0) {
    return (
      <div
        data-testid={`${testIdPrefix}-fields-empty`}
        className={`text-center space-y-4 py-6 ${className}`}
      >
        <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto" />
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {emptyMessage.title}
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {emptyMessage.description}
        </p>
      </div>
    )
  }

  return (
    <div data-testid={`${testIdPrefix}-fields-form`} className={`space-y-6 ${className}`}>
      {showHeader && (
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            {headerTitle}
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {headerDescription}
          </p>
        </div>
      )}

      {capabilitiesNeedingSetup.map((capability) => (
        <CapabilityFieldGroup
          key={capability.id}
          capability={capability}
          testIdPrefix={testIdPrefix}
        />
      ))}
    </div>
  )
}

// =============================================================================
// Capability Group - Displays provider info and its required fields
// =============================================================================

interface CapabilityFieldGroupProps {
  capability: CapabilityRequirement
  testIdPrefix: string
}

function CapabilityFieldGroup({ capability, testIdPrefix }: CapabilityFieldGroupProps) {
  // Format capability ID for display (llm -> LLM, transcription -> Transcription)
  const capabilityLabel = capability.id === 'llm'
    ? 'LLM'
    : capability.id.charAt(0).toUpperCase() + capability.id.slice(1)

  return (
    <div
      data-testid={`${testIdPrefix}-capability-${capability.id}`}
      className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg space-y-4"
    >
      {/* Header - Provider info */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
            {capabilityLabel} Provider
          </h4>
          {capability.provider_name && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Using {capability.provider_name}
              {capability.provider_mode && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                  {capability.provider_mode}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Error message if any */}
      {capability.error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm rounded">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{capability.error}</span>
        </div>
      )}

      {/* Missing keys fields */}
      <div className="space-y-3">
        {capability.missing_keys.map((key) => (
          <KeyField
            key={key.key}
            keyInfo={key}
            capabilityId={capability.id}
            testIdPrefix={testIdPrefix}
          />
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// Individual Field - Secret/Text/URL input
// =============================================================================

interface KeyFieldProps {
  keyInfo: MissingKey
  capabilityId: string
  testIdPrefix: string
}

function KeyField({ keyInfo, capabilityId, testIdPrefix }: KeyFieldProps) {
  const { control } = useFormContext()

  if (!keyInfo.settings_path) return null

  const fieldId = `${testIdPrefix}-${capabilityId}-${keyInfo.key}`

  return (
    <div data-testid={`${testIdPrefix}-field-${capabilityId}-${keyInfo.key}`} className="space-y-2">
      {/* Label with optional link to get API key */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {keyInfo.label} <span className="text-red-600">*</span>
        </label>
        {keyInfo.link && (
          <a
            href={keyInfo.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-600 hover:underline flex items-center gap-1"
            data-testid={`${fieldId}-link`}
          >
            Get API Key <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Form field - controlled by react-hook-form */}
      <Controller
        name={keyInfo.settings_path}
        control={control}
        defaultValue=""
        render={({ field }) => {
          // Secret fields (API keys, passwords)
          if (keyInfo.type === 'secret') {
            return (
              <SecretInput
                id={fieldId}
                name={field.name as string}
                value={(field.value as string) || ''}
                onChange={field.onChange}
                placeholder={`Enter ${keyInfo.label}`}
              />
            )
          }

          // Text or URL fields
          return (
            <SettingField
              id={fieldId}
              name={field.name as string}
              label=""
              type={keyInfo.type === 'url' ? 'url' : 'text'}
              value={(field.value as string) || ''}
              onChange={field.onChange}
              placeholder={`Enter ${keyInfo.label}`}
            />
          )
        }}
      />
    </div>
  )
}

export default RequiredFieldsForm
