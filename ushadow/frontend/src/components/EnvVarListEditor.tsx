import { useState } from 'react'
import { Plus, Trash2, Eye, EyeOff, FileCode, Key } from 'lucide-react'

/**
 * Environment variable configuration for import/creation flows.
 * Simpler than EnvVarConfig used for service configuration.
 */
export interface EnvVarItem {
  name: string
  source: 'literal' | 'setting' | 'default'
  value?: string
  setting_path?: string
  is_secret: boolean
}

export interface EnvVarListEditorProps {
  /** Current list of env vars */
  envVars: EnvVarItem[]
  /** Callback when list changes */
  onChange: (envVars: EnvVarItem[]) => void
  /** Whether names are editable (true for new vars, false for predefined) */
  allowNameEdit?: boolean
  /** Placeholder for env var name input */
  namePlaceholder?: string
  /** Test ID prefix */
  testIdPrefix?: string
}

/**
 * Detects if an env var name likely contains a secret.
 */
export function isSecretName(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.includes('key') ||
    lower.includes('secret') ||
    lower.includes('password') ||
    lower.includes('token') ||
    lower.includes('credential')
  )
}

/**
 * Reusable component for editing a list of environment variables.
 *
 * Features:
 * - Add/remove variables
 * - Name editing (optional, for new vars)
 * - Value source selection (literal, default, from settings)
 * - Secret detection and masking
 * - Bulk paste from .env format
 *
 * @example
 * <EnvVarListEditor
 *   envVars={envVars}
 *   onChange={setEnvVars}
 *   allowNameEdit={true}
 * />
 */
export default function EnvVarListEditor({
  envVars,
  onChange,
  allowNameEdit = true,
  namePlaceholder = 'VAR_NAME',
  testIdPrefix = 'env-var',
}: EnvVarListEditorProps) {
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')

  // Update a single env var
  const updateEnvVar = (index: number, updates: Partial<EnvVarItem>) => {
    onChange(envVars.map((ev, i) => (i === index ? { ...ev, ...updates } : ev)))
  }

  // Add a new empty env var
  const addEnvVar = () => {
    onChange([...envVars, { name: '', source: 'literal', value: '', is_secret: false }])
  }

  // Remove an env var
  const removeEnvVar = (index: number) => {
    onChange(envVars.filter((_, i) => i !== index))
  }

  // Toggle secret visibility
  const toggleSecretVisibility = (name: string) => {
    setShowSecrets((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  // Parse pasted .env content
  const parsePasteContent = () => {
    const lines = pasteText.split('\n')
    const newVars: EnvVarItem[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue

      // Parse KEY=value or KEY= or just KEY
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/)
      if (match) {
        const name = match[1]
        const value = match[2] ?? ''

        // Skip if already exists
        if (!envVars.some((e) => e.name === name)) {
          newVars.push({
            name,
            source: 'literal',
            value,
            is_secret: isSecretName(name),
          })
        }
      }
    }

    if (newVars.length > 0) {
      onChange([...envVars, ...newVars])
    }
    setPasteText('')
    setShowPaste(false)
  }

  return (
    <div className="space-y-4" data-testid={`${testIdPrefix}-list-editor`}>
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Key className="w-4 h-4" />
          Environment Variables ({envVars.length})
        </h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPaste(!showPaste)}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
            data-testid={`${testIdPrefix}-paste-toggle`}
          >
            <FileCode className="w-4 h-4" /> Paste Template
          </button>
          <button
            type="button"
            onClick={addEnvVar}
            className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            data-testid={`${testIdPrefix}-add`}
          >
            <Plus className="w-4 h-4" /> Add Variable
          </button>
        </div>
      </div>

      {/* Paste template area */}
      {showPaste && (
        <div className="p-3 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Paste environment variables (KEY=value format, one per line):
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`# Example:\nAPI_KEY=your-key-here\nDATABASE_URL=postgres://...\nDEBUG=true`}
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
            data-testid={`${testIdPrefix}-paste-textarea`}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={() => {
                setPasteText('')
                setShowPaste(false)
              }}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={parsePasteContent}
              disabled={!pasteText.trim()}
              className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              data-testid={`${testIdPrefix}-paste-apply`}
            >
              Add Variables
            </button>
          </div>
        </div>
      )}

      {/* Env var list */}
      <div className="space-y-3">
        {envVars.map((env, index) => (
          <EnvVarRow
            key={index}
            env={env}
            index={index}
            allowNameEdit={allowNameEdit || !env.name}
            namePlaceholder={namePlaceholder}
            showSecret={showSecrets[env.name] || false}
            onUpdate={(updates) => updateEnvVar(index, updates)}
            onRemove={() => removeEnvVar(index)}
            onToggleSecret={() => toggleSecretVisibility(env.name)}
            testIdPrefix={testIdPrefix}
          />
        ))}
      </div>

      {envVars.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          No environment variables configured. Click "Add Variable" or "Paste Template" to add some.
        </p>
      )}
    </div>
  )
}

