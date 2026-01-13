/**
 * useStreaming.ts
 *
 * Combined streaming hook that orchestrates audio recording and WebSocket streaming.
 * Provides a simple interface for the UI to start/stop streaming.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
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
  startStreaming: (streamUrl: string, mode?: 'batch' | 'streaming') => Promise<void>;
  stopStreaming: () => Promise<void>;
  cancelRetry: () => void;
}

export const useStreaming = (): UseStreaming => {
  const [combinedError, setCombinedError] = useState<string | null>(null);
  const streamUrlRef = useRef<string>('');
  const cancelledRef = useRef<boolean>(false);
  const recordingCallbackRef = useRef<((data: Uint8Array) => void) | null>(null);

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

  // Auto-stop recording if WebSocket disconnects while recording
  const prevWsStreamingRef = useRef(wsStreaming);
  useEffect(() => {
    if (prevWsStreamingRef.current && !wsStreaming && isRecording) {
      console.log('[Streaming] WebSocket disconnected while recording, stopping recording...');
      stopRecording().catch(err => {
        console.error('[Streaming] Error auto-stopping recording:', err);
      });
      cancelledRef.current = true;
      recordingCallbackRef.current = null;
    }
    prevWsStreamingRef.current = wsStreaming;
  }, [wsStreaming, isRecording, stopRecording]);

  // Start streaming: connect WebSocket, then start recording
  const startStreamingCombined = useCallback(async (streamUrl: string, mode: 'batch' | 'streaming' = 'streaming') => {
    setCombinedError(null);
    streamUrlRef.current = streamUrl;
    cancelledRef.current = false;

    try {
      console.log(`[Streaming] Starting WebSocket connection (mode: ${mode})...`);
      await wsStart(streamUrl, mode);

      // Check if cancelled during connection
      if (cancelledRef.current) {
        console.log('[Streaming] Connection cancelled by user, aborting');
        wsStop();
        return;
      }

      console.log('[Streaming] WebSocket connected, starting audio recording...');

      // Create callback that checks if WebSocket is still open before sending
      const audioCallback = (pcmBuffer: Uint8Array) => {
        // Only send if not cancelled and WebSocket is connected
        if (!cancelledRef.current && wsStreaming) {
          sendAudio(pcmBuffer);
        }
      };
      recordingCallbackRef.current = audioCallback;

      await startRecording(audioCallback);

      console.log('[Streaming] Streaming started successfully');
    } catch (err) {
      const errorMessage = (err as Error).message || 'Failed to start streaming';
      console.error('[Streaming] Error starting streaming:', errorMessage);
      setCombinedError(errorMessage);

      // Cleanup on error
      await stopRecording();
      wsStop();
      recordingCallbackRef.current = null;

      throw err;
    }
  }, [wsStart, startRecording, sendAudio, stopRecording, wsStop, wsStreaming]);

  // Stop streaming: stop recording, then disconnect WebSocket
  const stopStreamingCombined = useCallback(async () => {
    console.log('[Streaming] Stopping streaming...');

    // Mark as cancelled to prevent any pending operations
    cancelledRef.current = true;
    recordingCallbackRef.current = null;

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
