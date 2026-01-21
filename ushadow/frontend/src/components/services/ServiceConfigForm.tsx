import { useState } from 'react'
import { Edit2, Save, X, Loader2, Plus, Trash2, Key, FileText } from 'lucide-react'
import type { ConfigField, ServiceServiceConfig } from '../../contexts/ServicesContext'
import { shouldShowField, maskValue } from '../../hooks/useServiceStatus'
import { SecretInput, SettingField } from '../settings'

// ============================================================================
// Types
// ============================================================================

interface ServiceConfigFormProps {
  /** The service being configured */
  service: ServiceServiceConfig
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
  /** Callback to remove a custom field */
  onRemoveField: (key: string) => void
  /** Callback to enter edit mode */
  onStartEdit: () => void
  /** Callback to save configuration */
  onSave: () => void
  /** Callback to cancel editing */
  onCancel: () => void
}

interface NewFieldState {
  key: string
  value: string
  isSecret: boolean
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
// Custom Field Row Component
// ============================================================================

interface CustomFieldRowProps {
  fieldKey: string
  value: any
  serviceId: string
  isEditing: boolean
  editForm: Record<string, any>
  onFieldChange: (key: string, value: any) => void
  onRemoveField: (key: string) => void
}

function CustomFieldRow({
  fieldKey,
  value,
  serviceId,
  isEditing,
  editForm,
  onFieldChange,
  onRemoveField,
}: CustomFieldRowProps) {
  const isSecret = fieldKey.toLowerCase().includes('key') ||
                   fieldKey.toLowerCase().includes('secret') ||
                   fieldKey.toLowerCase().includes('password') ||
                   fieldKey.toLowerCase().includes('token')
  const fieldId = `${serviceId}-custom-${fieldKey}`

  if (isEditing) {
    return (
      <div className="flex items-start gap-2" data-testid={`custom-field-${fieldKey}`}>
        <div className="flex-1">
          <label
            htmlFor={fieldId}
            className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 flex items-center gap-1"
          >
            {isSecret ? (
              <Key className="h-3 w-3 text-warning-500" />
            ) : (
              <FileText className="h-3 w-3 text-neutral-400" />
            )}
            {fieldKey}
            <span className="text-neutral-400 text-[10px]">(custom)</span>
          </label>
          {isSecret ? (
            <SecretInput
              id={fieldId}
              name={fieldKey}
              value={editForm[fieldKey] || ''}
              onChange={(v) => onFieldChange(fieldKey, v)}
              placeholder="●●●●●●"
              showIcon={false}
              className="text-xs"
            />
          ) : (
            <SettingField
              id={fieldId}
              name={fieldKey}
              label=""
              type="text"
              value={editForm[fieldKey] || ''}
              onChange={(v) => onFieldChange(fieldKey, v as string)}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemoveField(fieldKey)}
          className="mt-6 p-1.5 text-neutral-400 hover:text-error-600 dark:hover:text-error-400 transition-colors"
          title="Remove field"
          data-testid={`remove-custom-field-${fieldKey}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // View mode
  return (
    <div className="flex items-baseline gap-2" data-testid={`custom-field-${fieldKey}`}>
      <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0 flex items-center gap-1">
        {isSecret ? (
          <Key className="h-3 w-3 text-warning-500" />
        ) : (
          <FileText className="h-3 w-3 text-neutral-400" />
        )}
        {fieldKey}:
      </span>
      <span className="font-mono text-xs" data-testid={`display-${fieldId}`}>
        {isSecret ? (value ? maskValue(String(value)) : 'Not set') : String(value).substring(0, 30)}
      </span>
    </div>
  )
}

// ============================================================================
// Add Field Form Component
// ============================================================================

interface AddFieldFormProps {
  serviceId: string
  onAdd: (key: string, value: string, isSecret: boolean) => void
  onCancel: () => void
  existingKeys: Set<string>
}

function AddFieldForm({ serviceId, onAdd, onCancel, existingKeys }: AddFieldFormProps) {
  const [newField, setNewField] = useState<NewFieldState>({
    key: '',
    value: '',
    isSecret: false,
  })
  const [error, setError] = useState<string>('')

  const handleSubmit = () => {
    const trimmedKey = newField.key.trim()

    if (!trimmedKey) {
      setError('Key name is required')
      return
    }

    if (existingKeys.has(trimmedKey)) {
      setError('This key already exists')
      return
    }

    // Validate key format (alphanumeric with underscores)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedKey)) {
      setError('Key must start with a letter and contain only letters, numbers, and underscores')
      return
    }

    onAdd(trimmedKey, newField.value, newField.isSecret)
  }

  return (
    <div
      className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700"
      data-testid={`add-field-form-${serviceId}`}
    >
      <div className="space-y-3">
        {/* Key input */}
        <div>
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 block">
            Key Name
          </label>
          <input
            type="text"
            value={newField.key}
            onChange={(e) => {
              setNewField(prev => ({ ...prev, key: e.target.value }))
              setError('')
            }}
            placeholder="e.g., api_key, base_url"
            className="w-full px-3 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded-md
                       bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100
                       focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            data-testid="add-field-key-input"
          />
        </div>

        {/* Value input */}
        <div>
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 block">
            Value
          </label>
          {newField.isSecret ? (
            <SecretInput
              id={`new-field-value-${serviceId}`}
              name="new-field-value"
              value={newField.value}
              onChange={(v) => setNewField(prev => ({ ...prev, value: v }))}
              placeholder="Enter secret value"
              showIcon={false}
              className="text-xs"
            />
          ) : (
            <input
              type="text"
              value={newField.value}
              onChange={(e) => setNewField(prev => ({ ...prev, value: e.target.value }))}
              placeholder="Enter value"
              className="w-full px-3 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded-md
                         bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100
                         focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              data-testid="add-field-value-input"
            />
          )}
        </div>

        {/* Is Secret toggle */}
        <label className="flex items-center gap-2 cursor-pointer" data-testid="add-field-secret-toggle">
          <input
            type="checkbox"
            checked={newField.isSecret}
            onChange={(e) => setNewField(prev => ({ ...prev, isSecret: e.target.checked }))}
            className="rounded border-neutral-300 dark:border-neutral-600 text-primary-600
                       focus:ring-primary-500 focus:ring-offset-0"
          />
          <span className="text-xs text-neutral-600 dark:text-neutral-400 flex items-center gap-1">
            <Key className="h-3 w-3" />
            This is a secret (API key, password, etc.)
          </span>
        </label>

        {/* Error message */}
        {error && (
          <p className="text-xs text-error-600 dark:text-error-400">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleSubmit}
            className="btn-primary text-xs flex items-center gap-1"
            data-testid="add-field-submit"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Field
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn-ghost text-xs"
            data-testid="add-field-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Configuration form for a service.
 *
 * Handles both view mode (displaying current values) and edit mode (input fields).
 * Supports conditional field visibility, inline validation errors, and custom fields.
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
 *   onRemoveField={removeEditFormField}
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
  onRemoveField,
  onStartEdit,
  onSave,
  onCancel,
}: ServiceConfigFormProps) {
  const [showAddForm, setShowAddForm] = useState(false)

  // Get schema-defined field keys
  const schemaKeys = new Set(service.config_schema?.map(f => f.key) || [])

  // Get all keys in editForm or config that aren't in schema (custom fields)
  const allKeys = new Set([...Object.keys(config), ...Object.keys(editForm)])
  const customFieldKeys = [...allKeys].filter(k => !schemaKeys.has(k))

  // Filter schema fields based on edit mode and visibility rules
  const visibleSchemaFields = (service.config_schema || []).filter((field: ConfigField) => {
    if (isEditing) return true
    if (config[field.key] === undefined) return false
    return shouldShowField(field.key, config)
  })

  // Filter custom fields for view mode (only show if has value)
  const visibleCustomFields = isEditing
    ? customFieldKeys
    : customFieldKeys.filter(k => config[k] !== undefined && config[k] !== '')

  const hasContent = visibleSchemaFields.length > 0 || visibleCustomFields.length > 0

  if (!hasContent && !isEditing) {
    return null
  }

  const handleAddField = (key: string, value: string, _isSecret: boolean) => {
    onFieldChange(key, value)
    setShowAddForm(false)
  }

  return (
    <div
      id={`config-form-${service.service_id}`}
      data-testid={`config-form-${service.service_id}`}
      className="space-y-2 px-4 pb-4 pt-3 border-t border-neutral-200 dark:border-neutral-700"
    >
      {/* Edit Mode Actions - Top */}
      {isEditing && (
        <div className="flex items-center justify-end gap-2 mb-3">
          <button
            id={`config-cancel-${service.service_id}`}
            data-testid={`config-cancel-${service.service_id}`}
            onClick={onCancel}
            className="btn-ghost text-xs flex items-center gap-1"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
          <button
            id={`config-save-${service.service_id}`}
            data-testid={`config-save-${service.service_id}`}
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

      {/* Schema-defined Config Fields */}
      {visibleSchemaFields.map((field: ConfigField) => (
        <div
          key={field.key}
          className={isEditing ? '' : 'flex items-baseline gap-2'}
          data-testid={`schema-field-${field.key}`}
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

      {/* Custom Fields Section */}
      {visibleCustomFields.length > 0 && (
        <div className="pt-2 mt-2 border-t border-dashed border-neutral-200 dark:border-neutral-700">
          <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2">
            Custom Fields
          </p>
          <div className="space-y-2">
            {visibleCustomFields.map((key) => (
              <CustomFieldRow
                key={key}
                fieldKey={key}
                value={isEditing ? editForm[key] : config[key]}
                serviceId={service.service_id}
                isEditing={isEditing}
                editForm={editForm}
                onFieldChange={onFieldChange}
                onRemoveField={onRemoveField}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add Field Form (edit mode only) */}
      {isEditing && showAddForm && (
        <div className="pt-2 mt-2">
          <AddFieldForm
            serviceId={service.service_id}
            onAdd={handleAddField}
            onCancel={() => setShowAddForm(false)}
            existingKeys={new Set([...schemaKeys, ...customFieldKeys])}
          />
        </div>
      )}

      {/* Add Field Button (edit mode only) */}
      {isEditing && !showAddForm && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="btn-ghost text-xs flex items-center gap-1 text-primary-600 dark:text-primary-400"
            data-testid={`add-custom-field-${service.service_id}`}
          >
            <Plus className="h-4 w-4" />
            Add Custom Field
          </button>
        </div>
      )}

      {/* Edit Button - Inside expanded section (view mode only) */}
      {!isEditing && (
        <div className="pt-3 mt-3 border-t border-neutral-200 dark:border-neutral-700">
          <button
            id={`config-edit-${service.service_id}`}
            data-testid={`config-edit-${service.service_id}`}
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
