import { useQuery } from '@tanstack/react-query'
import { chronicleApi, myceliaApi } from '../services/api'
import { chronicleConversationsApi } from '../services/chronicleApi'
import type { Conversation } from '../services/chronicleApi'

export type ConversationSource = 'chronicle' | 'mycelia'

interface ConversationsResponse {
  conversations: Conversation[]
  count: number
}

/**
 * Fetch conversations from Chronicle
 */
export function useChronicleConversations(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['conversations', 'chronicle'],
    queryFn: async () => {
      const response = await chronicleConversationsApi.getAll()
      // Handle different response formats
      const data = response.data

      // If data is already an array, return it
      if (Array.isArray(data)) {
        return data as Conversation[]
      }

      // If data has a conversations field, return that
      if (data && typeof data === 'object' && 'conversations' in data) {
        return (data as any).conversations as Conversation[]
      }

      // Otherwise return empty array
      console.warn('[useChronicleConversations] Unexpected response format:', data)
      return []
    },
    enabled: options?.enabled !== false,
    retry: false,
    staleTime: 30000, // Consider fresh for 30s
  })
}

/**
 * Fetch conversations from Mycelia
 */
export function useMyceliaConversations(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['conversations', 'mycelia'],
    queryFn: async () => {
      try {
        const response = await myceliaApi.getConversations({ limit: 25 })
        const data = response.data

        // If data has conversations field, return that
        if (data && typeof data === 'object' && 'conversations' in data) {
          return ((data as any).conversations || []) as Conversation[]
        }

        // If data is already an array, return it
        if (Array.isArray(data)) {
          return data as Conversation[]
        }

        // Otherwise return empty array
        console.warn('[useMyceliaConversations] Unexpected response format:', data)
        return []
      } catch (error) {
        console.error('[useMyceliaConversations] Error fetching conversations:', error)
        return []
      }
    },
    enabled: options?.enabled !== false,
    retry: false,
    staleTime: 30000,
  })
}

/**
 * Fetch conversations from multiple sources
 * Returns a map of source -> conversations
 */
export function useMultiSourceConversations(enabledSources: ConversationSource[]) {
  const chronicleEnabled = enabledSources.includes('chronicle')
  const myceliaEnabled = enabledSources.includes('mycelia')

  const chronicle = useChronicleConversations({ enabled: chronicleEnabled })
  const mycelia = useMyceliaConversations({ enabled: myceliaEnabled })

  // Ensure data is always an array
  const chronicleData = Array.isArray(chronicle.data) ? chronicle.data : []
  const myceliaData = Array.isArray(mycelia.data) ? mycelia.data : []

  return {
    chronicle: {
      data: chronicleData,
      isLoading: chronicle.isLoading,
      error: chronicle.error,
      refetch: chronicle.refetch,
    },
    mycelia: {
      data: myceliaData,
      isLoading: mycelia.isLoading,
      error: mycelia.error,
      refetch: mycelia.refetch,
    },
    // Aggregate states
    anyLoading: chronicle.isLoading || mycelia.isLoading,
    allLoaded: (!chronicleEnabled || !chronicle.isLoading) && (!myceliaEnabled || !mycelia.isLoading),
  }
}
