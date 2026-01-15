import { useState } from 'react'
import { Pencil, Lock } from 'lucide-react'
import { EnvVarInfo, EnvVarConfig } from '../services/api'

interface EnvVarEditorProps {
  envVar: EnvVarInfo
  config: EnvVarConfig
  onChange: (updates: Partial<EnvVarConfig>) => void
}

/**
 * Shared component for editing environment variable configuration.
 *
 * Supports:
 * - Mapping to existing settings (via dropdown of suggestions)
 * - Manual value entry (auto-creates new settings)
 * - Default values
 * - Secret masking
 * - Locked fields (provider-supplied values)
 *
 * Used by:
 * - ServicesPage (for Docker service configuration)
 * - DeployToK8sModal (for K8s deployment configuration)
 * - InstancesPage (for instance configuration)
 */
export default function EnvVarEditor({ envVar, config, onChange }: EnvVarEditorProps) {
  const [editing, setEditing] = useState(false)
  const [showMapping, setShowMapping] = useState(config.source === 'setting' && !config.locked)

  const isSecret = envVar.name.includes('KEY') || envVar.name.includes('SECRET') || envVar.name.includes('PASSWORD')
  const hasDefault = envVar.has_default && envVar.default_value
  const isUsingDefault = config.source === 'default' || (!config.value && !config.setting_path && hasDefault)
  const isLocked = config.locked || false

  // Generate setting path from env var name for auto-creating settings
  const autoSettingPath = () => {
    const name = envVar.name.toLowerCase()
    if (name.includes('api_key') || name.includes('key') || name.includes('secret') || name.includes('token')) {
      return `api_keys.${name}`
    }
    return `settings.${name}`
  }

  // Handle value input - auto-create setting
  const handleValueChange = (value: string) => {
    if (value) {
      onChange({ source: 'new_setting', new_setting_path: autoSettingPath(), value, setting_path: undefined })
    } else {
      onChange({ source: 'default', value: undefined, setting_path: undefined, new_setting_path: undefined })
    }
  }

  // Check if there's a matching suggestion for auto-mapping
  const matchingSuggestion = envVar.suggestions.find((s) => {
    const envName = envVar.name.toLowerCase()
    const pathParts = s.path.toLowerCase().split('.')
    const lastPart = pathParts[pathParts.length - 1]
    return envName.includes(lastPart) || lastPart.includes(envName.replace(/_/g, ''))
  })

  // Auto-map if matching and not yet configured
  const effectiveSettingPath = config.setting_path || (matchingSuggestion?.has_value ? matchingSuggestion.path : undefined)

  // Locked fields - provided by wired providers or infrastructure
  if (isLocked) {
    const displayValue = config.value || ''
    const isMaskedSecret = isSecret && displayValue.length > 0
    const maskedValue = isMaskedSecret ? '•'.repeat(Math.min(displayValue.length, 20)) : displayValue

    return (
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100 dark:border-neutral-700 last:border-0 bg-blue-50 dark:bg-blue-900/10"
        data-testid={`env-var-editor-${envVar.name}`}
      >
        {/* Label */}
        <span
          className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-40 truncate flex-shrink-0"
          title={envVar.name}
        >
          {envVar.name}
          {envVar.is_required && <span className="text-error-500 ml-0.5">*</span>}
        </span>

        {/* Padlock icon */}
        <div className="flex-shrink-0" title="Locked - provided by infrastructure or provider">
          <Lock className="w-3 h-3 text-blue-600 dark:text-blue-400" />
        </div>

        {/* Value display */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-xs text-neutral-700 dark:text-neutral-300 truncate font-mono" title={displayValue}>
            {maskedValue}
          </span>
          <span className="ml-auto px-1.5 py-0.5 text-[10px] rounded bg-blue-600/20 text-blue-700 dark:text-blue-300 flex-shrink-0">
            {config.provider_name || 'infrastructure'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100 dark:border-neutral-700 last:border-0 bg-white dark:bg-neutral-800"
      data-testid={`env-var-editor-${envVar.name}`}
    >
      {/* Label */}
      <span
        className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-40 truncate flex-shrink-0"
        title={envVar.name}
      >
        {envVar.name}
        {envVar.is_required && <span className="text-error-500 ml-0.5">*</span>}
      </span>

      {/* Map button - LEFT of input */}
      <button
        onClick={() => setShowMapping(!showMapping)}
        className={`px-2 py-1 text-xs rounded transition-colors flex-shrink-0 ${
          showMapping
            ? 'bg-primary-900/30 text-primary-300'
            : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700'
        }`}
        title={showMapping ? 'Enter value' : 'Map to setting'}
        data-testid={`map-button-${envVar.name}`}
      >
        Map
      </button>

      {/* Input area */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {showMapping ? (
          // Mapping mode - styled dropdown
          <select
            value={effectiveSettingPath || ''}
            onChange={(e) => {
              if (e.target.value) {
                onChange({
                  source: 'setting',
                  setting_path: e.target.value,
                  value: undefined,
                  new_setting_path: undefined,
                })
              }
            }}
            className="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono rounded border-0 bg-neutral-700/50 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer overflow-hidden text-ellipsis"
            data-testid={`map-select-${envVar.name}`}
          >
            <option value="">select...</option>
            {envVar.suggestions.map((s) => {
              // Truncate long values to prevent horizontal scrolling
              const displayValue = s.value && s.value.length > 30 ? s.value.substring(0, 30) + '...' : s.value
              return (
                <option key={s.path} value={s.path}>
                  {s.path}
                  {displayValue ? ` → ${displayValue}` : ''}
                </option>
              )
            })}
          </select>
        ) : hasDefault && isUsingDefault && !editing ? (
          // Default value display
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-neutral-500 hover:text-neutral-300 flex-shrink-0"
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <span className="text-xs text-neutral-400 truncate">{envVar.default_value}</span>
            <span className="ml-auto px-1.5 py-0.5 text-[10px] rounded bg-neutral-700 text-neutral-400 flex-shrink-0">
              default
            </span>
          </>
        ) : (
          // Value input
          <input
            type={isSecret ? 'password' : 'text'}
            value={config.source === 'setting' ? '' : config.value || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="enter value"
            className="flex-1 px-2 py-1.5 text-xs rounded border-0 bg-neutral-700/50 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-neutral-500"
            autoFocus={editing}
            onBlur={() => {
              if (!config.value && hasDefault) setEditing(false)
            }}
            data-testid={`value-input-${envVar.name}`}
          />
        )}
      </div>
    </div>
  )
}
