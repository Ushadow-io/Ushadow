/**
 * usePhoneAudioRecorder.ts
 *
 * Audio recording hook using react-native-audio-record for real-time PCM streaming.
 * Streams actual microphone audio data via callback for WebSocket transmission.
 *
 * Audio format: 16kHz, mono, 16-bit PCM (matching Chronicle backend expectations)
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import AudioRecord from 'react-native-audio-record';
import { Audio } from 'expo-av';

export interface UsePhoneAudioRecorder {
  isRecording: boolean;
  isInitializing: boolean;
  error: string | null;
  audioLevel: number;
  startRecording: (onAudioData: (pcmBuffer: Uint8Array) => void) => Promise<void>;
  stopRecording: () => Promise<void>;
}

// Audio recording configuration (Chronicle expects 16kHz, mono, 16-bit)
const AUDIO_OPTIONS = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  audioSource: 6, // VOICE_RECOGNITION (best for speech)
  wavFile: 'audio.wav', // Temporary file name
};

// Calculate audio level from PCM samples with gain boost for visualization
const calculateAudioLevel = (buffer: Uint8Array): number => {
  if (buffer.length === 0) return 0;

  // Calculate RMS (Root Mean Square) from 16-bit PCM samples
  let sum = 0;
  const samples = buffer.length / 2; // 16-bit = 2 bytes per sample

  for (let i = 0; i < buffer.length; i += 2) {
    // Read 16-bit signed integer (little-endian)
    const sample = (buffer[i + 1] << 8) | buffer[i];
    const signed = sample > 32767 ? sample - 65536 : sample;
    sum += signed * signed;
  }

  const rms = Math.sqrt(sum / samples);
  // Apply gain boost for better visualization (speech is typically quieter than max volume)
  // Use logarithmic scaling to handle wide dynamic range
  const normalized = Math.min(100, (rms / 32768) * 1000); // 5x boost from 200 to 1000
  return normalized;
};

export const usePhoneAudioRecorder = (): UsePhoneAudioRecorder => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const onAudioDataRef = useRef<((pcmBuffer: Uint8Array) => void) | null>(null);
  const mountedRef = useRef<boolean>(true);
  const audioLevelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioLevelRef = useRef<number>(0); // Store latest audio level in ref

  // Safe state setter
  const setStateSafe = useCallback(<T,>(setter: (v: T) => void, val: T) => {
    if (mountedRef.current) setter(val);
  }, []);

  // Request microphone permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Microphone Permission Required',
          'Please enable microphone access in your device settings to use audio streaming.',
          [{ text: 'OK' }]
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error('[PhoneAudioRecorder] Permission error:', err);
      return false;
    }
  }, []);

  // Store data handler ref so we can remove it
  const dataHandlerRef = useRef<((data: string) => void) | null>(null);

  // Initialize audio recorder
  const initializeRecorder = useCallback(() => {
    console.log('[PhoneAudioRecorder] Initializing audio recorder with options:', AUDIO_OPTIONS);

    // Check if native module is available
    if (!AudioRecord || typeof AudioRecord.init !== 'function') {
      throw new Error('AudioRecord native module not available - did you rebuild the app?');
    }

    // Remove old listener if exists
    if (dataHandlerRef.current) {
      console.log('[PhoneAudioRecorder] Removing old audio data listener');
      try {
        AudioRecord.removeListener('data', dataHandlerRef.current);
      } catch (e) {
        console.warn('[PhoneAudioRecorder] Failed to remove old listener:', e);
      }
    }

    AudioRecord.init(AUDIO_OPTIONS);

    // Set up data callback - this receives real PCM audio data
    let chunkCount = 0;
    const dataHandler = (data: string) => {
      chunkCount++;
      if (chunkCount === 1 || chunkCount % 50 === 0) {
        console.log(`[PhoneAudioRecorder] Received audio chunk #${chunkCount}, size: ${data.length} bytes (base64)`);
      }

      if (!onAudioDataRef.current) {
        console.warn('[PhoneAudioRecorder] No callback set, discarding audio data');
        return;
      }

      try {
        // Convert base64 PCM data to Uint8Array
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        if (chunkCount === 1) {
          console.log(`[PhoneAudioRecorder] First chunk decoded: ${bytes.length} bytes PCM`);
        }

        // Send real audio data to WebSocket
        onAudioDataRef.current(bytes);

        // Calculate and update audio level for visualization
        const level = calculateAudioLevel(bytes);
        audioLevelRef.current = level;
      } catch (err) {
        console.error('[PhoneAudioRecorder] Error processing audio data:', err);
      }
    };

    // Store handler ref and register listener
    dataHandlerRef.current = dataHandler;
    AudioRecord.on('data', dataHandler);

    console.log('[PhoneAudioRecorder] Audio recorder initialized with new listener');
  }, [setStateSafe]);

  // Start recording
  const startRecording = useCallback(async (onAudioData: (pcmBuffer: Uint8Array) => void): Promise<void> => {
    if (isRecording) {
      console.log('[PhoneAudioRecorder] Already recording, stopping first...');
      await stopRecording();
    }

    setStateSafe(setIsInitializing, true);
    setStateSafe(setError, null);
    onAudioDataRef.current = onAudioData;

    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        throw new Error('Microphone permission denied');
      }

      console.log('[PhoneAudioRecorder] Starting audio recording...');

      // Initialize recorder with callback
      initializeRecorder();

      // Start recording
      AudioRecord.start();

      setStateSafe(setIsRecording, true);
      setStateSafe(setIsInitializing, false);

      // Start interval to sync ref audioLevel to state (updates React components)
      audioLevelIntervalRef.current = setInterval(() => {
        setAudioLevel(audioLevelRef.current);
      }, 50); // Update state 20 times per second

      console.log('[PhoneAudioRecorder] Recording started successfully - streaming real PCM audio data');
    } catch (err) {
      const errorMessage = (err as Error).message || 'Failed to start recording';
      console.error('[PhoneAudioRecorder] Start recording error:', errorMessage);
      setStateSafe(setError, errorMessage);
      setStateSafe(setIsInitializing, false);
      onAudioDataRef.current = null;
      throw new Error(errorMessage);
    }
  }, [isRecording, requestPermissions, initializeRecorder, setStateSafe]);

  // Stop recording
  const stopRecording = useCallback(async (): Promise<void> => {
    console.log('[PhoneAudioRecorder] Stopping recording...');

    // Stop audio level sync interval
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }

    onAudioDataRef.current = null;
    audioLevelRef.current = 0;
    setStateSafe(setAudioLevel, 0);

    if (!isRecording) {
      console.log('[PhoneAudioRecorder] No active recording');
      setStateSafe(setIsRecording, false);
      setStateSafe(setIsInitializing, false);
      return;
    }

    try {
      // Stop recording
      await AudioRecord.stop();
      console.log('[PhoneAudioRecorder] Recording stopped');
    } catch (err) {
      console.error('[PhoneAudioRecorder] Stop recording error:', err);
      setStateSafe(setError, 'Failed to stop recording');
    }

    setStateSafe(setIsRecording, false);
    setStateSafe(setIsInitializing, false);
  }, [isRecording, setStateSafe]);

  // Cleanup on unmount ONLY (empty deps = runs once, cleanup on unmount)
  useEffect(() => {
    return () => {
      console.log('[PhoneAudioRecorder] Component unmounting, cleaning up...');
      mountedRef.current = false;

      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
        audioLevelIntervalRef.current = null;
      }

      // Remove audio data listener
      if (dataHandlerRef.current) {
        try {
          AudioRecord.removeListener('data', dataHandlerRef.current);
        } catch (e) {
          // removeListener might not exist on all versions
          console.log('[PhoneAudioRecorder] Note: removeListener not available');
        }
        dataHandlerRef.current = null;
      }

      // Stop recording if active (react-native-audio-record is global)
      try {
        AudioRecord.stop();
      } catch (e) {
        // Ignore if not recording
      }
    };
  }, []); // Empty deps = cleanup only on unmount

  return {
    isRecording,
    isInitializing,
    error,
    audioLevel,
    startRecording,
    stopRecording,
  };
};
