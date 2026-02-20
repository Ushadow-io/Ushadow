/**
 * ProviderCard - Individual provider card with expand/collapse and env var editing
 */

import { AlertCircle, CheckCircle, ChevronUp, Cloud, HardDrive, Loader2, Pencil, Save } from 'lucide-react'
import EnvVarEditor from '../EnvVarEditor'
import { EnvVarInfo, EnvVarConfig } from '../../services/api'

interface ProviderCardProps {
  provider: any
  isExpanded: boolean
  onToggleExpand: () => void
  envVars: EnvVarInfo[]
  envConfigs: Record<string, EnvVarConfig>
  onEnvConfigChange: (envVarName: string, updates: Partial<EnvVarConfig>) => void
  onCancel: () => void
  onSave: () => void
  isLoading: boolean
  isSaving: boolean
}

export default function ProviderCard({
  provider,
  isExpanded,
  onToggleExpand,
  envVars,
  envConfigs,
  onEnvConfigChange,
  onCancel,
  onSave,
  isLoading,
  isSaving,
}: ProviderCardProps) {
  const isConfigured = provider.configured !== false

  return (
    <div
      className={`rounded-lg border bg-white dark:bg-neutral-900 transition-all ${
        isExpanded
          ? 'border-primary-400 dark:border-primary-600'
          : isConfigured
          ? 'border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-600'
          : 'border-amber-300 dark:border-amber-700 hover:border-amber-400 dark:hover:border-amber-600'
      }`}
      data-testid={`provider-card-${provider.id}`}
    >
      {/* Card Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={onToggleExpand}
      >
        <div
          className={`p-1.5 rounded-md flex-shrink-0 ${
            provider.mode === 'cloud'
              ? 'bg-blue-100 dark:bg-blue-900/30'
              : 'bg-purple-100 dark:bg-purple-900/30'
          }`}
        >
          {provider.mode === 'cloud' ? (
            <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          ) : (
            <HardDrive className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate">
            {provider.name}
          </div>
          {!isConfigured && !isExpanded && (
            <div className="text-xs text-amber-600 dark:text-amber-400">Needs setup</div>
          )}
          {isConfigured && provider.description && !isExpanded && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {provider.description}
            </div>
          )}
        </div>
        {isConfigured ? (
          <CheckCircle className="h-4 w-4 text-success-500 flex-shrink-0" data-testid={`provider-status-ok-${provider.id}`} />
        ) : (
          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" data-testid={`provider-status-warning-${provider.id}`} />
        )}
        <button
          className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
          data-testid={`provider-edit-${provider.id}`}
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <Pencil className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Expanded Content - EnvVarEditor */}
      {isExpanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-700">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
              <span className="ml-2 text-sm text-neutral-500">Loading...</span>
            </div>
          ) : envVars.length > 0 ? (
            <>
              <div className="max-h-80 overflow-y-auto">
                {envVars.map((envVar) => {
                  const config = envConfigs[envVar.name] || {
                    name: envVar.name,
                    source: 'default',
                  }
                  return (
                    <EnvVarEditor
                      key={envVar.name}
                      envVar={envVar}
                      config={config}
                      onChange={(updates) => onEnvConfigChange(envVar.name, updates)}
                    />
                  )
                })}
              </div>
              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
                <button
                  onClick={onCancel}
                  className="px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded"
                  data-testid={`provider-cancel-${provider.id}`}
                >
                  Cancel
                </button>
                <button
                  onClick={onSave}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                  data-testid={`provider-save-${provider.id}`}
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save
                </button>
              </div>
            </>
          ) : (
            <div className="p-4 text-center text-sm text-neutral-500">
              No configuration options available.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
