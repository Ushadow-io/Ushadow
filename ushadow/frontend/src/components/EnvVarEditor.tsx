import { useState } from 'react'
import { Lock, KeyRound, Link } from 'lucide-react'
import { EnvVarInfo, EnvVarConfig } from '../services/api'

interface EnvVarEditorProps {
  envVar: EnvVarInfo
  config: EnvVarConfig
  onChange: (updates: Partial<EnvVarConfig>) => void
  mode?: 'config' | 'deploy' | 'target'
}

/**
 * Layout: [label w-40] [Map|Edit btn] [icon slot] [content area]
 *
 * Map/Edit button:
 *   - "Map"  → not in mapping mode; click to show settings dropdown
 *   - "Edit" → in mapping mode; click to switch back to direct text entry
 *
 * Icon slot (one of):
 *   - Lock     → locked field (provider/infra supplied)
 *   - Link     → mapped to a settings path
 *   - KeyRound → secret value (unlocked, unmapped)
 *   - (empty)  → normal field
 *
 * Editing:
 *   - Unmapped field: click the value text to edit in place (no pencil icon)
 *   - Mapped field: use dropdown to change mapping, or click Edit to override with literal
 */
export default function EnvVarEditor({ envVar, config, onChange, mode = 'deploy' }: EnvVarEditorProps) {
  const [editing, setEditing] = useState(false)
  const isMapped = !!config.setting_path
  const [showMapping, setShowMapping] = useState(isMapped)

  const isSecret = envVar.is_secret ?? false
  const isLocked = config.locked || envVar.locked || false

  const autoSettingPath = () => {
    const name = envVar.name.toLowerCase()
    if (name.includes('api_key') || name.includes('key') || name.includes('secret') || name.includes('token')) {
      return `api_keys.${name}`
    }
    return `settings.${name}`
  }

  const handleValueChange = (value: string) => {
    if (value) {
      onChange({ source: 'new_setting', new_setting_path: autoSettingPath(), value, setting_path: undefined })
    } else {
      onChange({ source: 'default', value: undefined, setting_path: undefined, new_setting_path: undefined })
    }
  }

  const handleSwitchToEdit = () => {
    setShowMapping(false)
    setEditing(true)
    // Clear the mapping so the value becomes a literal override
    onChange({ source: 'new_setting', setting_path: undefined, new_setting_path: autoSettingPath(), value: config.value })
  }

  // Row background
  const rowBg = isSecret
    ? 'bg-purple-50 dark:bg-purple-900/10'
    : isLocked
      ? 'bg-blue-50 dark:bg-blue-900/10'
      : 'bg-white dark:bg-neutral-800'

  // Icon slot
  const iconSlot = isLocked
    ? <Lock className={`w-3 h-3 flex-shrink-0 ${isSecret ? 'text-purple-500 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400'}`} title="Locked" />
    : showMapping
      ? <Link className="w-3 h-3 flex-shrink-0 text-primary-400 dark:text-primary-400" title="Mapped to setting" />
      : isSecret
        ? <KeyRound className="w-3 h-3 flex-shrink-0 text-purple-500 dark:text-purple-400" title="Secret" />
        : <span className="w-3 h-3 flex-shrink-0" />

  const displayValue = config.value || ''

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 border-b border-neutral-100 dark:border-neutral-700 last:border-0 ${rowBg}`}
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

      {/* Map / Edit toggle button */}
      <button
        onClick={() => showMapping ? handleSwitchToEdit() : setShowMapping(true)}
        className={`px-2 py-1 text-xs rounded transition-colors flex-shrink-0 ${
          showMapping
            ? 'bg-primary-900/30 text-primary-300'
            : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700'
        }`}
        title={showMapping ? 'Switch to direct value entry' : 'Map to a setting'}
        data-testid={`map-button-${envVar.name}`}
      >
        {showMapping ? 'Edit' : 'Map'}
      </button>

      {/* Icon slot */}
      {iconSlot}

      {/* Content area */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {showMapping ? (
          // Mapping mode — settings path dropdown
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
            className="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono rounded border-0 bg-neutral-700/50 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer overflow-hidden text-ellipsis"
            data-testid={`map-select-${envVar.name}`}
          >
            <option value="">select...</option>
            {config.setting_path && !envVar.suggestions.some(s => s.path === config.setting_path) && (
              <option value={config.setting_path}>
                {config.setting_path}{config.value ? ` → ${config.value.length > 20 ? config.value.substring(0, 20) + '...' : config.value}` : ' (current)'}
              </option>
            )}
            {envVar.suggestions.map((s) => {
              const sv = s.value && s.value.length > 30 ? s.value.substring(0, 30) + '...' : s.value
              return (
                <option key={s.path} value={s.path}>
                  {s.path}{sv ? ` → ${sv}` : ''}
                </option>
              )
            })}
          </select>
        ) : isLocked && !editing ? (
          // Locked: read-only value + source badge
          <>
            <span className="text-xs text-neutral-700 dark:text-neutral-300 truncate font-mono flex-1" title={displayValue}>
              {displayValue}
            </span>
            <span className={`ml-auto px-1.5 py-0.5 text-[10px] rounded flex-shrink-0 ${
              isSecret ? 'bg-purple-600/20 text-purple-700 dark:text-purple-300' : 'bg-blue-600/20 text-blue-700 dark:text-blue-300'
            }`}>
              {config.provider_name || 'provider'}
            </span>
          </>
        ) : editing || !displayValue ? (
          // Editing or empty — text input
          <input
            type="text"
            value={displayValue}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="enter value"
            className="flex-1 px-2 py-1.5 text-xs rounded border-0 bg-neutral-700/50 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-neutral-500"
            autoFocus={editing}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            data-testid={`value-input-${envVar.name}`}
          />
        ) : (
          // Has value, not editing — click to edit
          <>
            <span
              className="text-xs text-neutral-300 truncate font-mono flex-1 cursor-text hover:text-neutral-100"
              title={`${displayValue} — click to edit`}
              onClick={() => setEditing(true)}
              data-testid={`value-display-${envVar.name}`}
            >
              {displayValue}
            </span>
            <span className={`ml-auto px-1.5 py-0.5 text-[10px] rounded flex-shrink-0 ${
              config.source === 'env_file' ? 'bg-green-600/20 text-green-400' :
              config.source === 'capability' ? 'bg-blue-600/20 text-blue-400' :
              config.source === 'infra' ? 'bg-cyan-600/20 text-cyan-400' :
              config.source === 'config_default' ? 'bg-purple-600/20 text-purple-400' :
              'bg-neutral-700 text-neutral-400'
            }`}>
              {config.source === 'env_file' ? '.env' :
               config.source === 'capability' ? 'provider' :
               config.source === 'infra' ? 'infra' :
               config.source === 'config_default' ? 'config' :
               config.source === 'default' ? 'default' :
               config.source}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
