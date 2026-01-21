/**
 * FlatServiceCard - Simplified service card for single-config services
 *
 * This is the "flat" view shown when a service has 0-1 configs.
 * Shows capability dropdowns inline instead of nested hierarchy.
 *
 * ┌─────────────────────────────────────────────────┐
 * │ Chronicle                           [▸] [⚙️] [+] │
 * │ ──────────────────────────────────────────────── │
 * │ LLM:           [OpenAI (default)        ▼]      │
 * │ Transcription: [Deepgram (default)      ▼]      │
 * │ Memory:        [OpenMemory              ▼]      │
 * └─────────────────────────────────────────────────┘
 */

import { useState, useCallback } from 'react'
import {
  Cloud,
  HardDrive,
  Loader2,
  PlayCircle,
  StopCircle,
  Plus,
  Pencil,
  Rocket,
  X,
  Save,
  ChevronLeft,
} from 'lucide-react'
import { CapabilitySlot } from './CapabilitySlot'
import { StatusIndicator } from './StatusIndicator'
import { SettingField } from '../settings/SettingField'
import { useProviderConfigs, type ProviderOption } from '../../hooks/useProviderConfigs'
import type { Template, ServiceConfigSummary, Wiring } from '../../services/api'

// ============================================================================
// Types
// ============================================================================

