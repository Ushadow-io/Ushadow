import { useState } from 'react'
import { Lock, KeyRound, Link, Pencil } from 'lucide-react'
import { Select, ComboboxItem } from '@mantine/core'
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

  // Build deduplicated select items + value display map for the mapping dropdown.
  // Mantine v9 throws (and renders nothing) if any value is duplicated in data.
  const { selectData, valueDisplay } = (() => {
    const seen = new Set<string>()
    const valueDisplay = new Map<string, string>()
    const selectData: { value: string; label: string }[] = []
    const inputLabel = (path: string, value?: string) => {
      const root = path.split('.')[0]
      return value ? `${root} → ${value}` : root
    }

    if (config.setting_path && !envVar.suggestions.some(s => s.path === config.setting_path)) {
      seen.add(config.setting_path)
      selectData.push({ value: config.setting_path, label: inputLabel(config.setting_path, config.value) })
      valueDisplay.set(config.setting_path, config.value || '(current)')
    }
    for (const s of envVar.suggestions) {
      if (!seen.has(s.path)) {
        seen.add(s.path)
        selectData.push({ value: s.path, label: inputLabel(s.path, s.value) })
        if (s.value) valueDisplay.set(s.path, s.value)
      }
    }
    return { selectData, valueDisplay }
  })()

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
            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
            : 'text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
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
          <Select
            value={config.setting_path || null}
            onChange={(val) => {
              if (val) {
                onChange({
                  source: 'setting',
                  setting_path: val,
                  value: undefined,
                  new_setting_path: undefined,
                })
              }
            }}
            data={selectData}
            placeholder="select..."
            w="100%"
            renderOption={({ option }: { option: ComboboxItem }) => (
              <div className="flex flex-col py-1">
                <span className="text-xs font-mono font-medium leading-tight">
                  {valueDisplay.get(option.value) || '—'}
                </span>
                <span className="text-[11px] font-mono leading-tight" style={{ color: 'var(--mantine-color-dimmed)' }}>
                  {option.value}
                </span>
              </div>
            )}
            size="xs"
            variant="filled"
            styles={{
              input: {
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
                backgroundColor: 'var(--mantine-color-dark-6)',
                color: 'var(--mantine-color-dark-0)',
                border: 'none',
              },
            }}
            comboboxProps={{ zIndex: 10000, width: 400, position: 'bottom-start' }}
            data-testid={`map-select-${envVar.name}`}
          />
        ) : isLocked && !editing ? (
          // Locked: read-only value + source badge
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 flex-shrink-0"
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <span className="text-xs text-neutral-700 dark:text-neutral-300 truncate font-mono" title={config.value}>
              {isSecret ? '•'.repeat(Math.min((config.value || '').length, 20)) : config.value}
            </span>
            <span className={`ml-auto px-1.5 py-0.5 text-[10px] rounded flex-shrink-0 ${
              config.source === 'env_file' ? 'bg-green-600/20 text-green-600 dark:text-green-400' :
              config.source === 'capability' ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400' :
              config.source === 'infra' ? 'bg-cyan-600/20 text-cyan-600 dark:text-cyan-400' :
              config.source === 'config_default' ? 'bg-purple-600/20 text-purple-600 dark:text-purple-400' :
              config.source === 'compose_default' ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400' :
              'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
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
            className="flex-1 px-2 py-1.5 text-xs rounded border-0 bg-neutral-100 dark:bg-neutral-700/50 text-neutral-900 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
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
