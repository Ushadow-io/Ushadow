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
  MOCK_CHAT_STATUS,
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

// ═══════════════════════════════════════════════════════════════════════════
// CHAT API DEMO IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Demo implementation of chatApi.getStatus
 */
export async function demoGetChatStatus() {
  await simulateNetworkDelay(100, 300);
  console.log('[DemoAPI] Getting chat status (demo mode)');
  return {
    ...MOCK_CHAT_STATUS,
  };
}

/**
 * Generate contextual demo response based on user message
 */
function generateDemoResponse(message: string, useMemory: boolean): string {
  const lower = message.toLowerCase();

  if (lower.includes('meeting') || lower.includes('discussed') || lower.includes('team')) {
    return useMemory
      ? "Based on your memories, you discussed Q1 roadmap priorities in today's team meeting. The key points were mobile app improvements and API stability. The team seemed aligned on these priorities."
      : "I can help you recall your meetings. Enable memory context for personalized responses based on your conversation history.";
  }

  if (lower.includes('roadmap') || lower.includes('plan') || lower.includes('priority')) {
    return useMemory
      ? "Your current roadmap priorities are: 1) Mobile app improvements with focus on streaming, 2) API stability and performance, 3) User onboarding enhancements. These align with what was discussed in your recent team meeting."
      : "I can help you with roadmap planning. Turn on memory to get insights from your past conversations and meetings.";
  }

  if (lower.includes('email') || lower.includes('draft') || lower.includes('write')) {
    return "I'd be happy to help you draft that! Based on the context, here's a suggestion:\n\n**Subject:** Follow-up on Today's Discussion\n\nHi team,\n\nThank you for the productive meeting. Key takeaways:\n• Focus on mobile improvements\n• Prioritize API stability\n\nLet's sync next week on specific tasks.\n\nBest regards";
  }

  if (lower.includes('startup') || lower.includes('idea') || lower.includes('friend')) {
    return useMemory
      ? "Your friend mentioned building AI-powered productivity tools with privacy-first design. They're focusing on local-first data storage, which aligns with current market trends."
      : "I can help you explore startup ideas. Enable memory to get insights from your past conversations.";
  }

  if (lower.includes('design') || lower.includes('wireframe') || lower.includes('ui')) {
    return useMemory
      ? "In your recent product design review, the team loved the simplified onboarding flow. The key feedback was to keep the interface clean and minimize steps for new users."
      : "I can help with design discussions. Memory context would let me reference your previous design meetings.";
  }

  if (lower.includes('help') || lower.includes('can you')) {
    return "I'm your AI assistant in demo mode! I can help you with:\n• Summarizing meetings and conversations\n• Drafting emails and documents\n• Planning and roadmapping\n• Recalling past discussions\n\nTry asking about your recent team meeting or roadmap priorities.";
  }

  // Default response
  return useMemory
    ? "That's an interesting question! I have access to your conversation history through memory context. In demo mode, responses are simulated, but in production I would use your configured LLM (like GPT-4) and pull relevant information from your past conversations to provide personalized answers."
    : "I understand. In demo mode, all responses are simulated. When you're connected to a real backend with an LLM configured, I'll be able to provide much more helpful and contextual responses. Try enabling memory to see how I can reference past conversations!";
}

/**
 * Demo implementation of chatApi.streamChat
 * Simulates streaming character-by-character
 */
export async function* demoStreamChat(
  request: any
): AsyncGenerator<any, void, unknown> {
  await simulateNetworkDelay(200, 400);
  console.log('[DemoAPI] Streaming chat (demo mode)');

  // Get the last user message
  const lastUserMessage = request.messages.findLast((m: any) => m.role === 'user')?.content || '';

  // Generate contextual response
  const response = generateDemoResponse(lastUserMessage, request.use_memory !== false);

  // Stream character by character
  for (const char of response) {
    await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 30));
    yield { type: 'text', content: char };
  }

  // Send finish marker
  yield {
    type: 'finish',
    finishReason: 'stop',
    usage: {
      promptTokens: 150,
      completionTokens: response.length / 4, // Rough token estimate
    },
  };
}

/**
 * Demo implementation of chatApi.sendSimpleMessage
 */
export async function demoSendSimpleMessage(request: any) {
  await simulateNetworkDelay();
  console.log('[DemoAPI] Sending simple message (demo mode)');

  const lastUserMessage = request.messages.findLast((m: any) => m.role === 'user')?.content || '';
  const response = generateDemoResponse(lastUserMessage, request.use_memory !== false);

  return {
    id: `msg_${Date.now()}`,
    role: 'assistant',
    content: response,
    timestamp: new Date().toISOString(),
    metadata: {
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      memoryEnriched: request.use_memory !== false,
    },
  };
}
