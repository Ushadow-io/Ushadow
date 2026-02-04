/**
 * useAppLifecycle Hook
 *
 * Monitors React Native AppState to detect when app moves to/from background.
 * This is CRITICAL for maintaining Bluetooth and WebSocket connections.
 *
 * Usage:
 * ```typescript
 * const { appState, isActive } = useAppLifecycle({
 *   onForeground: () => {
 *     console.log('App returned to foreground - check connection health');
 *     // Verify connections are alive, trigger reconnection if needed
 *   },
 *   onBackground: () => {
 *     console.log('App moved to background');
 *     // Optional: prepare for potential connection suspension
 *   }
 * });
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { addPersistentLog } from '../services/persistentLogger';

interface UseAppLifecycleOptions {
  onForeground?: () => void;
  onBackground?: () => void;
  onInactive?: () => void;
}

interface UseAppLifecycle {
  appState: AppStateStatus;
  isActive: boolean;
  isBackground: boolean;
  isInactive: boolean;
}

/**
 * Hook to monitor app lifecycle state changes.
 *
 * AppState values:
 * - 'active': App is in foreground and receiving events
 * - 'background': App is in background (user pressed Home)
 * - 'inactive': Transition state (iOS only, e.g., during calls or app switcher)
 */
export const useAppLifecycle = (options?: UseAppLifecycleOptions): UseAppLifecycle => {
  const { onForeground, onBackground, onInactive } = options || {};

  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  // Use refs for callbacks to avoid recreating listener on every render
  const onForegroundRef = useRef(onForeground);
  const onBackgroundRef = useRef(onBackground);
  const onInactiveRef = useRef(onInactive);

  useEffect(() => {
    onForegroundRef.current = onForeground;
    onBackgroundRef.current = onBackground;
    onInactiveRef.current = onInactive;
  }, [onForeground, onBackground, onInactive]);

  useEffect(() => {
    console.log('[AppLifecycle] Setting up AppState listener, current state:', AppState.currentState);

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log(`[AppLifecycle] State change: ${appState} -> ${nextAppState}`);

      // Detect transitions
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to foreground
        console.log('[AppLifecycle] 🟢 App entered FOREGROUND');
        addPersistentLog('lifecycle', '🟢 App entered FOREGROUND', { from: appState, to: nextAppState });
        onForegroundRef.current?.();
      } else if (appState === 'active' && nextAppState === 'background') {
        // App has gone to background
        console.log('[AppLifecycle] 🔴 App entered BACKGROUND');
        addPersistentLog('lifecycle', '🔴 App entered BACKGROUND', { from: appState, to: nextAppState });
        onBackgroundRef.current?.();
      } else if (nextAppState === 'inactive') {
        // App is in transition (iOS only)
        console.log('[AppLifecycle] 🟡 App is INACTIVE');
        addPersistentLog('lifecycle', '🟡 App is INACTIVE', { from: appState, to: nextAppState });
        onInactiveRef.current?.();
      }

      setAppState(nextAppState);
    };

    // Subscribe to app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      console.log('[AppLifecycle] Removing AppState listener');
      subscription.remove();
    };
  }, [appState]);

  return {
    appState,
    isActive: appState === 'active',
    isBackground: appState === 'background',
    isInactive: appState === 'inactive',
  };
};

export default useAppLifecycle;
