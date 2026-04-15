/**
 * useConnectionLog — Persistent connection status logging across all subsystems.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ConnectionType,
  ConnectionStatus,
  ConnectionLogEntry,
  ConnectionState,
  generateLogId,
} from '../types/connectionLog';

const STORAGE_KEY = '@connection_log';
const MAX_LOG_ENTRIES = 500;

export interface UseConnectionLogReturn {
  entries: ConnectionLogEntry[];
  connectionState: ConnectionState;
  logEvent: (
    type: ConnectionType,
    status: ConnectionStatus,
    message: string,
    details?: string,
    metadata?: Record<string, unknown>
  ) => void;
  clearLogs: () => void;
  clearLogsByType: (type: ConnectionType) => void;
  isLoading: boolean;
}

export const useConnectionLog = (): UseConnectionLogReturn => {
  const [entries, setEntries] = useState<ConnectionLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    network: 'unknown',
    server: 'unknown',
    bluetooth: 'unknown',
    websocket: 'unknown',
  });

  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const loadEntries = async () => {
      if (hasLoadedRef.current) return;
      hasLoadedRef.current = true;

      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ConnectionLogEntry[];
          const entriesWithDates = parsed.map(entry => ({
            ...entry,
            timestamp: new Date(entry.timestamp),
          }));
          setEntries(entriesWithDates);

          const restoredState: ConnectionState = {
            network: 'unknown',
            server: 'unknown',
            bluetooth: 'unknown',
            websocket: 'unknown',
          };

          for (const type of ['network', 'server', 'bluetooth', 'websocket'] as ConnectionType[]) {
            const lastEntry = entriesWithDates.find(e => e.type === type);
            if (lastEntry) {
              restoredState[type] = lastEntry.status;
            }
          }
          setConnectionState(restoredState);
        }
      } catch (error) {
        console.error('[useConnectionLog] Failed to load entries:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadEntries();
  }, []);

  useEffect(() => {
    if (isLoading || entries.length === 0) return;

    const saveEntries = async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      } catch (error) {
        console.error('[useConnectionLog] Failed to save entries:', error);
      }
    };

    const timer = setTimeout(saveEntries, 500);
    return () => clearTimeout(timer);
  }, [entries, isLoading]);

  const logEvent = useCallback(
    (
      type: ConnectionType,
      status: ConnectionStatus,
      message: string,
      details?: string,
      metadata?: Record<string, unknown>
    ) => {
      const entry: ConnectionLogEntry = {
        id: generateLogId(),
        timestamp: new Date(),
        type,
        status,
        message,
        details,
        metadata,
      };

      console.log(`[ConnectionLog] ${type}: ${status} - ${message}`);

      setEntries(prev => {
        const updated = [entry, ...prev];
        return updated.slice(0, MAX_LOG_ENTRIES);
      });

      setConnectionState(prev => ({
        ...prev,
        [type]: status,
      }));
    },
    []
  );

  const clearLogs = useCallback(async () => {
    setEntries([]);
    setConnectionState({
      network: 'unknown',
      server: 'unknown',
      bluetooth: 'unknown',
      websocket: 'unknown',
    });

    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[useConnectionLog] Failed to clear storage:', error);
    }
  }, []);

  const clearLogsByType = useCallback(async (type: ConnectionType) => {
    setEntries(prev => prev.filter(entry => entry.type !== type));
    setConnectionState(prev => ({
      ...prev,
      [type]: 'unknown',
    }));
  }, []);

  return {
    entries,
    connectionState,
    logEvent,
    clearLogs,
    clearLogsByType,
    isLoading,
  };
};

export default useConnectionLog;
