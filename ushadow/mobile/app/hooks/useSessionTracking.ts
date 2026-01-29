/**
 * useSessionTracking Hook
 *
 * Manages streaming session lifecycle and persistence.
 * Tracks active sessions and maintains session history.
 */

import { useState, useCallback, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  StreamingSession,
  SessionSource,
  SessionDestination,
  generateSessionId,
  getSessionDuration,
} from '../types/streamingSession';
import { loadSessions, saveSessions, addSession, updateSession } from '../_utils/sessionStorage';
import { RelayStatus } from './useAudioStreamer';

interface UseSessionTrackingReturn {
  sessions: StreamingSession[];
  activeSession: StreamingSession | null;
  startSession: (source: SessionSource, codec: 'pcm' | 'opus') => string;
  updateSessionStatus: (sessionId: string, relayStatus: RelayStatus) => void;
  endSession: (sessionId: string, error?: string) => void;
  linkToConversation: (sessionId: string, conversationId: string) => void;
  deleteSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  isLoading: boolean;
}

export const useSessionTracking = (): UseSessionTrackingReturn => {
  const [sessions, setSessions] = useState<StreamingSession[]>([]);
  const [activeSession, setActiveSession] = useState<StreamingSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load sessions from storage on mount
  useEffect(() => {
    const loadData = async () => {
      const loaded = await loadSessions();
      setSessions(loaded);
      // Find any active session (shouldn't happen, but handle gracefully)
      const active = loaded.find(s => !s.endTime);
      if (active) {
        setActiveSession(active);
      }
      setIsLoading(false);
    };
    loadData();
  }, []);

  // Auto-save sessions when they change
  useEffect(() => {
    if (!isLoading && sessions.length > 0) {
      const saveData = async () => {
        await saveSessions(sessions);
      };
      // Debounce saves
      const timeout = setTimeout(saveData, 500);
      return () => clearTimeout(timeout);
    }
  }, [sessions, isLoading]);

  /**
   * Start a new streaming session
   */
  const startSession = useCallback(async (source: SessionSource, codec: 'pcm' | 'opus'): Promise<string> => {
    const sessionId = generateSessionId();

    // Get network info
    const netInfo = await NetInfo.fetch();
    const networkType = netInfo.type;

    const newSession: StreamingSession = {
      id: sessionId,
      source,
      destinations: [], // Will be populated when relay_status arrives
      startTime: new Date(),
      bytesTransferred: 0,
      chunksTransferred: 0,
      codec,
      networkType,
    };

    setSessions(prev => [newSession, ...prev]);
    setActiveSession(newSession);

    console.log('[SessionTracking] Started session:', sessionId);
    return sessionId;
  }, []);

  /**
   * Update session with relay status from backend
   */
  const updateSessionStatus = useCallback((sessionId: string, relayStatus: RelayStatus) => {
    setSessions(prev => {
      const updated = prev.map(session => {
        if (session.id === sessionId) {
          const updatedSession = {
            ...session,
            destinations: relayStatus.destinations,
            bytesTransferred: relayStatus.bytes_relayed,
            chunksTransferred: relayStatus.chunks_relayed,
          };
          if (activeSession?.id === sessionId) {
            setActiveSession(updatedSession);
          }
          return updatedSession;
        }
        return session;
      });
      return updated;
    });
  }, [activeSession]);

  /**
   * End a streaming session
   *
   * TODO: Implement session completion logic
   *
   * This function is called when streaming stops. You need to decide:
   * 1. Should we calculate final duration here, or let the UI compute it on-demand?
   * 2. Should we mark sessions with errors differently (e.g., special status field)?
   * 3. Should we auto-clean up very short sessions (< 5 seconds) as test sessions?
   *
   * Parameters:
   * - sessionId: The session to end
   * - error: Optional error message if session failed
   *
   * Consider:
   * - Duration calculation: endTime - startTime or pre-computed?
   * - Error handling: Should errors be logged separately or just stored in session?
   * - Session validity: Filter out sessions with 0 bytes transferred?
   */
  const endSession = useCallback((sessionId: string, error?: string) => {
    // TODO: Your implementation here
    // Hint: Update the session with endTime, calculate duration, handle errors
    console.log('[SessionTracking] Ending session:', sessionId, error);
  }, []);

  /**
   * Link session to a Chronicle conversation
   */
  const linkToConversation = useCallback((sessionId: string, conversationId: string) => {
    setSessions(prev => {
      const updated = prev.map(session => {
        if (session.id === sessionId) {
          return { ...session, conversationId };
        }
        return session;
      });
      return updated;
    });
    // Also persist immediately
    updateSession(sessionId, { conversationId });
  }, []);

  /**
   * Delete a session from history
   */
  const deleteSessionCallback = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  }, []);

  /**
   * Clear all session history
   */
  const clearAllSessionsCallback = useCallback(() => {
    setSessions([]);
    setActiveSession(null);
  }, []);

  return {
    sessions,
    activeSession,
    startSession,
    updateSessionStatus,
    endSession,
    linkToConversation,
    deleteSession: deleteSessionCallback,
    clearAllSessions: clearAllSessionsCallback,
    isLoading,
  };
};
