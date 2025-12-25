import { useState } from 'react'
import { RefreshCw, Sparkles, FlaskConical, ToggleLeft, ToggleRight, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../services/api'
import { useFeatureFlags } from '../contexts/FeatureFlagsContext'

export default function FeatureFlags() {
  const { flags, loading, error: contextError, refresh } = useFeatureFlags()
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [usageExpanded, setUsageExpanded] = useState(false)

  const toggleFlag = async (flagName: string) => {
    setUpdating(flagName)
    try {
      const response = await api.post(`/api/feature-flags/toggle/${flagName}`)

      if (response.data.success) {
        // Refresh flags to show updated state
        await refresh()
      } else {
        setError(response.data.error || 'Failed to toggle flag')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle flag')
    } finally {
      setUpdating(null)
    }
  }

  const getFlagTypeIcon = (type: string) => {
    switch (type) {
      case 'release':
        return <Sparkles className="h-4 w-4" />
      case 'experiment':
        return <FlaskConical className="h-4 w-4" />
      case 'ops':
        return <FlaskConical className="h-4 w-4" />
      default:
        return <ToggleLeft className="h-4 w-4" />
    }
  }

  const getFlagTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'release':
        return 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
      case 'experiment':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
      case 'ops':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
      default:
        return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary-500" />
          <p className="text-neutral-600 dark:text-neutral-400">Loading feature flags...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center shadow-md">
              <FlaskConical className="h-6 w-6 text-white" />
            </div>
            Feature Flags
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Experimental features and configuration toggles
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={refresh}
            className="btn-secondary flex items-center gap-2"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Message */}
      {(error || contextError) && (
        <div className="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-4">
          <p className="text-sm text-error-700 dark:text-error-300">{error || contextError}</p>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FlaskConical className="h-5 w-5 text-primary-600 dark:text-primary-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-primary-900 dark:text-primary-100 mb-1">
              Live Feature Flag System
            </h3>
            <p className="text-sm text-primary-700 dark:text-primary-300">
              Toggle features on/off with a single click! Changes are saved to <code className="bg-primary-100 dark:bg-primary-900/40 px-1.5 py-0.5 rounded text-xs">config/feature_flags.yaml</code> and take effect immediately across the application.
            </p>
          </div>
        </div>
      </div>

      {/* Feature Flags List */}
      <div className="space-y-3">
        {Object.entries(flags).length === 0 ? (
          <div className="text-center py-12">
            <FlaskConical className="h-12 w-12 mx-auto mb-4 text-neutral-300 dark:text-neutral-600" />
            <p className="text-neutral-600 dark:text-neutral-400">No feature flags configured</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-2">
              Add flags to <code className="bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-xs">config/feature_flags.yaml</code> to get started
            </p>
          </div>
        ) : (
          Object.entries(flags).map(([name, flag]) => (
            <div
              key={name}
              className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Flag Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-1.5 rounded-lg ${flag.enabled ? 'bg-success-100 dark:bg-success-900/30' : 'bg-neutral-100 dark:bg-neutral-700'}`}>
                      {getFlagTypeIcon(flag.type)}
                    </div>
                    <div>
                      <h3 className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getFlagTypeBadgeColor(flag.type)}`}>
                          {flag.type}
                        </span>
                        {flag.enabled && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300">
                            ✓ Active
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 ml-11">
                    {flag.description}
                  </p>
                </div>

                {/* Toggle Button */}
                <button
                  onClick={() => toggleFlag(name)}
                  disabled={updating === name}
                  className={`
                    relative inline-flex h-9 w-16 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-800
                    ${flag.enabled
                      ? 'bg-success-500 dark:bg-success-600'
                      : 'bg-neutral-300 dark:bg-neutral-600'
                    }
                    ${updating === name ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}
                  `}
                  title={`Click to toggle ${name}`}
                >
                  <span
                    className={`
                      inline-block h-7 w-7 transform rounded-full bg-white shadow-lg transition-transform
                      ${flag.enabled ? 'translate-x-8' : 'translate-x-1'}
                    `}
                  >
                    {updating === name ? (
                      <RefreshCw className="h-7 w-7 p-1.5 animate-spin text-neutral-400" />
                    ) : flag.enabled ? (
                      <ToggleRight className="h-7 w-7 p-1.5 text-success-500" />
                    ) : (
                      <ToggleLeft className="h-7 w-7 p-1.5 text-neutral-400" />
                    )}
                  </span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Instructions */}
      <div className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3 flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          How It Works
        </h3>
        <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
          <li className="flex items-start gap-2">
            <span className="text-primary-500">✓</span>
            <span><strong>Click toggles</strong> - Changes are saved immediately to <code className="bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded text-xs">config/feature_flags.yaml</code></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary-500">✓</span>
            <span><strong>No restart needed</strong> - Features enable/disable instantly across the application</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary-500">✓</span>
            <span><strong>Version controlled</strong> - YAML file is tracked in git for deployment</span>
          </li>
        </ul>
      </div>

      {/* YAML File Editor */}
      <div className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
        {/* File Header */}
        <div className="bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 px-4 py-2 flex items-center justify-between">
          <code className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
            config/feature_flags.yaml
          </code>
          <span className="text-xs text-neutral-500 dark:text-neutral-500">
            Edit this file to add new flags
          </span>
        </div>

        {/* File Content */}
        <pre className="bg-neutral-900 dark:bg-black text-neutral-100 p-4 text-xs overflow-x-auto">
{`# Feature Flags Configuration
# Flags are loaded on startup and when changed via the API

flags:
  example_feature:
    enabled: false
    description: "Example feature flag for testing"
    type: experiment

  # Add your new flags here:
  # my_new_feature:
  #   enabled: false
  #   description: "What this feature does"
  #   type: release  # or experiment, ops`}
        </pre>

        {/* Usage Guide (Collapsible) */}
        <div className="border-t border-neutral-200 dark:border-neutral-700">
          <button
            onClick={() => setUsageExpanded(!usageExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
          >
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              How to use flags in code
            </span>
            {usageExpanded ? (
              <ChevronDown className="h-4 w-4 text-neutral-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-neutral-500" />
            )}
          </button>

          {usageExpanded && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Backend (Python):</p>
                <pre className="bg-neutral-900 dark:bg-black text-neutral-100 p-3 rounded text-xs overflow-x-auto">
{`from src.services.feature_flags import get_feature_flag_service

if get_feature_flag_service().is_enabled("my_new_feature"):
    return new_implementation()`}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Frontend (React):</p>
                <pre className="bg-neutral-900 dark:bg-black text-neutral-100 p-3 rounded text-xs overflow-x-auto">
{`import { useFeatureFlags } from '../contexts/FeatureFlagsContext'

const { isEnabled } = useFeatureFlags()
if (isEnabled('my_new_feature')) return <NewUI />`}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