// =============================================================================
// EnvVarRow - Individual row component
// =============================================================================

interface EnvVarRowProps {
  env: EnvVarItem
  index: number
  allowNameEdit: boolean
  namePlaceholder: string
  showSecret: boolean
  onUpdate: (updates: Partial<EnvVarItem>) => void
  onRemove: () => void
  onToggleSecret: () => void
  testIdPrefix: string
}

function EnvVarRow({
  env,
  index,
  allowNameEdit,
  namePlaceholder,
  showSecret,
  onUpdate,
  onRemove,
  onToggleSecret,
  testIdPrefix,
}: EnvVarRowProps) {
  // Auto-detect secret when name changes
  const handleNameChange = (name: string) => {
    const upperName = name.toUpperCase()
    onUpdate({
      name: upperName,
      is_secret: isSecretName(upperName),
    })
  }

  return (
    <div
      className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
      data-testid={`${testIdPrefix}-row-${index}`}
    >
      {/* Name row */}
      <div className="flex items-center justify-between mb-2">
        {allowNameEdit ? (
          <input
            type="text"
            value={env.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={namePlaceholder}
            className="font-mono text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:ring-2 focus:ring-primary-500"
            data-testid={`${testIdPrefix}-name-${index}`}
          />
        ) : (
          <span className="font-mono text-sm text-gray-900 dark:text-white">
            {env.name}
          </span>
        )}

        <div className="flex items-center gap-2">
          {env.is_secret && (
            <span className="text-xs text-amber-500">Secret</span>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-gray-400 hover:text-red-500"
            data-testid={`${testIdPrefix}-delete-${index}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Value row */}
      <div className="flex items-center gap-2">
        {/* Source selector */}
        <select
          value={env.source}
          onChange={(e) => onUpdate({ source: e.target.value as EnvVarItem['source'] })}
          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          data-testid={`${testIdPrefix}-source-${index}`}
        >
          <option value="literal">Set Value</option>
          <option value="default">Use Default</option>
          <option value="setting">From Settings</option>
        </select>

        {/* Value input based on source */}
        {env.source === 'literal' && (
          <div className="flex-1 flex items-center gap-2">
            <input
              type={env.is_secret && !showSecret ? 'password' : 'text'}
              value={env.value || ''}
              onChange={(e) => onUpdate({ value: e.target.value })}
              placeholder="Enter value"
              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              data-testid={`${testIdPrefix}-value-${index}`}
            />
            {env.is_secret && (
              <button
                type="button"
                onClick={onToggleSecret}
                className="p-1 text-gray-400 hover:text-gray-600"
                data-testid={`${testIdPrefix}-toggle-secret-${index}`}
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
        )}

        {env.source === 'default' && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Will use default value from compose file
          </span>
        )}

        {env.source === 'setting' && (
          <input
            type="text"
            value={env.setting_path || ''}
            onChange={(e) => onUpdate({ setting_path: e.target.value })}
            placeholder="api_keys.my_key"
            className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            data-testid={`${testIdPrefix}-setting-path-${index}`}
          />
        )}
      </div>
    </div>
  )
}
