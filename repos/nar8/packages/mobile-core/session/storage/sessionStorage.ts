/**
 * Session Storage — AsyncStorage persistence for streaming sessions.
 *
 * Maintains list of recent sessions with size limits.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StreamingSession } from '../../audio/types/streamingSession';

const DEFAULT_STORAGE_KEY = '@streaming_sessions';
const MAX_SESSIONS = 100;

export function createSessionStorage(storageKey = DEFAULT_STORAGE_KEY) {
  async function loadSessions(): Promise<StreamingSession[]> {
    try {
      const json = await AsyncStorage.getItem(storageKey);
      if (!json) return [];

      const sessions = JSON.parse(json) as StreamingSession[];
      return sessions.map(session => ({
        ...session,
        startTime: new Date(session.startTime),
        endTime: session.endTime ? new Date(session.endTime) : undefined,
      }));
    } catch (error) {
      console.error('[SessionStorage] Failed to load sessions:', error);
      return [];
    }
  }

  async function saveSessions(sessions: StreamingSession[]): Promise<void> {
    try {
      const recentSessions = sessions.slice(0, MAX_SESSIONS);
      await AsyncStorage.setItem(storageKey, JSON.stringify(recentSessions));
    } catch (error) {
      console.error('[SessionStorage] Failed to save sessions:', error);
    }
  }

  async function addSession(session: StreamingSession): Promise<void> {
    const sessions = await loadSessions();
    sessions.unshift(session);
    await saveSessions(sessions);
  }

  async function updateSession(sessionId: string, updates: Partial<StreamingSession>): Promise<void> {
    const sessions = await loadSessions();
    const index = sessions.findIndex(s => s.id === sessionId);
    if (index !== -1) {
      sessions[index] = { ...sessions[index], ...updates };
      await saveSessions(sessions);
    }
  }

  async function deleteSession(sessionId: string): Promise<void> {
    const sessions = await loadSessions();
    const filtered = sessions.filter(s => s.id !== sessionId);
    await saveSessions(filtered);
  }

  async function clearAllSessions(): Promise<void> {
    try {
      await AsyncStorage.removeItem(storageKey);
    } catch (error) {
      console.error('[SessionStorage] Failed to clear sessions:', error);
    }
  }

  async function linkSessionToConversation(sessionId: string, conversationId: string): Promise<void> {
    await updateSession(sessionId, { conversationId });
  }

  return {
    loadSessions,
    saveSessions,
    addSession,
    updateSession,
    deleteSession,
    clearAllSessions,
    linkSessionToConversation,
  };
}

// Default instance for backwards compatibility
const defaultStorage = createSessionStorage('@ushadow/streaming_sessions');

export const loadSessions = defaultStorage.loadSessions;
export const saveSessions = defaultStorage.saveSessions;
export const addSession = defaultStorage.addSession;
export const updateSession = defaultStorage.updateSession;
export const deleteSession = defaultStorage.deleteSession;
export const clearAllSessions = defaultStorage.clearAllSessions;
export const linkSessionToConversation = defaultStorage.linkSessionToConversation;
