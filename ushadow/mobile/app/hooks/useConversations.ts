/**
 * Conversation Hooks
 *
 * React hooks for fetching conversations from Chronicle and Mycelia backends.
 * Supports single-source and multi-source conversation fetching.
 */

import { useState, useEffect, useCallback } from 'react';
import * as chronicleApi from '../services/chronicleApi';
import * as myceliaApi from '../services/myceliaApi';
import type { Conversation, ConversationsResponse } from '../services/chronicleApi';

export type ConversationSource = 'chronicle' | 'mycelia';

interface UseConversationsOptions {
  enabled?: boolean;
  page?: number;
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
}

interface ConversationState {
  data: Conversation[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch conversations from Chronicle backend.
 */
export function useChronicleConversations(
  options: UseConversationsOptions = {}
): ConversationState {
  const {
    enabled = true,
    page = 1,
    limit = 50,
    autoRefresh = false,
    refreshInterval = 30000,
  } = options;

  const [data, setData] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await chronicleApi.fetchConversations(page, limit);

      // Handle both array and object response formats
      const conversations = response.conversations || [];
      setData(conversations);

      console.log(`[useChronicleConversations] Fetched ${conversations.length} conversations`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch Chronicle conversations';
      setError(message);
      console.error('[useChronicleConversations] Error:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, page, limit]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh if enabled
  useEffect(() => {
    if (!autoRefresh || !enabled) {
      return;
    }

    const intervalId = setInterval(fetchData, refreshInterval);
    return () => clearInterval(intervalId);
  }, [autoRefresh, enabled, refreshInterval, fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Hook to fetch conversations from Mycelia backend.
 */
export function useMyceliaConversations(
  options: UseConversationsOptions = {}
): ConversationState {
  const {
    enabled = true,
    page = 1,
    limit = 25, // Mycelia default
    autoRefresh = false,
    refreshInterval = 30000,
  } = options;

  const [data, setData] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await myceliaApi.fetchConversations(page, limit);

      // Handle both array and object response formats
      const conversations = response.conversations || [];
      setData(conversations);

      console.log(`[useMyceliaConversations] Fetched ${conversations.length} conversations`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch Mycelia conversations';
      setError(message);
      console.error('[useMyceliaConversations] Error:', err);

      // Don't treat service unavailable as critical error
      if (message.includes('not available') || message.includes('503')) {
        console.log('[useMyceliaConversations] Mycelia service unavailable - returning empty data');
      }

      setData([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, page, limit]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh if enabled
  useEffect(() => {
    if (!autoRefresh || !enabled) {
      return;
    }

    const intervalId = setInterval(fetchData, refreshInterval);
    return () => clearInterval(intervalId);
  }, [autoRefresh, enabled, refreshInterval, fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Hook to fetch conversations from multiple sources.
 * Merges and deduplicates conversations from Chronicle and Mycelia.
 */
export function useMultiSourceConversations(
  enabledSources: ConversationSource[],
  options: UseConversationsOptions = {}
) {
  const chronicleEnabled = enabledSources.includes('chronicle');
  const myceliaEnabled = enabledSources.includes('mycelia');

  const chronicle = useChronicleConversations({
    ...options,
    enabled: chronicleEnabled,
  });

  const mycelia = useMyceliaConversations({
    ...options,
    enabled: myceliaEnabled,
    limit: options.limit || 25, // Mycelia default
  });

  // Merge and deduplicate conversations
  const mergedData = useCallback(() => {
    const conversationMap = new Map<string, Conversation & { source: ConversationSource }>();

    // Add Chronicle conversations
    chronicle.data.forEach((conv) => {
      conversationMap.set(conv.conversation_id, {
        ...conv,
        source: 'chronicle' as ConversationSource,
      });
    });

    // Add Mycelia conversations (may have duplicates)
    mycelia.data.forEach((conv) => {
      if (!conversationMap.has(conv.conversation_id)) {
        conversationMap.set(conv.conversation_id, {
          ...conv,
          source: 'mycelia' as ConversationSource,
        });
      }
    });

    // Sort by created_at descending (most recent first)
    return Array.from(conversationMap.values()).sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });
  }, [chronicle.data, mycelia.data]);

  const refetchAll = useCallback(async () => {
    await Promise.all([
      chronicleEnabled ? chronicle.refetch() : Promise.resolve(),
      myceliaEnabled ? mycelia.refetch() : Promise.resolve(),
    ]);
  }, [chronicleEnabled, myceliaEnabled, chronicle.refetch, mycelia.refetch]);

  return {
    // Individual sources
    chronicle: {
      data: chronicle.data,
      loading: chronicle.loading,
      error: chronicle.error,
      refetch: chronicle.refetch,
    },
    mycelia: {
      data: mycelia.data,
      loading: mycelia.loading,
      error: mycelia.error,
      refetch: mycelia.refetch,
    },
    // Merged data
    data: mergedData(),
    // Aggregate states
    loading: chronicle.loading || mycelia.loading,
    anyLoading: chronicle.loading || mycelia.loading,
    allLoaded: (!chronicleEnabled || !chronicle.loading) && (!myceliaEnabled || !mycelia.loading),
    error: chronicle.error || mycelia.error,
    // Refetch all sources
    refetch: refetchAll,
  };
}
