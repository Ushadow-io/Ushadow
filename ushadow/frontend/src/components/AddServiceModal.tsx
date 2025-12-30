import { useState, useEffect } from 'react'
import { X, Plus, Loader2, Server, Cloud, HardDrive } from 'lucide-react'
import { servicesApi } from '../services/api'
import { useTheme } from '../contexts/ThemeContext'

interface ServiceTemplate {
  template_id: string
  name: string
  description: string
  category: string
  modes: ('cloud' | 'local')[]
  config_schema: any[]
}

interface AddServiceModalProps {
  isOpen: boolean
  onClose: () => void
  onServiceInstalled: () => void
}

export default function AddServiceModal({
  isOpen,
  onClose,
  onServiceInstalled,
}: AddServiceModalProps) {
  const { isDark } = useTheme()
  const [templates, setTemplates] = useState<ServiceTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<ServiceTemplate | null>(null)
  const [selectedMode, setSelectedMode] = useState<'cloud' | 'local'>('cloud')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadTemplates()
    }
  }, [isOpen])

  const loadTemplates = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await servicesApi.getCatalog()
      setTemplates(response.data || [])
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load service catalog')
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = async () => {
    if (!selectedTemplate) return

    setInstalling(true)
    setError(null)
    try {
      await servicesApi.installService(selectedTemplate.template_id)
      onServiceInstalled()
      onClose()
      setSelectedTemplate(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to install service')
    } finally {
      setInstalling(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      id="add-service-modal-overlay"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        id="add-service-modal"
        className="rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
        style={{
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
          border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-6"
          style={{
            borderBottom: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
          }}
        >
          <div className="flex items-center gap-3">
            <Plus className="w-6 h-6" style={{ color: '#4ade80' }} />
            <h2
              id="add-service-modal-title"
              className="text-xl font-semibold"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              Add Service
            </h2>
          </div>
          <button
            id="add-service-modal-close"
            onClick={onClose}
            className="transition-colors"
            style={{ color: isDark ? 'var(--surface-400)' : '#a1a1aa' }}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#4ade80' }} />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p style={{ color: '#f87171' }}>{error}</p>
              <button
                onClick={loadTemplates}
                className="mt-4 transition-colors"
                style={{ color: '#4ade80' }}
              >
                Retry
              </button>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12">
              <Server
                className="w-12 h-12 mx-auto mb-4"
                style={{ color: isDark ? 'var(--surface-400)' : '#a1a1aa' }}
              />
              <p style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>
                No service templates available
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map((template) => {
                const isSelected = selectedTemplate?.template_id === template.template_id
                return (
                  <button
                    key={template.template_id}
                    id={`service-template-${template.template_id}`}
                    onClick={() => {
                      setSelectedTemplate(template)
                      setSelectedMode(template.modes[0] || 'cloud')
                    }}
                    className="w-full p-4 rounded-lg text-left transition-all"
                    style={{
                      border: `2px solid ${
                        isSelected
                          ? '#4ade80'
                          : isDark
                          ? 'var(--surface-500)'
                          : '#e4e4e7'
                      }`,
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(74, 222, 128, 0.1)'
                          : 'rgba(74, 222, 128, 0.05)'
                        : 'transparent',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <Server className="w-5 h-5 mt-0.5" style={{ color: '#4ade80' }} />
                      <div>
                        <h3
                          className="font-medium"
                          style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                        >
                          {template.name}
                        </h3>
                        <p
                          className="text-sm mt-1"
                          style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                        >
                          {template.description}
                        </p>
                        <div className="flex gap-2 mt-2">
                          {template.modes.map((mode) => (
                            <span
                              key={mode}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full"
                              style={{
                                backgroundColor: isDark ? 'var(--surface-600)' : '#f4f4f5',
                                color: isDark ? 'var(--text-secondary)' : '#52525b',
                              }}
                            >
                              {mode === 'cloud' ? (
                                <Cloud className="w-3 h-3" />
                              ) : (
                                <HardDrive className="w-3 h-3" />
                              )}
                              {mode}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Mode Selection */}
          {selectedTemplate && selectedTemplate.modes.length > 1 && (
            <div
              className="mt-6 pt-6"
              style={{
                borderTop: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
              }}
            >
              <label
                className="block text-sm font-medium mb-3"
                style={{ color: isDark ? 'var(--text-secondary)' : '#52525b' }}
              >
                Deployment Mode
              </label>
              <div className="flex gap-4">
                {selectedTemplate.modes.map((mode) => {
                  const isSelected = selectedMode === mode
                  return (
                    <button
                      key={mode}
                      id={`mode-select-${mode}`}
                      onClick={() => setSelectedMode(mode)}
                      className="flex-1 p-4 rounded-lg transition-all"
                      style={{
                        border: `2px solid ${
                          isSelected
                            ? '#a855f7'
                            : isDark
                            ? 'var(--surface-500)'
                            : '#e4e4e7'
                        }`,
                        backgroundColor: isSelected
                          ? isDark
                            ? 'rgba(168, 85, 247, 0.1)'
                            : 'rgba(168, 85, 247, 0.05)'
                          : 'transparent',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {mode === 'cloud' ? (
                          <Cloud className="w-5 h-5" style={{ color: '#a855f7' }} />
                        ) : (
                          <HardDrive className="w-5 h-5" style={{ color: '#a855f7' }} />
                        )}
                        <span
                          className="font-medium capitalize"
                          style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                        >
                          {mode}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-3 p-6"
          style={{
            borderTop: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
          }}
        >
          <button
            id="add-service-modal-cancel"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{
              backgroundColor: isDark ? 'var(--surface-600)' : '#e4e4e7',
              color: isDark ? 'var(--text-primary)' : '#0f0f13',
            }}
          >
            Cancel
          </button>
          <button
            id="add-service-modal-install"
            onClick={handleInstall}
            disabled={!selectedTemplate || installing}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: '#4ade80',
              color: '#0f0f13',
            }}
          >
            {installing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Install Service
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
