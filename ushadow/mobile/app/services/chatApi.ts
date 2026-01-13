/**
 * Chat API
 *
 * Real API implementation for chat functionality.
 * Communicates with the backend /api/chat endpoints.
 * Supports streaming responses using ReadableStream API.
 */

import { getAuthToken, getUserEmail } from '../utils/authStorage';
import { getActiveUnode } from '../utils/unodeStorage';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    model?: string;
    finishReason?: string;
    memoryEnriched?: boolean;
  };
}

export interface ChatRequest {
  messages: ChatMessage[];
  system?: string;
  use_memory?: boolean;
  user_id?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  memory_available: boolean;
  error: string | null;
}

export type StreamChunk =
  | { type: 'text'; content: string }
  | { type: 'finish'; finishReason: string; usage?: {promptTokens?: number; completionTokens?: number} }
  | { type: 'error'; error: string };

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

export class ChatApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ChatApiError';
  }

  static fromResponse(response: Response, body?: string): ChatApiError {
    if (response.status === 401) {
      return new ChatApiError(
        'Authentication expired. Please reconnect.',
        'AUTH_EXPIRED',
        401,
        false
      );
    }

    if (response.status === 503) {
      return new ChatApiError(
        'Chat not configured. Ask your administrator to set up an LLM provider.',
        'NOT_CONFIGURED',
        503,
        false
      );
    }

    if (response.status >= 500) {
      return new ChatApiError(
        'Server error. Please try again.',
        'SERVER_ERROR',
        response.status,
        true
      );
    }

    return new ChatApiError(
      body || `Request failed: ${response.status}`,
      'API_ERROR',
      response.status,
      true
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// URL & AUTH HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get chat API URL (follows UNode pattern)
 * First tries active UNode, then falls back to global API URL
 */
async function getChatApiUrl(): Promise<string> {
  // Try active UNode first
  const activeUnode = await getActiveUnode();
  if (activeUnode?.apiUrl) {
    // Chat endpoint is on the main ushadow API, not Chronicle
    return activeUnode.apiUrl;
  }

  // Fallback to global auth storage
  const { getApiUrl } = await import('../utils/authStorage');
  const apiUrl = await getApiUrl();

  if (!apiUrl) {
    throw new ChatApiError(
      'No API URL configured. Please connect to a leader node.',
      'NO_API_URL',
      undefined,
      false
    );
  }

  return apiUrl;
}

/**
 * Get auth token for API requests
 */
async function getToken(): Promise<string> {
  const token = await getAuthToken();

  if (!token) {
    throw new ChatApiError(
      'Not authenticated. Please sign in.',
      'NO_AUTH_TOKEN',
      undefined,
      false
    );
  }

  return token;
}

// ═══════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get chat service status
 * Checks if LLM is configured and if OpenMemory is available
 */
export async function getStatus(): Promise<ChatStatus> {
  try {
    const [apiUrl, token] = await Promise.all([getChatApiUrl(), getToken()]);
    console.log('[ChatAPI] getStatus - API URL:', apiUrl);

    const url = `${apiUrl}/api/chat/status`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw ChatApiError.fromResponse(response);
    }

    const data = await response.json();
    console.log('[ChatAPI] getStatus - Response:', JSON.stringify(data));
    return data as ChatStatus;
  } catch (error) {
    if (error instanceof ChatApiError) {
      throw error;
    }

    console.error('[ChatApi] getStatus error:', error);
    throw new ChatApiError(
      'Failed to check chat status',
      'NETWORK_ERROR',
      undefined,
      true
    );
  }
}

/**
 * Stream chat completion
 * Uses AsyncGenerator to yield text chunks as they arrive
 *
 * AI SDK format:
 * 0:"text"                        → Text delta
 * d:{"finishReason":"stop"}       → Finish marker
 * e:{"error":"message"}           → Error
 */
export async function* streamChat(
  request: ChatRequest
): AsyncGenerator<StreamChunk, void, unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  try {
    const [apiUrl, token] = await Promise.all([getChatApiUrl(), getToken()]);

    // Add user_id from auth if not provided
    if (!request.user_id) {
      const userEmail = await getUserEmail();
      if (userEmail) {
        request.user_id = userEmail;
      }
    }

    const url = `${apiUrl}/api/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw ChatApiError.fromResponse(response, errorText);
    }

    console.log('[ChatAPI] Response received:', {
      status: response.status,
      hasBody: !!response.body,
      bodyType: typeof response.body,
      hasGetReader: response.body ? typeof response.body.getReader : 'no body',
    });

    // Check if streaming is supported
    if (!response.body || typeof response.body.getReader !== 'function') {
      console.warn('[ChatAPI] Streaming not supported, falling back to simple endpoint');
      // Fall back to non-streaming endpoint
      const simpleResponse = await sendSimpleMessage(request);
      yield { type: 'text', content: simpleResponse.content };
      yield { type: 'finish', finishReason: 'stop' };
      return;
    }

    reader = response.body.getReader();

    console.log('[ChatAPI] Stream started, reading chunks...');
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      console.log('[ChatAPI] Read chunk - done:', done, 'bytes:', value?.length);
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        console.log('[ChatAPI] Processing line:', line.substring(0, 100));

        try {
          // Parse AI SDK format
          if (line.startsWith('0:')) {
            // Text delta: 0:"content"
            const content = JSON.parse(line.substring(2));
            console.log('[ChatAPI] Yielding text:', content.substring(0, 50));
            yield { type: 'text', content };
          } else if (line.startsWith('d:')) {
            // Finish: d:{"finishReason":"stop","usage":{...}}
            const data = JSON.parse(line.substring(2));
            yield {
              type: 'finish',
              finishReason: data.finishReason,
              usage: data.usage,
            };
          } else if (line.startsWith('e:')) {
            // Error: e:{"error":"message"}
            const data = JSON.parse(line.substring(2));
            console.error('[ChatAPI] Backend error:', data.error);
            yield { type: 'error', error: data.error };
          }
        } catch (parseError) {
          console.warn('[ChatApi] Failed to parse chunk:', line, parseError);
          // Continue processing other chunks
        }
      }
    }
  } catch (error) {
    if (error instanceof ChatApiError) {
      yield { type: 'error', error: error.message };
      throw error;
    }

    console.error('[ChatApi] streamChat error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Stream error';
    yield { type: 'error', error: errorMessage };
    throw new ChatApiError(
      'Failed to stream chat response',
      'STREAM_ERROR',
      undefined,
      true
    );
  } finally {
    // Clean up reader
    if (reader) {
      try {
        reader.releaseLock();
      } catch (e) {
        console.warn('[ChatApi] Failed to release reader:', e);
      }
    }
  }
}

/**
 * Send simple (non-streaming) chat message
 * Useful for testing or when streaming is not needed
 */
export async function sendSimpleMessage(
  request: ChatRequest
): Promise<ChatMessage> {
  try {
    const [apiUrl, token] = await Promise.all([getChatApiUrl(), getToken()]);

    // Add user_id from auth if not provided
    if (!request.user_id) {
      const userEmail = await getUserEmail();
      if (userEmail) {
        request.user_id = userEmail;
      }
    }

    const url = `${apiUrl}/api/chat/simple`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw ChatApiError.fromResponse(response, errorText);
    }

    const data = await response.json();
    return {
      id: data.id,
      role: 'assistant',
      content: data.content,
      timestamp: new Date().toISOString(),
      metadata: {
        model: data.model,
      },
    };
  } catch (error) {
    if (error instanceof ChatApiError) {
      throw error;
    }

    console.error('[ChatApi] sendSimpleMessage error:', error);
    throw new ChatApiError(
      'Failed to send message',
      'NETWORK_ERROR',
      undefined,
      true
    );
  }
}
