/**
 * Session Storage Utilities
 *
 * AsyncStorage persistence for streaming sessions.
 * Maintains list of recent sessions with size limits.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { StreamingSession } from '../types/streamingSession';

const STORAGE_KEY = '@ushadow/streaming_sessions';
const MAX_SESSIONS = 100; // Keep last 100 sessions

/**
 * Load sessions from storage
 */
export const loadSessions = async (): Promise<StreamingSession[]> => {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (!json) return [];

    const sessions = JSON.parse(json) as StreamingSession[];

    // Convert date strings back to Date objects
    return sessions.map(session => ({
      ...session,
      startTime: new Date(session.startTime),
      endTime: session.endTime ? new Date(session.endTime) : undefined,
    }));
  } catch (error) {
    console.error('[SessionStorage] Failed to load sessions:', error);
    return [];
  }
};

/**
 * Save sessions to storage
 */
export const saveSessions = async (sessions: StreamingSession[]): Promise<void> => {
  try {
    // Keep only the most recent sessions
    const recentSessions = sessions.slice(0, MAX_SESSIONS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recentSessions));
  } catch (error) {
    console.error('[SessionStorage] Failed to save sessions:', error);
  }
};

/**
 * Add a new session
 */
export const addSession = async (session: StreamingSession): Promise<void> => {
  const sessions = await loadSessions();
  sessions.unshift(session); // Add to beginning
  await saveSessions(sessions);
};

/**
 * Update an existing session
 */
export const updateSession = async (sessionId: string, updates: Partial<StreamingSession>): Promise<void> => {
  const sessions = await loadSessions();
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index !== -1) {
    sessions[index] = { ...sessions[index], ...updates };
    await saveSessions(sessions);
  }
};

/**
 * Delete a session
 */
export const deleteSession = async (sessionId: string): Promise<void> => {
  const sessions = await loadSessions();
  const filtered = sessions.filter(s => s.id !== sessionId);
  await saveSessions(filtered);
};

/**
 * Clear all sessions
 */
export const clearAllSessions = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('[SessionStorage] Failed to clear sessions:', error);
  }
};

/**
 * Link a session to a conversation
 */
export const linkSessionToConversation = async (
  sessionId: string,
  conversationId: string
): Promise<void> => {
  await updateSession(sessionId, { conversationId });
};
