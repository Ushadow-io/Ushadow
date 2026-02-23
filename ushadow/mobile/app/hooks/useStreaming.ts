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
import { useLiveActivity } from './useLiveActivity';
import { addPersistentLog } from '../services/persistentLogger';

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
    getBufferStatus,
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
  }, [wsStart, startRecording, sendAudio, stopRecording, wsStop, liveActivity]);

  // Reconnect WebSocket when app returns to foreground (mic keeps recording during standby)
  useAppLifecycle({
    onForeground: useCallback((backgroundDurationMs: number) => {
      const wsState = getWebSocketReadyState();
      const wsStateLabel = wsState === WebSocket.OPEN ? 'OPEN'
        : wsState === WebSocket.CONNECTING ? 'CONNECTING'
        : wsState === WebSocket.CLOSING ? 'CLOSING'
        : wsState === WebSocket.CLOSED ? 'CLOSED'
        : 'UNDEFINED';
      const bufferStatus = getBufferStatus();

      // Always log foreground transition diagnostics when streaming
      if (shouldBeStreamingRef.current) {
        const diagnostics = {
          backgroundDurationMs,
          backgroundDurationSec: Math.round(backgroundDurationMs / 1000),
          webSocketState: wsStateLabel,
          webSocketReadyState: wsState,
          shouldBeStreaming: shouldBeStreamingRef.current,
          hasStreamUrl: !!streamUrlRef.current,
          bufferedChunks: bufferStatus.bufferedChunks,
          droppedChunks: bufferStatus.droppedChunks,
          isBuffering: bufferStatus.isBuffering,
          codec: streamCodecRef.current,
          mode: streamModeRef.current,
        };

        console.log('[Streaming] App foregrounded while streaming - diagnostics:', JSON.stringify(diagnostics));
        addPersistentLog('streaming', 'App foregrounded during stream', diagnostics);
      }

      if (
        shouldBeStreamingRef.current &&
        streamUrlRef.current &&
        wsState !== WebSocket.OPEN
      ) {
        console.log(`[Streaming] App foregrounded: reconnecting WebSocket (was in background ${Math.round(backgroundDurationMs / 1000)}s, mic still recording, ws=${wsStateLabel})`);
        addPersistentLog('connection', 'Foreground reconnect attempt', {
          backgroundDurationMs,
          previousWsState: wsStateLabel,
          bufferedChunks: bufferStatus.bufferedChunks,
          droppedChunks: bufferStatus.droppedChunks,
        });

        wsStart(streamUrlRef.current, streamModeRef.current, streamCodecRef.current)
          .then(() => {
            console.log('[Streaming] Foreground reconnect succeeded');
            addPersistentLog('connection', 'Foreground reconnect succeeded', {
              backgroundDurationMs,
              bufferedChunksFlushed: bufferStatus.bufferedChunks,
            });
          })
          .catch(err => {
            const errorMsg = (err as Error).message || String(err);
            console.warn('[Streaming] Foreground reconnect failed:', errorMsg);
            addPersistentLog('error', 'Foreground reconnect failed', {
              error: errorMsg,
              backgroundDurationMs,
              willRetry: true,
            });
          });
      } else if (shouldBeStreamingRef.current && wsState === WebSocket.OPEN) {
        console.log('[Streaming] App foregrounded: WebSocket still open, no reconnect needed');
        addPersistentLog('streaming', 'Foreground - WebSocket still connected', {
          backgroundDurationMs,
        });
      }
    }, [wsStart, getWebSocketReadyState, getBufferStatus]),
    onBackground: useCallback(() => {
      if (shouldBeStreamingRef.current) {
        const wsState = getWebSocketReadyState();
        const wsStateLabel = wsState === WebSocket.OPEN ? 'OPEN' : String(wsState);
        console.log(`[Streaming] App backgrounded while streaming (ws=${wsStateLabel})`);
        addPersistentLog('streaming', 'App backgrounded during stream', {
          webSocketState: wsStateLabel,
          codec: streamCodecRef.current,
          mode: streamModeRef.current,
        });
      }
    }, [getWebSocketReadyState]),
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
