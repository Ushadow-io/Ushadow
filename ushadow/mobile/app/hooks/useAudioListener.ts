import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { OmiConnection } from 'friend-lite-react-native';
import { Subscription, ConnectionPriority } from 'react-native-ble-plx';

interface UseAudioListener {
  isListeningAudio: boolean;
  audioPacketsReceived: number;
  audioLevel: number;  // 0-100, calculated from RMS of audio samples
  startAudioListener: (onAudioData: (bytes: Uint8Array) => void) => Promise<void>;
  stopAudioListener: () => Promise<void>;
  isRetrying: boolean;
  retryAttempts: number;
}

export const useAudioListener = (
  omiConnection: OmiConnection,
  isConnected: () => boolean
): UseAudioListener => {
  const [isListeningAudio, setIsListeningAudio] = useState<boolean>(false);
  const [audioPacketsReceived, setAudioPacketsReceived] = useState<number>(0);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [retryAttempts, setRetryAttempts] = useState<number>(0);

  const audioSubscriptionRef = useRef<Subscription | null>(null);
  const uiUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localPacketCounterRef = useRef<number>(0);
  const audioLevelRef = useRef<number>(0);

  // Random pattern for visual feedback (Opus doesn't provide reliable amplitude)
  const calculateAudioLevel = useCallback((_bytes: Uint8Array): number => {
    return 20 + Math.random() * 60; // Random 20-80
  }, []);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldRetryRef = useRef<boolean>(false);
  const currentOnAudioDataRef = useRef<((bytes: Uint8Array) => void) | null>(null);
  // Ref to retryStartAudioListener to break circular useCallback dependency
  const retryStartAudioListenerRef = useRef<() => void>(() => {});

  // Silent-disconnect watchdog: if we're "listening" but no packets arrive within
  // this window, assume BLE died without firing handleConnectionStateChange and restart.
  const AUDIO_WATCHDOG_MS = 10000;
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  const lastPacketTimeRef = useRef<number>(0);

  // Retry configuration
  const MAX_RETRY_ATTEMPTS = 10;
  const INITIAL_RETRY_DELAY = 1000;
  const MAX_RETRY_DELAY = 60000;

  const stopAudioListener = useCallback(async () => {
    console.log('Attempting to stop audio listener...');

    // Stop retry mechanism
    shouldRetryRef.current = false;
    setIsRetrying(false);
    setRetryAttempts(0);
    currentOnAudioDataRef.current = null;

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }

    if (uiUpdateIntervalRef.current) {
      clearInterval(uiUpdateIntervalRef.current);
      uiUpdateIntervalRef.current = null;
    }

    // Update state eagerly before the BLE call — the native stopAudioBytesListener
    // can hang indefinitely if the BLE connection is already dropped, which would
    // block the entire handleStopStreaming chain and leave the UI frozen.
    const sub = audioSubscriptionRef.current;
    audioSubscriptionRef.current = null;
    setIsListeningAudio(false);
    localPacketCounterRef.current = 0;
    audioLevelRef.current = 0;
    setAudioLevel(0);

    if (sub) {
      // Fire-and-forget — we've already cleared JS state above
      omiConnection.stopAudioBytesListener(sub).then(() => {
        console.log('Audio listener stopped.');
      }).catch((error: unknown) => {
        console.error('Stop audio listener error:', error);
      });
    } else {
      console.log('Audio listener was not active.');
    }
  }, [omiConnection]);

  // Calculate exponential backoff delay
  const getRetryDelay = useCallback((attemptNumber: number): number => {
    const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attemptNumber), MAX_RETRY_DELAY);
    const jitter = Math.random() * 0.3 * delay;
    return delay + jitter;
  }, []);

  // Internal function to attempt starting audio listener
  const attemptStartAudioListener = useCallback(async (onAudioData: (bytes: Uint8Array) => void): Promise<boolean> => {
    console.log('[AudioListener] attemptStartAudioListener called');
    if (!isConnected()) {
      console.log('[AudioListener] Device not connected, cannot start audio listener');
      return false;
    }

    try {
      await omiConnection.requestConnectionPriority(ConnectionPriority.High);
      console.log('[AudioListener] Requested high connection priority');
    } catch (error) {
      console.error('[AudioListener] Failed to request high connection priority:', error);
    }

    try {
      const subscription = await omiConnection.startAudioBytesListener((bytes) => {
        localPacketCounterRef.current++;
        lastPacketTimeRef.current = Date.now();
        if (bytes && bytes.length > 0) {
          const audioBytes = new Uint8Array(bytes);
          const level = calculateAudioLevel(audioBytes);
          audioLevelRef.current = level;
          setAudioLevel(level);
          onAudioData(audioBytes);
        }
      });

      if (subscription) {
        audioSubscriptionRef.current = subscription;
        setIsListeningAudio(true);
        setIsRetrying(false);
        setRetryAttempts(0);
        lastPacketTimeRef.current = Date.now();
        console.log('[AudioListener] Audio listener started successfully');

        // Start silent-disconnect watchdog. Omi BLE can drop without firing
        // handleConnectionStateChange — we detect this by watching for audio silence.
        if (watchdogRef.current) clearInterval(watchdogRef.current);
        watchdogRef.current = setInterval(() => {
          if (!shouldRetryRef.current) return;
          const silentMs = Date.now() - lastPacketTimeRef.current;
          if (silentMs > AUDIO_WATCHDOG_MS) {
            console.warn(`[AudioListener] Watchdog: no audio for ${Math.round(silentMs / 1000)}s — BLE may have silently disconnected, restarting listener`);
            if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null; }
            setIsListeningAudio(false);
            if (audioSubscriptionRef.current) {
              omiConnection.stopAudioBytesListener(audioSubscriptionRef.current).catch(() => {});
              audioSubscriptionRef.current = null;
            }
            setIsRetrying(true);
            retryStartAudioListenerRef.current(); // use ref to avoid circular dep
          }
        }, AUDIO_WATCHDOG_MS);

        return true;
      } else {
        console.error('[AudioListener] No subscription returned from startAudioBytesListener');
        return false;
      }
    } catch (error) {
      console.error('[AudioListener] Failed to start audio listener:', error);
      return false;
    }
  }, [omiConnection, isConnected]);

  // Retry mechanism with exponential backoff
  const retryStartAudioListener = useCallback(async () => {
    if (!shouldRetryRef.current || !currentOnAudioDataRef.current) {
      console.log('[AudioListener] Retry cancelled or no callback available');
      return;
    }

    const currentAttempt = retryAttempts;
    if (currentAttempt >= MAX_RETRY_ATTEMPTS) {
      console.log(`[AudioListener] Maximum retry attempts (${MAX_RETRY_ATTEMPTS}) reached`);
      setIsRetrying(false);
      setIsListeningAudio(false);
      Alert.alert(
        'Audio Listener Failed',
        `Failed to start audio listener after ${MAX_RETRY_ATTEMPTS} attempts. Please try again manually.`
      );
      return;
    }

    console.log(`[AudioListener] Retry attempt ${currentAttempt + 1}/${MAX_RETRY_ATTEMPTS}`);
    setRetryAttempts(currentAttempt + 1);
    setIsRetrying(true);

    const success = await attemptStartAudioListener(currentOnAudioDataRef.current);

    if (success) {
      console.log('[AudioListener] Retry successful');
      return;
    }

    // If still should retry, schedule next attempt
    if (shouldRetryRef.current) {
      const delay = getRetryDelay(currentAttempt);
      console.log(`[AudioListener] Scheduling retry in ${Math.round(delay)}ms`);

      retryTimeoutRef.current = setTimeout(() => {
        if (shouldRetryRef.current) {
          retryStartAudioListener();
        }
      }, delay);
    }
  }, [retryAttempts, attemptStartAudioListener, getRetryDelay]);

  // Keep the ref in sync so the watchdog can call it without a dep cycle
  useEffect(() => { retryStartAudioListenerRef.current = retryStartAudioListener; }, [retryStartAudioListener]);

  const startAudioListener = useCallback(async (onAudioData: (bytes: Uint8Array) => void) => {
    // No early abort for isConnected() — BLE may still be establishing when this is called
    // immediately after connectToDevice(). The retry mechanism polls isConnected() with
    // exponential backoff until the BLE handshake completes.

    if (isListeningAudio) {
      console.log('[AudioListener] Audio listener is already active. Stopping first.');
      await stopAudioListener();
    }

    // Store the callback for retry attempts
    currentOnAudioDataRef.current = onAudioData;
    shouldRetryRef.current = true;

    setAudioPacketsReceived(0);
    localPacketCounterRef.current = 0;
    setRetryAttempts(0);
    console.log('[AudioListener] Starting audio bytes listener...');

    // Batch UI updates for packet counter
    if (uiUpdateIntervalRef.current) clearInterval(uiUpdateIntervalRef.current);
    uiUpdateIntervalRef.current = setInterval(() => {
      if (localPacketCounterRef.current > 0) {
        setAudioPacketsReceived(prev => prev + localPacketCounterRef.current);
        localPacketCounterRef.current = 0;
      }
    }, 500);

    // Try to start audio listener
    const success = await attemptStartAudioListener(onAudioData);

    if (!success && shouldRetryRef.current) {
      console.log('[AudioListener] Initial attempt failed, starting retry mechanism');
      setIsRetrying(true);
      retryStartAudioListener();
    }
  }, [omiConnection, stopAudioListener, attemptStartAudioListener, retryStartAudioListener]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldRetryRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (uiUpdateIntervalRef.current) {
        clearInterval(uiUpdateIntervalRef.current);
      }
    };
  }, []);

  return {
    isListeningAudio,
    audioPacketsReceived,
    audioLevel,
    startAudioListener,
    stopAudioListener,
    isRetrying,
    retryAttempts,
  };
};
