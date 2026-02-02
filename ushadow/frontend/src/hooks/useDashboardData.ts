import { useQuery } from '@tanstack/react-query'
import { dashboardApi, type DashboardData } from '../services/api'

/**
 * Hook to fetch dashboard data (stats + recent conversations & memories).
 * Automatically refetches every 30 seconds to keep data fresh.
 */
export function useDashboardData(conversationLimit = 10, memoryLimit = 10) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard', 'data', conversationLimit, memoryLimit],
    queryFn: async () => {
      const response = await dashboardApi.getDashboardData(conversationLimit, memoryLimit)
      return response.data
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
  })
}
