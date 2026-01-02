/**
 * useGraphApi Hook
 *
 * React Query hook for fetching memory graph data for visualization.
 * Uses graphApi for server communication.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { graphApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import type { GraphData } from '../types/graph'

const FALLBACK_USER_ID = 'ushadow'

export function useGraphApi(limit: number = 100) {
  const { user } = useAuth()
  const userId = user?.email || FALLBACK_USER_ID
  const queryClient = useQueryClient()

  const queryKeys = {
    graphData: ['graphData', userId, limit] as const,
    graphStats: ['graphStats', userId] as const,
    graphSearch: (query: string) => ['graphSearch', userId, query] as const,
  }

  // Fetch graph data
  const graphDataQuery = useQuery({
    queryKey: queryKeys.graphData,
    queryFn: () => graphApi.fetchGraphData(userId, limit),
    staleTime: 60000, // 1 minute
  })

  // Fetch graph stats
  const graphStatsQuery = useQuery({
    queryKey: queryKeys.graphStats,
    queryFn: () => graphApi.fetchGraphStats(userId),
    staleTime: 60000, // 1 minute
  })

  // Search graph - use a mutation-like pattern since it depends on user input
  const searchGraph = async (query: string): Promise<GraphData | null> => {
    if (!query.trim()) return null
    try {
      const data = await graphApi.searchGraph(query, userId, limit)
      // Update the cache with search results
      queryClient.setQueryData(queryKeys.graphData, data)
      return data
    } catch (error) {
      console.error('Failed to search graph:', error)
      throw error
    }
  }

  // Refetch both data and stats
  const refetch = async () => {
    await Promise.all([
      graphDataQuery.refetch(),
      graphStatsQuery.refetch(),
    ])
  }

  // Update limit and refetch
  const updateLimit = async (newLimit: number) => {
    const data = await graphApi.fetchGraphData(userId, newLimit)
    queryClient.setQueryData(['graphData', userId, newLimit], data)
    return data
  }

  return {
    // Data
    graphData: graphDataQuery.data ?? null,
    stats: graphStatsQuery.data ?? null,

    // Loading states
    isLoading: graphDataQuery.isLoading || graphStatsQuery.isLoading,
    isFetching: graphDataQuery.isFetching || graphStatsQuery.isFetching,

    // Error
    error: graphDataQuery.error?.message || graphStatsQuery.error?.message || null,

    // Actions
    searchGraph,
    refetch,
    updateLimit,
  }
}