export interface FlatServiceCardProps {
  /** The service template */
  template: Template
  /** The single config (if any) */
  config: ServiceConfigSummary | null
  /** Current wiring connections */
  wiring: Wiring[]
  /** Called when a provider is selected for a capability */
  onWiringChange: (capability: string, sourceConfigId: string) => Promise<void>
  /** Called when wiring is cleared */
  onWiringClear: (capability: string) => Promise<void>
  /** Called when a new config is created - returns the created config ID */
  onConfigCreate: (templateId: string, name: string, config: Record<string, any>) => Promise<string>
  /** Called to edit an existing config */
  onEditConfig?: (configId: string) => void
  /** Called to delete a config */
  onDeleteConfig?: (configId: string) => Promise<void>
  /** Called to update an existing config */
  onUpdateConfig?: (configId: string, config: Record<string, any>) => Promise<void>
  /** Called to start the service */
  onStart?: () => Promise<void>
  /** Called to stop the service */
  onStop?: () => Promise<void>
  /** Called to edit settings */
  onEdit?: () => void
  /** Called to add a new config variant */
  onAddConfig?: () => void
  /** Called to deploy the service */
  onDeploy?: (target: { type: 'local' | 'remote' | 'kubernetes'; id?: string }) => void
  /** Provider templates by capability (for dropdowns) */
  providerTemplates: Template[]
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateConfigName(template: Template): string {
  const baseName = template.name.toLowerCase().replace(/\s+/g, '-')
  return `${baseName}-custom`
}

function getDefaultValues(template: Template): Record<string, any> {
  const defaults: Record<string, any> = {}
  if (template.config_schema) {
    for (const field of template.config_schema) {
      if (field.default !== undefined) {
        defaults[field.key] = field.default
      }
    }
  }
  return defaults
}

function mapFieldType(schemaType: string): 'text' | 'secret' | 'url' | 'select' | 'toggle' {
  switch (schemaType) {
    case 'secret':
    case 'password':
      return 'secret'
    case 'url':
      return 'url'
    case 'boolean':
    case 'bool':
      return 'toggle'
    case 'select':
    case 'enum':
      return 'select'
    default:
      return 'text'
  }
}

// ============================================================================
// InlineConfigPanel - Progressive inline config expansion
// ============================================================================

interface InlineConfigPanelProps {
  capability: string
  templates: Template[]
  initialTemplateId?: string
  onSubmit: (data: { templateId: string; name: string; config: Record<string, any> }) => Promise<void>
  onClose: () => void
}

function InlineConfigPanel({
  capability,
  templates,
  initialTemplateId,
  onSubmit,
  onClose,
}: InlineConfigPanelProps) {
  const initialTemplate = templates.find(t => t.id === (initialTemplateId || templates[0]?.id))

  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplateId || templates[0]?.id || '')
  const [configName, setConfigName] = useState(initialTemplate ? generateConfigName(initialTemplate) : '')
  const [configValues, setConfigValues] = useState<Record<string, any>>(initialTemplate ? getDefaultValues(initialTemplate) : {})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId)
    const template = templates.find(t => t.id === templateId)
    if (template) {
      setConfigName(generateConfigName(template))
      setConfigValues(getDefaultValues(template))
    }
  }

  const handleSubmit = async () => {
    if (!selectedTemplate) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        templateId: selectedTemplateId,
        name: configName || generateConfigName(selectedTemplate),
        config: configValues,
      })
    } catch (err: any) {
      setError(err.message || 'Failed to create configuration')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="border-t border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/20 animate-in slide-in-from-top duration-200"
      data-testid={`inline-config-${capability}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-primary-200 dark:border-primary-800">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="p-1 hover:bg-primary-100 dark:hover:bg-primary-800 rounded"
            data-testid={`inline-config-back-${capability}`}
          >
            <ChevronLeft className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          </button>
          <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
            Configure {capability.toUpperCase()}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-primary-100 dark:hover:bg-primary-800 rounded"
        >
          <X className="h-4 w-4 text-neutral-500" />
        </button>
      </div>

      {/* Form Content */}
      <div className="p-4 space-y-4">
        {error && (
          <div className="p-2 text-xs bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Provider Selection */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Provider
          </label>
          <select
            value={selectedTemplateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
            disabled={submitting}
            className="w-full text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5"
            data-testid={`inline-config-provider-${capability}`}
          >
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.mode === 'cloud' ? '☁️' : '💻'} {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Config Name */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Configuration Name
          </label>
          <input
            type="text"
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
            placeholder="e.g., openai-fast"
            disabled={submitting}
            className="w-full text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5"
            data-testid={`inline-config-name-${capability}`}
          />
        </div>

        {/* Dynamic Fields */}
        {selectedTemplate?.config_schema && selectedTemplate.config_schema.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-700">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Settings
            </span>
            {selectedTemplate.config_schema.map(field => (
              <SettingField
                key={field.key}
                id={`${capability}-${field.key}`}
                name={field.key}
                label={field.label || field.key}
                type={mapFieldType(field.type)}
                value={configValues[field.key] ?? field.default ?? ''}
                onChange={(v) => setConfigValues(prev => ({ ...prev, [field.key]: v }))}
                required={field.required}
                disabled={submitting}
                placeholder={field.default?.toString()}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
            data-testid={`inline-config-cancel-${capability}`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedTemplateId}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
            data-testid={`inline-config-save-${capability}`}
          >
            {submitting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

interface CapabilityRowProps {
  capability: string
  consumerId: string
  currentProviderId: string | null
  onSelect: (option: ProviderOption) => void
  onCreateConfig: (templateId: string, name: string, config: Record<string, any>) => Promise<void>
  onEditConfig?: (configId: string) => void
  onDeleteConfig?: (configId: string) => Promise<void>
  onUpdateConfig?: (configId: string, config: Record<string, any>) => Promise<void>
  /** Called after delete to refresh parent state */
  onExternalRefresh?: () => Promise<void>
  onCreateNew: () => void
  onClear: () => void
}

function CapabilityRow({
  capability,
  consumerId,
  currentProviderId,
  onSelect,
  onCreateConfig,
  onEditConfig,
  onDeleteConfig,
  onUpdateConfig,
  onExternalRefresh,
  onCreateNew,
  onClear,
}: CapabilityRowProps) {
  const { grouped, templates, loading, refresh } = useProviderConfigs(capability)

  // Combined refresh: refresh hook data + notify parent
  const handleRefresh = useCallback(async () => {
    await refresh()
    await onExternalRefresh?.()
  }, [refresh, onExternalRefresh])

  // Find current selection in grouped options
  const findCurrentOption = (): ProviderOption | null => {
    if (!currentProviderId) return null

    // Check saved configs first
    const savedOption = grouped.saved.find(o => o.id === currentProviderId)
    if (savedOption) return savedOption

    // Check if it's a template reference
    const templateOption = grouped.defaults.find(o =>
      o.id === `template:${currentProviderId}` || o.templateId === currentProviderId
    )
    if (templateOption) return templateOption

    return null
  }

  const selectedOption = findCurrentOption()

  return (
    <CapabilitySlot
      mode="dropdown"
      consumerId={consumerId}
      capability={capability}
      selectedOption={selectedOption}
      options={grouped}
      templates={templates}
      loading={loading}
      onSelect={onSelect}
      onCreateConfig={onCreateConfig}
      onEditConfig={onEditConfig}
      onDeleteConfig={onDeleteConfig}
      onUpdateConfig={onUpdateConfig}
      onRefresh={handleRefresh}
      onCreateNew={onCreateNew}
      onClear={onClear}
    />
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FlatServiceCard({
  template,
  config,
  wiring,
  onWiringChange,
  onWiringClear,
  onConfigCreate,
  onEditConfig,
  onDeleteConfig,
  onUpdateConfig,
  onStart,
  onStop,
  onEdit,
  onAddConfig,
  onDeploy,
  providerTemplates,
}: FlatServiceCardProps) {
  const [isStarting, setIsStarting] = useState(false)
  const [creatingCapability, setCreatingCapability] = useState<string | null>(null)

  // Compute state
  const isCloud = template.mode === 'cloud'
  const consumerId = config?.id || template.id
  const status = config?.status || 'pending'

  const canStart = !isCloud && ['stopped', 'pending', 'not_running', 'not_found'].includes(status)
  const canStop = !isCloud && ['running', 'starting'].includes(status)

  // Get current provider for a capability from wiring
  const getProviderForCapability = useCallback(
    (capability: string): string | null => {
      const wire = wiring.find(
        w => w.target_config_id === consumerId && w.target_capability === capability
      )
      return wire?.source_config_id || null
    },
    [wiring, consumerId]
  )

  // Handle provider selection
  const handleProviderSelect = useCallback(
    async (capability: string, option: ProviderOption) => {
      // If it's a template (default), use the templateId
      // If it's a saved config, use the config id
      const sourceId = option.isDefault ? option.templateId : option.id
      await onWiringChange(capability, sourceId)
    },
    [onWiringChange]
  )

  // Handle start/stop
  const handleStartClick = async () => {
    if (!onStart) return
    setIsStarting(true)
    try {
      await onStart()
    } finally {
      setIsStarting(false)
    }
  }

  const handleStopClick = async () => {
    if (!onStop) return
    setIsStarting(true)
    try {
      await onStop()
    } finally {
      setIsStarting(false)
    }
  }

  // Open create form for a capability
  const handleCreateNew = (capability: string) => {
    setCreatingCapability(capability)
  }

  // Handle form submission
  const handleFormSubmit = async (data: {
    templateId: string
    name: string
    config: Record<string, any>
  }) => {
    await onConfigCreate(data.templateId, data.name, data.config)

    // After creating, wire to this capability
    if (creatingCapability) {
      await onWiringChange(creatingCapability, data.name) // Use the new config's name as ID
    }

    setCreatingCapability(null)
  }

  // Get templates for the capability being created
  const getTemplatesForCapability = (capability: string): Template[] => {
    return providerTemplates.filter(t => t.provides === capability)
  }

  // Card border color based on status
  const getCardClasses = () => {
    if (status === 'running') {
      return 'border-success-400 dark:border-success-600'
    }
    return 'border-neutral-200 dark:border-neutral-700'
  }

  return (
    <>
      <div
        className={`rounded-lg border ${getCardClasses()} bg-white dark:bg-neutral-900 transition-all shadow-sm`}
        data-testid={`flat-service-${template.id}`}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Mode icon */}
              {isCloud ? (
                <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              ) : (
                <HardDrive className="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
              )}

              {/* Service name */}
              <span className="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate">
                {template.name}
              </span>

              <StatusIndicator status={status} />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Start/Stop */}
              {!isCloud && onStart && onStop && (
                <>
                  {isStarting ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </span>
                  ) : canStart ? (
                    <button
                      onClick={handleStartClick}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300 hover:bg-success-200"
                      data-testid={`flat-service-start-${template.id}`}
                    >
                      <PlayCircle className="h-4 w-4" />
                      Start
                    </button>
                  ) : canStop ? (
                    <button
                      onClick={handleStopClick}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200"
                      data-testid={`flat-service-stop-${template.id}`}
                    >
                      <StopCircle className="h-4 w-4" />
                      Stop
                    </button>
                  ) : null}
                </>
              )}

              {/* Edit */}
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                  title="Edit settings"
                  data-testid={`flat-service-edit-${template.id}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}

              {/* Add config variant */}
              {onAddConfig && (
                <button
                  onClick={onAddConfig}
                  className="p-1.5 text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                  title="Add configuration variant"
                  data-testid={`flat-service-add-${template.id}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}

              {/* Deploy */}
              {onDeploy && (
                <button
                  onClick={() => onDeploy({ type: 'local' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50"
                  title="Deploy service"
                  data-testid={`flat-service-deploy-${template.id}`}
                >
                  <Rocket className="h-4 w-4" />
                  Deploy
                </button>
              )}
            </div>
          </div>

          {/* Description */}
          {template.description && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {template.description}
            </p>
          )}
        </div>

        {/* Capability Dropdowns - hidden when inline config is open */}
        {template.requires && template.requires.length > 0 && !creatingCapability && (
          <div className="p-4 space-y-3">
            {template.requires.map(capability => (
              <CapabilityRow
                key={capability}
                capability={capability}
                consumerId={consumerId}
                currentProviderId={getProviderForCapability(capability)}
                onSelect={(option) => handleProviderSelect(capability, option)}
                onCreateConfig={async (templateId, name, config) => {
                  const createdId = await onConfigCreate(templateId, name, config)
                  // After creating, auto-wire to this capability using the actual ID
                  await onWiringChange(capability, createdId)
                }}
                onEditConfig={onEditConfig}
                onDeleteConfig={onDeleteConfig}
                onUpdateConfig={onUpdateConfig}
                onCreateNew={() => handleCreateNew(capability)}
                onClear={() => onWiringClear(capability)}
              />
            ))}
          </div>
        )}

        {/* Inline config panel - for "Create new configuration..." option */}
        {creatingCapability && (
          <InlineConfigPanel
            capability={creatingCapability}
            templates={getTemplatesForCapability(creatingCapability)}
            onSubmit={handleFormSubmit}
            onClose={() => setCreatingCapability(null)}
          />
        )}
      </div>
    </>
  )
}

export default FlatServiceCard
