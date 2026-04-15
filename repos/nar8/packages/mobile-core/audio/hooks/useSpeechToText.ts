/**
 * useSpeechToText.ts
 *
 * Native speech-to-text hook using @react-native-voice/voice.
 * Provides streaming transcription with partial results for real-time display.
 *
 * Features:
 * - Native iOS/Android speech recognition (no external API needed)
 * - Real-time streaming partial results
 * - Final transcription when speech ends
 * - Language support (defaults to device language)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
  SpeechStartEvent,
  SpeechEndEvent,
  SpeechVolumeChangeEvent,
} from '@react-native-voice/voice';

export interface UseSpeechToTextOptions {
  /** Language locale (e.g., 'en-US', 'es-ES'). Defaults to device language. */
  language?: string;
  /** Called with partial results as user speaks (streaming) */
  onPartialResult?: (text: string) => void;
  /** Called when final result is ready */
  onFinalResult?: (text: string) => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
}

export interface UseSpeechToTextReturn {
  /** Whether voice recognition is currently active */
  isListening: boolean;
  /** Whether voice recognition is initializing */
  isInitializing: boolean;
  /** Current partial transcript (updates in real-time) */
  partialTranscript: string;
  /** Final transcript after recognition ends */
  finalTranscript: string;
  /** Current audio volume level (0-10) for visualization */
  volumeLevel: number;
  /** Any error message */
  error: string | null;
  /** Whether voice recognition is available on this device */
  isAvailable: boolean;
  /** Start listening for speech */
  startListening: () => Promise<void>;
  /** Stop listening and get final result */
  stopListening: () => Promise<void>;
  /** Cancel listening without getting result */
  cancelListening: () => Promise<void>;
  /** Clear the current transcript */
  clearTranscript: () => void;
}

export const useSpeechToText = (
  options: UseSpeechToTextOptions = {}
): UseSpeechToTextReturn => {
  const { language, onPartialResult, onFinalResult, onError } = options;

  const [isListening, setIsListening] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);

  const mountedRef = useRef(true);
  const onPartialResultRef = useRef(onPartialResult);
  const onFinalResultRef = useRef(onFinalResult);
  const onErrorRef = useRef(onError);

  // Keep refs updated
  useEffect(() => {
    onPartialResultRef.current = onPartialResult;
    onFinalResultRef.current = onFinalResult;
    onErrorRef.current = onError;
  }, [onPartialResult, onFinalResult, onError]);

  // Initialize voice recognition handlers
  useEffect(() => {
    // Check availability
    Voice.isAvailable().then((available) => {
      if (mountedRef.current) {
        setIsAvailable(!!available);
        if (!available) {
          console.warn('[SpeechToText] Voice recognition not available on this device');
        }
      }
    });

    // Event handlers
    const onSpeechStart = (e: SpeechStartEvent) => {
      console.log('[SpeechToText] Speech started');
      if (mountedRef.current) {
        setIsListening(true);
        setIsInitializing(false);
        setError(null);
      }
    };

    const onSpeechEnd = (e: SpeechEndEvent) => {
      console.log('[SpeechToText] Speech ended');
      if (mountedRef.current) {
        setIsListening(false);
        setVolumeLevel(0);
      }
    };

    const onSpeechResults = (e: SpeechResultsEvent) => {
      console.log('[SpeechToText] Final results:', e.value);
      if (mountedRef.current && e.value && e.value.length > 0) {
        const finalText = e.value[0];
        setFinalTranscript(finalText);
        setPartialTranscript(finalText);
        onFinalResultRef.current?.(finalText);
      }
    };

    const onSpeechPartialResults = (e: SpeechResultsEvent) => {
      // Streaming partial results as user speaks
      if (mountedRef.current && e.value && e.value.length > 0) {
        const partialText = e.value[0];
        setPartialTranscript(partialText);
        onPartialResultRef.current?.(partialText);
      }
    };

    const onSpeechVolumeChanged = (e: SpeechVolumeChangeEvent) => {
      // Volume is typically -2 to 10, normalize to 0-10 for visualization
      if (mountedRef.current && e.value !== undefined) {
        const normalized = Math.max(0, Math.min(10, e.value + 2));
        setVolumeLevel(normalized);
      }
    };

    const onSpeechError = (e: SpeechErrorEvent) => {
      console.error('[SpeechToText] Error:', e.error);
      if (mountedRef.current) {
        let errorMessage = 'Speech recognition error';

        // Handle specific error codes
        if (e.error?.code) {
          switch (e.error.code) {
            case '7': // No speech detected
              errorMessage = 'No speech detected. Please try again.';
              break;
            case '6': // Speech input error
              errorMessage = 'Speech input error. Please try again.';
              break;
            case '5': // Server error
              errorMessage = 'Recognition server error. Please try again.';
              break;
            case '9': // Permission denied
              errorMessage = 'Microphone permission required for voice input.';
              break;
            case '11': // Language not supported
              errorMessage = 'Speech recognition not available for this language.';
              break;
            default:
              errorMessage = e.error.message || 'Speech recognition error';
          }
        }

        setError(errorMessage);
        setIsListening(false);
        setIsInitializing(false);
        setVolumeLevel(0);
        onErrorRef.current?.(errorMessage);
      }
    };

    // Register listeners
    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechPartialResults = onSpeechPartialResults;
    Voice.onSpeechVolumeChanged = onSpeechVolumeChanged;
    Voice.onSpeechError = onSpeechError;

    return () => {
      mountedRef.current = false;
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!isAvailable) {
      const msg = 'Voice recognition not available on this device';
      setError(msg);
      onErrorRef.current?.(msg);
      return;
    }

    try {
      setIsInitializing(true);
      setError(null);
      setPartialTranscript('');
      setFinalTranscript('');
      setVolumeLevel(0);

      // Determine language
      const locale = language || (Platform.OS === 'ios' ? 'en-US' : undefined);

      console.log('[SpeechToText] Starting recognition...', { locale });

      await Voice.start(locale || 'en-US');
    } catch (err) {
      const errorMessage = (err as Error).message || 'Failed to start voice recognition';
      console.error('[SpeechToText] Start error:', errorMessage);

      if (errorMessage.includes('permission')) {
        Alert.alert(
          'Microphone Permission Required',
          'Please enable microphone access in your device settings to use voice input.',
          [{ text: 'OK' }]
        );
      }

      setError(errorMessage);
      setIsInitializing(false);
      setIsListening(false);
      onErrorRef.current?.(errorMessage);
    }
  }, [isAvailable, language]);

  const stopListening = useCallback(async () => {
    try {
      console.log('[SpeechToText] Stopping recognition...');
      await Voice.stop();
    } catch (err) {
      console.error('[SpeechToText] Stop error:', err);
    }
    setIsListening(false);
    setIsInitializing(false);
    setVolumeLevel(0);
  }, []);

  const cancelListening = useCallback(async () => {
    try {
      console.log('[SpeechToText] Cancelling recognition...');
      await Voice.cancel();
    } catch (err) {
      console.error('[SpeechToText] Cancel error:', err);
    }
    setIsListening(false);
    setIsInitializing(false);
    setPartialTranscript('');
    setVolumeLevel(0);
  }, []);

  const clearTranscript = useCallback(() => {
    setPartialTranscript('');
    setFinalTranscript('');
  }, []);

  return {
    isListening,
    isInitializing,
    partialTranscript,
    finalTranscript,
    volumeLevel,
    error,
    isAvailable,
    startListening,
    stopListening,
    cancelListening,
    clearTranscript,
  };
};
