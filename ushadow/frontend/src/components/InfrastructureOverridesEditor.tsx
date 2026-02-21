/**
 * InfrastructureOverridesEditor - Shows all infrastructure env vars with ability to override.
 *
 * Uses the unified deploy-target endpoint which returns already-composited vars with
 * source attribution (default | infrastructure | override). No frontend compositing needed.
 */

import { useState, useEffect } from 'react'
import { Save, X, AlertCircle, Loader } from 'lucide-react'
import EnvVarEditor from './EnvVarEditor'
import type { EnvVarInfo, EnvVarConfig } from '../services/api'
import { deploymentTargetsApi } from '../services/api'

interface InfrastructureOverridesEditorProps {
  /** Deployment target ID (e.g. "anubis.k8s.purple") — NOT cluster_id */
  targetId: string
  targetName: string
  onSave?: () => void
  onCancel?: () => void
}

export default function InfrastructureOverridesEditor({
  targetId,
  targetName,
  onSave,
  onCancel,
}: InfrastructureOverridesEditorProps) {
  const [allEnvVars, setAllEnvVars] = useState<EnvVarInfo[]>([])
  const [envConfigs, setEnvConfigs] = useState<Record<string, EnvVarConfig>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const response = await deploymentTargetsApi.getInfrastructureEnvVars(targetId)
        const { env_vars } = response.data

        const vars: EnvVarInfo[] = []
        const configs: Record<string, EnvVarConfig> = {}

        env_vars.forEach(ev => {
          vars.push({
            name: ev.name,
            is_required: false,
            source: ev.source,
            resolved_value: ev.value,
            suggestions: [],
            is_secret: ev.is_secret,
          })

          configs[ev.name] = {
            name: ev.name,
            source: ev.source,
            value: ev.value,
            locked: ev.locked,
            provider_name: ev.locked ? targetName : undefined,
          }
        })

        setAllEnvVars(vars)
        setEnvConfigs(configs)
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load infrastructure configuration')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [targetId, targetName])

  const handleEnvConfigChange = (name: string, updates: Partial<EnvVarConfig>) => {
    setEnvConfigs(prev => ({
      ...prev,
      [name]: { ...(prev[name] || { name }), ...updates } as EnvVarConfig,
    }))
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      // Save previously stored overrides (source='override') and newly user-entered values (source='new_setting')
      // Excludes compose defaults and infra-locked values
      const overrides: Record<string, string> = {}
      Object.entries(envConfigs).forEach(([name, config]) => {
        if ((config.source === 'override' || config.source === 'new_setting') && config.value) {
          overrides[name] = config.value
        }
      })

      await deploymentTargetsApi.saveInfrastructureOverrides(targetId, overrides)
      onSave?.()
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to save overrides')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="infra-editor-loading">
        <Loader className="h-8 w-8 animate-spin text-primary-600" />
        <span className="ml-3 text-neutral-600 dark:text-neutral-400">Loading infrastructure configuration...</span>
      </div>
    )
  }

  if (allEnvVars.length === 0) {
    return (
      <div className="text-center py-12" data-testid="infra-editor-empty">
        <AlertCircle className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
        <p className="text-neutral-600 dark:text-neutral-400">No infrastructure services found in docker-compose.infra.yml</p>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="infra-overrides-editor">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800">
          <AlertCircle className="h-5 w-5 text-danger-600 dark:text-danger-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-danger-700 dark:text-danger-300">{error}</p>
        </div>
      )}

      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        Infrastructure endpoints for <strong>{targetName}</strong>.
        Locked values come from infrastructure scans. Click to override.
      </div>

      <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
        {allEnvVars
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(envVar => {
            const config = envConfigs[envVar.name] || {
              name: envVar.name,
              source: 'default',
              value: undefined,
            }
            return (
              <div key={envVar.name} className="w-full">
                <EnvVarEditor
                  envVar={envVar}
                  config={config}
                  onChange={updates => handleEnvConfigChange(envVar.name, updates)}
                  mode="deploy"
                />
              </div>
            )
          })}
      </div>

      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        Locked values come from infrastructure scans. Click the padlock to override for this deploy target.
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-2"
            data-testid="cancel-infra-overrides-btn"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center gap-2"
          data-testid="save-infra-overrides-btn"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Overrides'}
        </button>
      </div>
    </div>
  )
}
