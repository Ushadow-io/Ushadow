import { useState, useEffect, useRef } from 'react'
import { X, Plus, Cloud, HardDrive, CheckCircle, Loader2, Search } from 'lucide-react'
import { servicesApi } from '../services/api'

interface CatalogService {
  service_id: string
  name: string
  description: string
  type: string  // Was 'template' - now just the type
  mode: 'cloud' | 'local' | null
  is_default: boolean
  installed: boolean
  enabled: boolean
  tags: string[]
  containers?: string[]
  api_base?: string
}

interface AddServiceModalProps {
  isOpen: boolean
  onClose: () => void
  onServiceInstalled: () => void
}

export default function AddServiceModal({
  isOpen,
  onClose,
  onServiceInstalled
}: AddServiceModalProps) {
  const [catalog, setCatalog] = useState<CatalogService[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      loadCatalog()
      document.body.style.overflow = 'hidden'

      // Focus search input
      setTimeout(() => searchInputRef.current?.focus(), 100)

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }

      document.addEventListener('keydown', handleEscape)

      return () => {
        document.body.style.overflow = ''
        document.removeEventListener('keydown', handleEscape)
      }
    }
  }, [isOpen, onClose])

  const loadCatalog = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await servicesApi.getCatalog()
      setCatalog(response.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load service catalog')
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = async (serviceId: string) => {
    setInstalling(serviceId)
    setError(null)
    try {
      await servicesApi.installService(serviceId)
      // Update local state
      setCatalog(prev =>
        prev.map(s => s.service_id === serviceId ? { ...s, installed: true, enabled: true } : s)
      )
      onServiceInstalled()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to install service')
    } finally {
      setInstalling(null)
    }
  }

  if (!isOpen) return null

  // Get unique categories (types)
  const categories = [...new Set(catalog.map(s => s.type))]

  // Filter services
  const filteredServices = catalog.filter(service => {
    const matchesSearch = searchQuery === '' ||
      service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesCategory = selectedCategory === null ||
      service.type === selectedCategory

    return matchesSearch && matchesCategory
  })

  // Group by type
  const servicesByCategory = filteredServices.reduce((acc, service) => {
    const category = service.type
    if (!acc[category]) acc[category] = []
    acc[category].push(service)
    return acc
  }, {} as Record<string, CatalogService[]>)

  const categoryLabels: Record<string, string> = {
    memory: 'Memory Services',
    llm: 'Language Models',
    transcription: 'Transcription',
    conversation_engine: 'Conversation'
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-service-title"
      data-testid="add-service-modal"
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-700">
          <div>
            <h2
              id="add-service-title"
              className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
            >
              Add Service
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Browse and install services from the catalog
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
          </button>
        </div>

        {/* Search & Filter */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-10 w-full"
                data-testid="search-services-input"
              />
            </div>
            <select
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className="input w-40"
              data-testid="category-filter"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{categoryLabels[cat] || cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg text-error-700 dark:text-error-300 text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
              {searchQuery ? 'No services match your search' : 'No services available'}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(servicesByCategory).map(([category, services]) => (
                <div key={category}>
                  <h3 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-3 uppercase tracking-wider">
                    {categoryLabels[category] || category}
                  </h3>
                  <div className="space-y-2">
                    {services.map(service => (
                      <div
                        key={service.service_id}
                        className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                          service.installed
                            ? 'bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700'
                            : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-600'
                        }`}
                        data-testid={`service-item-${service.service_id}`}
                      >
                        <div className="flex items-center gap-4">
                          {/* Mode icon */}
                          <div className={`p-2 rounded-lg ${
                            service.mode === 'cloud'
                              ? 'bg-blue-100 dark:bg-blue-900/30'
                              : 'bg-purple-100 dark:bg-purple-900/30'
                          }`}>
                            {service.mode === 'cloud' ? (
                              <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <HardDrive className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            )}
                          </div>

                          {/* Service info */}
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                                {service.name}
                              </h4>
                              {service.is_default && (
                                <span className="px-1.5 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded">
                                  Default
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">
                              {service.description}
                            </p>
                          </div>
                        </div>

                        {/* Action button */}
                        {service.installed ? (
                          <div className="flex items-center gap-2 text-success-600 dark:text-success-400">
                            <CheckCircle className="h-5 w-5" />
                            <span className="text-sm font-medium">Installed</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleInstall(service.service_id)}
                            disabled={installing === service.service_id}
                            className="btn-primary text-sm flex items-center gap-2"
                            data-testid={`install-${service.service_id}`}
                          >
                            {installing === service.service_id ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Installing...
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4" />
                                Install
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-neutral-200 dark:border-neutral-700">
          <button
            onClick={onClose}
            className="btn-ghost"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
