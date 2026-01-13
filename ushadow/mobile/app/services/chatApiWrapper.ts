/**
 * Chat API Wrapper
 *
 * Wraps the Chat API to support demo mode.
 * When demo mode is enabled, routes calls to demo implementation.
 * Otherwise, uses the real API.
 */

import { isDemoMode } from '../utils/demoModeStorage';
import * as realChatApi from './chatApi';
import * as demoApi from './demoApiService';
import type {
  ChatMessage,
  ChatRequest,
  ChatStatus,
  StreamChunk,
} from './chatApi';

/**
 * Get chat service status
 * Routes to demo API if in demo mode
 */
export async function getStatus(): Promise<ChatStatus> {
  if (await isDemoMode()) {
    return demoApi.demoGetChatStatus();
  }
  return realChatApi.getStatus();
}

/**
 * Stream chat completion
 * Routes to demo API if in demo mode
 */
export async function* streamChat(
  request: ChatRequest
): AsyncGenerator<StreamChunk, void, unknown> {
  const demoMode = await isDemoMode();
  console.log('[ChatAPIWrapper] streamChat - demo mode:', demoMode);

  if (demoMode) {
    yield* demoApi.demoStreamChat(request);
  } else {
    yield* realChatApi.streamChat(request);
  }
}

/**
 * Send simple (non-streaming) chat message
 * Routes to demo API if in demo mode
 */
export async function sendSimpleMessage(
  request: ChatRequest
): Promise<ChatMessage> {
  if (await isDemoMode()) {
    return demoApi.demoSendSimpleMessage(request);
  }
  return realChatApi.sendSimpleMessage(request);
}

// Re-export types
export type {
  ChatMessage,
  ChatRequest,
  ChatStatus,
  StreamChunk,
} from './chatApi';

export { ChatApiError } from './chatApi';
