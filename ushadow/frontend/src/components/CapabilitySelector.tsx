import { useState } from 'react'
import { Plus, X, Server } from 'lucide-react'

/**
 * Standard capability options used across the application.
 * These represent the core capabilities that services can provide or require.
 */
export const CAPABILITY_OPTIONS = [
  { id: 'llm', label: 'LLM', description: 'Language model inference' },
  { id: 'tts', label: 'TTS', description: 'Text to speech' },
  { id: 'stt', label: 'STT', description: 'Speech to text' },
  { id: 'transcription', label: 'Transcription', description: 'Speech to text transcription' },
  { id: 'embedding', label: 'Embedding', description: 'Text embeddings' },
  { id: 'memory', label: 'Memory', description: 'Persistent memory storage' },
  { id: 'vision', label: 'Vision', description: 'Image understanding' },
  { id: 'image_gen', label: 'Image Gen', description: 'Image generation' },
] as const

export type CapabilityOption = typeof CAPABILITY_OPTIONS[number]

export interface CapabilitySelectorProps {
  /** Currently selected capabilities */
  selected: string[]
  /** Callback when selection changes */
  onChange: (capabilities: string[]) => void
  /** Visual mode - 'provides' uses primary/blue, 'requires' uses amber/orange */
  mode: 'provides' | 'requires'
  /** Optional title override */
  title?: string
  /** Optional description override */
  description?: string
  /** Whether to show the custom capability input */
  allowCustom?: boolean
  /** Test ID prefix for automation */
  testIdPrefix?: string
}

/**
 * Reusable component for selecting service capabilities.
 *
 * Used for both:
 * - "Capabilities Provided" - what a service offers (LLM, memory, etc.)
 * - "Capabilities Required" - what a service depends on
 *
 * @example
 * // For capabilities a service provides
 * <CapabilitySelector
 *   selected={provides}
 *   onChange={setProvides}
 *   mode="provides"
 * />
 *
 * // For capabilities a service requires
 * <CapabilitySelector
 *   selected={requires}
 *   onChange={setRequires}
 *   mode="requires"
 * />
 */
export default function CapabilitySelector({
  selected,
  onChange,
  mode,
  title,
  description,
  allowCustom = true,
  testIdPrefix = 'capability',
}: CapabilitySelectorProps) {
  const [customInput, setCustomInput] = useState('')

  // Style variants based on mode
  const styles = {
    provides: {
      selectedButton: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-2 border-primary-500',
      chip: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300',
    },
    requires: {
      selectedButton: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-2 border-amber-500',
      chip: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    },
  }

  const currentStyles = styles[mode]

  const defaultTitle = mode === 'provides' ? 'Capabilities Provided' : 'Capabilities Required'
  const defaultDescription = mode === 'provides'
    ? 'Select the capabilities this service provides (optional)'
    : 'Select capabilities this service depends on (e.g., LLM, memory)'

  const toggleCapability = (capId: string) => {
    if (selected.includes(capId)) {
      onChange(selected.filter((c) => c !== capId))
    } else {
      onChange([...selected, capId])
    }
  }

  const addCustomCapability = () => {
    const normalized = customInput.toLowerCase().replace(/[^a-z0-9_-]/g, '')
    if (normalized && !selected.includes(normalized)) {
      onChange([...selected, normalized])
      setCustomInput('')
    }
  }

  const removeCapability = (capId: string) => {
    onChange(selected.filter((c) => c !== capId))
  }

  // Handle Enter key in custom input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addCustomCapability()
    }
  }

  return (
    <div
      className="space-y-4"
      data-testid={`${testIdPrefix}-selector-${mode}`}
    >
      {/* Header */}
      <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
        <Server className="w-4 h-4" />
        {title || defaultTitle}
      </h4>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        {description || defaultDescription}
      </p>

      {/* Preset capability buttons */}
      <div className="flex flex-wrap gap-2">
        {CAPABILITY_OPTIONS.map((cap) => (
          <button
            key={cap.id}
            type="button"
            onClick={() => toggleCapability(cap.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selected.includes(cap.id)
                ? currentStyles.selectedButton
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
            }`}
            title={cap.description}
            data-testid={`${testIdPrefix}-${mode}-${cap.id}`}
          >
            {cap.label}
          </button>
        ))}
      </div>

      {/* Custom capability input */}
      {allowCustom && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
            onKeyDown={handleKeyDown}
            placeholder="Add custom capability..."
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            data-testid={`${testIdPrefix}-${mode}-custom-input`}
          />
          <button
            type="button"
            onClick={addCustomCapability}
            disabled={!customInput || selected.includes(customInput)}
            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            data-testid={`${testIdPrefix}-${mode}-custom-add`}
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      )}

      {/* Selected capabilities as removable chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((cap) => (
            <span
              key={cap}
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${currentStyles.chip}`}
            >
              {cap}
              <button
                type="button"
                onClick={() => removeCapability(cap)}
                className="hover:text-red-500"
                data-testid={`${testIdPrefix}-${mode}-remove-${cap}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
