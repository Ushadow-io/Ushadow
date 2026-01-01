/**
 * Chronicle API Service
 *
 * API client for fetching conversations and memories from the Chronicle backend.
 */

import { getAuthToken, getApiUrl } from '../utils/authStorage';

// Types matching Chronicle backend responses
export interface Conversation {
  id: string;
  conversation_id: string;
  client_id: string;
  user_id: string;
  created_at: string;
  ended_at?: string;
  duration_seconds?: number;
  transcript?: TranscriptVersion;
  speaker_segments?: SpeakerSegment[];
  status: 'active' | 'closed' | 'processing';
}

export interface TranscriptVersion {
  version: number;
  text: string;
  created_at: string;
  word_count?: number;
}

export interface SpeakerSegment {
  speaker_id: string;
  speaker_label: string;
  start_time: number;
  end_time: number;
  text: string;
}

export interface Memory {
  id: string;
  content: string;
  user_id: string;
  client_id?: string;
  created_at: string;
  updated_at?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  score?: number; // Relevance score for search results
}

export interface ConversationsResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  limit: number;
}

export interface MemoriesSearchResponse {
  memories: Memory[];
  total: number;
  query?: string;
}

/**
 * Get the base API URL for Chronicle backend.
 * Uses the stored API URL or falls back to default.
 */
async function getBaseUrl(): Promise<string> {
  const storedUrl = await getApiUrl();
  if (storedUrl) {
    return storedUrl;
  }
  // Default to the Tailscale URL
  return 'https://blue.spangled-kettle.ts.net';
}

/**
 * Make an authenticated API request to Chronicle backend.
 */
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const [baseUrl, token] = await Promise.all([getBaseUrl(), getAuthToken()]);

  if (!token) {
    throw new Error('Not authenticated. Please log in first.');
  }

  const url = `${baseUrl}/api/chronicle${endpoint}`;
  console.log(`[ChronicleAPI] ${options.method || 'GET'} ${endpoint}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[ChronicleAPI] Error ${response.status}:`, errorText);
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch user's conversations from Chronicle backend.
 */
export async function fetchConversations(
  page: number = 1,
  limit: number = 20
): Promise<ConversationsResponse> {
  try {
    const response = await apiRequest<Conversation[] | ConversationsResponse>(
      `/conversations?page=${page}&limit=${limit}`
    );

    // Handle both array and paginated response formats
    if (Array.isArray(response)) {
      return {
        conversations: response,
        total: response.length,
        page,
        limit,
      };
    }

    return response;
  } catch (error) {
    console.error('[ChronicleAPI] Failed to fetch conversations:', error);
    throw error;
  }
}

/**
 * Fetch a single conversation by ID.
 */
export async function fetchConversation(conversationId: string): Promise<Conversation> {
  try {
    return await apiRequest<Conversation>(`/conversations/${conversationId}`);
  } catch (error) {
    console.error('[ChronicleAPI] Failed to fetch conversation:', error);
    throw error;
  }
}

/**
 * Search memories with optional query.
 */
export async function searchMemories(
  query?: string,
  limit: number = 50
): Promise<MemoriesSearchResponse> {
  try {
    const endpoint = query
      ? `/memories/search?query=${encodeURIComponent(query)}&limit=${limit}`
      : `/memories?limit=${limit}`;

    const response = await apiRequest<Memory[] | MemoriesSearchResponse>(endpoint);

    // Handle both array and object response formats
    if (Array.isArray(response)) {
      return {
        memories: response,
        total: response.length,
        query,
      };
    }

    return response;
  } catch (error) {
    console.error('[ChronicleAPI] Failed to search memories:', error);
    throw error;
  }
}

/**
 * Fetch all memories for the user.
 */
export async function fetchMemories(limit: number = 100): Promise<MemoriesSearchResponse> {
  return searchMemories(undefined, limit);
}

/**
 * Delete a memory by ID.
 */
export async function deleteMemory(memoryId: string): Promise<void> {
  try {
    await apiRequest(`/memories/${memoryId}`, { method: 'DELETE' });
  } catch (error) {
    console.error('[ChronicleAPI] Failed to delete memory:', error);
    throw error;
  }
}
