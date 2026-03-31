/**
 * usePhoneAudioRecorder.ts
 *
 * Audio recording hook using @siteed/expo-audio-studio for real-time PCM streaming.
 * Streams actual microphone audio data via callback for WebSocket transmission.
 *
 * Audio format: 16kHz, mono, 16-bit PCM (matching backend expectations)
 *
 * expo-audio-studio manages the AVAudioSession lifecycle internally — no manual
 * Audio.setAudioModeAsync calls needed. The library sets .playAndRecord +
 * staysActiveInBackground, which keeps iOS from killing the process when backgrounded.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import {
  useAudioRecorder,
  ExpoAudioStreamModule,
} from '@siteed/expo-audio-studio';
import type { AudioDataEvent } from '@siteed/expo-audio-studio';

export interface UsePhoneAudioRecorder {
  isRecording: boolean;
  isInitializing: boolean;
  error: string | null;
  audioLevel: number;
  /** Last N amplitude values (0–1) from analysis, for waveform display */
  waveformData: number[];
  startRecording: (onAudioData: (pcmBuffer: Uint8Array) => void) => Promise<void>;
  stopRecording: () => Promise<void>;
}

export const usePhoneAudioRecorder = (): UsePhoneAudioRecorder => {
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const onAudioDataRef = useRef<((pcmBuffer: Uint8Array) => void) | null>(null);
  const mountedRef = useRef<boolean>(true);

  const {
    startRecording: startRecorderInternal,
    stopRecording: stopRecorderInternal,
    isRecording,
    analysisData,
  } = useAudioRecorder();

  // Safe state setter — guards against updates after unmount
  const setStateSafe = useCallback(<T,>(setter: (v: T) => void, val: T) => {
    if (mountedRef.current) setter(val);
  }, []);

  // Decode base64 PCM from native or pass through Float32Array from web
  const processAudioDataEvent = useCallback((event: AudioDataEvent): Uint8Array | null => {
    try {
      const audioData = event.data;

      if (typeof audioData === 'string') {
        // Native platforms: base64-encoded PCM bytes
        const binaryString = atob(audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      } else if (audioData instanceof Float32Array) {
        // Web: convert Float32 [-1,1] → Int16 PCM little-endian
        const buffer = new ArrayBuffer(audioData.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < audioData.length; i++) {
          const s = Math.max(-1, Math.min(1, audioData[i]));
          view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
        return new Uint8Array(buffer);
      }
      return null;
    } catch (err) {
      console.error('[PhoneAudioRecorder] Audio conversion error:', err);
      return null;
    }
  }, []);

  const startRecording = useCallback(async (onAudioData: (pcmBuffer: Uint8Array) => void): Promise<void> => {
    if (isRecording) {
      console.log('[PhoneAudioRecorder] Already recording, stopping first...');
      await stopRecorderInternal();
    }

    setStateSafe(setIsInitializing, true);
    setStateSafe(setError, null);
    onAudioDataRef.current = onAudioData;

    try {
      const { granted } = await ExpoAudioStreamModule.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'Microphone Permission Required',
          'Please enable microphone access in your device settings to use audio streaming.',
          [{ text: 'OK' }]
        );
        throw new Error('Microphone permission denied');
      }

      console.log('[PhoneAudioRecorder] Starting audio recording...');

      const result = await startRecorderInternal({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 100,
        enableProcessing: true,
        intervalAnalysis: 100,
        onAudioStream: async (event: AudioDataEvent) => {
          if (!onAudioDataRef.current || !mountedRef.current) return;
          const pcmBuffer = processAudioDataEvent(event);
          if (pcmBuffer && pcmBuffer.length > 0) {
            onAudioDataRef.current(pcmBuffer);
          }
        },
      });

      if (!result) {
        throw new Error('Failed to start recording');
      }

      setStateSafe(setIsInitializing, false);
      console.log('[PhoneAudioRecorder] Recording started successfully - streaming real PCM audio data');
    } catch (err) {
      const errorMessage = (err as Error).message || 'Failed to start recording';
      console.error('[PhoneAudioRecorder] Start recording error:', errorMessage);
      setStateSafe(setError, errorMessage);
      setStateSafe(setIsInitializing, false);
      onAudioDataRef.current = null;
      throw new Error(errorMessage);
    }
  }, [isRecording, startRecorderInternal, processAudioDataEvent, setStateSafe]);

  const stopRecording = useCallback(async (): Promise<void> => {
    console.log('[PhoneAudioRecorder] Stopping recording...');
    onAudioDataRef.current = null;
    setStateSafe(setAudioLevel, 0);

    if (!isRecording) {
      console.log('[PhoneAudioRecorder] Not recording, nothing to stop');
      setStateSafe(setIsInitializing, false);
      return;
    }

    try {
      await stopRecorderInternal();
      console.log('[PhoneAudioRecorder] Recording stopped');
    } catch (err) {
      const msg = (err as Error).message || '';
      if (!msg.includes('not active') && !msg.includes('Recording is not active')) {
        console.error('[PhoneAudioRecorder] Stop recording error:', err);
        setStateSafe(setError, 'Failed to stop recording');
      }
    }

    setStateSafe(setIsInitializing, false);
  }, [isRecording, stopRecorderInternal, setStateSafe]);

  // Sync RMS audio level from analysis data for visualization
  useEffect(() => {
    if (analysisData?.dataPoints && analysisData.dataPoints.length > 0 && mountedRef.current) {
      const latest = analysisData.dataPoints[analysisData.dataPoints.length - 1];
      // dB is dBFS (typically -96 to 0). Map to 0–100 for StreamingDisplay:
      // -60dBFS → 0%, 0dBFS → 100%. Speech sits around -40 to -20dBFS (33–67%).
      setStateSafe(setAudioLevel, Math.max(0, Math.min(100, (latest.dB + 60) * (100 / 60))));
    }
  }, [analysisData, setStateSafe]);

  // Derive waveform data from real analysis points (last 30 amplitude values, 0–1)
  const waveformData = analysisData?.dataPoints
    ? analysisData.dataPoints.slice(-30).map(p => p.amplitude)
    : [];

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (isRecording) {
        stopRecorderInternal().catch(() => {});
      }

      // Deactivate iOS audio session on unmount to dismiss recording indicator
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        interruptionModeIOS: 0,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isRecording,
    isInitializing,
    error,
    audioLevel,
    waveformData,
    startRecording,
    stopRecording,
  };
};
