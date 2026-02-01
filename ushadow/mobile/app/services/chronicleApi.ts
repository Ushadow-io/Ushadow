/**
 * Chronicle API Service
 *
 * API client for fetching conversations and memories from the Chronicle backend.
 */

import { getAuthToken, getApiUrl } from '../_utils/authStorage';
import { getActiveUnode } from '../_utils/unodeStorage';

// Types matching Chronicle backend responses
export interface Conversation {
  conversation_id: string;
  audio_uuid?: string;
  user_id: string;
  client_id: string;
  audio_path?: string;
  cropped_audio_path?: string;
  created_at: string;
  deleted?: boolean;
  title?: string;
  summary?: string;
  detailed_summary?: string;
  active_transcript_version?: string;
  segment_count?: number;
  has_memory?: boolean;
  memory_count?: number;
  transcript_version_count?: number;
  // Legacy fields for compatibility
  id?: string;
  status?: 'active' | 'closed' | 'processing';
  transcript?: TranscriptVersion;
  speaker_segments?: SpeakerSegment[];
  duration_seconds?: number;
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
 * Get the Chronicle API base URL.
 * Uses chronicleApiUrl if set, otherwise constructs from apiUrl + /chronicle/api
 */
async function getChronicleApiUrl(): Promise<string> {
  const activeUnode = await getActiveUnode();

  // First, check if UNode has explicit Chronicle API URL
  if (activeUnode?.chronicleApiUrl) {
    console.log(`[ChronicleAPI] Using UNode chronicleApiUrl: ${activeUnode.chronicleApiUrl}`);
    return activeUnode.chronicleApiUrl;
  }

  // Use generic proxy pattern (per docs/IMPLEMENTATION-SUMMARY.md)
  if (activeUnode?.apiUrl) {
    const chronicleUrl = `${activeUnode.apiUrl}/api/services/chronicle-backend/proxy`;
    console.log(`[ChronicleAPI] Using generic proxy: ${chronicleUrl}`);
    return chronicleUrl;
  }

  // Fall back to global storage (legacy)
  const storedUrl = await getApiUrl();
  if (storedUrl) {
    const chronicleUrl = `${storedUrl}/api/services/chronicle-backend/proxy`;
    console.log(`[ChronicleAPI] Using stored URL + generic proxy: ${chronicleUrl}`);
    return chronicleUrl;
  }

  // Default fallback
  console.log('[ChronicleAPI] Using default Chronicle generic proxy');
  return 'https://blue.spangled-kettle.ts.net/api/services/chronicle-backend/proxy';
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
 * Make an authenticated API request to Chronicle backend.
 */
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const [chronicleApiUrl, token] = await Promise.all([getChronicleApiUrl(), getToken()]);

  if (!token) {
    throw new Error('Not authenticated. Please log in first.');
  }

  // chronicleApiUrl already includes /chronicle/api, just append the endpoint
  const url = `${chronicleApiUrl}${endpoint}`;
  console.log(`[ChronicleAPI] ${options.method || 'GET'} ${url}`);

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

    // Handle 401 Unauthorized - token is invalid or expired
    if (response.status === 401) {
      console.log('[ChronicleAPI] Token invalid or expired - clearing auth and prompting re-login');

      // Clear the invalid token from storage
      const { clearAuthToken } = await import('../_utils/authStorage');
      await clearAuthToken();

      throw new Error('Authentication expired. Please scan QR code to reconnect.');
    }

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
      `/api/conversations?page=${page}&limit=${limit}`
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
    return await apiRequest<Conversation>(`/api/conversations/${conversationId}`);
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

/**
 * Verify authentication against a specific UNode API.
 * Makes a lightweight request to check if the token is still valid.
 *
 * @param apiUrl The UNode's API URL
 * @param token The auth token to verify
 * @returns Object with auth status and optional error message
 */
export async function verifyUnodeAuth(
  apiUrl: string,
  token: string
): Promise<{ valid: boolean; error?: string; ushadowOk?: boolean; chronicleOk?: boolean }> {
  try {
    // Check ushadow auth at /api/auth/me
    const ushadowUrl = `${apiUrl}/api/auth/me`;
    console.log(`[ChronicleAPI] Verifying ushadow auth at: ${ushadowUrl}`);

    const ushadowResponse = await fetch(ushadowUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const ushadowOk = ushadowResponse.ok;
    console.log(`[ChronicleAPI] Ushadow auth: ${ushadowResponse.status}`);

    // Check chronicle auth using generic proxy pattern
    const chronicleUrl = `${apiUrl}/api/services/chronicle-backend/proxy/users/me`;
    console.log(`[ChronicleAPI] Verifying chronicle auth at: ${chronicleUrl}`);

    const chronicleResponse = await fetch(chronicleUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const chronicleOk = chronicleResponse.ok;
    console.log(`[ChronicleAPI] Chronicle auth: ${chronicleResponse.status}`);

    // Both must be OK for full auth
    if (ushadowOk && chronicleOk) {
      console.log('[ChronicleAPI] Auth verified successfully (both services)');
      return { valid: true, ushadowOk: true, chronicleOk: true };
    }

    // Build error message based on what failed
    const errors: string[] = [];
    if (!ushadowOk) {
      errors.push(`ushadow: ${ushadowResponse.status}`);
    }
    if (!chronicleOk) {
      errors.push(`chronicle: ${chronicleResponse.status}`);
    }

    console.log(`[ChronicleAPI] Auth failed: ${errors.join(', ')}`);
    return {
      valid: false,
      error: errors.join(', '),
      ushadowOk,
      chronicleOk
    };
  } catch (error) {
    console.error('[ChronicleAPI] Auth verification failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Network') || message.includes('fetch')) {
      return { valid: false, error: 'Network error - server unreachable' };
    }
    return { valid: false, error: message };
  }
}

/**
 * Get audio URL for playback.
 *
 * IMPORTANT: Audio playback uses the proxy with token in query string.
 * The Chronicle audio endpoint accepts a 'token' query parameter
 * specifically for media playback where headers can't be sent.
 *
 * @param conversationId The conversation ID
 * @param cropped Whether to use the cropped (speech-only) audio
 * @returns Promise<string> The full URL to the audio file
 */
export async function getChronicleAudioUrl(
  conversationId: string,
  cropped: boolean = true
): Promise<string> {
  const [chronicleApiUrl, token] = await Promise.all([getChronicleApiUrl(), getToken()]);

  if (!token) {
    throw new Error('Not authenticated. Please log in first.');
  }

  // Use proxy URL with token in query string
  // The proxy will forward the entire request including the token parameter
  const url = `${chronicleApiUrl}/api/audio/get_audio/${conversationId}?cropped=${cropped}&token=${encodeURIComponent(token)}`;
  console.log('[ChronicleAPI] Generated audio URL:', url.substring(0, 100) + '...');
  return url;
}
