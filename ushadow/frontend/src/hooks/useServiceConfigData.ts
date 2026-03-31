/**
 * useServiceConfigData - Fetch all service configuration data with React Query
 *
 * Split into three queries to unblock page rendering:
 *
 * 1. coreQuery  (fast, blocks render) — templates (installed only), instances, wiring
 *    These are pure YAML reads on the backend; the page is ready as soon as they resolve.
 *
 * 2. statusQuery (slow, non-blocking) — Docker container statuses
 *    Docker API calls can be slow. Status updates the UI once ready without blocking render.
 *
 * 3. deploymentsQuery (non-blocking) — Slim deployment records (no env map)
 *    Fetched without deployed_config to reduce payload size.
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

const CORE_QUERY_KEY = ['service-configs-core'] as const
const STATUS_QUERY_KEY = ['service-statuses'] as const
const DEPLOYMENTS_QUERY_KEY = ['service-deployments'] as const

/**
 * Fetch service configuration data.
 *
 * Core data (templates/instances/wiring) blocks page render.
 * Status and deployments load in the background and update when ready.
 */
export function useServiceConfigData(): UseServiceConfigDataResult {
  const queryClient = useQueryClient()

  // ── Fast core query — page renders when this resolves ───────────────────────
  const coreQuery = useQuery({
    queryKey: CORE_QUERY_KEY,
    queryFn: async () => {
      console.log('🔄 Fetching core service config data...')
      const [templatesRes, instancesRes, wiringRes] = await Promise.all([
        svcConfigsApi.getTemplates({ installed: true }),
        svcConfigsApi.getServiceConfigs(),
        svcConfigsApi.getWiring(),
      ])
      console.log('✅ Core data fetched:', {
        templates: templatesRes.data.length,
        instances: instancesRes.data.length,
        wiring: wiringRes.data.length,
      })
      return {
        templates: templatesRes.data,
        instances: instancesRes.data,
        wiring: wiringRes.data,
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  // ── Status query — non-blocking, updates when Docker responds ────────────────
  const statusQuery = useQuery({
    queryKey: STATUS_QUERY_KEY,
    queryFn: async () => {
      const res = await servicesApi.getAllStatuses().catch(() => ({ data: {} }))
      return res.data || {}
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  // ── Deployments query — slim (no env map), non-blocking ─────────────────────
  const deploymentsQuery = useQuery({
    queryKey: DEPLOYMENTS_QUERY_KEY,
    queryFn: async () => {
      const res = await deploymentsApi.listDeployments({ slim: true }).catch((err) => {
        console.error('Failed to load deployments:', err)
        return { data: [] }
      })
      return res.data || []
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const refresh = async () => {
    console.log('🔄 Manual refresh triggered')
    await Promise.all([
      queryClient.refetchQueries({ queryKey: CORE_QUERY_KEY }),
      queryClient.refetchQueries({ queryKey: STATUS_QUERY_KEY }),
      queryClient.refetchQueries({ queryKey: DEPLOYMENTS_QUERY_KEY }),
    ])
  }

  return {
    templates: coreQuery.data?.templates,
    instances: coreQuery.data?.instances,
    wiring: coreQuery.data?.wiring,
    serviceStatuses: statusQuery.data,
    deployments: deploymentsQuery.data,
    // Only block render on core data — status/deployments are progressive
    isLoading: coreQuery.isLoading,
    error: coreQuery.error,
    refresh,
  }
}
