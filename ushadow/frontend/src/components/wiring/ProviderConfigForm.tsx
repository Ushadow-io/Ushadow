/**
 * ProviderConfigForm - Form for creating/editing provider configurations
 *
 * Features:
 * - Base provider selection (OpenAI, Anthropic, etc.)
 * - Dynamic fields from template config_schema
 * - "Save as reusable configuration" option
 * - Slide-out panel presentation
 */

import { useState, useEffect, useCallback } from 'react'
import { Cloud, HardDrive, Loader2, Save } from 'lucide-react'
import SlideOutPanel from '../SlideOutPanel'
import { SettingField } from '../settings/SettingField'
import type { Template } from '../../services/api'

// ============================================================================
// Types
// ============================================================================

export interface ProviderConfigFormData {
  templateId: string
  name: string
  config: Record<string, any>
  saveAsReusable: boolean
}

export interface ProviderConfigFormProps {
  /** Whether the form panel is open */
  isOpen: boolean
  /** Close handler */
  onClose: () => void
  /** Capability being configured (e.g., "llm") */
  capability: string
  /** Available provider templates for this capability */
  templates: Template[]
  /** Initial template to select */
  initialTemplateId?: string
  /** Called when form is submitted */
  onSubmit: (data: ProviderConfigFormData) => Promise<void>
  /** Optional loading state override */
  loading?: boolean
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a default config name based on template
 */
function generateConfigName(template: Template): string {
  const baseName = template.name.toLowerCase().replace(/\s+/g, '-')
  return `${baseName}-custom`
}

/**
 * Get default values from template config_schema
 */
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

/**
 * Map config_schema type to SettingField type
 */
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
// Component
// ============================================================================

export function ProviderConfigForm({
  isOpen,
  onClose,
  capability,
  templates,
  initialTemplateId,
  onSubmit,
  loading: externalLoading,
}: ProviderConfigFormProps) {
  // Form state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialTemplateId || '')
  const [configName, setConfigName] = useState('')
  const [configValues, setConfigValues] = useState<Record<string, any>>({})
  const [saveAsReusable, setSaveAsReusable] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
  const loading = externalLoading || submitting

  // Reset form when opening with initial template
  useEffect(() => {
    if (isOpen) {
      const templateId = initialTemplateId || (templates.length > 0 ? templates[0].id : '')
      setSelectedTemplateId(templateId)
      setError(null)

      if (templateId) {
        const template = templates.find(t => t.id === templateId)
        if (template) {
          setConfigName(generateConfigName(template))
          setConfigValues(getDefaultValues(template))
        }
      }
    }
  }, [isOpen, initialTemplateId, templates])

  // Update form when template changes
  const handleTemplateChange = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId)
    const template = templates.find(t => t.id === templateId)
    if (template) {
      setConfigName(generateConfigName(template))
      setConfigValues(getDefaultValues(template))
    }
  }, [templates])

  // Update config value
  const handleConfigChange = useCallback((key: string, value: any) => {
    setConfigValues(prev => ({ ...prev, [key]: value }))
  }, [])

  // Submit form
  const handleSubmit = async () => {
    if (!selectedTemplate) {
      setError('Please select a provider')
      return
    }

    // Validate required fields
    const missingFields: string[] = []
    if (selectedTemplate.config_schema) {
      for (const field of selectedTemplate.config_schema) {
        if (field.required && !configValues[field.key]) {
          missingFields.push(field.label || field.key)
        }
      }
    }

    if (missingFields.length > 0) {
      setError(`Missing required fields: ${missingFields.join(', ')}`)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await onSubmit({
        templateId: selectedTemplateId,
        name: configName || generateConfigName(selectedTemplate),
        config: configValues,
        saveAsReusable,
      })
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create configuration')
    } finally {
      setSubmitting(false)
    }
  }

  // Render provider selection
  const renderProviderSelect = () => (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Base Provider
      </label>
      <select
        value={selectedTemplateId}
        onChange={(e) => handleTemplateChange(e.target.value)}
        disabled={loading}
        data-testid="provider-config-field-template"
        className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {templates.length === 0 && (
          <option value="">No providers available</option>
        )}
        {templates.map(template => (
          <option key={template.id} value={template.id}>
            {template.mode === 'cloud' ? '☁️' : '💻'} {template.name}
            {template.description ? ` - ${template.description}` : ''}
          </option>
        ))}
      </select>
      {selectedTemplate && (
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          {selectedTemplate.mode === 'cloud' ? (
            <Cloud className="h-3 w-3" />
          ) : (
            <HardDrive className="h-3 w-3" />
          )}
          <span>{selectedTemplate.mode === 'cloud' ? 'Cloud provider' : 'Local/self-hosted'}</span>
        </div>
      )}
    </div>
  )

  // Render config name field
  const renderNameField = () => (
    <SettingField
      id="config-name"
      name="configName"
      label="Configuration Name"
      type="text"
      value={configName}
      onChange={(v) => setConfigName(v as string)}
      placeholder="e.g., openai-fast, anthropic-reasoning"
      disabled={loading}
      description="A unique name to identify this configuration"
    />
  )

  // Render dynamic fields from config_schema
  const renderConfigFields = () => {
    if (!selectedTemplate?.config_schema || selectedTemplate.config_schema.length === 0) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
          This provider has no additional configuration options.
        </p>
      )
    }

    return (
      <div className="space-y-4">
        {selectedTemplate.config_schema.map(field => {
          const fieldType = mapFieldType(field.type)

          return (
            <SettingField
              key={field.key}
              id={field.key}
              name={field.key}
              label={field.label || field.key}
              type={fieldType}
              value={
                fieldType === 'toggle'
                  ? Boolean(configValues[field.key])
                  : (configValues[field.key] ?? '')
              }
              onChange={(v) => handleConfigChange(field.key, v)}
              required={field.required}
              disabled={loading}
              placeholder={field.default || undefined}
              description={field.env_var ? `Maps to ${field.env_var}` : undefined}
            />
          )
        })}
      </div>
    )
  }

  // Render save as reusable checkbox
  const renderSaveOption = () => (
    <label className="flex items-center gap-3 cursor-pointer" data-testid="provider-config-field-reusable">
      <input
        type="checkbox"
        checked={saveAsReusable}
        onChange={(e) => setSaveAsReusable(e.target.checked)}
        disabled={loading}
        className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
      />
      <span className="text-sm text-neutral-700 dark:text-neutral-300">
        Save as reusable configuration
      </span>
    </label>
  )

  // Render footer with action buttons
  const renderFooter = () => (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
        data-testid="provider-config-cancel"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || !selectedTemplateId}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        data-testid="provider-config-save"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Create Configuration
          </>
        )}
      </button>
    </div>
  )

  return (
    <SlideOutPanel
      isOpen={isOpen}
      onClose={onClose}
      title={`New ${capability.toUpperCase()} Configuration`}
      testId="provider-config-form"
      footer={renderFooter()}
    >
      <div className="space-y-6" data-testid="provider-config-form-content">
        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Provider selection */}
        {renderProviderSelect()}

        {/* Config name */}
        {renderNameField()}

        {/* Divider */}
        <hr className="border-neutral-200 dark:border-neutral-700" />

        {/* Provider-specific fields */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
            Provider Settings
          </h3>
          {renderConfigFields()}
        </div>

        {/* Divider */}
        <hr className="border-neutral-200 dark:border-neutral-700" />

        {/* Save option */}
        {renderSaveOption()}
      </div>
    </SlideOutPanel>
  )
}

export default ProviderConfigForm
