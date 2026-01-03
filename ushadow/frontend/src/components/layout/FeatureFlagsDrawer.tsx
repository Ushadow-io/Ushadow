import { useState, useEffect, useRef } from 'react'
import { X, RefreshCw, Sparkles, FlaskConical, ToggleLeft, ToggleRight, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../../services/api'
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext'
import { useTheme } from '../../contexts/ThemeContext'

interface FeatureFlagsDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export default function FeatureFlagsDrawer({ isOpen, onClose }: FeatureFlagsDrawerProps) {
  const { flags, loading, error: contextError, refresh } = useFeatureFlags()
  const { isDark } = useTheme()
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [usageExpanded, setUsageExpanded] = useState(false)

  // Animation state - keeps drawer in DOM during exit animation
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)

  // Handle open/close with animation
  useEffect(() => {
    if (isOpen) {
      // Opening: mount first, then animate in
      setIsVisible(true)
      // Small delay to ensure DOM is ready before animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else if (isVisible) {
      // Closing: animate out first, then unmount
      setIsAnimating(false)
    }
  }, [isOpen])

  // Handle animation end for closing
  useEffect(() => {
    const drawer = drawerRef.current
    if (!drawer) return

    const handleTransitionEnd = (e: TransitionEvent) => {
      // Only respond to the drawer's transform transition
      if (e.propertyName === 'transform' && !isOpen) {
        setIsVisible(false)
      }
    }

    drawer.addEventListener('transitionend', handleTransitionEnd)
    return () => drawer.removeEventListener('transitionend', handleTransitionEnd)
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isVisible])

  const toggleFlag = async (flagName: string) => {
    setUpdating(flagName)
    try {
      const response = await api.post(`/api/feature-flags/toggle/${flagName}`)

      if (response.data.success) {
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

  if (!isVisible) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-drawer-backdrop transition-opacity duration-300 ease-out"
        style={{
          backgroundColor: isAnimating ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0)',
        }}
        onClick={onClose}
        data-testid="feature-flags-backdrop"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 h-full w-full max-w-lg z-drawer shadow-2xl overflow-hidden flex flex-col transition-transform duration-300 ease-out"
        style={{
          backgroundColor: isDark ? 'var(--surface-900)' : '#fafafa',
          borderLeft: isDark ? '1px solid var(--surface-500)' : '1px solid #e5e5e5',
          transform: isAnimating ? 'translateX(0)' : 'translateX(100%)',
        }}
        data-testid="feature-flags-drawer"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{
            borderBottom: isDark ? '1px solid var(--surface-500)' : '1px solid #e5e5e5',
            backgroundColor: isDark ? 'var(--surface-800)' : 'white',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center shadow-md">
              <FlaskConical className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color: isDark ? 'var(--text-primary)' : '#171717' }}
              >
                Feature Flags
              </h2>
              <p
                className="text-xs"
                style={{ color: isDark ? 'var(--text-muted)' : '#737373' }}
              >
                Toggle features on/off instantly
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="p-2 rounded-lg transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700"
              disabled={loading}
              title="Refresh flags"
              data-testid="refresh-flags-btn"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: isDark ? 'var(--text-secondary)' : '#525252' }} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700"
              title="Close"
              data-testid="close-drawer-btn"
            >
              <X className="h-5 w-5" style={{ color: isDark ? 'var(--text-secondary)' : '#525252' }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Error Message */}
          {(error || contextError) && (
            <div className="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-3">
              <p className="text-sm text-error-700 dark:text-error-300">{error || contextError}</p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-primary-500" />
            </div>
          )}

          {/* Feature Flags List */}
          {!loading && (
            <div className="space-y-3">
              {Object.entries(flags).length === 0 ? (
                <div className="text-center py-8">
                  <FlaskConical className="h-10 w-10 mx-auto mb-3 text-neutral-300 dark:text-neutral-600" />
                  <p className="text-neutral-600 dark:text-neutral-400 text-sm">No feature flags configured</p>
                </div>
              ) : (
                Object.entries(flags).map(([name, flag]) => (
                  <div
                    key={name}
                    className="rounded-lg p-4 transition-shadow hover:shadow-md"
                    style={{
                      backgroundColor: isDark ? 'var(--surface-800)' : 'white',
                      border: isDark ? '1px solid var(--surface-600)' : '1px solid #e5e5e5',
                    }}
                    data-testid={`flag-${name}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Flag Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`p-1 rounded-md ${flag.enabled ? 'bg-success-100 dark:bg-success-900/30' : 'bg-neutral-100 dark:bg-neutral-700'}`}>
                            {getFlagTypeIcon(flag.type)}
                          </div>
                          <h3
                            className="font-mono text-sm font-medium truncate"
                            style={{ color: isDark ? 'var(--text-primary)' : '#171717' }}
                          >
                            {name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getFlagTypeBadgeColor(flag.type)}`}>
                            {flag.type}
                          </span>
                          {flag.enabled && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300">
                              Active
                            </span>
                          )}
                        </div>
                        <p
                          className="text-xs leading-relaxed"
                          style={{ color: isDark ? 'var(--text-muted)' : '#737373' }}
                        >
                          {flag.description}
                        </p>
                      </div>

                      {/* Toggle Button */}
                      <button
                        onClick={() => toggleFlag(name)}
                        disabled={updating === name}
                        className={`
                          relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-800 flex-shrink-0
                          ${flag.enabled
                            ? 'bg-success-500 dark:bg-success-600'
                            : 'bg-neutral-300 dark:bg-neutral-600'
                          }
                          ${updating === name ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}
                        `}
                        title={`Toggle ${name}`}
                        data-testid={`toggle-${name}`}
                      >
                        <span
                          className={`
                            inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform
                            ${flag.enabled ? 'translate-x-6' : 'translate-x-1'}
                          `}
                        >
                          {updating === name ? (
                            <RefreshCw className="h-5 w-5 p-0.5 animate-spin text-neutral-400" />
                          ) : flag.enabled ? (
                            <ToggleRight className="h-5 w-5 p-0.5 text-success-500" />
                          ) : (
                            <ToggleLeft className="h-5 w-5 p-0.5 text-neutral-400" />
                          )}
                        </span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Usage Guide (Collapsible) */}
          <div
            className="rounded-lg overflow-hidden"
            style={{
              backgroundColor: isDark ? 'var(--surface-800)' : 'white',
              border: isDark ? '1px solid var(--surface-600)' : '1px solid #e5e5e5',
            }}
          >
            <button
              onClick={() => setUsageExpanded(!usageExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
            >
              <span
                className="text-sm font-medium"
                style={{ color: isDark ? 'var(--text-secondary)' : '#525252' }}
              >
                How to use flags in code
              </span>
              {usageExpanded ? (
                <ChevronDown className="h-4 w-4 text-neutral-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-neutral-500" />
              )}
            </button>

            {usageExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-neutral-200 dark:border-neutral-700 pt-3">
                <div>
                  <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Backend (Python):</p>
                  <pre className="bg-neutral-900 dark:bg-black text-neutral-100 p-2 rounded text-[11px] overflow-x-auto">
{`from src.services.feature_flags import get_feature_flag_service

if get_feature_flag_service().is_enabled("my_feature"):
    return new_implementation()`}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Frontend (React):</p>
                  <pre className="bg-neutral-900 dark:bg-black text-neutral-100 p-2 rounded text-[11px] overflow-x-auto">
{`import { useFeatureFlags } from '../contexts/FeatureFlagsContext'

const { isEnabled } = useFeatureFlags()
if (isEnabled('my_feature')) return <NewUI />`}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
