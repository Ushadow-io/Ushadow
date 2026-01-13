/**
 * Chat Storage Utility
 *
 * Manages chat session persistence using AsyncStorage.
 * Handles session creation, loading, saving, and deletion.
 * Implements session limits and cleanup strategies.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage } from '../services/chatApi';

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE KEYS
// ═══════════════════════════════════════════════════════════════════════════

const CHAT_SESSIONS_KEY = '@ushadow:chat_sessions';
const CHAT_SESSION_PREFIX = '@ushadow:chat_session:';
const ACTIVE_SESSION_KEY = '@ushadow:active_chat_session';
const CHAT_PREFERENCES_KEY = '@ushadow:chat_preferences';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ChatSession {
  id: string;                    // UUID
  title: string;                 // Auto-generated or user-edited
  createdAt: string;             // ISO timestamp
  lastMessageAt: string;         // ISO timestamp
  messageCount: number;
  isDemo: boolean;              // Flag for demo sessions
  userId: string;               // User email
  memoryEnabled: boolean;
  model?: string;
}

export interface ChatSessionData {
  session: ChatSession;
  messages: ChatMessage[];
}

export interface ChatPreferences {
  useMemory: boolean;
  temperature?: number;
  maxTokens?: number;
  autoTitle: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 100;
const SESSION_AGE_DAYS = 30;

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate title from first user message
 */
function generateTitle(firstMessage: string): string {
  const title = firstMessage.slice(0, 50).trim();
  const lastSpace = title.lastIndexOf(' ');
  if (lastSpace > 30 && lastSpace < title.length) {
    return title.slice(0, lastSpace) + '...';
  }
  return title.length < firstMessage.length ? title + '...' : title;
}

/**
 * Load all chat sessions (metadata only, not messages)
 */
export async function loadSessions(): Promise<ChatSession[]> {
  try {
    const stored = await AsyncStorage.getItem(CHAT_SESSIONS_KEY);
    if (!stored) {
      return [];
    }

    const sessionIds: string[] = JSON.parse(stored);
    const sessions: ChatSession[] = [];

    // Load each session metadata
    for (const id of sessionIds) {
      try {
        const sessionData = await AsyncStorage.getItem(`${CHAT_SESSION_PREFIX}${id}`);
        if (sessionData) {
          const data: ChatSessionData = JSON.parse(sessionData);
          sessions.push(data.session);
        }
      } catch (error) {
        console.warn(`[ChatStorage] Failed to load session ${id}:`, error);
      }
    }

    // Sort by last message time (newest first)
    sessions.sort((a, b) => {
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });

    return sessions;
  } catch (error) {
    console.error('[ChatStorage] Failed to load sessions:', error);
    return [];
  }
}

/**
 * Load a single session with all messages
 */
export async function loadSession(id: string): Promise<ChatSessionData | null> {
  try {
    const stored = await AsyncStorage.getItem(`${CHAT_SESSION_PREFIX}${id}`);
    if (!stored) {
      return null;
    }

    return JSON.parse(stored);
  } catch (error) {
    console.error(`[ChatStorage] Failed to load session ${id}:`, error);
    return null;
  }
}

/**
 * Save a session with all messages
 */
export async function saveSession(sessionData: ChatSessionData): Promise<void> {
  try {
    const { session, messages } = sessionData;

    // Update session metadata
    session.messageCount = messages.length;
    session.lastMessageAt = messages.length > 0
      ? messages[messages.length - 1].timestamp
      : session.createdAt;

    // Enforce message limit
    if (messages.length > MAX_MESSAGES_PER_SESSION) {
      sessionData.messages = messages.slice(-MAX_MESSAGES_PER_SESSION);
      console.warn(`[ChatStorage] Session ${session.id} exceeded message limit, trimmed to ${MAX_MESSAGES_PER_SESSION}`);
    }

    // Save session data
    await AsyncStorage.setItem(
      `${CHAT_SESSION_PREFIX}${session.id}`,
      JSON.stringify(sessionData)
    );

    // Update sessions list
    const stored = await AsyncStorage.getItem(CHAT_SESSIONS_KEY);
    let sessionIds: string[] = stored ? JSON.parse(stored) : [];

    if (!sessionIds.includes(session.id)) {
      sessionIds.unshift(session.id);

      // Enforce session limit
      if (sessionIds.length > MAX_SESSIONS) {
        const removed = sessionIds.slice(MAX_SESSIONS);
        sessionIds = sessionIds.slice(0, MAX_SESSIONS);

        // Delete excess sessions
        for (const id of removed) {
          await AsyncStorage.removeItem(`${CHAT_SESSION_PREFIX}${id}`);
        }
        console.log(`[ChatStorage] Removed ${removed.length} excess sessions`);
      }

      await AsyncStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessionIds));
    }

    console.log(`[ChatStorage] Saved session ${session.id}`);
  } catch (error) {
    console.error('[ChatStorage] Failed to save session:', error);
    throw error;
  }
}

/**
 * Delete a session
 */
export async function deleteSession(id: string): Promise<void> {
  try {
    // Remove session data
    await AsyncStorage.removeItem(`${CHAT_SESSION_PREFIX}${id}`);

    // Update sessions list
    const stored = await AsyncStorage.getItem(CHAT_SESSIONS_KEY);
    if (stored) {
      let sessionIds: string[] = JSON.parse(stored);
      sessionIds = sessionIds.filter(sid => sid !== id);
      await AsyncStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessionIds));
    }

    // Clear active if this was active
    const activeId = await getActiveSessionId();
    if (activeId === id) {
      await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
    }

    console.log(`[ChatStorage] Deleted session ${id}`);
  } catch (error) {
    console.error(`[ChatStorage] Failed to delete session ${id}:`, error);
    throw error;
  }
}

