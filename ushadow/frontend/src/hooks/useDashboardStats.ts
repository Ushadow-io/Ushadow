import { useQuery } from '@tanstack/react-query'
import { conversationsApi, servicesApi } from '../services/api'

interface ConversationsResponse {
  conversations: any[]
  total: number
  page: number
  limit: number
  source: string
  breakdown?: {
    chronicle: number
    mycelia: number
  }
}

/**
 * Fetch unified conversations count from all sources
 */
export function useConversationsCount() {
  return useQuery({
    queryKey: ['dashboard', 'conversations-count'],
    queryFn: async () => {
      const response = await conversationsApi.getAll({ source: 'all', page: 1, limit: 1 })
      const data = response.data as ConversationsResponse
      return data.total || 0
    },
    staleTime: 60000, // 60 seconds (increased from 30s)
    retry: 1,
  })
}

/**
 * Fetch count of MCP servers from services
 */
export function useMcpServersCount() {
  return useQuery({
    queryKey: ['dashboard', 'mcp-servers-count'],
    queryFn: async () => {
      try {
        const response = await servicesApi.getInstalled()
        const services = response.data
        // Count services with MCP capability
        const mcpServices = Array.isArray(services)
          ? services.filter((s: any) => s.capabilities?.includes('mcp'))
          : []
        return mcpServices.length
      } catch (error) {
        console.error('Error fetching MCP servers:', error)
        return 0
      }
    },
    staleTime: 60000, // 60 seconds (increased from 30s)
    retry: 1,
  })
}

/**
 * Fetch all dashboard stats at once
 */
export function useDashboardStats() {
  const conversationsCount = useConversationsCount()
  const mcpServersCount = useMcpServersCount()

  return {
    conversations: {
      count: conversationsCount.data ?? 0,
      isLoading: conversationsCount.isLoading,
      error: conversationsCount.error,
    },
    mcpServers: {
      count: mcpServersCount.data ?? 0,
      isLoading: mcpServersCount.isLoading,
      error: mcpServersCount.error,
    },
    isLoading: conversationsCount.isLoading || mcpServersCount.isLoading,
    hasError: !!conversationsCount.error || !!mcpServersCount.error,
  }
}
