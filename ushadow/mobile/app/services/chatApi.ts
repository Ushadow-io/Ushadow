/**
 * Chat API Service
 *
 * API client for sending chat messages and receiving AI responses.
 * Supports both streaming and non-streaming modes.
 */

import { getAuthToken, getApiUrl } from '../utils/authStorage';
import { getActiveUnode } from '../utils/unodeStorage';

// Types for chat API
export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface ChatRequest {
  messages: ChatMessage[];
  system?: string;
  use_memory?: boolean;
  user_id?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatResponse {
  role: 'assistant';
  content: string;
}

export interface ChatStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  memory_available: boolean;
  error: string | null;
}

export interface StreamChunk {
  type: 'text' | 'done' | 'error';
  content?: string;
  error?: string;
}

/**
 * Get the Chat API base URL.
 * Uses the UNode API URL with /api/chat endpoint.
 */
async function getChatApiUrl(): Promise<string> {
  const activeUnode = await getActiveUnode();

  if (activeUnode?.apiUrl) {
    console.log(`[ChatAPI] Using UNode apiUrl: ${activeUnode.apiUrl}`);
    return activeUnode.apiUrl;
  }

  // Fall back to global storage (legacy)
  const storedUrl = await getApiUrl();
  if (storedUrl) {
    console.log(`[ChatAPI] Using stored URL: ${storedUrl}`);
    return storedUrl;
  }

  // Default fallback
  console.log('[ChatAPI] Using default API URL');
  return 'https://blue.spangled-kettle.ts.net';
}

/**
 * Get the auth token from active UNode or global storage.
 */
async function getToken(): Promise<string | null> {
  const activeUnode = await getActiveUnode();
  if (activeUnode?.authToken) {
    return activeUnode.authToken;
  }
  return getAuthToken();
}

/**
 * Make an authenticated API request to chat backend.
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const [apiUrl, token] = await Promise.all([getChatApiUrl(), getToken()]);

  if (!token) {
    throw new Error('Not authenticated. Please log in first.');
  }

  const url = `${apiUrl}${endpoint}`;
  console.log(`[ChatAPI] ${options.method || 'GET'} ${url}`);

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
    console.error(`[ChatAPI] Error ${response.status}:`, errorText);

    if (response.status === 401) {
      const { clearAuthToken } = await import('../utils/authStorage');
      await clearAuthToken();
      throw new Error('Authentication expired. Please scan QR code to reconnect.');
    }

    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get chat configuration status.
 */
export async function getChatStatus(): Promise<ChatStatus> {
  try {
    return await apiRequest<ChatStatus>('/api/chat/status');
  } catch (error) {
    console.error('[ChatAPI] Failed to get status:', error);
    throw error;
  }
}

/**
 * Send a non-streaming chat message.
 */
export async function sendMessage(request: ChatRequest): Promise<ChatResponse> {
  try {
    return await apiRequest<ChatResponse>('/api/chat/simple', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  } catch (error) {
    console.error('[ChatAPI] Failed to send message:', error);
    throw error;
  }
}

/**
 * Send a streaming chat message.
 * Uses Server-Sent Events for real-time response streaming.
 *
 * @param request The chat request
 * @param onChunk Callback for each streamed chunk
 * @param onDone Callback when streaming is complete
 * @param onError Callback for errors
 */
export async function sendStreamingMessage(
  request: ChatRequest,
  onChunk: (chunk: StreamChunk) => void,
  onDone?: (fullContent: string) => void,
  onError?: (error: string) => void
): Promise<void> {
  const [apiUrl, token] = await Promise.all([getChatApiUrl(), getToken()]);

  if (!token) {
    const error = 'Not authenticated. Please log in first.';
    onError?.(error);
    throw new Error(error);
  }

  const url = `${apiUrl}/api/chat`;
  console.log(`[ChatAPI] POST (streaming) ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ChatAPI] Streaming error ${response.status}:`, errorText);

      if (response.status === 401) {
        const { clearAuthToken } = await import('../utils/authStorage');
        await clearAuthToken();
        const error = 'Authentication expired. Please scan QR code to reconnect.';
        onError?.(error);
        throw new Error(error);
      }

      const error = `API request failed: ${response.status}`;
      onError?.(error);
      throw new Error(error);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const error = 'No response body for streaming';
      onError?.(error);
      throw new Error(error);
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining buffer
        if (buffer.trim()) {
          const lines = buffer.split('\n');
          for (const line of lines) {
            const chunk = parseSSELine(line);
            if (chunk) {
              if (chunk.type === 'text' && chunk.content) {
                fullContent += chunk.content;
                onChunk(chunk);
              } else if (chunk.type === 'error') {
                onError?.(chunk.error || 'Unknown error');
              }
            }
          }
        }
        onChunk({ type: 'done' });
        onDone?.(fullContent);
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const chunk = parseSSELine(line);
        if (chunk) {
          if (chunk.type === 'text' && chunk.content) {
            fullContent += chunk.content;
            onChunk(chunk);
          } else if (chunk.type === 'error') {
            onError?.(chunk.error || 'Unknown error');
          } else if (chunk.type === 'done') {
            onChunk(chunk);
            onDone?.(fullContent);
            return;
          }
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Streaming failed';
    console.error('[ChatAPI] Streaming error:', message);
    onError?.(message);
    throw error;
  }
}

/**
 * Parse a Server-Sent Events line.
 */
function parseSSELine(line: string): StreamChunk | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith(':')) {
    return null; // Empty line or comment
  }

  if (trimmed.startsWith('data: ')) {
    const data = trimmed.slice(6);

    if (data === '[DONE]') {
      return { type: 'done' };
    }

    try {
      const parsed = JSON.parse(data);

      // Handle AI SDK format (0:"text")
      if (typeof parsed === 'string') {
        return { type: 'text', content: parsed };
      }

      // Handle object format with choices/delta
      if (parsed.choices?.[0]?.delta?.content) {
        return { type: 'text', content: parsed.choices[0].delta.content };
      }

      // Handle simple content format
      if (parsed.content) {
        return { type: 'text', content: parsed.content };
      }

      // Handle text field
      if (parsed.text) {
        return { type: 'text', content: parsed.text };
      }

      // Handle error
      if (parsed.error) {
        return { type: 'error', error: parsed.error };
      }

      return null;
    } catch {
      // If not JSON, treat as plain text
      return { type: 'text', content: data };
    }
  }

  // Handle AI SDK streaming format (0:"text", 2:[...], etc.)
  const aiSdkMatch = trimmed.match(/^(\d+):(.*)$/);
  if (aiSdkMatch) {
    const [, typeNum, content] = aiSdkMatch;

    // Type 0 is text content
    if (typeNum === '0') {
      try {
        const text = JSON.parse(content);
        return { type: 'text', content: text };
      } catch {
        return { type: 'text', content };
      }
    }

    // Type d is done
    if (typeNum === 'd') {
      return { type: 'done' };
    }

    // Type e is error
    if (typeNum === 'e') {
      try {
        const error = JSON.parse(content);
        return { type: 'error', error: error.message || content };
      } catch {
        return { type: 'error', error: content };
      }
    }
  }

  return null;
}

/**
 * Create a unique message ID.
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a user message object.
 */
export function createUserMessage(content: string): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'user',
    content,
    timestamp: Date.now(),
  };
}

/**
 * Create an assistant message object.
 */
export function createAssistantMessage(content: string): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
  };
}
