/**
 * Chronicle API Wrapper
 *
 * Wraps the Chronicle API to support demo mode.
 * When demo mode is enabled, routes calls to demo implementation.
 * Otherwise, uses the real API.
 */

import { isDemoMode } from '../utils/demoModeStorage';
import { isDemoUrl } from '../utils/mockData';
import * as realChronicleApi from './chronicleApi';
import * as demoApi from './demoApiService';
import type {
  Conversation,
  ConversationsResponse,
  MemoriesSearchResponse,
  Memory,
} from './chronicleApi';

/**
 * Fetch user's conversations from Chronicle backend.
 * Routes to demo API if in demo mode.
 */
export async function fetchConversations(
  page: number = 1,
  limit: number = 20
): Promise<ConversationsResponse> {
  const demoMode = await isDemoMode();

  if (demoMode) {
    return demoApi.demoFetchConversations(page, limit);
  }

  return realChronicleApi.fetchConversations(page, limit);
}

/**
 * Fetch a single conversation by ID.
 * Routes to demo API if in demo mode.
 */
export async function fetchConversation(conversationId: string): Promise<Conversation> {
  if (await isDemoMode()) {
    return demoApi.demoFetchConversation(conversationId);
  }
  return realChronicleApi.fetchConversation(conversationId);
}

/**
 * Search memories with optional query.
 * Routes to demo API if in demo mode.
 */
export async function searchMemories(
  query?: string,
  limit: number = 50
): Promise<MemoriesSearchResponse> {
  if (await isDemoMode()) {
    return demoApi.demoSearchChronicleMemories(query, limit);
  }
  return realChronicleApi.searchMemories(query, limit);
}

/**
 * Fetch all memories for the user.
 * Routes to demo API if in demo mode.
 */
export async function fetchMemories(limit: number = 100): Promise<MemoriesSearchResponse> {
  if (await isDemoMode()) {
    return demoApi.demoFetchChronicleMemories(limit);
  }
  return realChronicleApi.fetchMemories(limit);
}

/**
 * Delete a memory by ID.
 * Routes to demo API if in demo mode.
 */
export async function deleteMemory(memoryId: string): Promise<void> {
  if (await isDemoMode()) {
    return demoApi.demoDeleteMemory(memoryId);
  }
  return realChronicleApi.deleteMemory(memoryId);
}

/**
 * Verify authentication against a specific UNode API.
 * Routes to demo API if URL is a demo URL or if in demo mode.
 */
export async function verifyUnodeAuth(
  apiUrl: string,
  token: string
): Promise<{ valid: boolean; error?: string; ushadowOk?: boolean; chronicleOk?: boolean }> {
  // Check if this is a demo URL first (demo:// URLs)
  if (isDemoUrl(apiUrl)) {
    return demoApi.demoVerifyUnodeAuth(apiUrl, token);
  }

  // Otherwise check global demo mode
  if (await isDemoMode()) {
    return demoApi.demoVerifyUnodeAuth(apiUrl, token);
  }

  return realChronicleApi.verifyUnodeAuth(apiUrl, token);
}

/**
 * Get audio URL for playback.
 * Routes to demo API if in demo mode.
 */
export async function getChronicleAudioUrl(
  conversationId: string,
  cropped: boolean = true
): Promise<string> {
  if (await isDemoMode()) {
    return demoApi.demoGetChronicleAudioUrl(conversationId, cropped);
  }
  return realChronicleApi.getChronicleAudioUrl(conversationId, cropped);
}

// Re-export types
export type {
  Conversation,
  ConversationsResponse,
  Memory,
  MemoriesSearchResponse,
  TranscriptVersion,
  SpeakerSegment,
} from './chronicleApi';
