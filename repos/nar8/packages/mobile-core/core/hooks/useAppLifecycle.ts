/**
 * useAppLifecycle — Monitor React Native AppState transitions.
 *
 * Critical for maintaining Bluetooth and WebSocket connections across
 * foreground/background transitions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { addPersistentLog } from '../services/persistentLogger';

export interface UseAppLifecycleOptions {
  onForeground?: () => void;
  onBackground?: () => void;
  onInactive?: () => void;
}

export interface UseAppLifecycleReturn {
  appState: AppStateStatus;
  isActive: boolean;
  isBackground: boolean;
  isInactive: boolean;
}

export const useAppLifecycle = (options?: UseAppLifecycleOptions): UseAppLifecycleReturn => {
  const { onForeground, onBackground, onInactive } = options || {};

  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

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

      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[AppLifecycle] App entered FOREGROUND');
        addPersistentLog('lifecycle', 'App entered FOREGROUND', { from: appState, to: nextAppState });
        onForegroundRef.current?.();
      } else if (appState === 'active' && nextAppState === 'background') {
        console.log('[AppLifecycle] App entered BACKGROUND');
        addPersistentLog('lifecycle', 'App entered BACKGROUND', { from: appState, to: nextAppState });
        onBackgroundRef.current?.();
      } else if (nextAppState === 'inactive') {
        console.log('[AppLifecycle] App is INACTIVE');
        addPersistentLog('lifecycle', 'App is INACTIVE', { from: appState, to: nextAppState });
        onInactiveRef.current?.();
      }

      setAppState(nextAppState);
    };

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
