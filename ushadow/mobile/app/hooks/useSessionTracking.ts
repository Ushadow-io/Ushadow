/**
 * useSessionTracking Hook
 *
 * Manages streaming session lifecycle and persistence.
 * Tracks active sessions and maintains session history.
 */

import React, { useState, useCallback, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  StreamingSession,
  SessionSource,
  SessionDestination,
  SessionDiagnostics,
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
  endSession: (sessionId: string, error?: string, endReason?: string, diagnostics?: SessionDiagnostics) => void;
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

  // Auto-save sessions when they change (including empty state after clear)
  const hasLoadedOnce = React.useRef(false);
  useEffect(() => {
    if (!isLoading) {
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        return; // Skip redundant save on initial load
      }
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
   * Called when WebSocket connection drops and doesn't reconnect.
   * Keeps ALL sessions (including failed ones) for debugging conversation drops.
   */
  const endSession = useCallback((
    sessionId: string,
    error?: string,
    endReason?: 'manual_stop' | 'connection_lost' | 'error' | 'timeout',
    diagnostics?: SessionDiagnostics,
  ) => {
    const endTime = new Date();

    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        const durationSeconds = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
        // Infer end reason if not provided
        let finalEndReason = endReason;
        if (!finalEndReason) {
          if (error) {
            finalEndReason = error.toLowerCase().includes('timeout') ? 'timeout' : 'error';
          } else {
            finalEndReason = 'manual_stop';
          }
        }
        return {
          ...session,
          endTime,
          durationSeconds,
          error,
          endReason: finalEndReason,
          diagnostics: diagnostics || session.diagnostics,
        };
      }
      return session;
    }));

    if (activeSession?.id === sessionId) {
      setActiveSession(null);
    }

    if (diagnostics && (diagnostics.reconnectCount > 0 || diagnostics.backgroundGapCount > 0)) {
      console.log('[SessionTracking] Ended session with diagnostics:', sessionId, {
        reconnects: diagnostics.reconnectCount,
        gaps: diagnostics.backgroundGapCount,
        backgroundMs: diagnostics.totalBackgroundMs,
        buffered: diagnostics.totalBufferedChunks,
        dropped: diagnostics.totalDroppedChunks,
        flushed: diagnostics.totalFlushedChunks,
      });
    } else {
      console.log('[SessionTracking] Ended session:', sessionId, endReason || 'unknown', error ? `Error: ${error}` : '');
    }
  }, [activeSession]);

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
