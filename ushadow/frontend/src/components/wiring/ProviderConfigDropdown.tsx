/**
 * ProviderConfigDropdown - Dropdown with cascading submenu for provider settings
 *
 * Design:
 * ┌─────────────────────────────────┬──────────────────────────┐
 * │ OpenAI - gpt-4o-mini       [→] │ API Key: [__________]    │
 * │ Anthropic - claude         [→] │ Base URL: [openai.com]   │
 * │ Ollama - llama3.1          [→] │ Model: [gpt-4o-mini]     │
 * ├─────────────────────────────────┤                          │
 * │ + Create new...                 │    [Cancel] [Save as...] │
 * └─────────────────────────────────┴──────────────────────────┘
 *
 * - Each provider has arrow [→] that opens settings submenu
 * - Edit values → prompted to name and save as new config
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext'
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  HardDrive,
  Plus,
  Check,
  AlertCircle,
  Loader2,
  Save,
  X,
  Pencil,
  Trash2,
} from 'lucide-react'
import EnvVarEditor from '../EnvVarEditor'
import type { ProviderOption, GroupedProviders } from '../../hooks/useProviderConfigs'
import type { Template, EnvVarInfo, EnvVarConfig } from '../../services/api'
import { svcConfigsApi, settingsApi } from '../../services/api'

// ============================================================================
// Types
// ============================================================================

export interface ProviderConfigDropdownProps {
  /** Capability being configured (e.g., "llm", "transcription") */
  capability: string
  /** Consumer ID that will use this provider */
  consumerId: string
  /** Currently selected provider option */
  value: ProviderOption | null
  /** Grouped provider options */
  options: GroupedProviders
  /** Provider templates (for config schema) */
  templates?: Template[]
  /** Whether the dropdown is loading */
  loading?: boolean
  /** Callback when an option is selected */
  onChange: (option: ProviderOption) => void
  /** Callback to create a new configuration with custom values */
  onCreateConfig?: (templateId: string, name: string, config: Record<string, any>) => Promise<void>
  /** Callback to edit an existing configuration */
  onEditConfig?: (configId: string) => void
  /** Callback to delete a configuration */
  onDeleteConfig?: (configId: string) => Promise<void>
  /** Callback to update an existing configuration */
  onUpdateConfig?: (configId: string, config: Record<string, any>) => Promise<void>
  /** Called after any mutation (create/update/delete) to refresh data */
  onRefresh?: () => Promise<void>
  /** Callback to create a new configuration */
  onCreateNew: () => void
  /** Whether the dropdown is disabled */
  disabled?: boolean
  /** Error message to display */
  error?: string
}

// ============================================================================
// Submenu Component - Uses EnvVarEditor directly
// ============================================================================

interface SubmenuProps {
  option: ProviderOption
  template: Template | undefined
  /** Saved configs based on this template */
  savedConfigs: ProviderOption[]
  /** Whether we're editing an existing saved config (not a template) */
  isEditingConfig?: boolean
  position: { top: number; left: number }
  onClose: () => void
  onSelect: () => void
  onSelectSaved: (option: ProviderOption) => void
  onEditSaved: (option: ProviderOption) => void
  onDeleteSaved: (option: ProviderOption) => Promise<void>
  /** Save as a new config */
  onSaveAs: (name: string, config: Record<string, any>) => void
  /** Update an existing config (when editing a saved config) */
  onUpdateConfig?: (configId: string, config: Record<string, any>) => Promise<void>
  /** Called after mutations to refresh the list */
  onRefresh?: () => Promise<void>
}

