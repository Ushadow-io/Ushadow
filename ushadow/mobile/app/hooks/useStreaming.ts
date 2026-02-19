/**
 * useStreaming.ts
 *
 * Combined streaming hook that orchestrates audio recording and WebSocket streaming.
 * Provides a simple interface for the UI to start/stop streaming.
 */
import { useState, useCallback, useRef } from 'react';
import { useAudioStreamer } from './useAudioStreamer';
import { usePhoneAudioRecorder } from './usePhoneAudioRecorder';
import { useAppLifecycle } from './useAppLifecycle';
import { useLockScreenControls } from './useLockScreenControls';

export interface UseStreaming {
  // Combined state
  isStreaming: boolean;
  isConnecting: boolean;
  isRecording: boolean;
  isInitializing: boolean;
  isRetrying: boolean;
  retryCount: number;
  maxRetries: number;
  error: string | null;
  audioLevel: number;

  // Actions
  startStreaming: (streamUrl: string, mode?: 'batch' | 'streaming', codec?: 'pcm' | 'opus') => Promise<void>;
  stopStreaming: () => Promise<void>;
  cancelRetry: () => void;
}

export const useStreaming = (): UseStreaming => {
  const [combinedError, setCombinedError] = useState<string | null>(null);
  const streamUrlRef = useRef<string>('');
  const shouldBeStreamingRef = useRef<boolean>(false);
  const streamModeRef = useRef<'batch' | 'streaming'>('streaming');
  const streamCodecRef = useRef<'pcm' | 'opus'>('pcm');

  // Audio streamer (WebSocket)
  const {
    isStreaming: wsStreaming,
    isConnecting,
    isRetrying,
    retryCount,
    maxRetries,
    error: wsError,
    startStreaming: wsStart,
    stopStreaming: wsStop,
    cancelRetry,
    sendAudio,
    getWebSocketReadyState,
  } = useAudioStreamer();

  // Lock screen controls (iOS now-playing presence during standby)
  const lockScreen = useLockScreenControls();

  // Phone audio recorder
  const {
    isRecording,
    isInitializing,
    error: recorderError,
    audioLevel,
    startRecording,
    stopRecording,
  } = usePhoneAudioRecorder();

  // Combined error state
  const error = combinedError || wsError || recorderError;

  // Combined streaming state (streaming = WS connected + recording)
  const isStreaming = wsStreaming && isRecording;

  // Start streaming: connect WebSocket, then start recording
  const startStreamingCombined = useCallback(async (
    streamUrl: string,
    mode: 'batch' | 'streaming' = 'streaming',
    codec: 'pcm' | 'opus' = 'pcm'
  ) => {
    setCombinedError(null);
    streamUrlRef.current = streamUrl;
    shouldBeStreamingRef.current = true;
    streamModeRef.current = mode;
    streamCodecRef.current = codec;

    try {
      console.log(`[Streaming] Starting WebSocket connection (mode: ${mode}, codec: ${codec})...`);
      await wsStart(streamUrl, mode, codec);

      console.log('[Streaming] WebSocket connected, starting audio recording...');
      await startRecording((pcmBuffer: Uint8Array) => {
        // Forward audio data to WebSocket
        sendAudio(pcmBuffer);
      });

      console.log('[Streaming] Streaming started successfully');
      await lockScreen.showStreamingControls({
        title: 'Ushadow Recording',
        artist: 'Phone Microphone',
      });
    } catch (err) {
      const errorMessage = (err as Error).message || 'Failed to start streaming';
      console.error('[Streaming] Error starting streaming:', errorMessage);
      setCombinedError(errorMessage);

      // Cleanup on error
      await stopRecording();
      wsStop();

      throw err;
    }
  }, [wsStart, startRecording, sendAudio, stopRecording, wsStop, lockScreen]);

  // Reconnect WebSocket when app returns to foreground (mic keeps recording during standby)
  useAppLifecycle({
    onForeground: useCallback(() => {
      if (
        shouldBeStreamingRef.current &&
        streamUrlRef.current &&
        getWebSocketReadyState() !== WebSocket.OPEN
      ) {
        console.log('[Streaming] App foregrounded: reconnecting WebSocket (mic still recording)');
        wsStart(streamUrlRef.current, streamModeRef.current, streamCodecRef.current)
          .catch(err => console.warn('[Streaming] Foreground reconnect failed:', err));
      }
    }, [wsStart, getWebSocketReadyState]),
  });

  // Stop streaming: stop recording, then disconnect WebSocket
  const stopStreamingCombined = useCallback(async () => {
    shouldBeStreamingRef.current = false;
    console.log('[Streaming] Stopping streaming...');

    try {
      await stopRecording();
    } catch (err) {
      console.error('[Streaming] Error stopping recording:', err);
    }

    wsStop();
    await lockScreen.hideControls();

    console.log('[Streaming] Streaming stopped');
  }, [stopRecording, wsStop, lockScreen]);

  return {
    isStreaming,
    isConnecting,
    isRecording,
    isInitializing,
    isRetrying,
    retryCount,
    maxRetries,
    error,
    audioLevel,
    startStreaming: startStreamingCombined,
    stopStreaming: stopStreamingCombined,
    cancelRetry,
  };
};
