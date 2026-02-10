/**
 * useGraphApi Hook
 *
 * React Query hook for fetching memory graph data for visualization.
 * Uses graphApi for server communication.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { graphApi, type MemorySource } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext'
import type { GraphData } from '../types/graph'

const FALLBACK_USER_ID = 'ushadow'

export function useGraphApi(limit: number = 100, source: MemorySource = 'openmemory') {
  // Check both auth contexts (Keycloak and legacy)
  const legacyAuth = useAuth()
  const keycloakAuth = useKeycloakAuth()

  // Prefer Keycloak auth if authenticated, fall back to legacy auth
  const user = keycloakAuth.isAuthenticated ? keycloakAuth.user : legacyAuth.user
  const userId = user?.email || FALLBACK_USER_ID

  // Diagnostic logging for user email resolution
  if (!user) {
    console.warn('[useGraphApi] No user object available from either auth context, falling back to:', FALLBACK_USER_ID)
    console.warn('[useGraphApi] Auth state:', {
      keycloakAuth: { isAuthenticated: keycloakAuth.isAuthenticated, hasUser: !!keycloakAuth.user },
      legacyAuth: { hasUser: !!legacyAuth.user, hasToken: !!legacyAuth.token }
    })
  } else if (!user.email) {
    console.warn('[useGraphApi] User object exists but email is missing:', { user, userId: FALLBACK_USER_ID })
  } else {
    console.log('[useGraphApi] Using user email as ID:', user.email, 'from', keycloakAuth.isAuthenticated ? 'Keycloak' : 'legacy auth')
  }

  const queryClient = useQueryClient()

  const queryKeys = {
    graphData: ['graphData', source, userId, limit] as const,
    graphStats: ['graphStats', source, userId] as const,
    graphSearch: (query: string) => ['graphSearch', source, userId, query] as const,
  }

  // Fetch graph data
  const graphDataQuery = useQuery({
    queryKey: queryKeys.graphData,
    queryFn: () => graphApi.fetchGraphData(userId, limit, source),
    staleTime: 60000, // 1 minute
  })

  // Fetch graph stats
  const graphStatsQuery = useQuery({
    queryKey: queryKeys.graphStats,
    queryFn: () => graphApi.fetchGraphStats(userId, source),
    staleTime: 60000, // 1 minute
  })

  // Search graph - use a mutation-like pattern since it depends on user input
  const searchGraph = async (query: string): Promise<GraphData | null> => {
    if (!query.trim()) return null
    try {
      const data = await graphApi.searchGraph(query, userId, limit, source)
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
    const data = await graphApi.fetchGraphData(userId, newLimit, source)
    queryClient.setQueryData(['graphData', source, userId, newLimit], data)
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
