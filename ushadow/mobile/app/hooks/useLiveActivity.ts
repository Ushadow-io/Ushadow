/**
 * useLiveActivity
 *
 * Manages an iOS 16.2+ Live Activity that shows recording status on the
 * lock screen and in the Dynamic Island.
 *
 * Falls back silently on Android or iOS < 16.2.
 */
import { useCallback, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';

const { LiveActivityModule } = NativeModules;

const isSupported = Platform.OS === 'ios' && !!LiveActivityModule;

export interface UseLiveActivity {
  /** Start a Live Activity. Call after recording begins. */
  startActivity: (deviceName: string) => Promise<void>;
  /** Stop the running Live Activity. Call after recording ends. */
  stopActivity: () => Promise<void>;
}

export function useLiveActivity(): UseLiveActivity {
  const activityIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const startActivity = useCallback(async (deviceName: string): Promise<void> => {
    if (!isSupported) return;

    try {
      const sessionId = Date.now().toString();
      const id: string = await LiveActivityModule.startActivity(deviceName, sessionId);
      activityIdRef.current = id;
      startTimeRef.current = Date.now();

      // Tick the elapsed-seconds counter every second
      timerRef.current = setInterval(() => {
        if (!activityIdRef.current) return;
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        LiveActivityModule.updateActivity(activityIdRef.current, elapsed).catch(() => {});
      }, 1000);

      console.log('[LiveActivity] Started:', id);
    } catch (err) {
      console.warn('[LiveActivity] Failed to start:', err);
    }
  }, []);

  const stopActivity = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!isSupported || !activityIdRef.current) return;

    try {
      await LiveActivityModule.endActivity(activityIdRef.current);
      console.log('[LiveActivity] Ended:', activityIdRef.current);
    } catch (err) {
      console.warn('[LiveActivity] Failed to end:', err);
    } finally {
      activityIdRef.current = null;
    }
  }, []);

  return { startActivity, stopActivity };
}
