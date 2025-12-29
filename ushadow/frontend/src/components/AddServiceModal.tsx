import { useState, useEffect } from 'react'
import { X, Plus, Loader2, Server, Cloud, HardDrive } from 'lucide-react'
import { servicesApi } from '../services/api'

interface CatalogService {
  service_id: string
  name: string
  description?: string
  mode?: string  // Single mode (new format)
  modes?: ('cloud' | 'local')[]  // Legacy array format
  template?: string | null
  is_default?: boolean
  installed?: boolean
  enabled?: boolean
  docker_image?: string
  tags?: string[]
  ui?: {
    category?: string
    icon?: string
  }
}

interface AddServiceModalProps {
  isOpen: boolean
  onClose: () => void
  onServiceInstalled: () => void
}

// Helper to get modes array from service (handles both formats)
function getServiceModes(service: CatalogService): ('cloud' | 'local')[] {
  if (service.modes && service.modes.length > 0) {
    return service.modes
  }
  if (service.mode === 'cloud' || service.mode === 'local') {
    return [service.mode]
  }
  return ['cloud']  // Default fallback
}

export default function AddServiceModal({
  isOpen,
  onClose,
  onServiceInstalled,
}: AddServiceModalProps) {
  const [services, setServices] = useState<CatalogService[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [selectedService, setSelectedService] = useState<CatalogService | null>(null)
  const [selectedMode, setSelectedMode] = useState<'cloud' | 'local'>('cloud')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadCatalog()
    }
  }, [isOpen])

  const loadCatalog = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await servicesApi.getCatalog()
      // Filter to only show services that aren't already installed
      const availableServices = (response.data || []).filter(
        (s: CatalogService) => !s.installed
      )
      setServices(availableServices)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load service catalog')
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = async () => {
    if (!selectedService) return

    setInstalling(true)
    setError(null)
    try {
      await servicesApi.installService(selectedService.service_id)
      onServiceInstalled()
      onClose()
      setSelectedService(null)
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
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Plus className="w-6 h-6 text-primary-600" />
            <h2
              id="add-service-modal-title"
              className="text-xl font-semibold text-gray-900 dark:text-white"
            >
              Add Service
            </h2>
          </div>
          <button
            id="add-service-modal-close"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={loadCatalog}
                className="mt-4 text-primary-600 hover:text-primary-700"
              >
                Retry
              </button>
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-12">
              <Server className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">No additional services available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {services.map((service) => {
                const modes = getServiceModes(service)
                return (
                  <button
                    key={service.service_id}
                    id={`service-catalog-${service.service_id}`}
                    onClick={() => {
                      setSelectedService(service)
                      setSelectedMode(modes[0] || 'cloud')
                    }}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      selectedService?.service_id === service.service_id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Server className="w-5 h-5 text-primary-600 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {service.name}
                        </h3>
                        {service.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {service.description}
                          </p>
                        )}
                        <div className="flex gap-2 mt-2">
                          {modes.map((mode) => (
                            <span
                              key={mode}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                            >
                              {mode === 'cloud' ? <Cloud className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
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

          {/* Mode Selection - only show if multiple modes available */}
          {selectedService && (() => {
            const modes = getServiceModes(selectedService)
            return modes.length > 1 ? (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Deployment Mode
                </label>
                <div className="flex gap-4">
                  {modes.map((mode) => (
                    <button
                      key={mode}
                      id={`mode-select-${mode}`}
                      onClick={() => setSelectedMode(mode)}
                      className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                        selectedMode === mode
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {mode === 'cloud' ? (
                          <Cloud className="w-5 h-5 text-primary-600" />
                        ) : (
                          <HardDrive className="w-5 h-5 text-primary-600" />
                        )}
                        <span className="font-medium text-gray-900 dark:text-white capitalize">
                          {mode}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null
          })()}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            id="add-service-modal-cancel"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            id="add-service-modal-install"
            onClick={handleInstall}
            disabled={!selectedService || installing}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
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
