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

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Cloud,
  HardDrive,
  Loader2,
  PlayCircle,
  StopCircle,
  Pencil,
  Rocket,
  X,
  Trash2,
  Save,
  ChevronLeft,
  ChevronDown,
  Server,
  Monitor,
} from 'lucide-react'
import { CapabilitySlot } from './CapabilitySlot'
import { SettingField } from '../settings/SettingField'
import { useProviderConfigs, type ProviderOption, type UseProviderConfigsOptions } from '../../hooks/useProviderConfigs'
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
  onDeploy?: (target: { type: 'local' | 'remote' | 'kubernetes'; id?: string; configId?: string }) => void
  /** Provider templates by capability (for dropdowns) */
  providerTemplates: Template[]
  /** Pre-fetched configs to avoid duplicate API calls */
  initialConfigs?: ServiceConfigSummary[]
  /** All service configs (provider configs included) for capability dropdown lookups */
  allConfigs?: ServiceConfigSummary[]
  /** Number of configured instances */
  instanceCount?: number
  /** Active deployments for this service */
  deployments?: any[]
  /** Set of deployment IDs currently being toggled */
  togglingDeployments?: Set<string>
  /** Called to stop a deployment */
  onStopDeployment?: (deploymentId: string) => Promise<void>
  /** Called to restart a deployment */
  onRestartDeployment?: (deploymentId: string) => Promise<void>
  /** Called to remove a deployment */
  onRemoveDeployment?: (deploymentId: string, serviceName: string) => Promise<void>
  /** Called to edit a deployment */
  onEditDeployment?: (deployment: any) => Promise<void>
  /** Worker services associated with this service */
  workers?: Array<{
    template: Template
    config: ServiceConfigSummary | null
    status: string
    deployments: any[]
  }>
  /** Called to start a worker */
  onStartWorker?: (templateId: string) => Promise<void>
  /** Called to stop a worker */
  onStopWorker?: (templateId: string) => Promise<void>
  /** Called to edit a worker's settings */
  onEditWorker?: (templateId: string) => void
  /** Called to deploy a worker */
  onDeployWorker?: (templateId: string, target: { type: 'local' | 'remote' | 'kubernetes' }) => void
  /** Called when a provider is selected for a worker capability */
  onWorkerWiringChange?: (workerConfigId: string, capability: string, sourceConfigId: string) => Promise<void>
  /** Called when worker wiring is cleared */
  onWorkerWiringClear?: (workerConfigId: string, capability: string) => Promise<void>
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
  /** Pre-fetched data to avoid duplicate API calls */
  hookOptions?: UseProviderConfigsOptions
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
  hookOptions,
}: CapabilityRowProps) {
  const { grouped, templates, loading, refresh } = useProviderConfigs(capability, hookOptions)

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
  initialConfigs,
  allConfigs,
  instanceCount = 0,
  deployments = [],
  togglingDeployments = new Set(),
  onStopDeployment,
  onRestartDeployment,
  onRemoveDeployment,
  onEditDeployment,
  workers = [],
  onStartWorker,
  onStopWorker,
  onEditWorker,
  onDeployWorker,
  onWorkerWiringChange,
  onWorkerWiringClear,
}: FlatServiceCardProps) {
  // Memoize hook options to avoid recreating on each render.
  // Use allConfigs (all service configs) for provider lookups — initialConfigs contains
  // only this service's own compose configs and is wrong for filtering provider configs.
  const hookOptions = useMemo<UseProviderConfigsOptions | undefined>(() => {
    if (providerTemplates && allConfigs) {
      return { initialTemplates: providerTemplates, initialConfigs: allConfigs }
    }
    if (providerTemplates) {
      return { initialTemplates: providerTemplates }
    }
    return undefined
  }, [providerTemplates, allConfigs])
  const [startingWorker, setStartingWorker] = useState<string | null>(null)
  const [expandedWorkerId, setExpandedWorkerId] = useState<string | null>(null)
  const [creatingCapability, setCreatingCapability] = useState<string | null>(null)
  const [showDeployMenu, setShowDeployMenu] = useState(false)
  const [showWorkersDeployMenu, setShowWorkersDeployMenu] = useState(false)
  const [workersDrawerOpen, setWorkersDrawerOpen] = useState(false)
  const deployMenuRef = useRef<HTMLDivElement>(null)
  const workersDeployMenuRef = useRef<HTMLDivElement>(null)

  // Close deploy menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deployMenuRef.current && !deployMenuRef.current.contains(event.target as Node)) {
        setShowDeployMenu(false)
      }
    }
    if (showDeployMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDeployMenu])

  // Close workers deploy menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (workersDeployMenuRef.current && !workersDeployMenuRef.current.contains(event.target as Node)) {
        setShowWorkersDeployMenu(false)
      }
    }
    if (showWorkersDeployMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showWorkersDeployMenu])

  // Compute state
  const isCloud = template.mode === 'cloud'
  const consumerId = config?.id || template.id
  const status = config?.status || 'pending'

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

  // Card border/background color based on deployment status
  const getCardClasses = () => {
    // Check deployment statuses first
    const hasRunningDeployment = deployments.some(d => d.status === 'running')
    const hasDeployments = deployments.length > 0
    const hasStoppedOrFailedDeployment = deployments.some(d =>
      d.status === 'stopped' || d.status === 'failed' || d.status === 'error'
    )

    if (hasRunningDeployment) {
      return 'border-success-400 dark:border-success-600 bg-success-50/50 dark:bg-success-900/10'
    }
    if (hasDeployments && hasStoppedOrFailedDeployment) {
      return 'border-warning-400 dark:border-warning-600 bg-warning-50/50 dark:bg-warning-900/10'
    }
    // Fallback to local container status
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
          {/* Row 1: Service name + Edit */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Mode icon */}
              {isCloud ? (
                <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              ) : (
                <HardDrive className="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
              )}

              {/* Service name */}
              <span className="font-semibold text-neutral-900 dark:text-neutral-100 flex-shrink-0">
                {template.name}
              </span>

              {/* Tags */}
              {template.tags && template.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {template.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                      data-testid={`service-tag-${tag}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Edit - top right */}
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded flex-shrink-0"
                title="Edit settings"
                data-testid={`flat-service-edit-${template.id}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Description */}
          {template.description && (
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
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
                hookOptions={hookOptions}
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

        {/* Configs Section */}
        {initialConfigs && initialConfigs.length > 0 && (
          <div className="border-t border-neutral-200 dark:border-neutral-700">
            <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-800">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Configurations ({initialConfigs.length})
              </span>
            </div>
            <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {initialConfigs.map((cfg) => (
                <div
                  key={cfg.id}
                  className="px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/30"
                  data-testid={`config-row-${cfg.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Monitor className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 truncate">
                          {cfg.name}
                        </span>
                        {cfg.description && (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                            {cfg.description}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Edit */}
                      {onEditConfig && (
                        <button
                          onClick={() => onEditConfig(cfg.id)}
                          className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                          title="Edit configuration"
                          data-testid={`edit-config-${cfg.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Deploy */}
                      {onDeploy && (
                        <button
                          onClick={() => {
                            // When deploying a specific config, we need to open the deploy modal
                            // This will be handled by the parent - it should open DeployModal with config_id
                            console.log('Deploy config clicked:', cfg.id)
                            onDeploy({ type: 'local', configId: cfg.id })
                          }}
                          className="p-1 text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded"
                          title="Deploy this configuration"
                          data-testid={`deploy-config-${cfg.id}`}
                        >
                          <Rocket className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Delete */}
                      {onDeleteConfig && (
                        <button
                          onClick={() => onDeleteConfig(cfg.id)}
                          className="p-1 text-neutral-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded"
                          title="Delete configuration"
                          data-testid={`delete-config-${cfg.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deployments Section - always show if onDeploy available or has deployments */}
        {(onDeploy || (deployments && deployments.length > 0)) && (
          <div className="border-t border-neutral-200 dark:border-neutral-700">
            <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-800 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Deployments {deployments && deployments.length > 0 ? `(${deployments.length})` : ''}
              </span>
              {/* Deploy button */}
              {onDeploy && (
                <div className="relative" ref={deployMenuRef}>
                  <button
                    onClick={() => setShowDeployMenu(!showDeployMenu)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50"
                    title="Deploy service"
                    data-testid={`flat-service-deploy-${template.id}`}
                  >
                    <Rocket className="h-3 w-3" />
                    Deploy
                    <ChevronDown className="h-3 w-3" />
                  </button>

                  {/* Deploy target menu */}
                  {showDeployMenu && (
                    <div
                      className="absolute right-0 bottom-full mb-1 w-40 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg z-dropdown"
                      data-testid={`flat-service-deploy-menu-${template.id}`}
                    >
                      <button
                        onClick={() => {
                          onDeploy({ type: 'local' })
                          setShowDeployMenu(false)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-t-lg"
                        data-testid={`deploy-target-local-${template.id}`}
                      >
                        <Monitor className="h-3.5 w-3.5 text-neutral-500" />
                        <span>Local Docker</span>
                      </button>
                      <button
                        onClick={() => {
                          onDeploy({ type: 'remote' })
                          setShowDeployMenu(false)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        data-testid={`deploy-target-remote-${template.id}`}
                      >
                        <Server className="h-3.5 w-3.5 text-neutral-500" />
                        <span>Remote uNode</span>
                      </button>
                      <button
                        onClick={() => {
                          onDeploy({ type: 'kubernetes' })
                          setShowDeployMenu(false)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-b-lg"
                        data-testid={`deploy-target-kubernetes-${template.id}`}
                      >
                        <Cloud className="h-3.5 w-3.5 text-neutral-500" />
                        <span>Kubernetes</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {deployments && deployments.length > 0 && (() => {
              // Group deployments by node (unode_hostname)
              const byNode = deployments.reduce((acc, d) => {
                const node = d.unode_hostname || 'Local'
                if (!acc[node]) acc[node] = []
                acc[node].push(d)
                return acc
              }, {} as Record<string, typeof deployments>)

              return (
                <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {Object.entries(byNode).map(([nodeName, nodeDeployments]) => (
                    <div key={nodeName} className="px-4 py-2">
                      {/* Node name header */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <Server className="h-3 w-3 text-neutral-400" />
                        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                          {nodeName}
                        </span>
                      </div>
                      {/* Deployments on this node */}
                      <div className="space-y-1 ml-5">
                        {nodeDeployments.map((deployment) => {
                          const shortContainerName = deployment.container_name
                            ?.replace(/^ushadow-\w+-/, '')
                            ?.replace(/-[a-f0-9]{8}$/, '') || deployment.container_name
                          const url = deployment.access_url || (deployment.exposed_port ? `http://localhost:${deployment.exposed_port}` : null)
                          const isRunning = deployment.status === 'running' || deployment.status === 'deploying'

                          return (
                            <div
                              key={deployment.id}
                              className="flex items-center justify-between gap-2"
                              data-testid={`deployment-row-${deployment.id}`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {/* Toggle switch */}
                                <button
                                  onClick={() => {
                                    if (isRunning && onStopDeployment) {
                                      onStopDeployment(deployment.id)
                                    } else if (!isRunning && onRestartDeployment) {
                                      onRestartDeployment(deployment.id)
                                    }
                                  }}
                                  disabled={togglingDeployments.has(deployment.id)}
                                  className={`relative flex-shrink-0 w-8 h-4 rounded-full transition-all ${
                                    togglingDeployments.has(deployment.id)
                                      ? 'bg-neutral-400 dark:bg-neutral-500 opacity-60'
                                      : isRunning
                                        ? 'bg-success-500'
                                        : 'bg-neutral-300 dark:bg-neutral-600'
                                  }`}
                                  title={togglingDeployments.has(deployment.id) ? 'Updating...' : isRunning ? 'Stop' : 'Start'}
                                  data-testid={`toggle-deployment-${deployment.id}`}
                                >
                                  <span
                                    className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${
                                      isRunning ? 'translate-x-4' : ''
                                    } ${togglingDeployments.has(deployment.id) ? 'opacity-70' : ''}`}
                                  />
                                </button>
                                {togglingDeployments.has(deployment.id) && (
                                  <Loader2 className="h-3 w-3 animate-spin text-neutral-400 flex-shrink-0" />
                                )}
                                <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400 truncate">
                                  {shortContainerName}
                                </span>
                                {url && (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate"
                                    data-testid={`deployment-url-${deployment.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {url.replace(/^https?:\/\//, '')}
                                  </a>
                                )}
                              </div>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                {onEditDeployment && (
                                  <button
                                    onClick={() => onEditDeployment(deployment)}
                                    className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                                    title="Edit"
                                    data-testid={`edit-deployment-${deployment.id}`}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                                {onRemoveDeployment && (
                                  <button
                                    onClick={() => onRemoveDeployment(deployment.id, template.name)}
                                    className="p-1 text-neutral-400 hover:text-error-600 dark:hover:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20 rounded"
                                    title="Remove"
                                    data-testid={`remove-deployment-${deployment.id}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}

        {/* Workers Section */}
        {workers && workers.length > 0 && (
          <div className="border-t border-neutral-200 dark:border-neutral-700">
            <div
              className="px-4 py-2 bg-neutral-50 dark:bg-neutral-800 flex items-center justify-between cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700/50"
              onClick={() => setWorkersDrawerOpen(!workersDrawerOpen)}
              data-testid="workers-section-header"
            >
              <div className="flex items-center gap-2">
                <ChevronDown
                  className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${
                    workersDrawerOpen ? 'rotate-180' : ''
                  }`}
                />
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Workers ({workers.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Edit button */}
                {onEditWorker && workers.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      // Edit the first worker (or could show a dropdown like deploy)
                      if (workers.length === 1) {
                        onEditWorker(workers[0].template.id)
                      } else {
                        // Toggle the drawer to show worker settings
                        setWorkersDrawerOpen(true)
                      }
                    }}
                    className="p-1.5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600 rounded"
                    title="Edit workers"
                    data-testid="edit-workers-button"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Deploy button with worker selection dropdown */}
                {onDeployWorker && workers.length > 0 && (
                  <div className="relative" ref={workersDeployMenuRef}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowWorkersDeployMenu(!showWorkersDeployMenu)
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50"
                      title="Deploy worker"
                      data-testid="deploy-workers-button"
                    >
                      <Rocket className="h-3 w-3" />
                      Deploy
                      <ChevronDown className="h-3 w-3" />
                    </button>

                  {/* Deploy target menu - same as main Deploy button */}
                  {showWorkersDeployMenu && (
                    <div
                      className="absolute right-0 bottom-full mb-1 w-40 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg z-dropdown"
                      data-testid="deploy-workers-menu"
                    >
                      <button
                        onClick={() => {
                          workers.forEach(w => onDeployWorker(w.template.id, { type: 'local' }))
                          setShowWorkersDeployMenu(false)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-t-lg"
                        data-testid="deploy-workers-local"
                      >
                        <Monitor className="h-3.5 w-3.5 text-neutral-500" />
                        <span>Local Docker</span>
                      </button>
                      <button
                        onClick={() => {
                          workers.forEach(w => onDeployWorker(w.template.id, { type: 'remote' }))
                          setShowWorkersDeployMenu(false)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        data-testid="deploy-workers-remote"
                      >
                        <Server className="h-3.5 w-3.5 text-neutral-500" />
                        <span>Remote uNode</span>
                      </button>
                      <button
                        onClick={() => {
                          workers.forEach(w => onDeployWorker(w.template.id, { type: 'kubernetes' }))
                          setShowWorkersDeployMenu(false)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-b-lg"
                        data-testid="deploy-workers-kubernetes"
                      >
                        <Cloud className="h-3.5 w-3.5 text-neutral-500" />
                        <span>Kubernetes</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>

            {/* Workers Capabilities Drawer */}
            {workersDrawerOpen && (
              <div
                className="border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 space-y-4 animate-in slide-in-from-top duration-200"
                data-testid="workers-capabilities-drawer"
              >
                {workers.map((worker) => {
                  const workerConsumerId = worker.config?.id || worker.template.id
                  const workerWiring = wiring.filter((w) => w.target_config_id === workerConsumerId)

                  // Skip workers with no required capabilities
                  if (!worker.template.requires || worker.template.requires.length === 0) {
                    return (
                      <div key={worker.template.id} className="text-xs text-neutral-500 dark:text-neutral-400">
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">{worker.template.name}</span>
                        <span className="ml-2">— No capabilities required</span>
                      </div>
                    )
                  }

                  return (
                    <div key={worker.template.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {worker.template.name}
                        </span>
                        {onEditWorker && (
                          <button
                            onClick={() => onEditWorker(worker.template.id)}
                            className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                            title="Edit worker settings"
                            data-testid={`edit-worker-${worker.template.id}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {worker.template.description && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {worker.template.description}
                        </p>
                      )}
                      <div className="space-y-2 pl-3 border-l-2 border-neutral-200 dark:border-neutral-700">
                        {worker.template.requires.map((capability) => {
                          const wire = workerWiring.find(
                            (w) => w.target_capability === capability
                          )
                          const currentProviderId = wire?.source_config_id || null

                          return (
                            <CapabilityRow
                              key={`${worker.template.id}-${capability}`}
                              capability={capability}
                              consumerId={workerConsumerId}
                              currentProviderId={currentProviderId}
                              onSelect={async (option) => {
                                const sourceId = option.isDefault ? option.templateId : option.id
                                if (onWorkerWiringChange) {
                                  await onWorkerWiringChange(workerConsumerId, capability, sourceId)
                                }
                              }}
                              onCreateConfig={async (templateId, name, config) => {
                                const createdId = await onConfigCreate(templateId, name, config)
                                if (onWorkerWiringChange) {
                                  await onWorkerWiringChange(workerConsumerId, capability, createdId)
                                }
                              }}
                              onEditConfig={onEditConfig}
                              onDeleteConfig={onDeleteConfig}
                              onUpdateConfig={onUpdateConfig}
                              onCreateNew={() => setCreatingCapability(capability)}
                              onClear={async () => {
                                if (onWorkerWiringClear) {
                                  await onWorkerWiringClear(workerConsumerId, capability)
                                }
                              }}
                              hookOptions={hookOptions}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {(() => {
              // Collect all worker deployments and group by node
              const allWorkerDeps: Array<{ worker: typeof workers[0], dep: any }> = []
              workers.forEach(worker => {
                if (worker.deployments && worker.deployments.length > 0) {
                  worker.deployments.forEach((dep: any) => {
                    allWorkerDeps.push({ worker, dep })
                  })
                }
              })

              // Group by node
              const byNode = allWorkerDeps.reduce((acc, { worker, dep }) => {
                const node = dep.unode_hostname || 'Local'
                if (!acc[node]) acc[node] = []
                acc[node].push({ worker, dep })
                return acc
              }, {} as Record<string, typeof allWorkerDeps>)

              // If no deployments, show workers without node grouping
              if (Object.keys(byNode).length === 0) {
                return (
                  <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                    {workers.map((worker) => (
                      <div
                        key={worker.template.id}
                        className="px-4 py-2 text-sm text-neutral-500 dark:text-neutral-400"
                        data-testid={`worker-row-${worker.template.id}`}
                      >
                        {worker.template.name} — No deployments
                      </div>
                    ))}
                  </div>
                )
              }

              return (
                <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {Object.entries(byNode).map(([nodeName, items]) => (
                    <div key={nodeName} className="px-4 py-2">
                      {/* Node header */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <Server className="h-3 w-3 text-neutral-400" />
                        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                          {nodeName}
                        </span>
                      </div>
                      {/* Worker deployments on this node */}
                      <div className="space-y-1 ml-5">
                        {items.map(({ worker, dep }) => {
                          const shortName = dep.container_name
                            ?.replace(/^ushadow-\w+-/, '')
                            ?.replace(/-[a-f0-9]{8}$/, '') || dep.container_name
                          const isDepRunning = dep.status === 'running' || dep.status === 'deploying'

                          return (
                            <div
                              key={dep.id}
                              className="flex items-center justify-between gap-2"
                              data-testid={`worker-deployment-${dep.id}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <button
                                  onClick={() => {
                                    if (isDepRunning && onStopDeployment) {
                                      onStopDeployment(dep.id)
                                    } else if (!isDepRunning && onRestartDeployment) {
                                      onRestartDeployment(dep.id)
                                    }
                                  }}
                                  disabled={togglingDeployments.has(dep.id)}
                                  className={`relative flex-shrink-0 w-8 h-4 rounded-full transition-all ${
                                    togglingDeployments.has(dep.id)
                                      ? 'bg-neutral-400 dark:bg-neutral-500 opacity-60'
                                      : isDepRunning
                                        ? 'bg-success-500'
                                        : 'bg-neutral-300 dark:bg-neutral-600'
                                  }`}
                                  title={togglingDeployments.has(dep.id) ? 'Updating...' : isDepRunning ? 'Stop' : 'Start'}
                                  data-testid={`toggle-worker-deployment-${dep.id}`}
                                >
                                  <span
                                    className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${
                                      isDepRunning ? 'translate-x-4' : ''
                                    } ${togglingDeployments.has(dep.id) ? 'opacity-70' : ''}`}
                                  />
                                </button>
                                {togglingDeployments.has(dep.id) && (
                                  <Loader2 className="h-3 w-3 animate-spin text-neutral-400 flex-shrink-0" />
                                )}
                                <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400 truncate">
                                  {shortName}
                                </span>
                              </div>
                              {onRemoveDeployment && (
                                <button
                                  onClick={() => onRemoveDeployment(dep.id, worker.template.name)}
                                  className="p-1 text-neutral-400 hover:text-error-600 dark:hover:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20 rounded"
                                  title="Remove"
                                  data-testid={`remove-worker-deployment-${dep.id}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </>
  )
}

export default FlatServiceCard
