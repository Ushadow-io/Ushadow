/**
 * memoriesApi.ts
 *
 * API client for OpenMemory (mem0) service.
 * Routes through ushadow backend proxy for unified auth and CORS handling.
 *
 * Proxy pattern: /api/services/mem0/proxy/api/v1/*
 */

import { getAuthToken, getApiUrl } from '../_utils/authStorage';
import { getActiveUnode } from '../_utils/unodeStorage';

export interface Memory {
  id: string;
  memory: string;
  created_at: string;
  categories: string[];
  app_name: string;
  state: 'active' | 'paused' | 'archived' | 'processing';
}

interface ApiMemoryItem {
  id: string;
  content: string;
  created_at: string;
  state: string;
  app_id: string;
  categories: string[];
  metadata_?: Record<string, unknown>;
  app_name: string;
}

interface MemoriesApiResponse {
  items: ApiMemoryItem[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface MemoriesSearchResponse {
  memories: Memory[];
  total: number;
  query?: string;
}

/**
 * Convert API response item to Memory format
 */
function adaptMemoryItem(item: ApiMemoryItem): Memory {
  return {
    id: item.id,
    memory: item.content,
    created_at: item.created_at,
    state: item.state as Memory['state'],
    categories: item.categories,
    app_name: item.app_name,
  };
}

/**
 * Get the mem0 API base URL using generic proxy pattern.
 */
async function getMemoryApiUrl(): Promise<string> {
  const activeUnode = await getActiveUnode();

  // Use generic proxy pattern (per docs/IMPLEMENTATION-SUMMARY.md)
  if (activeUnode?.apiUrl) {
    const mem0Url = `${activeUnode.apiUrl}/api/services/mem0/proxy`;
    console.log(`[MemoriesAPI] Using generic proxy: ${mem0Url}`);
    return mem0Url;
  }

  // Fall back to global storage (legacy)
  const storedUrl = await getApiUrl();
  if (storedUrl) {
    const mem0Url = `${storedUrl}/api/services/mem0/proxy`;
    console.log(`[MemoriesAPI] Using stored URL + generic proxy: ${mem0Url}`);
    return mem0Url;
  }

  // Default fallback
  console.log('[MemoriesAPI] Using default mem0 generic proxy');
  return 'https://red.spangled-kettle.ts.net/api/services/mem0/proxy';
}

/**
 * Get the auth token from active UNode or global storage.
 */
async function getToken(): Promise<string | null> {
  // First, try to get token from active UNode
  const activeUnode = await getActiveUnode();
  if (activeUnode?.authToken) {
    return activeUnode.authToken;
  }

  // Fall back to global storage (legacy)
  return getAuthToken();
}

/**
 * Make authenticated request to mem0 service through proxy
 */
async function makeMemoryRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const [memoryApiUrl, token] = await Promise.all([getMemoryApiUrl(), getToken()]);

  if (!token) {
    throw new Error('Not authenticated. Please log in first.');
  }

  const url = `${memoryApiUrl}${endpoint}`;
  console.log(`[MemoriesAPI] ${options.method || 'GET'} ${url}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[MemoriesAPI] API request failed: ${response.status}`, errorText);
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch memories with optional search query and pagination.
 */
export async function fetchMemories(
  userId: string,
  query?: string,
  page: number = 1,
  size: number = 100
): Promise<MemoriesSearchResponse> {
  try {
    const response = await makeMemoryRequest<MemoriesApiResponse>(
      '/api/v1/memories/filter',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          page,
          size,
          search_query: query || '',
        }),
      }
    );

    return {
      memories: response.items.map(adaptMemoryItem),
      total: response.total,
      query,
    };
  } catch (error) {
    console.error('[MemoriesAPI] Failed to fetch memories:', error);
    throw error;
  }
}

/**
 * Search memories with query string.
 */
export async function searchMemories(
  userId: string,
  query: string,
  limit: number = 50
): Promise<MemoriesSearchResponse> {
  return fetchMemories(userId, query, 1, limit);
}

/**
 * Create a new memory.
 */
export async function createMemory(
  userId: string,
  text: string,
  app: string = 'ushadow-mobile'
): Promise<Memory> {
  try {
    const response = await makeMemoryRequest<ApiMemoryItem>(
      '/api/v1/memories/',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          text,
          infer: true,
          app,
        }),
      }
    );

    return adaptMemoryItem(response);
  } catch (error) {
    console.error('[MemoriesAPI] Failed to create memory:', error);
    throw error;
  }
}

/**
 * Delete memories by IDs.
 */
export async function deleteMemories(
  userId: string,
  memoryIds: string[]
): Promise<void> {
  try {
    await makeMemoryRequest('/api/v1/memories/', {
      method: 'DELETE',
      body: JSON.stringify({
        memory_ids: memoryIds,
        user_id: userId,
      }),
    });
  } catch (error) {
    console.error('[MemoriesAPI] Failed to delete memories:', error);
    throw error;
  }
}
