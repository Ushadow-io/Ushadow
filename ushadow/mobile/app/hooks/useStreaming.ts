/**
 * useStreaming.ts
 *
 * Combined streaming hook that orchestrates audio recording and WebSocket streaming.
 * Provides a simple interface for the UI to start/stop streaming.
 */
import { useState, useCallback, useRef } from 'react';
import { useAudioStreamer } from './useAudioStreamer';
import { usePhoneAudioRecorder } from './usePhoneAudioRecorder';

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
  startStreaming: (streamUrl: string) => Promise<void>;
  stopStreaming: () => Promise<void>;
  cancelRetry: () => void;
}

export const useStreaming = (): UseStreaming => {
  const [combinedError, setCombinedError] = useState<string | null>(null);
  const streamUrlRef = useRef<string>('');

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
  } = useAudioStreamer();

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
  const startStreamingCombined = useCallback(async (streamUrl: string) => {
    setCombinedError(null);
    streamUrlRef.current = streamUrl;

    try {
      console.log('[Streaming] Starting WebSocket connection...');
      await wsStart(streamUrl);

      console.log('[Streaming] WebSocket connected, starting audio recording...');
      await startRecording((pcmBuffer: Uint8Array) => {
        // Forward audio data to WebSocket
        sendAudio(pcmBuffer);
      });

      console.log('[Streaming] Streaming started successfully');
    } catch (err) {
      const errorMessage = (err as Error).message || 'Failed to start streaming';
      console.error('[Streaming] Error starting streaming:', errorMessage);
      setCombinedError(errorMessage);

      // Cleanup on error
      await stopRecording();
      wsStop();

      throw err;
    }
  }, [wsStart, startRecording, sendAudio, stopRecording, wsStop]);

  // Stop streaming: stop recording, then disconnect WebSocket
  const stopStreamingCombined = useCallback(async () => {
    console.log('[Streaming] Stopping streaming...');

    try {
      await stopRecording();
    } catch (err) {
      console.error('[Streaming] Error stopping recording:', err);
    }

    wsStop();

    console.log('[Streaming] Streaming stopped');
  }, [stopRecording, wsStop]);

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
