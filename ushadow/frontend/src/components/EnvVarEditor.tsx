import { useState } from 'react'
import { Pencil, Lock } from 'lucide-react'
import { EnvVarInfo, EnvVarConfig } from '../services/api'

interface EnvVarEditorProps {
  envVar: EnvVarInfo
  config: EnvVarConfig
  onChange: (updates: Partial<EnvVarConfig>) => void
  mode?: 'config' | 'deploy' | 'target'  // Mode affects what options are shown
}

/**
 * Shared component for editing environment variable configuration.
 *
 * Supports:
 * - Mapping to existing settings (via dropdown of suggestions)
 * - Manual value entry (auto-creates new settings)
 * - Secret masking
 * - Locked fields (provider-supplied values)
 *
 * Modes:
 * - 'config': Creating a ServiceConfig (shows @settings.path mappings primarily)
 * - 'deploy': Deploying a service (shows runtime/deployment options, default)
 * - 'target': Per-target overrides (shows target-specific values)
 *
 * Used by:
 * - ServicesPage (for Docker service configuration)
 * - DeployModal (for K8s/Docker deployment configuration)
 * - ServiceConfigsPage (for instance configuration)
 */
export default function EnvVarEditor({ envVar, config, onChange, mode = 'deploy' }: EnvVarEditorProps) {
  const [editing, setEditing] = useState(false)
  // If setting_path is set, this is a "mapped" value - show mapping mode
  const isMapped = !!config.setting_path
  const [showMapping, setShowMapping] = useState(isMapped)

  const isSecret = envVar.name.includes('KEY') || envVar.name.includes('SECRET') || envVar.name.includes('PASSWORD')
  const isLocked = config.locked || envVar.locked || false

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
            {config.provider_name || 'provider'}
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
            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
            : 'text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
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
            value={config.setting_path || ''}
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
            className="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono rounded border-0 bg-neutral-100 dark:bg-neutral-700/50 text-neutral-900 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer overflow-hidden text-ellipsis"
            data-testid={`map-select-${envVar.name}`}
          >
            <option value="">select...</option>
            {/* If current setting_path isn't in suggestions, show it as an option */}
            {config.setting_path && !envVar.suggestions.some(s => s.path === config.setting_path) && (
              <option value={config.setting_path}>
                {config.setting_path} {config.value ? `→ ${config.value.length > 20 ? config.value.substring(0, 20) + '...' : config.value}` : '(current)'}
              </option>
            )}
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
        ) : config.value && !editing ? (
          // Has resolved value - show with source badge
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 flex-shrink-0"
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <span className="text-xs text-neutral-700 dark:text-neutral-300 truncate font-mono" title={config.value}>
              {isSecret ? '•'.repeat(Math.min(config.value.length, 20)) : config.value}
            </span>
            <span className={`ml-auto px-1.5 py-0.5 text-[10px] rounded flex-shrink-0 ${
              config.source === 'env_file' ? 'bg-green-600/20 text-green-600 dark:text-green-400' :
              config.source === 'capability' ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400' :
              config.source === 'infra' ? 'bg-cyan-600/20 text-cyan-600 dark:text-cyan-400' :
              config.source === 'config_default' ? 'bg-purple-600/20 text-purple-600 dark:text-purple-400' :
              config.source === 'compose_default' ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400' :
              'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
            }`}>
              {config.source === 'env_file' ? '.env' :
               config.source === 'capability' ? 'provider' :
               config.source === 'infra' ? 'infra' :
               config.source === 'config_default' ? 'config' :
               config.source === 'compose_default' ? 'default' :
               config.source === 'default' ? 'default' :
               config.source}
            </span>
          </>
        ) : (
          // No value or editing - show input
          <input
            type={isSecret ? 'password' : 'text'}
            value={config.value || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="enter value"
            className="flex-1 px-2 py-1.5 text-xs rounded border-0 bg-neutral-100 dark:bg-neutral-700/50 text-neutral-900 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            autoFocus={editing}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            data-testid={`value-input-${envVar.name}`}
          />
        )}
      </div>
    </div>
  )
}
