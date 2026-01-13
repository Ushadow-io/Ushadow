/**
 * Mock Data for Demo Mode
 *
 * Provides realistic sample data for App Store review testing.
 * This data is used when demo mode is enabled.
 */

/**
 * Mock authentication response
 */
export const MOCK_AUTH_TOKEN = 'demo_token_' + Date.now();
export const MOCK_USER_EMAIL = 'demo@ushadow.io';
export const MOCK_USER_ID = 'demo_user_001';

/**
 * Mock memories data
 */
export const MOCK_MEMORIES = [
  {
    id: '1',
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 mins ago
    title: 'Team Meeting Discussion',
    content: 'Discussed Q1 roadmap and feature priorities. Decided to focus on mobile app improvements and API stability.',
    tags: ['work', 'planning'],
    duration: 1800, // 30 minutes
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    title: 'Coffee Shop Conversation',
    content: 'Caught up with an old friend about their new startup. Interesting ideas about AI-powered productivity tools.',
    tags: ['personal', 'networking'],
    duration: 2700, // 45 minutes
  },
  {
    id: '3',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // Yesterday
    title: 'Product Design Review',
    content: 'Reviewed wireframes for the new user onboarding flow. Team loved the simplified approach.',
    tags: ['work', 'design'],
    duration: 3600, // 1 hour
  },
  {
    id: '4',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    title: 'Podcast Recording Session',
    content: 'Recorded episode about the future of personal AI assistants. Great conversation about privacy and ethics.',
    tags: ['content', 'ai'],
    duration: 4500, // 75 minutes
  },
];

/**
 * Mock conversations data
 */
export const MOCK_CONVERSATIONS = [
  {
    id: '1',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
    participants: ['You', 'AI Assistant'],
    messages: [
      {
        id: 'm1',
        speaker: 'You',
        text: 'Can you help me summarize the key points from today\'s meetings?',
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      },
      {
        id: 'm2',
        speaker: 'AI Assistant',
        text: 'Based on your recorded conversations today, here are the key points: 1) Q1 roadmap focuses on mobile improvements, 2) API stability is a priority, 3) New onboarding flow approved.',
        timestamp: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      },
      {
        id: 'm3',
        speaker: 'You',
        text: 'Perfect, thanks!',
        timestamp: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      },
    ],
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), // 3 hours ago
    participants: ['You', 'AI Assistant'],
    messages: [
      {
        id: 'm4',
        speaker: 'You',
        text: 'What did I discuss about the startup idea?',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      },
      {
        id: 'm5',
        speaker: 'AI Assistant',
        text: 'Your friend mentioned building AI-powered productivity tools with a focus on privacy-first design. They\'re particularly interested in local-first data storage.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3 + 1000 * 5).toISOString(),
      },
    ],
  },
];

/**
 * Mock streaming status
 */
export const MOCK_STREAMING_STATUS = {
  isStreaming: false,
  source: null,
  destination: null,
  duration: 0,
  bytesTransferred: 0,
};

/**
 * Mock OMI devices
 */
export const MOCK_OMI_DEVICES = [
  {
    id: 'demo_omi_001',
    name: 'Demo OMI Device',
    rssi: -60,
    connected: false,
  },
];

/**
 * Mock user profile
 */
export const MOCK_USER_PROFILE = {
  email: MOCK_USER_EMAIL,
  userId: MOCK_USER_ID,
  name: 'Demo User',
  createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(), // 30 days ago
  plan: 'demo',
};

/**
 * Simulate network delay for realistic mock API responses
 */
export function simulateNetworkDelay(minMs: number = 300, maxMs: number = 800): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs) + minMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Demo UNode for streaming testing
 */
export const DEMO_UNODE = {
  id: 'demo-unode-001',
  name: 'Demo Leader Node',
  apiUrl: 'demo://ushadow-demo-node',
  streamUrl: 'demo://ushadow-demo-node/stream',
  chronicleApiUrl: 'demo://ushadow-demo-node/chronicle',
  authToken: MOCK_AUTH_TOKEN,
  addedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(), // Added 7 days ago
  lastConnected: new Date().toISOString(),
  isActive: true,
};

/**
 * Check if a URL is a demo URL
 */
export function isDemoUrl(url: string): boolean {
  return url?.startsWith('demo://') || url?.includes('demo-node');
}

/**
 * Mock chat sessions for demo mode
 */
export const MOCK_CHAT_SESSIONS = [
  {
    id: 'demo_chat_001',
    title: 'Demo Chat Session',
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
    lastMessageAt: new Date().toISOString(),
    messageCount: 4,
    isDemo: true,
    userId: MOCK_USER_EMAIL,
    memoryEnabled: true,
    model: 'gpt-4o-mini',
  },
];

/**
 * Mock chat messages for demo sessions
 */
export const MOCK_CHAT_MESSAGES: Record<string, any[]> = {
  'demo_chat_001': [
    {
      id: 'msg_001',
      role: 'user',
      content: 'What did I discuss in my team meeting today?',
      timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    },
    {
      id: 'msg_002',
      role: 'assistant',
      content: 'Based on your memories, you discussed Q1 roadmap priorities in today\'s team meeting. The key points were:\n\n1. **Mobile App Improvements** - Focus on enhancing the streaming capabilities and offline support\n2. **API Stability** - Prioritize performance optimization and better error handling\n3. **Timeline** - These initiatives are planned for the next quarter\n\nThe team seemed aligned on these priorities, and there was consensus that mobile experience improvements will have the most immediate impact.',
      timestamp: new Date(Date.now() - 1000 * 60 * 59).toISOString(),
      metadata: {
        model: 'gpt-4o-mini',
        finishReason: 'stop',
        memoryEnriched: true,
      },
    },
    {
      id: 'msg_003',
      role: 'user',
      content: 'Can you help me draft a follow-up email for that meeting?',
      timestamp: new Date(Date.now() - 1000 * 60 * 58).toISOString(),
    },
    {
      id: 'msg_004',
      role: 'assistant',
      content: 'Certainly! Here\'s a concise follow-up email:\n\n---\n\n**Subject:** Q1 Roadmap - Action Items from Today\'s Meeting\n\nHi team,\n\nThank you for the productive discussion today. To recap our Q1 priorities:\n\n• Mobile App Improvements: Focus on streaming and offline capabilities\n• API Stability: Performance and error handling enhancements\n\nLet\'s schedule individual planning sessions next week to define specific tasks and timelines.\n\nBest,\n[Your name]\n\n---\n\nFeel free to adjust the tone or add any specific details!',
      timestamp: new Date(Date.now() - 1000 * 60 * 57).toISOString(),
      metadata: {
        model: 'gpt-4o-mini',
        finishReason: 'stop',
        memoryEnriched: true,
      },
    },
  ],
};

/**
 * Mock chat status
 */
export const MOCK_CHAT_STATUS = {
  configured: true,
  provider: 'openai',
  model: 'gpt-4o-mini',
  memory_available: true,
  error: null,
};
