/**
 * useSessionTracking — Manage streaming session lifecycle and persistence.
 *
 * Tracks active sessions and maintains session history.
 */

import React, { useState, useCallback, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  StreamingSession,
  SessionSource,
  generateSessionId,
} from '../../audio/types/streamingSession';
import { loadSessions, saveSessions, updateSession } from '../storage/sessionStorage';
import type { RelayStatus } from '../../audio/hooks/useAudioStreamer';

export interface UseSessionTrackingReturn {
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

  useEffect(() => {
    const loadData = async () => {
      const loaded = await loadSessions();
      setSessions(loaded);
      const active = loaded.find(s => !s.endTime);
      if (active) {
        setActiveSession(active);
      }
      setIsLoading(false);
    };
    loadData();
  }, []);

  const hasLoadedOnce = React.useRef(false);
  useEffect(() => {
    if (!isLoading) {
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        return;
      }
      const saveData = async () => {
        await saveSessions(sessions);
      };
      const timeout = setTimeout(saveData, 500);
      return () => clearTimeout(timeout);
    }
  }, [sessions, isLoading]);

  const startSession = useCallback(async (source: SessionSource, codec: 'pcm' | 'opus'): Promise<string> => {
    const sessionId = generateSessionId();
    const netInfo = await NetInfo.fetch();
    const networkType = netInfo.type;

    const newSession: StreamingSession = {
      id: sessionId,
      source,
      destinations: [],
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

  const endSession = useCallback((sessionId: string, error?: string, endReason?: 'manual_stop' | 'connection_lost' | 'error' | 'timeout') => {
    const endTime = new Date();

    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        const durationSeconds = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
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
        };
      }
      return session;
    }));

    if (activeSession?.id === sessionId) {
      setActiveSession(null);
    }

    console.log('[SessionTracking] Ended session:', sessionId, endReason || 'unknown', error ? `Error: ${error}` : '');
  }, [activeSession]);

  const linkToConversation = useCallback((sessionId: string, conversationId: string) => {
    setSessions(prev => {
      return prev.map(session => {
        if (session.id === sessionId) {
          return { ...session, conversationId };
        }
        return session;
      });
    });
    updateSession(sessionId, { conversationId });
  }, []);

  const deleteSessionCallback = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  }, []);

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
