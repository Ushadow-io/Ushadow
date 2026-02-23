/**
 * Background Task Manager
 *
 * Keeps Bluetooth connections alive during background execution.
 * Uses expo-task-manager and expo-background-fetch to run periodic health checks.
 *
 * Platform Behavior:
 * - iOS: Runs every ~15 minutes in background (iOS limitation)
 * - Android: Can run more frequently, configurable
 *
 * Usage:
 * ```typescript
 * import { registerBackgroundTask, unregisterBackgroundTask } from './services/backgroundTasks';
 *
 * // Start background monitoring
 * await registerBackgroundTask();
 *
 * // Stop background monitoring
 * await unregisterBackgroundTask();
 * ```
 */

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Task name constant
export const BACKGROUND_BLUETOOTH_TASK = 'BACKGROUND_BLUETOOTH_TASK';

// Storage keys for background task state
const STORAGE_KEYS = {
  LAST_CHECK: '@background_task_last_check',
  CHECK_COUNT: '@background_task_check_count',
  CONNECTION_STATE: '@background_connection_state',
  ERRORS: '@background_task_errors',
};

/**
 * Background task definition.
 *
 * This function runs in the background when triggered by the OS.
 * It has limited execution time (~30s on iOS, more on Android).
 *
 * IMPORTANT: Cannot use React hooks or access React components here.
 * This runs in a separate JavaScript context.
 */
TaskManager.defineTask(BACKGROUND_BLUETOOTH_TASK, async () => {
  const now = new Date().toISOString();
  console.log(`[BackgroundTask] Task triggered at ${now}`);

  try {
    // Increment check counter
    const checkCountStr = await AsyncStorage.getItem(STORAGE_KEYS.CHECK_COUNT);
    const checkCount = checkCountStr ? parseInt(checkCountStr, 10) : 0;
    await AsyncStorage.setItem(STORAGE_KEYS.CHECK_COUNT, (checkCount + 1).toString());

    // Store last check timestamp
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_CHECK, now);

    // Get current connection state (saved by foreground app)
    const connectionStateStr = await AsyncStorage.getItem(STORAGE_KEYS.CONNECTION_STATE);
    const connectionState = connectionStateStr ? JSON.parse(connectionStateStr) : null;

    console.log('[BackgroundTask] Connection state:', connectionState);

    if (connectionState?.isStreaming) {
      const timeSinceStateUpdate = connectionState.timestamp
        ? Date.now() - new Date(connectionState.timestamp).getTime()
        : null;

      console.log('[BackgroundTask] App is streaming, monitoring connection state');
      console.log('[BackgroundTask] Connection details:', {
        isConnected: connectionState.isConnected,
        isStreaming: connectionState.isStreaming,
        deviceId: connectionState.deviceId,
        source: connectionState.source,
        timeSinceLastUpdateMs: timeSinceStateUpdate,
        checkNumber: checkCount + 1,
      });

      // Note: We can't directly interact with BLE or WebSocket from here
      // The main purpose is to:
      // 1. Keep the JS thread alive so iOS doesn't suspend the app
      // 2. Log diagnostic data that persists across background periods
      // 3. Track how often the background task fires (iOS ~15min intervals)
      //
      // Actual reconnection happens in foreground (useAppLifecycle)

      // Store diagnostic snapshot for debugging
      await AsyncStorage.setItem(
        '@background_task_last_snapshot',
        JSON.stringify({
          timestamp: now,
          checkNumber: checkCount + 1,
          connectionState,
          timeSinceStateUpdateMs: timeSinceStateUpdate,
        })
      );
    } else {
      console.log('[BackgroundTask] App not streaming, no action needed');
    }

    // Return success
    return BackgroundFetch.BackgroundFetchResult.NewData;

  } catch (error) {
    console.error('[BackgroundTask] Error:', error);

    // Store error for debugging
    const errorLog = {
      timestamp: now,
      error: String(error),
    };
    await AsyncStorage.setItem(STORAGE_KEYS.ERRORS, JSON.stringify(errorLog));

    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register background task with the OS.
 *
 * Call this when the user starts streaming to enable background monitoring.
 *
 * @param minimumInterval - Minimum seconds between task executions (default: 60)
 *                          Note: iOS enforces minimum ~15 minutes regardless of this value
 */
export const registerBackgroundTask = async (minimumInterval: number = 60): Promise<boolean> => {
  try {
    console.log('[BackgroundTask] Registering background task...');

    // Check if task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_BLUETOOTH_TASK);

    if (isRegistered) {
      console.log('[BackgroundTask] Task already registered');
      return true;
    }

    // Register the task
    await BackgroundFetch.registerTaskAsync(BACKGROUND_BLUETOOTH_TASK, {
      minimumInterval, // seconds
      stopOnTerminate: false, // Continue after app is killed
      startOnBoot: true, // Start after device reboot
    });

    console.log('[BackgroundTask] ✅ Task registered successfully');

    // Initialize counters
    await AsyncStorage.setItem(STORAGE_KEYS.CHECK_COUNT, '0');
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_CHECK, new Date().toISOString());

    return true;

  } catch (error) {
    console.error('[BackgroundTask] ❌ Failed to register task:', error);
    return false;
  }
};

/**
 * Unregister background task.
 *
 * Call this when the user stops streaming or closes the app.
 */
export const unregisterBackgroundTask = async (): Promise<boolean> => {
  try {
    console.log('[BackgroundTask] Unregistering background task...');

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_BLUETOOTH_TASK);

    if (!isRegistered) {
      console.log('[BackgroundTask] Task not registered, nothing to unregister');
      return true;
    }

    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_BLUETOOTH_TASK);
    console.log('[BackgroundTask] ✅ Task unregistered successfully');

    return true;

  } catch (error) {
    console.error('[BackgroundTask] ❌ Failed to unregister task:', error);
    return false;
  }
};

