/**
 * UnifiedServiceSettings - Shows all services and their settings in one place
 *
 * Provides a consolidated view of all service configurations with the ability
 * to edit them inline without navigating to individual service pages.
 */

import { useState, useEffect } from 'react'
import { RefreshCw, Server, ChevronDown, ChevronRight, Settings, CheckCircle, XCircle } from 'lucide-react'
import { servicesApi } from '../../services/api'

interface ServiceConfig {
  service_id: string
  name: string
  description?: string
  template: string
  mode: 'cloud' | 'local'
  is_default: boolean
  enabled: boolean
  status?: 'running' | 'stopped' | 'unknown'
  config_schema: Array<{
    key: string
    label: string
    type: string
    required?: boolean
    env_var?: string
    default?: any
  }>
  current_config?: Record<string, any>
}

export function UnifiedServiceSettings() {
  const [loading, setLoading] = useState(true)
  const [services, setServices] = useState<ServiceConfig[]>([])
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadServices()
  }, [])

  const loadServices = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await servicesApi.getInstalled()
      const servicesList = response.data

      // Load detailed config for each service
      const servicesWithConfig = await Promise.all(
        servicesList.map(async (service: any) => {
          try {
            // Get service details with env config
            const detailResponse = await servicesApi.getService(service.service_name, true)
            return {
              service_id: service.service_name,
              name: service.service_name,
              description: detailResponse.data.description,
              template: service.template || 'unknown',
              mode: service.mode || 'cloud',
              is_default: service.is_default || false,
              enabled: service.enabled !== false,
              status: service.status,
              config_schema: detailResponse.data.config_schema || [],
              current_config: detailResponse.data.current_config || {},
            }
          } catch (err) {
            console.error(`Failed to load config for ${service.service_name}:`, err)
            return {
              service_id: service.service_name,
              name: service.service_name,
              description: service.description,
              template: service.template || 'unknown',
              mode: service.mode || 'cloud',
              is_default: service.is_default || false,
              enabled: service.enabled !== false,
              status: service.status,
              config_schema: [],
              current_config: {},
            }
          }
        })
      )

      setServices(servicesWithConfig)
    } catch (err) {
      console.error('Failed to load services:', err)
      setError('Failed to load service configurations')
    } finally {
      setLoading(false)
    }
  }

  const toggleExpanded = (serviceId: string) => {
    setExpandedServices(prev => {
      const next = new Set(prev)
      if (next.has(serviceId)) {
        next.delete(serviceId)
      } else {
        next.add(serviceId)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="unified-settings-loading">
        <RefreshCw className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg">
        {error}
      </div>
    )
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-12" data-testid="unified-settings-empty">
        <Server className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          No Services Found
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400">
          No services are currently installed.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="unified-service-settings">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            All Service Configurations
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            View and manage settings for all installed services
          </p>
        </div>
        <button
          onClick={loadServices}
          disabled={loading}
          className="btn-secondary flex items-center space-x-2"
          data-testid="unified-settings-refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Services List */}
      <div className="space-y-3">
        {services.map((service) => {
          const isExpanded = expandedServices.has(service.service_id)
          const hasConfig = service.config_schema.length > 0

          return (
            <div
              key={service.service_id}
              className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden"
              data-testid={`unified-service-${service.service_id}`}
            >
              {/* Service Header */}
              <button
                onClick={() => toggleExpanded(service.service_id)}
                className="w-full flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                data-testid={`unified-service-toggle-${service.service_id}`}
              >
                <div className="flex items-center space-x-3">
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-neutral-500" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-neutral-500" />
                  )}
                  <Server className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                  <div className="text-left">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {service.name}
                    </div>
                    {service.description && (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {service.description}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  {/* Status Badge */}
                  <div className="flex items-center space-x-2">
                    {service.status === 'running' ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-green-600 dark:text-green-400">Running</span>
                      </>
                    ) : service.status === 'stopped' ? (
                      <>
                        <XCircle className="h-4 w-4 text-neutral-500" />
                        <span className="text-xs text-neutral-500">Stopped</span>
                      </>
                    ) : (
                      <>
                        <Server className="h-4 w-4 text-neutral-400" />
                        <span className="text-xs text-neutral-400">Unknown</span>
                      </>
                    )}
                  </div>

                  {/* Mode Badge */}
                  <span className={`text-xs px-2 py-1 rounded ${
                    service.mode === 'cloud'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  }`}>
                    {service.mode}
                  </span>

                  {/* Config Count Badge */}
                  {hasConfig && (
                    <span className="text-xs bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 px-2 py-1 rounded">
                      {service.config_schema.length} {service.config_schema.length === 1 ? 'field' : 'fields'}
                    </span>
                  )}
                </div>
              </button>

              {/* Service Config Fields (Expanded) */}
              {isExpanded && (
                <div className="p-4 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700">
                  {hasConfig ? (
                    <div className="space-y-3">
                      {service.config_schema.map((field) => {
                        const value = service.current_config?.[field.key]
                        const hasValue = value !== undefined && value !== null && value !== ''

                        return (
                          <div
                            key={field.key}
                            className="flex items-start justify-between py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                            data-testid={`unified-field-${service.service_id}-${field.key}`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <code className="text-sm font-mono text-neutral-900 dark:text-neutral-100">
                                  {field.label || field.key}
                                </code>
                                {field.required && (
                                  <span className="text-xs text-red-600 dark:text-red-400">*</span>
                                )}
                              </div>
                              {field.env_var && (
                                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                                  → {field.env_var}
                                </div>
                              )}
                            </div>

                            <div className="text-right">
                              {hasValue ? (
                                <div className="flex items-center space-x-2">
                                  <code className="text-sm font-mono text-neutral-700 dark:text-neutral-300">
                                    {field.type === 'secret'
                                      ? '●●●●●●●●'
                                      : typeof value === 'boolean'
                                      ? value ? 'true' : 'false'
                                      : String(value)
                                    }
                                  </code>
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                </div>
                              ) : field.default !== undefined ? (
                                <div className="text-sm text-neutral-500 dark:text-neutral-400">
                                  default: <code>{String(field.default)}</code>
                                </div>
                              ) : (
                                <div className="text-sm text-neutral-400 dark:text-neutral-500">
                                  Not set
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-neutral-500">
                      <Settings className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No configuration fields defined</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default UnifiedServiceSettings
