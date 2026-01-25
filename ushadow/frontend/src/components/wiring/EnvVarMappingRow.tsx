/**
 * EnvVarMappingRow - Matches EnvVarEditor style exactly
 *
 * Layout: | ENV_VAR_NAME | Map | ✏️ value or dropdown | badge |
 */

import { useState } from 'react'
import { Pencil } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

export interface ConfigSchemaField {
  key: string
  type: string
  label?: string
  required?: boolean
  default?: string
  env_var?: string
  settings_path?: string
  has_value?: boolean
  value?: string
}

export interface SettingSuggestion {
  path: string
  value?: string
  has_value: boolean
}

export type MappingSource = 'default' | 'mapped' | 'override'

export interface MappingValue {
  source: MappingSource
  setting_path?: string
  value?: string
}

export interface EnvVarMappingRowProps {
  field: ConfigSchemaField
  suggestions?: SettingSuggestion[]
  currentMapping?: MappingValue
  onChange: (key: string, mapping: MappingValue) => void
}

// ============================================================================
// Component
// ============================================================================

export function EnvVarMappingRow({
  field,
  suggestions = [],
  currentMapping,
  onChange,
}: EnvVarMappingRowProps) {
  const [showMapping, setShowMapping] = useState(false)
  const [editing, setEditing] = useState(false)

  const envVar = field.env_var || field.key.toUpperCase()
  const isSecret = field.type === 'secret' || envVar.includes('KEY') || envVar.includes('SECRET') || envVar.includes('PASSWORD')

  // Determine current source
  const getSource = (): MappingSource => {
    if (currentMapping) return currentMapping.source
    if (field.settings_path && field.has_value) return 'mapped'
    return 'default'
  }

  const source = getSource()

  // Get display value
  const getDisplayValue = (): string => {
    if (currentMapping?.source === 'override' && currentMapping.value) {
      return currentMapping.value
    }
    if (currentMapping?.source === 'mapped' && currentMapping.setting_path) {
      const suggestion = suggestions.find(s => s.path === currentMapping.setting_path)
      return suggestion?.value || ''
    }
    if (field.has_value && field.value) {
      return field.value
    }
    return field.default || ''
  }

  const displayValue = getDisplayValue()

  // Mask secrets but show last few chars
  const maskValue = (val: string): string => {
    if (!val || !isSecret) return val
    if (val.length <= 4) return '••••'
    return '••••' + val.slice(-4)
  }

  // Get mapped path
  const getMappedPath = (): string | undefined => {
    if (currentMapping?.source === 'mapped') return currentMapping.setting_path
    if (field.settings_path) return field.settings_path
    return undefined
  }

  const mappedPath = getMappedPath()

  // Handlers
  const handleSelectMapping = (path: string) => {
    const suggestion = suggestions.find(s => s.path === path)
    onChange(field.key, {
      source: 'mapped',
      setting_path: path,
      value: suggestion?.value,
    })
    setShowMapping(false)
  }

  const handleValueChange = (value: string) => {
    if (value.trim()) {
      onChange(field.key, { source: 'override', value: value.trim() })
    } else {
      onChange(field.key, { source: 'default' })
    }
    setEditing(false)
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700 last:border-0"
      data-testid={`env-mapping-${field.key}`}
    >
      {/* Column 1: Env var name */}
      <span
        className="w-40 text-xs font-medium text-neutral-300 truncate flex-shrink-0"
        title={envVar}
      >
        {envVar}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </span>

      {/* Column 2: Map button */}
      <button
        onClick={() => {
          setShowMapping(!showMapping)
          setEditing(false)
        }}
        disabled={suggestions.length === 0}
        className={`px-2 py-1 text-xs rounded transition-colors flex-shrink-0 ${
          showMapping || source === 'mapped'
            ? 'bg-primary-900/30 text-primary-300'
            : suggestions.length > 0
              ? 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700'
              : 'text-neutral-600 cursor-not-allowed'
        }`}
        title={suggestions.length > 0 ? 'Map to setting' : 'No settings available'}
        data-testid={`env-mapping-map-${field.key}`}
      >
        Map
      </button>

      {/* Column 3: Value area */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {showMapping ? (
          // Mapping dropdown
          <select
            value={mappedPath || ''}
            onChange={(e) => {
              if (e.target.value) handleSelectMapping(e.target.value)
            }}
            autoFocus
            className="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono rounded border-0 bg-neutral-700/50 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer"
            data-testid={`env-mapping-select-${field.key}`}
          >
            <option value="">select...</option>
            {suggestions.map(s => (
              <option key={s.path} value={s.path}>
                {s.path}{s.has_value ? ` → ${maskValue(s.value || '')}` : ''}
              </option>
            ))}
          </select>
        ) : editing ? (
          // Value input
          <input
            type={isSecret ? 'password' : 'text'}
            defaultValue={source === 'override' ? displayValue : ''}
            onBlur={(e) => handleValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleValueChange((e.target as HTMLInputElement).value)
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder="enter value"
            autoFocus
            className="flex-1 px-2 py-1.5 text-xs font-mono rounded border-0 bg-neutral-700/50 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-neutral-500"
            data-testid={`env-mapping-input-${field.key}`}
          />
        ) : source === 'mapped' && mappedPath ? (
          // Mapped value display
          <span className="text-xs font-mono text-neutral-300 truncate">
            {mappedPath} → {maskValue(displayValue)}
          </span>
        ) : (
          // Default/override value display
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-neutral-500 hover:text-neutral-300 flex-shrink-0"
              title="Edit"
              data-testid={`env-mapping-edit-${field.key}`}
            >
              <Pencil className="w-3 h-3" />
            </button>
            <span className="text-xs text-neutral-400 truncate font-mono">
              {displayValue ? maskValue(displayValue) : 'enter value'}
            </span>
          </>
        )}
      </div>

      {/* Column 4: Badge */}
      {!showMapping && !editing && source === 'default' && (
        <span className="ml-auto px-1.5 py-0.5 text-[10px] rounded bg-neutral-700 text-neutral-400 flex-shrink-0">
          default
        </span>
      )}
    </div>
  )
}

export default EnvVarMappingRow
