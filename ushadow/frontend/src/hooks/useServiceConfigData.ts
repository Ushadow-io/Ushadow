/**
 * useServiceConfigData - Fetch all service configuration data with React Query
 *
 * Pattern 2: Data Fetching Hook
 * Handles loading templates, instances, wiring, statuses, and deployments
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { svcConfigsApi, servicesApi, deploymentsApi } from '../services/api'
import type { Template, ServiceConfigSummary, Wiring } from '../services/api'

export interface ServiceConfigData {
  templates: Template[]
  instances: ServiceConfigSummary[]
  wiring: Wiring[]
  serviceStatuses: Record<string, any>
  deployments: any[]
}

export interface UseServiceConfigDataResult {
  templates?: Template[]
  instances?: ServiceConfigSummary[]
  wiring?: Wiring[]
  serviceStatuses?: Record<string, any>
  deployments?: any[]
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<void>
}

/**
 * Fetch all service configuration data in a single query.
 * Uses React Query for caching and automatic refetching.
 */
export function useServiceConfigData(): UseServiceConfigDataResult {
  const query = useQuery<ServiceConfigData, Error>({
    queryKey: ['service-configs'],
    queryFn: async () => {
      console.log('🔄 Fetching service config data...')
      const [templatesRes, instancesRes, wiringRes, statusesRes, deploymentsRes] = await Promise.all([
        svcConfigsApi.getTemplates(),
        svcConfigsApi.getServiceConfigs(),
        svcConfigsApi.getWiring(),
        servicesApi.getAllStatuses().catch(() => ({ data: {} })),
        deploymentsApi.listDeployments().catch((err) => {
          console.error('Failed to load deployments:', err)
          return { data: [] }
        }),
      ])

      const result = {
        templates: templatesRes.data,
        instances: instancesRes.data,
        wiring: wiringRes.data,
        serviceStatuses: statusesRes.data || {},
        deployments: deploymentsRes.data || [],
      }

      console.log('✅ Service config data fetched:', {
        templates: result.templates.length,
        instances: result.instances.length,
        wiring: result.wiring.length,
        deployments: result.deployments.length,
      })

      return result
    },
    staleTime: 0, // Never cache - always fetch fresh data
    gcTime: 0, // Don't keep inactive data in cache
    refetchOnWindowFocus: false, // Only refetch on manual refresh
    retry: 1,
  })

  const refresh = async () => {
    console.log('🔄 Manual refresh triggered')
    await query.refetch()
  }

  return {
    templates: query.data?.templates,
    instances: query.data?.instances,
    wiring: query.data?.wiring,
    serviceStatuses: query.data?.serviceStatuses,
    deployments: query.data?.deployments,
    isLoading: query.isLoading,
    error: query.error,
    refresh,
  }
}
