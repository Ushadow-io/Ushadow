/**
 * useConversationDetail
 *
 * Fetches a single conversation by id from either Chronicle or Mycelia.
 * Mirrors the web hook of the same name; uses plain useState (no react-query
 * on mobile yet) to match the style of useConversations.ts.
 */

import { useState, useEffect, useCallback } from 'react';
import * as chronicleApi from '../services/chronicleApi';
import * as myceliaApi from '../services/myceliaApi';
import type { Conversation } from '../services/chronicleApi';
import type { ConversationSource } from './useConversations';

interface UseConversationDetailResult {
  conversation: Conversation | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useConversationDetail(
  id: string | undefined,
  source: ConversationSource
): UseConversationDetailResult {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) {
      console.warn('[useConversationDetail] No id provided');
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      console.log(`[useConversationDetail] Fetching ${source} conversation ${id}`);
      const data =
        source === 'chronicle'
          ? await chronicleApi.fetchConversation(id)
          : await myceliaApi.fetchConversation(id);
      console.log('[useConversationDetail] Received:', {
        hasTitle: !!data?.title,
        hasSummary: !!data?.summary,
        hasSegments: !!(data as any)?.segments?.length || !!(data as any)?.speaker_segments?.length,
        keys: data ? Object.keys(data) : null,
      });
      setConversation(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch conversation';
      setError(message);
      console.error('[useConversationDetail] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [id, source]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { conversation, isLoading, error, refetch: fetchData };
}
