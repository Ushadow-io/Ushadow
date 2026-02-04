/**
 * Mycelia API Service
 *
 * API client for fetching conversations and memories from the Mycelia backend.
 */

import { getAuthToken, getApiUrl, getDefaultServerUrl } from '../_utils/authStorage';
import { getActiveUnode } from '../_utils/unodeStorage';
import type { Conversation, ConversationsResponse } from './chronicleApi';

// Mycelia service name for proxy routing
const MYCELIA_SERVICE = 'mycelia-backend';

/**
 * Get the backend API base URL.
 */
async function getBackendApiUrl(): Promise<string> {
  const activeUnode = await getActiveUnode();

  // First, check if UNode has explicit API URL
  if (activeUnode?.apiUrl) {
    console.log(`[MyceliaAPI] Using UNode apiUrl: ${activeUnode.apiUrl}`);
    return activeUnode.apiUrl;
  }

  // Fall back to global storage (legacy)
  const storedUrl = await getApiUrl();
  if (storedUrl) {
    console.log(`[MyceliaAPI] Using stored URL: ${storedUrl}`);
    return storedUrl;
  }

  // Default fallback - use configured default server URL
  const defaultUrl = await getDefaultServerUrl();
  console.log(`[MyceliaAPI] Using default URL: ${defaultUrl}`);
  return defaultUrl;
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
 * Make an authenticated API request to Mycelia backend via generic proxy.
 */
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const [apiUrl, token] = await Promise.all([getBackendApiUrl(), getToken()]);

  if (!token) {
    throw new Error('Not authenticated. Please log in first.');
  }

  // Use generic proxy pattern: /api/services/mycelia-backend/proxy
  const url = `${apiUrl}/api/services/${MYCELIA_SERVICE}/proxy${endpoint}`;
  console.log(`[MyceliaAPI] ${options.method || 'GET'} ${url}`);

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
    console.error(`[MyceliaAPI] Error ${response.status}:`, errorText);

    // Handle 401 Unauthorized - token is invalid or expired
    if (response.status === 401) {
      console.log('[MyceliaAPI] Token invalid or expired - clearing auth and prompting re-login');

      // Clear the invalid token from storage
      const { clearAuthToken } = await import('../_utils/authStorage');
      await clearAuthToken();

      throw new Error('Authentication expired. Please scan QR code to reconnect.');
    }

    // Handle 503 Service Unavailable - Mycelia backend is not running
    if (response.status === 503) {
      throw new Error('Mycelia service is not available');
    }

    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Normalize Mycelia conversation to match Chronicle format.
 * Mycelia may use different field names (id vs conversation_id).
 */
function normalizeConversation(conv: any): Conversation {
  return {
    conversation_id: conv.conversation_id || conv.id,
    audio_uuid: conv.audio_uuid,
    user_id: conv.user_id || '',
    client_id: conv.client_id || '',
    audio_path: conv.audio_path,
    cropped_audio_path: conv.cropped_audio_path,
    created_at: conv.created_at || conv.timeRanges?.[0]?.start || new Date().toISOString(),
    deleted: conv.deleted,
    title: conv.title,
    summary: conv.summary,
    detailed_summary: conv.detailed_summary,
    active_transcript_version: conv.active_transcript_version,
    segment_count: conv.segment_count,
    has_memory: conv.has_memory,
    memory_count: conv.memory_count,
    transcript_version_count: conv.transcript_version_count,
    status: conv.status,
    duration_seconds: conv.duration_seconds,
  };
}

/**
 * Fetch user's conversations from Mycelia backend.
 */
export async function fetchConversations(
  page: number = 1,
  limit: number = 25
): Promise<ConversationsResponse> {
  try {
    // Calculate skip for pagination (Mycelia uses skip, not page)
    const skip = (page - 1) * limit;

    const response = await apiRequest<Conversation[] | { conversations: Conversation[] }>(
      `/data/conversations?limit=${limit}&skip=${skip}`
    );

    // Handle both array and object response formats
    let conversations: Conversation[];
    if (Array.isArray(response)) {
      conversations = response.map(normalizeConversation);
    } else if (response && typeof response === 'object' && 'conversations' in response) {
      conversations = (response.conversations || []).map(normalizeConversation);
    } else {
      console.warn('[MyceliaAPI] Unexpected response format:', response);
      conversations = [];
    }

    return {
      conversations,
      total: conversations.length,
      page,
      limit,
    };
  } catch (error) {
    console.error('[MyceliaAPI] Failed to fetch conversations:', error);
    throw error;
  }
}

/**
 * Fetch a single conversation by ID from Mycelia.
 */
export async function fetchConversation(conversationId: string): Promise<Conversation> {
  try {
    const response = await apiRequest<any>(`/data/conversations/${conversationId}`);
    return normalizeConversation(response);
  } catch (error) {
    console.error('[MyceliaAPI] Failed to fetch conversation:', error);
    throw error;
  }
}

/**
 * Check if Mycelia service is available.
 */
export async function checkAvailability(): Promise<boolean> {
  try {
    await apiRequest<any>('/health');
    return true;
  } catch (error) {
    console.log('[MyceliaAPI] Mycelia service not available:', error);
    return false;
  }
}