function Submenu({ option, template, savedConfigs, isEditingConfig, position, onClose, onSelect, onSelectSaved, onEditSaved, onDeleteSaved, onSaveAs, onUpdateConfig, onRefresh }: SubmenuProps) {
  const [envVars, setEnvVars] = useState<EnvVarInfo[]>([])
  const [configs, setConfigs] = useState<Record<string, EnvVarConfig>>({})
  const [deleting, setDeleting] = useState(false)
  const [configName, setConfigName] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingUpdate, setSavingUpdate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showSaveAsNew, setShowSaveAsNew] = useState(false)
  const submenuRef = useRef<HTMLDivElement>(null)

  // Fetch env config with suggestions from backend (same process as services)
  useEffect(() => {
    if (!template?.id) return

    const fetchEnvConfig = async () => {
      // Clear stale data from previous template before loading new one
      setEnvVars([])
      setConfigs({})
      setLoading(true)
      try {
        const response = await svcConfigsApi.getTemplateEnvConfig(template.id)
        const data = response.data

        setEnvVars(data)

        // Initialize configs from backend response (already has auto-mapping)
        const initial: Record<string, EnvVarConfig> = {}
        for (const ev of data) {
          initial[ev.name] = {
            name: ev.name,
            source: (ev.source as 'setting' | 'literal' | 'default') || 'default',
            setting_path: ev.setting_path,
            value: ev.value,
          }
        }
        setConfigs(initial)
      } catch (err) {
        console.error('Failed to fetch template env config:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchEnvConfig()
  }, [template?.id])

  const hasChanges = Object.values(configs).some(c => c.source !== 'default' || c.value || c.setting_path)

  const handleConfigChange = (envVar: string, updates: Partial<EnvVarConfig>) => {
    setConfigs(prev => ({
      ...prev,
      [envVar]: { ...prev[envVar], ...updates },
    }))
  }

  // Save new settings to the settings store and build config values
  // This properly saves API keys to settings before creating/updating configs
  const saveSettingsAndBuildConfig = async (): Promise<Record<string, any>> => {
    const configValues: Record<string, any> = {}
    const settingsUpdates: Record<string, Record<string, string>> = {}

    for (const [name, cfg] of Object.entries(configs)) {
      if (cfg.source === 'setting' && cfg.setting_path) {
        // Map to existing setting - use _from_setting reference
        configValues[name] = { _from_setting: cfg.setting_path }
      } else if (cfg.source === 'new_setting' && cfg.value && cfg.new_setting_path) {
        // New setting - save to settings store first, then reference it
        // Parse path like "api_keys.openai_api_key" into nested object
        const parts = cfg.new_setting_path.split('.')
        if (parts.length === 2) {
          const [section, key] = parts
          if (!settingsUpdates[section]) settingsUpdates[section] = {}
          settingsUpdates[section][key] = cfg.value
        }
        // Reference the new setting in the config
        configValues[name] = { _from_setting: cfg.new_setting_path }
      } else if (cfg.source === 'literal' && cfg.value) {
        // Direct value (no setting storage)
        configValues[name] = cfg.value
      }
    }

    // Save any new settings to the settings store
    if (Object.keys(settingsUpdates).length > 0) {
      await settingsApi.update(settingsUpdates)
    }

    return configValues
  }

  // Save as new config
  const handleSaveAsNew = async () => {
    if (!configName.trim()) return
    setSaving(true)
    try {
      const configValues = await saveSettingsAndBuildConfig()
      await onSaveAs(configName, configValues)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // Update existing config
  const handleUpdateConfig = async () => {
    if (!onUpdateConfig || !isEditingConfig) return
    setSavingUpdate(true)
    try {
      const configValues = await saveSettingsAndBuildConfig()
      await onUpdateConfig(option.id, configValues)
      onClose()
    } finally {
      setSavingUpdate(false)
    }
  }

  const handleUseDefault = () => {
    onSelect()
    onClose()
  }

  // Loading state
  if (loading) {
    return (
      <div
        ref={submenuRef}
        style={{ position: 'absolute', top: position.top, left: position.left, zIndex: 10000 }}
        className="w-64 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-3"
        data-testid={`submenu-${option.templateId}`}
      >
        <div className="flex items-center gap-2 text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    )
  }

  // No env vars
  if (envVars.length === 0) {
    return (
      <div
        ref={submenuRef}
        style={{ position: 'absolute', top: position.top, left: position.left, zIndex: 10000 }}
        className="w-64 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-3"
        data-testid={`submenu-${option.templateId}`}
      >
        <p className="text-sm text-neutral-400 mb-3">No configuration options.</p>
        <button
          onClick={handleUseDefault}
          className="w-full px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
          data-testid={`submenu-${option.templateId}-use-default`}
        >
          Use {option.name}
        </button>
      </div>
    )
  }

  return (
    <div
      ref={submenuRef}
      style={{ position: 'absolute', top: position.top, left: position.left, zIndex: 10000 }}
      className="min-w-96 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl"
      data-testid={`submenu-${option.templateId}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 bg-neutral-900/50 rounded-t-lg">
        <span className="text-sm font-medium text-neutral-300">{option.name}</span>
        <button onClick={onClose} className="p-1 hover:bg-neutral-700 rounded">
          <X className="h-3 w-3 text-neutral-500" />
        </button>
      </div>

      {/* Env Var Editors - using EnvVarInfo from backend */}
      <div className="max-h-80 overflow-y-auto">
        {envVars.map(ev => {
          const config = configs[ev.name] || { name: ev.name, source: 'default' }

          return (
            <EnvVarEditor
              key={ev.name}
              envVar={ev}
              config={config}
              onChange={(updates) => handleConfigChange(ev.name, updates)}
            />
          )
        })}
      </div>

      {/* Footer actions */}
      <div className="px-3 py-2 border-t border-neutral-700 bg-neutral-900/50">
        {isEditingConfig ? (
          // Editing an existing saved config
          <div className="space-y-2">
            {showSaveAsNew ? (
              // Save as new form
              <>
                <input
                  type="text"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  placeholder="Name for new configuration..."
                  className="w-full text-xs px-2 py-1.5 rounded border border-neutral-600 bg-neutral-800 text-neutral-200"
                  data-testid={`submenu-${option.id}-new-name`}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSaveAsNew(false)}
                    className="flex-1 px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-700 rounded"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSaveAsNew}
                    disabled={!configName.trim() || saving}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                    data-testid={`submenu-${option.id}-save-new`}
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Create
                  </button>
                </div>
              </>
            ) : (
              // Main edit actions
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onSelect()
                      onClose()
                    }}
                    className="flex-1 px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-700 rounded"
                  >
                    Use
                  </button>
                  <button
                    onClick={handleUpdateConfig}
                    disabled={savingUpdate || !hasChanges}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                    data-testid={`submenu-${option.id}-save`}
                  >
                    {savingUpdate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </button>
                  <button
                    onClick={() => setShowSaveAsNew(true)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs border border-neutral-600 text-neutral-300 rounded hover:bg-neutral-700"
                    data-testid={`submenu-${option.id}-save-as`}
                  >
                    <Plus className="h-3 w-3" />
                    New
                  </button>
                </div>
                <button
                  onClick={async () => {
                    setDeleting(true)
                    try {
                      await onDeleteSaved(option)
                      await onRefresh?.()
                      onClose()
                    } finally {
                      setDeleting(false)
                    }
                  }}
                  disabled={deleting}
                  className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-red-400 hover:bg-red-900/30 rounded border border-red-800/50 disabled:opacity-50"
                  data-testid={`submenu-${option.id}-delete`}
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete Profile
                </button>
              </div>
            )}
          </div>
        ) : hasChanges ? (
          // Template with changes - save as new
          <div className="space-y-2">
            <input
              type="text"
              value={configName}
              onChange={(e) => setConfigName(e.target.value)}
              placeholder="Name this configuration..."
              className="w-full text-xs px-2 py-1.5 rounded border border-neutral-600 bg-neutral-800 text-neutral-200"
              data-testid={`submenu-${option.templateId}-name`}
            />
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAsNew}
                disabled={!configName.trim() || saving}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                data-testid={`submenu-${option.templateId}-save`}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
            </div>
          </div>
        ) : (
          // Template without changes - use default
          <button
            onClick={handleUseDefault}
            className="w-full px-3 py-1.5 text-xs bg-primary-600 text-white rounded hover:bg-primary-700"
            data-testid={`submenu-${option.templateId}-use-default`}
          >
            Use Default
          </button>
        )}
      </div>

      {/* Saved configs for this template - at bottom (only when viewing template, not editing a config) */}
      {!isEditingConfig && savedConfigs.length > 0 && (
        <div className="border-t border-neutral-700 rounded-b-lg">
          <div className="px-3 py-1.5 text-[10px] font-medium text-neutral-500 uppercase tracking-wide bg-neutral-900/30">
            Saved Profiles
          </div>
          {savedConfigs.map(saved => (
            <div
              key={saved.id}
              className="flex items-center hover:bg-neutral-700 group"
              data-testid={`submenu-saved-${saved.id}`}
            >
              <button
                onClick={() => {
                  onSelectSaved(saved)
                  onClose()
                }}
                className="flex-1 flex items-center gap-2 px-3 py-2 text-left text-sm"
              >
                <span className="text-neutral-300">{saved.name}</span>
                {saved.configSummary && (
                  <span className="text-xs text-neutral-500">- {saved.configSummary}</span>
                )}
              </button>
              <div className="flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditSaved(saved)
                    onClose()
                  }}
                  className="p-1 hover:bg-neutral-600 rounded"
                  title="Edit"
                  data-testid={`submenu-saved-${saved.id}-edit`}
                >
                  <Pencil className="h-3 w-3 text-neutral-400" />
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    await onDeleteSaved(saved)
                    await onRefresh?.()
                  }}
                  className="p-1 hover:bg-neutral-600 rounded"
                  title="Delete"
                  data-testid={`submenu-saved-${saved.id}-delete`}
                >
                  <Trash2 className="h-3 w-3 text-neutral-400 hover:text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ProviderConfigDropdown({
  capability,
  consumerId,
  value,
  options,
  templates = [],
  loading = false,
  onChange,
  onCreateConfig,
  onEditConfig,
  onDeleteConfig,
  onUpdateConfig,
  onRefresh,
  onCreateNew,
  disabled = false,
  error,
}: ProviderConfigDropdownProps) {
  const { isEnabled } = useFeatureFlags()
  const serviceConfigsEnabled = isEnabled('service_configs')

  // When service_configs flag is off, hide saved configs
  const effectiveOptions: GroupedProviders = serviceConfigsEnabled
    ? options
    : { defaults: options.defaults, saved: [] }

  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 })
  const [activeSubmenu, setActiveSubmenu] = useState<{ option: ProviderOption; top: number } | null>(null)
  const [optimisticValue, setOptimisticValue] = useState<ProviderOption | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const testIdBase = `provider-dropdown-${consumerId}-${capability}`

  // Clear optimistic value when actual value updates (API completed)
  useEffect(() => {
    if (value?.id === optimisticValue?.id) {
      setOptimisticValue(null)
    }
  }, [value, optimisticValue])

  // The displayed value: optimistic takes priority for instant feedback
  const displayValue = optimisticValue || value

  // Calculate menu position when opening
  const updateMenuPosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }
  }, [])

  // Update position when opening
  useEffect(() => {
    if (isOpen) {
      updateMenuPosition()
    } else {
      setActiveSubmenu(null)
    }
  }, [isOpen, updateMenuPosition])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const clickedTrigger = dropdownRef.current?.contains(target)
      const clickedMenu = menuRef.current?.contains(target)
      // Check if clicked inside submenu
      const clickedSubmenu = (event.target as Element).closest('[data-testid^="submenu-"]')
      if (!clickedTrigger && !clickedMenu && !clickedSubmenu) {
        setIsOpen(false)
        setActiveSubmenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (activeSubmenu) {
          setActiveSubmenu(null)
        } else {
          setIsOpen(false)
        }
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [activeSubmenu])

  const handleSelect = (option: ProviderOption) => {
    // Set optimistic value immediately for instant feedback
    setOptimisticValue(option)
    setIsOpen(false)
    setActiveSubmenu(null)
    // Call onChange in background (don't await)
    onChange(option)
  }

  const handleArrowClick = (option: ProviderOption, event: React.MouseEvent) => {
    event.stopPropagation()
    const rect = (event.target as HTMLElement).closest('button')?.getBoundingClientRect()
    if (rect) {
      setActiveSubmenu({
        option,
        top: rect.top + window.scrollY,
      })
    }
  }

  const getTemplateForOption = (option: ProviderOption): Template | undefined => {
    return templates.find(t => t.id === option.templateId)
  }

  const handleSaveAs = async (option: ProviderOption, name: string, config: Record<string, any>) => {
    if (onCreateConfig) {
      await onCreateConfig(option.templateId, name, config)
    }
  }

  const hasDefaults = effectiveOptions.defaults.length > 0

  // Render the selected value display
  const renderSelectedValue = () => {
    if (loading) {
      return (
        <span className="flex items-center gap-2 text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </span>
      )
    }

    if (!displayValue) {
      return (
        <span className="text-neutral-400 dark:text-neutral-500">
          Select provider...
        </span>
      )
    }

    const ModeIcon = displayValue.mode === 'cloud' ? Cloud : HardDrive

    return (
      <span className="flex items-center gap-2">
        <ModeIcon className="h-4 w-4 text-neutral-500" />
        <span className="font-medium">{displayValue.name}</span>
        {displayValue.configSummary && (
          <span className="text-neutral-500 dark:text-neutral-400">
            - {displayValue.configSummary}
          </span>
        )}
        {displayValue.isDefault && (
          <span className="text-xs text-neutral-400">(default)</span>
        )}
      </span>
    )
  }

  // Render a single option with arrow for submenu
  const renderOption = (option: ProviderOption, isSelected: boolean) => {
    const ModeIcon = option.mode === 'cloud' ? Cloud : HardDrive
    const testId = option.isDefault
      ? `provider-option-default-${option.templateId}`
      : `provider-option-config-${option.id}`
    const hasSubmenu = option.isDefault && getTemplateForOption(option)?.config_schema?.length

    return (
      <div
        key={option.id}
        className={`
          flex items-center text-sm
          hover:bg-neutral-100 dark:hover:bg-neutral-700
          ${isSelected ? 'bg-primary-50 dark:bg-primary-900/30' : ''}
        `}
      >
        {/* Main option - click to select */}
        <button
          type="button"
          onClick={() => handleSelect(option)}
          data-testid={testId}
          className="flex-1 flex items-center gap-2 px-3 py-2 text-left"
        >
          <ModeIcon className="h-4 w-4 text-neutral-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{option.name}</span>
              {option.configSummary && (
                <span className="text-neutral-500 dark:text-neutral-400 truncate text-xs">
                  - {option.configSummary}
                </span>
              )}
            </div>
          </div>
          {!option.configured && (
            <span title="Needs configuration">
              <AlertCircle className="h-4 w-4 text-warning-500 flex-shrink-0" />
            </span>
          )}
          {isSelected && (
            <Check className="h-4 w-4 text-primary-500 flex-shrink-0" />
          )}
        </button>

        {/* Arrow button for submenu */}
        {hasSubmenu && (
          <button
            type="button"
            onClick={(e) => handleArrowClick(option, e)}
            className={`
              px-2 py-2 hover:bg-neutral-200 dark:hover:bg-neutral-600 border-l border-neutral-200 dark:border-neutral-700
              ${activeSubmenu?.option.id === option.id ? 'bg-neutral-200 dark:bg-neutral-600' : ''}
            `}
            data-testid={`${testId}-arrow`}
          >
            <ChevronRight className="h-4 w-4 text-neutral-400" />
          </button>
        )}
      </div>
    )
  }

  // Check if selected value is a saved config (not a default template)
  const selectedIsConfig = value && !value.isDefault

  // Open the edit drawer for the currently selected config
  const handleEditSelectedConfig = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!value || !triggerRef.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    updateMenuPosition()
    setIsOpen(true)
    setActiveSubmenu({
      option: value,
      top: rect.top + window.scrollY,
    })
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown trigger with edit button inside */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || loading}
        data-testid={testIdBase}
        className={`
          w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border
          ${error
            ? 'border-red-300 dark:border-red-700'
            : 'border-neutral-300 dark:border-neutral-600'
          }
          ${disabled || loading
            ? 'bg-neutral-100 dark:bg-neutral-800 cursor-not-allowed opacity-50'
            : 'bg-white dark:bg-neutral-800 hover:border-primary-400 dark:hover:border-primary-500 cursor-pointer'
          }
          text-neutral-900 dark:text-neutral-100
          focus:outline-none focus:ring-2 focus:ring-primary-500
        `}
      >
        {renderSelectedValue()}
        <div className="flex items-center gap-1">
          {/* Edit button for selected saved config - inside dropdown */}
          {selectedIsConfig && (
            <span
              role="button"
              onClick={handleEditSelectedConfig}
              className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-600 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              title="Edit configuration"
              data-testid={`${testIdBase}-edit`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Error message */}
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400" data-testid={`${testIdBase}-error`}>
          {error}
        </p>
      )}

      {/* Dropdown menu - rendered via portal */}
      {isOpen && createPortal(
        <>
          <div
            ref={menuRef}
            style={{
              position: 'absolute',
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              zIndex: 9999,
            }}
            className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg"
            data-testid={`${testIdBase}-menu`}
          >
            {/* Provider templates with saved configs indented underneath */}
            {hasDefaults && (
              <>
                {effectiveOptions.defaults.map(templateOption => {
                  const childConfigs = effectiveOptions.saved.filter(s => s.templateId === templateOption.templateId)

                  // When exactly one saved config exists, skip the parent/child hierarchy
                  // and render the saved config directly at the top level
                  if (childConfigs.length === 1) {
                    return renderOption(childConfigs[0], value?.id === childConfigs[0].id)
                  }

                  return (
                    <div key={templateOption.id}>
                      {/* Template option */}
                      {renderOption(templateOption, value?.id === templateOption.id)}

                      {/* Saved configs indented under this template (when >1 exist) */}
                      {childConfigs.map(savedConfig => (
                        <div
                          key={savedConfig.id}
                          className={`
                            flex items-center text-sm pl-6
                            hover:bg-neutral-100 dark:hover:bg-neutral-700
                            ${value?.id === savedConfig.id ? 'bg-primary-50 dark:bg-primary-900/30' : ''}
                          `}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelect(savedConfig)}
                            data-testid={`provider-option-config-${savedConfig.id}`}
                            className="flex-1 flex items-center gap-2 px-3 py-1.5 text-left"
                          >
                            <span className="text-neutral-400 text-xs">└</span>
                            <span className="text-neutral-700 dark:text-neutral-300">{savedConfig.name}</span>
                            {savedConfig.configSummary && (
                              <span className="text-neutral-500 dark:text-neutral-400 truncate text-xs">
                                - {savedConfig.configSummary}
                              </span>
                            )}
                            {value?.id === savedConfig.id && (
                              <Check className="h-3 w-3 text-primary-500 flex-shrink-0 ml-auto" />
                            )}
                          </button>
                          {/* Arrow to edit saved config */}
                          <button
                            type="button"
                            onClick={(e) => handleArrowClick(savedConfig, e)}
                            className={`
                              px-2 py-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-600 border-l border-neutral-200 dark:border-neutral-700
                              ${activeSubmenu?.option.id === savedConfig.id ? 'bg-neutral-200 dark:bg-neutral-600' : ''}
                            `}
                            data-testid={`provider-option-config-${savedConfig.id}-arrow`}
                          >
                            <ChevronRight className="h-4 w-4 text-neutral-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </>
            )}

            {/* No options message */}
            {!hasDefaults && (
              <div className="px-3 py-4 text-sm text-neutral-500 dark:text-neutral-400 text-center">
                No providers available for {capability}
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-neutral-200 dark:border-neutral-700" />

            {/* Create new */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                onCreateNew()
              }}
              data-testid="provider-dropdown-create-new"
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30"
            >
              <Plus className="h-4 w-4" />
              Create new configuration...
            </button>
          </div>

          {/* Submenu - slides out from right */}
          {activeSubmenu && (
            <Submenu
              option={activeSubmenu.option}
              template={getTemplateForOption(activeSubmenu.option)}
              savedConfigs={effectiveOptions.saved.filter(s => s.templateId === activeSubmenu.option.templateId)}
              isEditingConfig={!activeSubmenu.option.isDefault}
              position={{
                top: activeSubmenu.top,
                left: menuPosition.left + menuPosition.width + 4,
              }}
              onClose={() => setActiveSubmenu(null)}
              onSelect={() => handleSelect(activeSubmenu.option)}
              onSelectSaved={(saved) => handleSelect(saved)}
              onEditSaved={(saved) => onEditConfig?.(saved.id)}
              onDeleteSaved={async (saved) => {
                await onDeleteConfig?.(saved.id)
              }}
              onSaveAs={(name, config) => handleSaveAs(activeSubmenu.option, name, config)}
              onUpdateConfig={onUpdateConfig}
              onRefresh={onRefresh}
            />
          )}
        </>,
        document.body
      )}
    </div>
  )
}

export default ProviderConfigDropdown
