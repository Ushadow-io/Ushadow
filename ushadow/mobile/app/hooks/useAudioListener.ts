import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { OmiConnection } from 'friend-lite-react-native';
import { Subscription, ConnectionPriority } from 'react-native-ble-plx';
import { MOCK_OMI_DEVICES } from '../utils/mockData';

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
  isConnected: () => boolean,
  connectedDeviceId?: string | null
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
  const demoAudioIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Random pattern for visual feedback (Opus doesn't provide reliable amplitude)
  const calculateAudioLevel = useCallback((_bytes: Uint8Array): number => {
    return 20 + Math.random() * 60; // Random 20-80
  }, []);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldRetryRef = useRef<boolean>(false);
  const currentOnAudioDataRef = useRef<((bytes: Uint8Array) => void) | null>(null);

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

    if (uiUpdateIntervalRef.current) {
      clearInterval(uiUpdateIntervalRef.current);
      uiUpdateIntervalRef.current = null;
    }

    if (demoAudioIntervalRef.current) {
      clearInterval(demoAudioIntervalRef.current);
      demoAudioIntervalRef.current = null;
    }

    if (audioSubscriptionRef.current) {
      try {
        await omiConnection.stopAudioBytesListener(audioSubscriptionRef.current);
        audioSubscriptionRef.current = null;
        setIsListeningAudio(false);
        localPacketCounterRef.current = 0;
        audioLevelRef.current = 0;
        setAudioLevel(0);
        console.log('Audio listener stopped.');
      } catch (error) {
        // Check if this is the expected "Operation was cancelled" error from BLE
        const errorMessage = String(error);
        if (errorMessage.includes('Operation was cancelled') || errorMessage.includes('BleError')) {
          // This is expected when cancelling a BLE subscription - suppress the error
          console.log('Audio listener cancelled (expected when stopping)');
          audioSubscriptionRef.current = null;
          setIsListeningAudio(false);
          localPacketCounterRef.current = 0;
          audioLevelRef.current = 0;
          setAudioLevel(0);
        } else {
          // Unexpected error
          console.error('Stop audio listener error:', error);
          Alert.alert('Error', `Failed to stop audio listener: ${error}`);
        }
      }
    } else {
      console.log('Audio listener was not active.');
    }
    setIsListeningAudio(false);
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
        if (bytes && bytes.length > 0) {
          const audioBytes = new Uint8Array(bytes);
          // Calculate and update audio level for waveform visualization
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
        console.log('[AudioListener] Audio listener started successfully');
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

  const startAudioListener = useCallback(async (onAudioData: (bytes: Uint8Array) => void) => {
    if (!isConnected()) {
      Alert.alert('Not Connected', 'Please connect to a device first to start audio listener.');
      return;
    }

    if (isListeningAudio) {
      console.log('[AudioListener] Audio listener is already active. Stopping first.');
      await stopAudioListener();
    }

    // Check if this is a demo device
    const isDemoDevice = connectedDeviceId && MOCK_OMI_DEVICES.some(d => d.id === connectedDeviceId);
    if (isDemoDevice) {
      console.log('[AudioListener] Demo device detected - starting fake audio generation');
      setIsListeningAudio(true);
      setAudioPacketsReceived(0);
      localPacketCounterRef.current = 0;
      setRetryAttempts(0);

      // Generate fake audio packets at ~50Hz (20ms intervals, typical for audio streaming)
      demoAudioIntervalRef.current = setInterval(() => {
        // Generate fake PCM audio data (2048 bytes = 1024 16-bit samples)
        const fakeAudio = new Uint8Array(2048);
        // Fill with random-ish data to simulate audio
        for (let i = 0; i < fakeAudio.length; i++) {
          fakeAudio[i] = Math.floor(Math.random() * 256);
        }

        // Update counters and audio level
        localPacketCounterRef.current++;
        const level = calculateAudioLevel(fakeAudio);
        audioLevelRef.current = level;
        setAudioLevel(level);

        // Call the audio data callback
        onAudioData(fakeAudio);
      }, 20); // 20ms = 50Hz

      // Batch UI updates for packet counter
      if (uiUpdateIntervalRef.current) clearInterval(uiUpdateIntervalRef.current);
      uiUpdateIntervalRef.current = setInterval(() => {
        if (localPacketCounterRef.current > 0) {
          setAudioPacketsReceived(prev => prev + localPacketCounterRef.current);
          localPacketCounterRef.current = 0;
        }
      }, 500);

      console.log('[AudioListener] Demo audio generation started');
      return;
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
  }, [omiConnection, isConnected, stopAudioListener, attemptStartAudioListener, retryStartAudioListener, connectedDeviceId, calculateAudioLevel]);

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
      if (demoAudioIntervalRef.current) {
        clearInterval(demoAudioIntervalRef.current);
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
