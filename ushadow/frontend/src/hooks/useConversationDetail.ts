import { useQuery } from '@tanstack/react-query'
import { chronicleConversationsApi } from '../services/chronicleApi'
import { myceliaApi } from '../services/api'
import type { Conversation } from '../services/chronicleApi'
import type { ConversationSource } from './useConversations'

/**
 * Fetch a single conversation from Chronicle
 */
export function useChronicleConversation(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['conversation', 'chronicle', id],
    queryFn: async () => {
      console.log('[useChronicleConversation] Fetching conversation:', id)
      const response = await chronicleConversationsApi.getById(id)
      console.log('[useChronicleConversation] Response:', response)

      // Handle different response formats
      const data = response.data
      if (data && typeof data === 'object' && 'conversation' in data) {
        return (data as any).conversation as Conversation
      }
      return data as Conversation
    },
    enabled: options?.enabled !== false && !!id,
    retry: false,
    staleTime: 60000, // Consider fresh for 60s
  })
}

/**
 * Fetch a single conversation from Mycelia
 */
export function useMyceliaConversation(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['conversation', 'mycelia', id],
    queryFn: async () => {
      console.log('[useMyceliaConversation] Fetching conversation:', id)
      const response = await myceliaApi.getConversation(id)
      console.log('[useMyceliaConversation] Response:', response)
      return response.data as Conversation
    },
    enabled: options?.enabled !== false && !!id,
    retry: false,
    staleTime: 60000,
  })
}

/**
 * Fetch a conversation from the specified source
 */
export function useConversationDetail(id: string, source: ConversationSource) {
  const chronicle = useChronicleConversation(id, { enabled: source === 'chronicle' })
  const mycelia = useMyceliaConversation(id, { enabled: source === 'mycelia' })

  const activeQuery = source === 'chronicle' ? chronicle : mycelia

  return {
    conversation: activeQuery.data,
    isLoading: activeQuery.isLoading,
    error: activeQuery.error,
    refetch: activeQuery.refetch,
    source,
  }
}