/**
 * Check if background task is currently registered.
 */
export const isBackgroundTaskRegistered = async (): Promise<boolean> => {
  try {
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_BLUETOOTH_TASK);
  } catch (error) {
    console.error('[BackgroundTask] Error checking registration:', error);
    return false;
  }
};

/**
 * Get background task status.
 *
 * Returns diagnostic information about background task execution.
 */
export const getBackgroundTaskStatus = async (): Promise<{
  isRegistered: boolean;
  lastCheck: string | null;
  checkCount: number;
  lastError: string | null;
}> => {
  try {
    const isRegistered = await isBackgroundTaskRegistered();
    const lastCheck = await AsyncStorage.getItem(STORAGE_KEYS.LAST_CHECK);
    const checkCountStr = await AsyncStorage.getItem(STORAGE_KEYS.CHECK_COUNT);
    const checkCount = checkCountStr ? parseInt(checkCountStr, 10) : 0;
    const errorLogStr = await AsyncStorage.getItem(STORAGE_KEYS.ERRORS);
    const errorLog = errorLogStr ? JSON.parse(errorLogStr) : null;

    return {
      isRegistered,
      lastCheck,
      checkCount,
      lastError: errorLog?.error || null,
    };
  } catch (error) {
    console.error('[BackgroundTask] Error getting status:', error);
    return {
      isRegistered: false,
      lastCheck: null,
      checkCount: 0,
      lastError: String(error),
    };
  }
};

/**
 * Update connection state for background task.
 *
 * Call this from foreground app to tell background task about current state.
 */
export const updateConnectionState = async (state: {
  isConnected: boolean;
  isStreaming: boolean;
  deviceId?: string;
  source?: 'microphone' | 'omi';
}): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.CONNECTION_STATE,
      JSON.stringify({
        ...state,
        timestamp: new Date().toISOString(),
      })
    );
    console.log('[BackgroundTask] Connection state updated:', state);
  } catch (error) {
    console.error('[BackgroundTask] Error updating connection state:', error);
  }
};

/**
 * Get stored connection state.
 */
export const getStoredConnectionState = async (): Promise<{
  isConnected: boolean;
  isStreaming: boolean;
  deviceId?: string;
  source?: 'microphone' | 'omi';
  timestamp?: string;
} | null> => {
  try {
    const stateStr = await AsyncStorage.getItem(STORAGE_KEYS.CONNECTION_STATE);
    return stateStr ? JSON.parse(stateStr) : null;
  } catch (error) {
    console.error('[BackgroundTask] Error getting connection state:', error);
    return null;
  }
};

/**
 * Clear all background task data.
 * Useful for debugging or resetting state.
 */
export const clearBackgroundTaskData = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.LAST_CHECK),
      AsyncStorage.removeItem(STORAGE_KEYS.CHECK_COUNT),
      AsyncStorage.removeItem(STORAGE_KEYS.CONNECTION_STATE),
      AsyncStorage.removeItem(STORAGE_KEYS.ERRORS),
    ]);
    console.log('[BackgroundTask] All background task data cleared');
  } catch (error) {
    console.error('[BackgroundTask] Error clearing data:', error);
  }
};
