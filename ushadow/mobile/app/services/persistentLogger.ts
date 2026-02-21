/**
 * Persistent Logger
 *
 * Logs survive app reloads/refreshes - perfect for debugging background behavior
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const LOG_STORAGE_KEY = '@persistent_logs';
const MAX_LOGS = 100;

export interface PersistentLogEntry {
  timestamp: string;
  type: 'lifecycle' | 'connection' | 'health' | 'background' | 'error';
  message: string;
  details?: any;
}

/**
 * Add a log entry that persists across app reloads
 */
export const addPersistentLog = async (
  type: PersistentLogEntry['type'],
  message: string,
  details?: any
): Promise<void> => {
  try {
    const entry: PersistentLogEntry = {
      timestamp: new Date().toISOString(),
      type,
      message,
      details,
    };

    // Get existing logs
    const existingLogsStr = await AsyncStorage.getItem(LOG_STORAGE_KEY);
    const existingLogs: PersistentLogEntry[] = existingLogsStr
      ? JSON.parse(existingLogsStr)
      : [];

    // Add new log at the beginning
    const updatedLogs = [entry, ...existingLogs].slice(0, MAX_LOGS);

    // Save back
    await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(updatedLogs));

    // Also console log
    console.log(`[PersistentLog] [${type}] ${message}`, details || '');
  } catch (error) {
    console.error('[PersistentLog] Error saving log:', error);
  }
};

/**
 * Get all persistent logs
 */
export const getPersistentLogs = async (): Promise<PersistentLogEntry[]> => {
  try {
    const logsStr = await AsyncStorage.getItem(LOG_STORAGE_KEY);
    return logsStr ? JSON.parse(logsStr) : [];
  } catch (error) {
    console.error('[PersistentLog] Error reading logs:', error);
    return [];
  }
};

/**
 * Clear all persistent logs
 */
export const clearPersistentLogs = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LOG_STORAGE_KEY);
    console.log('[PersistentLog] Logs cleared');
  } catch (error) {
    console.error('[PersistentLog] Error clearing logs:', error);
  }
};

/**
 * Get logs as formatted text for sharing
 */
export const getPersistentLogsText = async (): Promise<string> => {
  const logs = await getPersistentLogs();
  return logs
    .map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const details = log.details ? ` | ${JSON.stringify(log.details)}` : '';
      return `[${time}] [${log.type}] ${log.message}${details}`;
    })
    .join('\n');
};
