/**
 * ProviderSelector - Select a provider for a capability.
 *
 * Displays available providers for a capability (llm, transcription, memory)
 * with their credentials status. Allows selection via radio buttons or cards.
 *
 * Used in Custom wizard mode for progressive disclosure - users can see
 * and override provider selections (in Quickstart mode, defaults are used).
 */

import { Check, Cloud, Server, ExternalLink, AlertCircle } from 'lucide-react'
import type { Provider, Capability } from '../../services/api'

export interface ProviderSelectorProps {
  /** The capability to select a provider for */
  capability: Capability
  /** Currently selected provider ID */
  selectedId: string | null
  /** Callback when a provider is selected */
  onSelect: (providerId: string) => void
  /** Display mode: 'dropdown' for compact, 'cards' for expanded */
  mode?: 'dropdown' | 'cards'
  /** Whether the selector is disabled */
  disabled?: boolean
}

/**
 * Get the mode icon for a provider
 */
function ModeIcon({ mode }: { mode: 'cloud' | 'local' }) {
  return mode === 'cloud' ? (
    <Cloud className="w-4 h-4 text-blue-500" aria-label="Cloud provider" />
  ) : (
    <Server className="w-4 h-4 text-green-500" aria-label="Local provider" />
  )
}

/**
 * Credential status indicator
 */
function CredentialStatus({ provider }: { provider: Provider }) {
  const requiredCreds = provider.credentials.filter(c => c.required)
  const configuredCreds = requiredCreds.filter(c => c.has_value)
  const allConfigured = requiredCreds.length === configuredCreds.length

  if (requiredCreds.length === 0) {
    return (
      <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
        <Check className="w-3 h-3" />
        No credentials required
      </span>
    )
  }

  if (allConfigured) {
    return (
      <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
        <Check className="w-3 h-3" />
        Configured
      </span>
    )
  }

  return (
    <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
      <AlertCircle className="w-3 h-3" />
      {configuredCreds.length}/{requiredCreds.length} credentials
    </span>
  )
}

/**
 * Provider card for expanded selection mode
 */
function ProviderCard({
  provider,
  isSelected,
  onSelect,
  disabled,
}: {
  provider: Provider
  isSelected: boolean
  onSelect: () => void
  disabled?: boolean
}) {
  return (
    <button
      id={`provider-card-${provider.id}`}
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`
        relative w-full p-4 rounded-lg border-2 text-left transition-all
        ${isSelected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2">
          <div className="w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <ModeIcon mode={provider.mode} />
        <span className="font-medium text-gray-900 dark:text-white">
          {provider.name}
        </span>
        {provider.is_default && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            Default
          </span>
        )}
      </div>

      {/* Description */}
      {provider.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {provider.description}
        </p>
      )}

      {/* Credential status */}
      <div className="mt-2">
        <CredentialStatus provider={provider} />
      </div>

      {/* Credential links */}
      {provider.credentials.filter(c => c.link && !c.has_value).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {provider.credentials
            .filter(c => c.link && !c.has_value)
            .map(cred => (
              <a
                key={cred.key}
                href={cred.link!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                Get {cred.label || cred.key}
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
        </div>
      )}
    </button>
  )
}

/**
 * Main ProviderSelector component
 */
export function ProviderSelector({
  capability,
  selectedId,
  onSelect,
  mode = 'cards',
  disabled = false,
}: ProviderSelectorProps) {
  // Sort providers: selected first, then by mode (cloud before local), then by name
  const sortedProviders = [...capability.providers].sort((a, b) => {
    if (a.id === selectedId) return -1
    if (b.id === selectedId) return 1
    if (a.mode !== b.mode) return a.mode === 'cloud' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  if (mode === 'dropdown') {
    return (
      <div id={`provider-selector-${capability.id}`} className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {capability.description}
        </label>
        <select
          id={`provider-select-${capability.id}`}
          value={selectedId || ''}
          onChange={e => onSelect(e.target.value)}
          disabled={disabled}
          className="input"
        >
          <option value="">Select a provider...</option>
          {sortedProviders.map(provider => (
            <option key={provider.id} value={provider.id}>
              {provider.name} ({provider.mode})
              {provider.is_default ? ' - Default' : ''}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // Cards mode
  return (
    <div id={`provider-selector-${capability.id}`} className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900 dark:text-white">
          {capability.description}
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {capability.providers.length} provider{capability.providers.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {sortedProviders.map(provider => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            isSelected={provider.id === selectedId}
            onSelect={() => onSelect(provider.id)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  )
}

export default ProviderSelector
