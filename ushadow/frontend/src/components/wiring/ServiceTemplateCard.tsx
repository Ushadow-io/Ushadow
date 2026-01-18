import { useState, useEffect } from 'react'
import { Plus, Package, Edit2, Save, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { servicesApi } from '../../services/api'

interface ConfigVar {
  key: string
  label: string
  value: string
  isSecret: boolean
  required?: boolean
}

interface EnvVarInfo {
  name: string
  is_required: boolean
  resolved_value?: string
  default_value?: string
  value?: string
  setting_path?: string
  source?: string
}

interface ServiceTemplateCardProps {
  template: {
    id: string
    name: string
    description?: string
    requires?: string[]
  }
  configVars?: ConfigVar[]
  onCreateInstance: () => void
  onUpdateConfigVars?: (vars: ConfigVar[]) => void
  alwaysShowConfig?: boolean // Force show expand button even if configVars is empty
}

/**
 * Service template card - shows service info with + button to create instances
 * Templates don't have slots - instances do
 */
export function ServiceTemplateCard({
  template,
  configVars = [],
  onCreateInstance,
  onUpdateConfigVars,
  alwaysShowConfig = false
}: ServiceTemplateCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [isLoadingEnv, setIsLoadingEnv] = useState(false)
  const [loadedEnvVars, setLoadedEnvVars] = useState<EnvVarInfo[]>([])

  const missingRequiredVars = configVars.filter((v) => v.required && !v.value)
  const configuredVars = configVars.filter((v) => v.value)

  // Load env config when expanded (for compose services)
  useEffect(() => {
    if (isExpanded && !isLoadingEnv && loadedEnvVars.length === 0) {
      loadEnvConfig()
    }
  }, [isExpanded])

  const loadEnvConfig = async () => {
    setIsLoadingEnv(true)
    try {
      const response = await servicesApi.getEnvConfig(template.id)
      const allVars = [...response.data.required_env_vars, ...response.data.optional_env_vars]
      setLoadedEnvVars(allVars)
    } catch (error) {
      console.error('Failed to load env config:', error)
      // If API fails, fall back to configVars
    } finally {
      setIsLoadingEnv(false)
    }
  }

  const handleEdit = () => {
    // Initialize form with current values from loaded env vars
    const formData: Record<string, string> = {}
    if (loadedEnvVars.length > 0) {
      loadedEnvVars.forEach((v) => {
        formData[v.name] = v.value || v.resolved_value || ''
      })
    } else {
      configVars.forEach((v) => {
        formData[v.key] = v.value || ''
      })
    }
    setEditForm(formData)
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (onUpdateConfigVars) {
      // Convert loaded env vars to ConfigVar format for saving
      const varsToSave = loadedEnvVars.length > 0
        ? loadedEnvVars.map((v) => ({
            key: v.name,
            label: v.name,
            value: editForm[v.name] || '',
            isSecret: v.name.includes('KEY') || v.name.includes('SECRET') || v.name.includes('PASSWORD'),
            required: v.is_required
          }))
        : configVars.map((v) => ({
            ...v,
            value: editForm[v.key] || ''
          }))

      await onUpdateConfigVars(varsToSave)
      // Reload env config to get updated values
      await loadEnvConfig()
    }
    setIsEditing(false)
    setEditForm({})
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditForm({})
  }

  const toggleExpanded = () => {
    if (!isEditing) {
      setIsExpanded(!isExpanded)
    }
  }

  // Use loaded env vars if available, otherwise fall back to configVars
  const displayVars = loadedEnvVars.length > 0
    ? loadedEnvVars.map((v) => ({
        key: v.name,
        label: v.name,
        value: v.resolved_value || v.value || '',
        isSecret: v.name.includes('KEY') || v.name.includes('SECRET') || v.name.includes('PASSWORD'),
        required: v.is_required
      }))
    : configVars

  return (
    <div
      className="card border-2 border-neutral-200 dark:border-neutral-700 hover:border-primary-400 dark:hover:border-primary-600 transition-colors"
      data-testid={`service-template-${template.id}`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Service Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-5 w-5 text-primary-600 dark:text-primary-400 flex-shrink-0" />
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {template.name}
              </h3>
            </div>
            {template.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-2">
                {template.description}
              </p>
            )}
            {template.requires && template.requires.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {template.requires.map((cap) => (
                  <span
                    key={cap}
                    className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 capitalize"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Deploy Button */}
          <button
            onClick={onCreateInstance}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors flex-shrink-0"
            title="Create service instance"
            data-testid={`deploy-${template.id}`}
          >
            <Plus className="h-4 w-4" />
            <span>Deploy</span>
          </button>
        </div>
      </div>

      {/* Expand/Collapse Handle - Bottom of card */}
      {(displayVars.length > 0 || alwaysShowConfig) && (
        <div className="flex justify-center">
          <button
            onClick={toggleExpanded}
            className="p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors rounded-b hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={isExpanded ? 'Hide configuration' : 'Show configuration'}
            data-testid={`expand-${template.id}`}
          >
            {isExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        </div>
      )}

      {/* Expanded Configuration Section */}
      {isExpanded && (displayVars.length > 0 || alwaysShowConfig || isLoadingEnv) && (
        <div className="px-4 pb-4 border-t border-neutral-200 dark:border-neutral-700">
          <div className="mt-3 space-y-2">
            {/* Loading State */}
            {isLoadingEnv && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
                <span className="ml-2 text-sm text-neutral-500">Loading configuration...</span>
              </div>
            )}

            {/* View Mode */}
            {!isEditing && !isLoadingEnv && (
              <>
                {displayVars.length > 0 ? (
                  displayVars.map((v) => (
                    <div key={v.key} className="flex items-baseline gap-2 text-sm">
                      <span className="text-neutral-500 dark:text-neutral-400 w-40 flex-shrink-0">
                        {v.required && <span className="text-error-500 mr-0.5">*</span>}
                        {v.label}:
                      </span>
                      <span className={`text-neutral-900 dark:text-neutral-100 ${v.isSecret ? 'font-mono' : ''}`}>
                        {v.isSecret && v.value ? '••••••' : v.value || (
                          <span className="italic text-warning-600 dark:text-warning-400">Not set</span>
                        )}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
                    No environment variables configured.
                  </p>
                )}
                {displayVars.length > 0 && (
                  <div className="pt-3 mt-2 border-t border-neutral-200 dark:border-neutral-700">
                    <button
                      onClick={handleEdit}
                      className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                      data-testid={`edit-config-${template.id}`}
                    >
                      <Edit2 className="h-4 w-4" />
                      Edit Configuration
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Edit Mode */}
            {isEditing && !isLoadingEnv && (
              <>
                {displayVars.map((v) => (
                  <div key={v.key} className="flex items-center gap-2">
                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-40 flex-shrink-0">
                      {v.required && <span className="text-error-500 mr-0.5">*</span>}
                      {v.label}
                    </label>
                    <input
                      type={v.isSecret ? 'password' : 'text'}
                      value={editForm[v.key] || ''}
                      onChange={(e) => setEditForm({ ...editForm, [v.key]: e.target.value })}
                      placeholder={v.isSecret ? '••••••••' : `Enter ${v.label.toLowerCase()}`}
                      className="input flex-1 text-sm"
                      data-testid={`input-${template.id}-${v.key}`}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-3 mt-2 border-t border-neutral-200 dark:border-neutral-700">
                  <button
                    onClick={handleCancel}
                    className="btn-ghost text-xs"
                    data-testid={`cancel-config-${template.id}`}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="btn-primary text-xs"
                    data-testid={`save-config-${template.id}`}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
