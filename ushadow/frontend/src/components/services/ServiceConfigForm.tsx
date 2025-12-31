import { Edit2, Save, X, Loader2 } from 'lucide-react'
import type { ConfigField, ServiceInstance } from '../../contexts/ServicesContext'
import { shouldShowField, maskValue } from '../../hooks/useServiceStatus'
import { SecretInput, SettingField } from '../settings'

// ============================================================================
// Types
// ============================================================================

interface ServiceConfigFormProps {
  /** The service being configured */
  service: ServiceInstance
  /** Current saved config values */
  config: Record<string, any>
  /** Whether we're in edit mode */
  isEditing: boolean
  /** Current form values (only used in edit mode) */
  editForm: Record<string, any>
  /** Validation errors by field key */
  validationErrors: Record<string, string>
  /** Whether save is in progress */
  isSaving: boolean
  /** Whether the status allows configuration */
  canConfigure: boolean
  /** Callback when a form field changes */
  onFieldChange: (key: string, value: any) => void
  /** Callback to enter edit mode */
  onStartEdit: () => void
  /** Callback to save configuration */
  onSave: () => void
  /** Callback to cancel editing */
  onCancel: () => void
}

// ============================================================================
// Helper Functions
// ============================================================================

function renderFieldValue(
  field: ConfigField,
  value: any,
  isEditing: boolean,
  serviceId: string,
  editForm: Record<string, any>,
  validationErrors: Record<string, string>,
  onFieldChange: (key: string, value: any) => void
) {
  const { key } = field
  const isSecret = key.includes('password') || key.includes('key')
  const fieldId = `${serviceId}-${key}`
  const hasError = validationErrors[key]

  if (isEditing) {
    // Boolean toggle
    if (typeof value === 'boolean' || field.type === 'boolean') {
      return (
        <SettingField
          id={fieldId}
          name={key}
          label=""
          type="toggle"
          value={editForm[key] === true}
          onChange={(v) => onFieldChange(key, v)}
        />
      )
    }

    // Secret input (API keys, passwords)
    if (isSecret) {
      return (
        <SecretInput
          id={fieldId}
          name={key}
          value={editForm[key] || ''}
          onChange={(v) => onFieldChange(key, v)}
          placeholder="●●●●●●"
          error={hasError}
          showIcon={false}
          className="text-xs"
        />
      )
    }

    // Regular text input
    return (
      <SettingField
        id={fieldId}
        name={key}
        label=""
        type="text"
        value={editForm[key] || ''}
        onChange={(v) => onFieldChange(key, v as string)}
        error={hasError}
      />
    )
  }

  // Display mode
  if (isSecret) {
    return (
      <span className="font-mono text-xs" data-testid={`display-${fieldId}`}>
        {value ? maskValue(String(value)) : 'Not set'}
      </span>
    )
  }

  if (typeof value === 'boolean') {
    return (
      <span
        className={`text-xs font-medium ${value ? 'text-success-600' : 'text-neutral-500'}`}
        data-testid={`display-${fieldId}`}
      >
        {value ? 'Enabled' : 'Disabled'}
      </span>
    )
  }

  return (
    <span className="font-mono text-xs" data-testid={`display-${fieldId}`}>
      {String(value).substring(0, 30)}
    </span>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * Configuration form for a service.
 *
 * Handles both view mode (displaying current values) and edit mode (input fields).
 * Supports conditional field visibility and inline validation errors.
 *
 * @example
 * <ServiceConfigForm
 *   service={service}
 *   config={serviceConfigs[service.service_id]}
 *   isEditing={editingService === service.service_id}
 *   editForm={editForm}
 *   validationErrors={validationErrors}
 *   isSaving={saving}
 *   canConfigure={status.canConfigure}
 *   onFieldChange={setEditFormField}
 *   onStartEdit={() => startEditing(service.service_id)}
 *   onSave={() => saveConfig(service.service_id)}
 *   onCancel={cancelEditing}
 * />
 */
export function ServiceConfigForm({
  service,
  config,
  isEditing,
  editForm,
  validationErrors,
  isSaving,
  canConfigure,
  onFieldChange,
  onStartEdit,
  onSave,
  onCancel,
}: ServiceConfigFormProps) {
  // No config schema means nothing to show
  if (!service.config_schema || service.config_schema.length === 0) {
    return null
  }

  // Filter fields based on edit mode and visibility rules
  const visibleFields = service.config_schema.filter((field: ConfigField) => {
    // In edit mode, show all fields
    if (isEditing) return true
    // In view mode, only show if configured AND should be visible
    if (config[field.key] === undefined) return false
    return shouldShowField(field.key, config)
  })

  if (visibleFields.length === 0 && !isEditing) {
    return null
  }

  return (
    <div
      id={`config-form-${service.service_id}`}
      className="space-y-2 px-4 pb-4 pt-3 border-t border-neutral-200 dark:border-neutral-700"
    >
      {/* Edit Mode Actions - Top */}
      {isEditing && (
        <div className="flex items-center justify-end gap-2 mb-3">
          <button
            id={`config-cancel-${service.service_id}`}
            onClick={onCancel}
            className="btn-ghost text-xs flex items-center gap-1"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
          <button
            id={`config-save-${service.service_id}`}
            onClick={onSave}
            disabled={isSaving}
            className="btn-primary text-xs flex items-center gap-1"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}

      {/* Config Fields */}
      {visibleFields.map((field: ConfigField) => (
        <div
          key={field.key}
          className={isEditing ? '' : 'flex items-baseline gap-2'}
        >
          {isEditing ? (
            <>
              <label
                htmlFor={`field-${service.service_id}-${field.key}`}
                className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 block"
              >
                {field.label}
                {field.required && <span className="text-error-600 ml-1">*</span>}
              </label>
              <div className="text-xs">
                {renderFieldValue(
                  field,
                  config[field.key],
                  isEditing,
                  service.service_id,
                  editForm,
                  validationErrors,
                  onFieldChange
                )}
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                {field.label}:
              </span>
              <div className="text-xs flex-1 truncate">
                {renderFieldValue(
                  field,
                  config[field.key],
                  isEditing,
                  service.service_id,
                  editForm,
                  validationErrors,
                  onFieldChange
                )}
              </div>
            </>
          )}
        </div>
      ))}

      {/* Edit Button - Inside expanded section (view mode only) */}
      {!isEditing && (
        <div className="pt-3 mt-3 border-t border-neutral-200 dark:border-neutral-700">
          <button
            id={`config-edit-${service.service_id}`}
            onClick={(e) => {
              e.stopPropagation()
              onStartEdit()
            }}
            className="btn-ghost text-xs flex items-center gap-1"
          >
            <Edit2 className="h-4 w-4" />
            {canConfigure ? 'Setup' : 'Edit'}
          </button>
        </div>
      )}
    </div>
  )
}

export default ServiceConfigForm
