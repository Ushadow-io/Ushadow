/**
 * Demo API Service
 *
 * Provides mock implementations of API services for demo mode.
 * When demo mode is enabled, these functions return realistic mock data
 * instead of making real API requests.
 */

import {
  MOCK_MEMORIES,
  MOCK_CONVERSATIONS,
  MOCK_USER_EMAIL,
  MOCK_USER_ID,
  MOCK_USER_PROFILE,
  MOCK_OMI_DEVICES,
  simulateNetworkDelay,
} from '../utils/mockData';
import type { Memory, MemoriesSearchResponse } from './memoriesApi';
import type {
  Conversation,
  ConversationsResponse,
  MemoriesSearchResponse as ChronicleMemoriesSearchResponse,
} from './chronicleApi';

/**
 * Demo implementation of memoriesApi.fetchMemories
 */
export async function demoFetchMemories(
  userId: string,
  query?: string,
  page: number = 1,
  size: number = 100
): Promise<MemoriesSearchResponse> {
  await simulateNetworkDelay();

  console.log('[DemoAPI] Fetching memories (demo mode)');

  // Filter by search query if provided
  let filteredMemories = MOCK_MEMORIES;
  if (query && query.trim()) {
    const lowerQuery = query.toLowerCase();
    filteredMemories = MOCK_MEMORIES.filter(
      (m) =>
        m.title.toLowerCase().includes(lowerQuery) ||
        m.content.toLowerCase().includes(lowerQuery) ||
        m.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }

  // Convert to Memory format
  const memories: Memory[] = filteredMemories.map((m) => ({
    id: m.id,
    memory: `${m.title}. ${m.content}`,
    created_at: m.timestamp,
    categories: m.tags,
    app_name: 'ushadow-mobile-demo',
    state: 'active',
  }));

  return {
    memories,
    total: memories.length,
    query,
  };
}

/**
 * Demo implementation of memoriesApi.searchMemories
 */
export async function demoSearchMemories(
  userId: string,
  query: string,
  limit: number = 50
): Promise<MemoriesSearchResponse> {
  return demoFetchMemories(userId, query, 1, limit);
}

/**
 * Demo implementation of memoriesApi.createMemory
 */
export async function demoCreateMemory(
  userId: string,
  text: string,
  app: string = 'ushadow-mobile'
): Promise<Memory> {
  await simulateNetworkDelay();

  console.log('[DemoAPI] Creating memory (demo mode)');

  return {
    id: `demo_memory_${Date.now()}`,
    memory: text,
    created_at: new Date().toISOString(),
    categories: ['demo'],
    app_name: app,
    state: 'active',
  };
}

/**
 * Demo implementation of memoriesApi.deleteMemories
 */
export async function demoDeleteMemories(userId: string, memoryIds: string[]): Promise<void> {
  await simulateNetworkDelay();
  console.log('[DemoAPI] Deleting memories (demo mode):', memoryIds);
  // In demo mode, this just succeeds without doing anything
}

/**
 * Demo implementation of chronicleApi.fetchConversations
 */
export async function demoFetchConversations(
  page: number = 1,
  limit: number = 20
): Promise<ConversationsResponse> {
  await simulateNetworkDelay();

  console.log('[DemoAPI] Fetching conversations (demo mode)');

  // Convert mock conversations to Chronicle format
  const conversations: Conversation[] = MOCK_CONVERSATIONS.map((conv) => ({
    conversation_id: conv.id,
    user_id: MOCK_USER_ID,
    client_id: 'demo_client',
    created_at: conv.timestamp,
    title: conv.messages[0]?.text.substring(0, 50) || 'Demo Conversation',
    summary: conv.messages[0]?.text,
    segment_count: conv.messages.length,
    deleted: false,
    status: 'active',
    id: conv.id,
  }));

  return {
    conversations,
    total: conversations.length,
    page,
    limit,
  };
}

/**
 * Demo implementation of chronicleApi.fetchConversation
 */
export async function demoFetchConversation(conversationId: string): Promise<Conversation> {
  await simulateNetworkDelay();

  console.log('[DemoAPI] Fetching conversation (demo mode):', conversationId);

  const mockConv = MOCK_CONVERSATIONS.find((c) => c.id === conversationId);
  if (!mockConv) {
    throw new Error('Conversation not found');
  }

  return {
    conversation_id: mockConv.id,
    user_id: MOCK_USER_ID,
    client_id: 'demo_client',
    created_at: mockConv.timestamp,
    title: mockConv.messages[0]?.text.substring(0, 50) || 'Demo Conversation',
    summary: mockConv.messages[0]?.text,
    detailed_summary: mockConv.messages.map((m) => `${m.speaker}: ${m.text}`).join('\n'),
    segment_count: mockConv.messages.length,
    deleted: false,
    status: 'active',
    id: mockConv.id,
  };
}

/**
 * Demo implementation of chronicleApi.searchMemories
 */
export async function demoSearchChronicleMemories(
  query?: string,
  limit: number = 50
): Promise<ChronicleMemoriesSearchResponse> {
  await simulateNetworkDelay();

  console.log('[DemoAPI] Searching Chronicle memories (demo mode)');

  // Reuse the memories from mock data
  let filteredMemories = MOCK_MEMORIES;
  if (query && query.trim()) {
    const lowerQuery = query.toLowerCase();
    filteredMemories = MOCK_MEMORIES.filter(
      (m) =>
        m.title.toLowerCase().includes(lowerQuery) ||
        m.content.toLowerCase().includes(lowerQuery) ||
        m.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }

  const memories = filteredMemories.map((m) => ({
    id: m.id,
    content: `${m.title}. ${m.content}`,
    user_id: MOCK_USER_ID,
    created_at: m.timestamp,
    source: 'ushadow-mobile-demo',
    metadata: { tags: m.tags },
  }));

  return {
    memories,
    total: memories.length,
    query,
  };
}

/**
 * Demo implementation of chronicleApi.fetchMemories
 */
export async function demoFetchChronicleMemories(
  limit: number = 100
): Promise<ChronicleMemoriesSearchResponse> {
  return demoSearchChronicleMemories(undefined, limit);
}

/**
 * Demo implementation of chronicleApi.deleteMemory
 */
export async function demoDeleteMemory(memoryId: string): Promise<void> {
  await simulateNetworkDelay();
  console.log('[DemoAPI] Deleting memory (demo mode):', memoryId);
  // In demo mode, this just succeeds without doing anything
}

/**
 * Demo implementation of chronicleApi.verifyUnodeAuth
 */
export async function demoVerifyUnodeAuth(
  apiUrl: string,
  token: string
): Promise<{ valid: boolean; error?: string; ushadowOk?: boolean; chronicleOk?: boolean }> {
  await simulateNetworkDelay(100, 300);
  console.log('[DemoAPI] Verifying auth (demo mode)');
  return {
    valid: true,
    ushadowOk: true,
    chronicleOk: true,
  };
}

/**
 * Demo implementation of chronicleApi.getChronicleAudioUrl
 */
export async function demoGetChronicleAudioUrl(
  conversationId: string,
  cropped: boolean = true
): Promise<string> {
  console.log('[DemoAPI] Getting audio URL (demo mode):', conversationId);
  // Return a demo audio URL (this won't actually work, but won't crash the app)
  return `demo://audio/${conversationId}?cropped=${cropped}`;
}

/**
 * Get demo user profile
 */
export function getDemoUserProfile() {
  return MOCK_USER_PROFILE;
}

/**
 * Get demo OMI devices
 */
export function getDemoOmiDevices() {
  return MOCK_OMI_DEVICES;
}