/**
 * Create a new chat session
 */
export async function createNewSession(
  userId: string,
  title?: string,
  memoryEnabled: boolean = true
): Promise<ChatSessionData> {
  const now = new Date().toISOString();
  const session: ChatSession = {
    id: generateSessionId(),
    title: title || 'New Chat',
    createdAt: now,
    lastMessageAt: now,
    messageCount: 0,
    isDemo: false,
    userId,
    memoryEnabled,
  };

  const sessionData: ChatSessionData = {
    session,
    messages: [],
  };

  await saveSession(sessionData);
  await setActiveSessionId(session.id);

  console.log(`[ChatStorage] Created new session ${session.id}`);
  return sessionData;
}

/**
 * Update session title
 * Auto-generates from first message if not set
 */
export async function updateSessionTitle(
  id: string,
  title: string
): Promise<void> {
  try {
    const sessionData = await loadSession(id);
    if (!sessionData) {
      throw new Error(`Session ${id} not found`);
    }

    sessionData.session.title = title;
    await saveSession(sessionData);

    console.log(`[ChatStorage] Updated session title: ${id} -> "${title}"`);
  } catch (error) {
    console.error(`[ChatStorage] Failed to update session title:`, error);
    throw error;
  }
}

/**
 * Auto-generate title from first user message
 */
export async function autoGenerateTitle(id: string): Promise<void> {
  try {
    const sessionData = await loadSession(id);
    if (!sessionData || sessionData.messages.length === 0) {
      return;
    }

    const firstUserMessage = sessionData.messages.find(m => m.role === 'user');
    if (firstUserMessage && sessionData.session.title === 'New Chat') {
      sessionData.session.title = generateTitle(firstUserMessage.content);
      await saveSession(sessionData);
      console.log(`[ChatStorage] Auto-generated title: "${sessionData.session.title}"`);
    }
  } catch (error) {
    console.error(`[ChatStorage] Failed to auto-generate title:`, error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE SESSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the active session ID
 */
export async function getActiveSessionId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
  } catch (error) {
    console.error('[ChatStorage] Failed to get active session:', error);
    return null;
  }
}

/**
 * Set the active session ID
 */
export async function setActiveSessionId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_SESSION_KEY, id);
    console.log(`[ChatStorage] Set active session: ${id}`);
  } catch (error) {
    console.error('[ChatStorage] Failed to set active session:', error);
    throw error;
  }
}

/**
 * Clear active session
 */
export async function clearActiveSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
    console.log('[ChatStorage] Cleared active session');
  } catch (error) {
    console.error('[ChatStorage] Failed to clear active session:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load chat preferences
 */
export async function loadPreferences(): Promise<ChatPreferences> {
  try {
    const stored = await AsyncStorage.getItem(CHAT_PREFERENCES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    // Default preferences
    return {
      useMemory: true,
      autoTitle: true,
    };
  } catch (error) {
    console.error('[ChatStorage] Failed to load preferences:', error);
    return {
      useMemory: true,
      autoTitle: true,
    };
  }
}

/**
 * Save chat preferences
 */
export async function savePreferences(preferences: ChatPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAT_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('[ChatStorage] Failed to save preferences:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP & MAINTENANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clean up demo chat sessions
 * Removes all sessions marked as demo
 */
export async function cleanupDemoChatData(): Promise<void> {
  try {
    const sessions = await loadSessions();
    const demoSessions = sessions.filter(s => s.isDemo);

    for (const session of demoSessions) {
      await deleteSession(session.id);
    }

    if (demoSessions.length > 0) {
      console.log(`[ChatStorage] Cleaned up ${demoSessions.length} demo sessions`);
    }
  } catch (error) {
    console.error('[ChatStorage] Failed to cleanup demo chat data:', error);
  }
}

/**
 * Clean up old chat sessions
 * Removes sessions older than SESSION_AGE_DAYS
 */
export async function cleanupOldSessions(): Promise<void> {
  try {
    const sessions = await loadSessions();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - SESSION_AGE_DAYS);
    const cutoffTime = cutoffDate.getTime();

    const oldSessions = sessions.filter(s => {
      const sessionTime = new Date(s.lastMessageAt).getTime();
      return sessionTime < cutoffTime;
    });

    for (const session of oldSessions) {
      await deleteSession(session.id);
    }

    if (oldSessions.length > 0) {
      console.log(`[ChatStorage] Cleaned up ${oldSessions.length} old sessions`);
    }
  } catch (error) {
    console.error('[ChatStorage] Failed to cleanup old sessions:', error);
  }
}

/**
 * Clear all chat data (for testing/debugging)
 */
export async function clearAllChatData(): Promise<void> {
  try {
    const sessions = await loadSessions();

    for (const session of sessions) {
      await AsyncStorage.removeItem(`${CHAT_SESSION_PREFIX}${session.id}`);
    }

    await AsyncStorage.removeItem(CHAT_SESSIONS_KEY);
    await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
    await AsyncStorage.removeItem(CHAT_PREFERENCES_KEY);

    console.log('[ChatStorage] Cleared all chat data');
  } catch (error) {
    console.error('[ChatStorage] Failed to clear all chat data:', error);
    throw error;
  }
}
