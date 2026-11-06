/**
 * useStreaming.ts
 *
 * Combined streaming hook that orchestrates audio recording and WebSocket streaming.
 * Provides a simple interface for the UI to start/stop streaming.
 */
import { useState, useCallback, useRef } from 'react';
import { useAudioStreamer } from './useAudioStreamer';
import { usePhoneAudioRecorder, type PhoneCaptureSession } from './usePhoneAudioRecorder';
import { useAppLifecycle } from './useAppLifecycle';
import { useLiveActivity } from './useLiveActivity';

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
  const phoneSessionRef = useRef<PhoneCaptureSession | undefined>(undefined);

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
    sendFrame,
    getWebSocketReadyState,
  } = useAudioStreamer();

  // Live Activity (iOS 16.2+) — lock screen + Dynamic Island recording indicator
  const liveActivity = useLiveActivity();

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
    _codec: 'pcm' | 'opus' = 'opus'
  ) => {
    setCombinedError(null);
    streamUrlRef.current = streamUrl;
    shouldBeStreamingRef.current = true;
    streamModeRef.current = mode;

    try {
      // Audio v2 needs the capture epoch and mic capabilities before
      // StartCapture, so the mic starts first. Frames sent before the
      // capture binding arrives are dropped by the streamer.
      console.log('[Streaming] Starting native Opus capture...');
      const session = await startRecording(sendFrame);
      phoneSessionRef.current = session;

      console.log('[Streaming] Mic running, opening audio v2 connection...');
      await wsStart(streamUrl, mode, 'opus', session);

      console.log('[Streaming] Streaming started successfully');
      await liveActivity.startActivity('Phone Microphone');
    } catch (err) {
      const errorMessage = (err as Error).message || 'Failed to start streaming';
      console.error('[Streaming] Error starting streaming:', errorMessage);
      setCombinedError(errorMessage);

      // Cleanup on error
      await stopRecording();
      wsStop();

      throw err;
    }
  }, [wsStart, startRecording, sendFrame, stopRecording, wsStop, liveActivity]);

  // Reconnect WebSocket when app returns to foreground (mic keeps recording during standby)
  useAppLifecycle({
    onForeground: useCallback(() => {
      if (
        shouldBeStreamingRef.current &&
        streamUrlRef.current &&
        getWebSocketReadyState() !== WebSocket.OPEN
      ) {
        console.log('[Streaming] App foregrounded: reconnecting WebSocket (mic still recording)');
        wsStart(streamUrlRef.current, streamModeRef.current, 'opus', phoneSessionRef.current)
          .catch(err => console.warn('[Streaming] Foreground reconnect failed:', err));
      }
    }, [wsStart, getWebSocketReadyState]),
  });

  // Stop streaming: stop recording, then disconnect WebSocket
  const stopStreamingCombined = useCallback(async () => {
    shouldBeStreamingRef.current = false;
    phoneSessionRef.current = undefined;
    console.log('[Streaming] Stopping streaming...');

    try {
      await stopRecording();
    } catch (err) {
      console.error('[Streaming] Error stopping recording:', err);
    }

    wsStop();
    await liveActivity.stopActivity();

    console.log('[Streaming] Streaming stopped');
  }, [stopRecording, wsStop, liveActivity]);

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
