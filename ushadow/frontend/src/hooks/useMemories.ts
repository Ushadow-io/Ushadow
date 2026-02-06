/**
 * useMemories Hook
 *
 * React Query hook for fetching and mutating memories data.
 * Uses memoriesApi for server communication and memoriesStore for UI state.
 * User ID comes from AuthContext (logged-in user's email).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { memoriesApi, type MemorySource } from '../services/api'
import { useMemoriesStore } from '../stores/memoriesStore'
import { useAuth } from '../contexts/AuthContext'
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext'
import type { Memory } from '../types/memory'

// Fallback user ID when not authenticated
const FALLBACK_USER_ID = 'ushadow'

export function useMemories(source: MemorySource = 'openmemory') {
  // Get user from auth context - use email as OpenMemory user_id
  const { user: legacyUser, isLoading: legacyLoading } = useAuth()
  const { isAuthenticated: kcAuthenticated, user: kcUser, isLoading: kcLoading } = useKeycloakAuth()

  // Use Keycloak user if authenticated via Keycloak, otherwise use legacy user
  const user = kcAuthenticated && kcUser ? kcUser : legacyUser
  const userId = user?.email || FALLBACK_USER_ID
  const isLoadingUser = legacyLoading || kcLoading

  // Diagnostic logging for user email resolution
  if (!isLoadingUser && !user) {
    console.warn('[useMemories] No user object available from either auth context, falling back to:', FALLBACK_USER_ID)
    console.warn('[useMemories] Auth state:', {
      keycloakAuth: { isAuthenticated: kcAuthenticated, hasUser: !!kcUser },
      legacyAuth: { hasUser: !!legacyUser }
    })
  } else if (!isLoadingUser && !user.email) {
    console.warn('[useMemories] User object exists but email is missing:', { user, userId: FALLBACK_USER_ID })
  } else if (!isLoadingUser) {
    console.log('[useMemories] Using user email as ID:', user.email, 'from', kcAuthenticated ? 'Keycloak' : 'legacy auth')
  }
  const queryClient = useQueryClient()
  const {
    searchQuery,
    filters,
    currentPage,
    pageSize,
    clearSelection,
  } = useMemoriesStore()

  // Query keys for cache management (include source in key)
  const queryKeys = {
    memories: ['memories', source, userId, searchQuery, currentPage, pageSize, filters] as const,
    memory: (id: string) => ['memory', source, userId, id] as const,
    stats: ['memoryStats', source, userId] as const,
    health: ['memoryHealth', source] as const,
  }

  // Fetch paginated memories
  const memoriesQuery = useQuery({
    queryKey: queryKeys.memories,
    queryFn: () => memoriesApi.fetchMemories(userId, searchQuery, currentPage, pageSize, filters, source),
    staleTime: 30000, // 30 seconds
    enabled: !isLoadingUser && userId !== FALLBACK_USER_ID, // Wait for auth to finish loading and have actual user
  })

  // Health check
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => memoriesApi.healthCheck(source),
    staleTime: 60000, // 1 minute
    retry: false,
  })

  // Create memory mutation
  const createMutation = useMutation({
    mutationFn: ({ text, infer = true }: { text: string; infer?: boolean }) =>
      memoriesApi.createMemory(userId, text, infer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] })
    },
  })

  // Update memory content mutation
  const updateMutation = useMutation({
    mutationFn: ({ memoryId, content }: { memoryId: string; content: string }) =>
      memoriesApi.updateMemory(userId, memoryId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] })
    },
  })

  // Update memory state mutation
  const updateStateMutation = useMutation({
    mutationFn: ({ memoryIds, state }: { memoryIds: string[]; state: Memory['state'] }) =>
      memoriesApi.updateMemoryState(userId, memoryIds, state),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] })
    },
  })

  // Delete memories mutation
  const deleteMutation = useMutation({
    mutationFn: (memoryIds: string[]) => memoriesApi.deleteMemories(userId, memoryIds),
    onSuccess: () => {
      clearSelection()
      queryClient.invalidateQueries({ queryKey: ['memories'] })
    },
  })

  return {
    // Query state
    memories: memoriesQuery.data?.memories ?? [],
    totalItems: memoriesQuery.data?.total ?? 0,
    totalPages: memoriesQuery.data?.pages ?? 1,
    isLoading: memoriesQuery.isLoading,
    isFetching: memoriesQuery.isFetching,
    error: memoriesQuery.error,

    // Health
    isServerAvailable: healthQuery.data ?? false,
    isCheckingHealth: healthQuery.isLoading,

    // Mutations
    createMemory: createMutation.mutateAsync,
    updateMemory: updateMutation.mutateAsync,
    updateMemoryState: updateStateMutation.mutateAsync,
    deleteMemories: deleteMutation.mutateAsync,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Refetch
    refetch: memoriesQuery.refetch,
  }
}

/**
 * Hook for fetching a single memory
 */
export function useMemory(memoryId: string) {
  const { user: legacyUser } = useAuth()
  const { isAuthenticated: kcAuthenticated, user: kcUser } = useKeycloakAuth()

  // Use Keycloak user if authenticated via Keycloak, otherwise use legacy user
  const user = kcAuthenticated && kcUser ? kcUser : legacyUser
  const userId = user?.email || FALLBACK_USER_ID

  return useQuery({
    queryKey: ['memory', userId, memoryId],
    queryFn: () => memoriesApi.getMemory(userId, memoryId),
    enabled: !!memoryId,
  })
}

/**
 * Hook for fetching related memories
 */
export function useRelatedMemories(memoryId: string) {
  const { user: legacyUser } = useAuth()
  const { isAuthenticated: kcAuthenticated, user: kcUser } = useKeycloakAuth()

  // Use Keycloak user if authenticated via Keycloak, otherwise use legacy user
  const user = kcAuthenticated && kcUser ? kcUser : legacyUser
  const userId = user?.email || FALLBACK_USER_ID

  return useQuery({
    queryKey: ['relatedMemories', userId, memoryId],
    queryFn: () => memoriesApi.getRelatedMemories(userId, memoryId),
    enabled: !!memoryId,
  })
}
