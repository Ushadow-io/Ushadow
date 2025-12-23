import { useState, useEffect } from 'react'
import { Server, Plus, RefreshCw, Settings, Trash2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { servicesApi } from '../services/api'

interface Service {
  service_id: string
  name: string
  description?: string
  service_type: string
  integration_type: string
  status: string
  connection?: {
    base_url?: string
  }
  metadata?: {
    last_sync?: string
    sync_count?: number
    error_count?: number
  }
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testingService, setTestingService] = useState<string | null>(null)

  useEffect(() => {
    loadServices()
  }, [])

  const loadServices = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await servicesApi.list()
      setServices(response.data)
    } catch (err: any) {
      console.error('Error loading services:', err)
      setError(err.response?.data?.detail || 'Failed to load services')
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async (serviceId: string) => {
    try {
      setTestingService(serviceId)
      const response = await servicesApi.testConnection(serviceId)
      if (response.data.success) {
        alert(`✅ ${response.data.message}`)
      } else {
        alert(`❌ ${response.data.message}`)
      }
    } catch (err: any) {
      console.error('Error testing connection:', err)
      alert(`❌ Connection test failed: ${err.response?.data?.detail || err.message}`)
    } finally {
      setTestingService(null)
    }
  }

  const handleDeleteService = async (serviceId: string, serviceName: string) => {
    if (!confirm(`Are you sure you want to delete "${serviceName}"?`)) {
      return
    }

    try {
      await servicesApi.delete(serviceId)
      alert(`✅ Deleted service: ${serviceName}`)
      loadServices()
    } catch (err: any) {
      console.error('Error deleting service:', err)
      alert(`❌ Failed to delete service: ${err.response?.data?.detail || err.message}`)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400" />
      case 'inactive':
        return <XCircle className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-danger-600 dark:text-danger-400" />
      default:
        return <AlertCircle className="h-5 w-5 text-warning-600 dark:text-warning-400" />
    }
  }

  const getIntegrationTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'rest':
        return 'text-primary-600 dark:text-primary-400'
      case 'mcp':
        return 'text-info-600 dark:text-info-400'
      case 'graphql':
        return 'text-warning-600 dark:text-warning-400'
      default:
        return 'text-neutral-600 dark:text-neutral-400'
    }
  }

  const totalServices = services.length
  const activeServices = services.filter(s => s.status?.toLowerCase() === 'active').length
  const memoryServices = services.filter(s => s.service_type?.includes('memory')).length
  const errorServices = services.filter(s => s.status?.toLowerCase() === 'error').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Services</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Manage external service integrations and memory sources
          </p>
        </div>
        <button 
          className="btn-primary flex items-center space-x-2"
          onClick={() => alert('Add Service wizard coming in Phase 2!')}
        >
          <Plus className="h-5 w-5" />
          <span>Add Service</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Services</p>
          <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{totalServices}</p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Active</p>
          <p className="mt-2 text-2xl font-bold text-success-600 dark:text-success-400">{activeServices}</p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Memory Sources</p>
          <p className="mt-2 text-2xl font-bold text-primary-600 dark:text-primary-400">{memoryServices}</p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Errors</p>
          <p className="mt-2 text-2xl font-bold text-danger-600 dark:text-danger-400">{errorServices}</p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="card p-4 border-l-4 border-danger-600 bg-danger-50 dark:bg-danger-900/20">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-danger-600 dark:text-danger-400" />
            <p className="text-danger-900 dark:text-danger-200">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <RefreshCw className="h-12 w-12 text-neutral-400 dark:text-neutral-600 mx-auto mb-4 animate-spin" />
          <p className="text-neutral-600 dark:text-neutral-400">Loading services...</p>
        </div>
      )}

      {/* Services Grid */}
      {!loading && !error && (
        <div>
          {services.length === 0 ? (
            <div className="card p-12 text-center">
              <Server className="h-16 w-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                No services configured
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400 mb-6">
                Get started by adding your first external service integration
              </p>
              <button 
                className="btn-primary"
                onClick={() => alert('Add Service wizard coming in Phase 2!')}
              >
                <Plus className="h-5 w-5 mr-2 inline" />
                Add Your First Service
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((service) => (
                <div key={service.service_id} className="card-hover p-6">
                  {/* Service Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                        <Server className={`h-6 w-6 ${getIntegrationTypeColor(service.integration_type)}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {service.name}
                        </h3>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">
                          {service.integration_type?.toUpperCase()}
                        </p>
                      </div>
                    </div>
                    {getStatusIcon(service.status)}
                  </div>

                  {/* Service Description */}
                  {service.description && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4 line-clamp-2">
                      {service.description}
                    </p>
                  )}

                  {/* Service Stats */}
                  {service.metadata && (
                    <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                      {service.metadata.sync_count !== undefined && (
                        <div className="bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1">
                          <span className="text-neutral-600 dark:text-neutral-400">Syncs:</span>{' '}
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {service.metadata.sync_count}
                          </span>
                        </div>
                      )}
                      {service.metadata.error_count !== undefined && (
                        <div className="bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1">
                          <span className="text-neutral-600 dark:text-neutral-400">Errors:</span>{' '}
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {service.metadata.error_count}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Service Actions */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleTestConnection(service.service_id)}
                      disabled={testingService === service.service_id}
                      className="flex-1 btn-secondary py-2 text-sm disabled:opacity-50"
                    >
                      {testingService === service.service_id ? (
                        <RefreshCw className="h-4 w-4 mx-auto animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </button>
                    <button
                      onClick={() => alert(`Settings for ${service.name} coming soon!`)}
                      className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteService(service.service_id, service.name)}
                      className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
