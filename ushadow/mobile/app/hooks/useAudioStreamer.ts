/**
 * useAudioStreamer.ts
 *
 * WebSocket audio streaming hook using Wyoming protocol.
 * Adapted from Chronicle's implementation for Ushadow mobile app.
 *
 * Wyoming Protocol: JSON header + binary payload for structured audio sessions.
 *
 * URL Format:
 * - Audio relay: wss://{tailscale-host}/ws/audio/relay?destinations=[...]&token={jwt}
 * - The relay forwards to Chronicle/Mycelia backends internally
 * - Token is appended automatically via appendTokenToUrl()
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export interface UseAudioStreamer {
  isStreaming: boolean;
  isConnecting: boolean;
  isRetrying: boolean;
  retryCount: number;
  maxRetries: number;
  error: string | null;
  startStreaming: (url: string, mode?: 'batch' | 'streaming', codec?: 'pcm' | 'opus') => Promise<void>;
  stopStreaming: () => void;
  cancelRetry: () => void;
  sendAudio: (audioBytes: Uint8Array) => void;
  getWebSocketReadyState: () => number | undefined;
  getBufferStatus: () => { bufferedChunks: number; droppedChunks: number; isBuffering: boolean };
}

export interface RelayStatus {
  destinations: Array<{
    name: string;
    connected: boolean;
    errors: number;
  }>;
  bytes_relayed: number;
  chunks_relayed: number;
}

export interface UseAudioStreamerOptions {
  onLog?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message: string, details?: string) => void;
  onRelayStatus?: (status: RelayStatus) => void;
}

// Wyoming Protocol Types
interface WyomingEvent {
  type: string;
  data?: Record<string, unknown>;
  version?: string;
  payload_length?: number | null;
}

// Audio format constants (matching backend expectations)
// Note: For Opus, width=0 indicates compressed format (not PCM)
const AUDIO_FORMAT_PCM = {
  rate: 16000,
  width: 2,  // 16-bit PCM
  channels: 1,
};

const AUDIO_FORMAT_OPUS = {
  rate: 16000,
  width: 0,  // 0 indicates Opus (compressed, not PCM)
  channels: 1,
  codec: 'opus',
};

// Create audio start format with specified mode and codec
const createAudioStartFormat = (
  mode: 'batch' | 'streaming' = 'streaming',
  codec: 'pcm' | 'opus' = 'pcm'
) => {
  const baseFormat = codec === 'opus' ? AUDIO_FORMAT_OPUS : AUDIO_FORMAT_PCM;
  return {
    ...baseFormat,
    mode, // batch: process after recording completes, streaming: real-time transcription
  };
};

// Reconnection constants
// No hard cap on reconnect attempts — we retry forever while streaming is active.
// Inspired by Omi's 15-second periodic reconnect and Chronicle's foreground-service model.
const MAX_SERVER_ERRORS = 5;
const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 60000;  // Cap backoff at 60s (was 30s)
const HEARTBEAT_MS = 20000;      // 20s heartbeat (was 25s) — more aggressive keep-alive

// Background health-check interval (like Omi's 15-second keep-alive timer)
const HEALTH_CHECK_MS = 15000;

// Audio buffer constants — sized for long background gaps (up to ~10 minutes)
const AUDIO_BUFFER_MAX_CHUNKS = 6000;  // ~10 minutes of audio at 100ms chunks
const AUDIO_BUFFER_MAX_AGE_MS = 600000; // Keep buffered chunks up to 10 minutes

export const useAudioStreamer = (options?: UseAudioStreamerOptions): UseAudioStreamer => {
  const { onLog, onRelayStatus } = options || {};
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const websocketRef = useRef<WebSocket | null>(null);
  const manuallyStoppedRef = useRef<boolean>(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentUrlRef = useRef<string>('');
  const currentModeRef = useRef<'batch' | 'streaming'>('streaming');
  const currentCodecRef = useRef<'pcm' | 'opus'>('pcm');
  const reconnectAttemptsRef = useRef<number>(0);
  const serverErrorCountRef = useRef<number>(0);
  const audioChunkCountRef = useRef<number>(0);

  // Audio buffer for bridging background gaps
  const audioBufferRef = useRef<Array<{ data: Uint8Array; timestamp: number }>>([]);
  const droppedChunkCountRef = useRef<number>(0);
  const backgroundDisconnectTimeRef = useRef<number | null>(null);

  // Guard state updates after unmount
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setStateSafe = useCallback(<T,>(setter: (v: T) => void, val: T) => {
    if (mountedRef.current) setter(val);
  }, []);

  // Send Wyoming protocol events
  const sendWyomingEvent = useCallback(async (event: WyomingEvent, payload?: Uint8Array) => {
    if (!websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) {
      console.log('[AudioStreamer] WebSocket not ready for Wyoming event');
      return;
    }
    try {
      // Match web implementation - don't add version field
      event.payload_length = payload ? payload.length : null;

      const jsonHeader = JSON.stringify(event) + '\n';
      websocketRef.current.send(jsonHeader);

      if (payload?.length) {
        // Send binary payload exactly like web implementation
        websocketRef.current.send(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength));
      }
    } catch (e) {
      const errorMessage = (e as Error).message || 'Error sending Wyoming event.';
      console.error('[AudioStreamer] Error sending Wyoming event:', errorMessage);
      setStateSafe(setError, errorMessage);
    }
  }, [setStateSafe]);

  // Stop streaming
  const stopStreaming = useCallback(async () => {
    manuallyStoppedRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (healthCheckRef.current) {
      clearInterval(healthCheckRef.current);
      healthCheckRef.current = null;
    }

    if (websocketRef.current) {
      try {
        // Send audio-stop best-effort
        if (websocketRef.current.readyState === WebSocket.OPEN) {
          const audioStopEvent: WyomingEvent = { type: 'audio-stop', data: { timestamp: Date.now() } };
          await sendWyomingEvent(audioStopEvent);
        }
      } catch {}
      try {
        websocketRef.current.close(1000, 'manual-stop');
      } catch {}
      websocketRef.current = null;
    }

    onLog?.('disconnected', 'Manually stopped streaming');

    // Clear audio buffer
    audioBufferRef.current = [];
    droppedChunkCountRef.current = 0;
    backgroundDisconnectTimeRef.current = null;

    setStateSafe(setIsStreaming, false);
    setStateSafe(setIsConnecting, false);
    setStateSafe(setIsRetrying, false);
    setStateSafe(setRetryCount, 0);
    reconnectAttemptsRef.current = 0;
  }, [sendWyomingEvent, setStateSafe, onLog]);

  // Cancel retry attempts
  const cancelRetry = useCallback(() => {
    console.log('[AudioStreamer] Cancelling retry attempts');
    manuallyStoppedRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setStateSafe(setIsRetrying, false);
    setStateSafe(setIsConnecting, false);
    setStateSafe(setRetryCount, 0);
    reconnectAttemptsRef.current = 0;
  }, [setStateSafe]);

  // Flush buffered audio chunks after reconnection
  const flushAudioBuffer = useCallback(async () => {
    const buffer = audioBufferRef.current;
    if (buffer.length === 0) return;

    const now = Date.now();
    // Filter out chunks that are too old
    const validChunks = buffer.filter(chunk => (now - chunk.timestamp) < AUDIO_BUFFER_MAX_AGE_MS);
    const expiredCount = buffer.length - validChunks.length;

    console.log(`[AudioStreamer] Flushing audio buffer: ${validChunks.length} chunks (${expiredCount} expired, ${droppedChunkCountRef.current} dropped during gap)`);

    const audioFormat = currentCodecRef.current === 'opus' ? AUDIO_FORMAT_OPUS : AUDIO_FORMAT_PCM;
    let sentCount = 0;

    for (const chunk of validChunks) {
      if (websocketRef.current?.readyState === WebSocket.OPEN) {
        try {
          const audioChunkEvent: WyomingEvent = { type: 'audio-chunk', data: audioFormat };
          await sendWyomingEvent(audioChunkEvent, chunk.data);
          sentCount++;
        } catch (e) {
          console.warn('[AudioStreamer] Error flushing buffered chunk:', (e as Error).message);
          break;
        }
      } else {
        console.warn('[AudioStreamer] WebSocket closed during buffer flush, stopping');
        break;
      }
    }

    console.log(`[AudioStreamer] Buffer flush complete: ${sentCount}/${validChunks.length} chunks sent`);
    audioBufferRef.current = [];
    droppedChunkCountRef.current = 0;
  }, [sendWyomingEvent]);

  // Reconnect with exponential backoff — retries indefinitely while streaming is active.
  // Like Omi's periodicConnect() and Chronicle's foreground service, we never give up.
  const attemptReconnect = useCallback(() => {
    if (manuallyStoppedRef.current || !currentUrlRef.current) {
      console.log('[AudioStreamer] Not reconnecting: manually stopped or missing URL');
      setStateSafe(setIsRetrying, false);
      return;
    }

    const attempt = reconnectAttemptsRef.current + 1;
    // Exponential backoff capped at MAX_RECONNECT_MS (60s)
    const delay = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * Math.pow(2, Math.min(reconnectAttemptsRef.current, 6)));
    reconnectAttemptsRef.current = attempt;

    console.log(`[AudioStreamer] Reconnect attempt ${attempt} in ${delay}ms (will keep trying)`);
    onLog?.('connecting', `Reconnecting (attempt ${attempt})`, `Delay: ${delay}ms`);

    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    setStateSafe(setIsConnecting, true);
    setStateSafe(setIsRetrying, true);
    setStateSafe(setRetryCount, attempt);

    reconnectTimeoutRef.current = setTimeout(() => {
      if (!manuallyStoppedRef.current) {
        startStreaming(currentUrlRef.current, currentModeRef.current, currentCodecRef.current)
          .then(() => {
            // Connection successful, reset retry state
            setStateSafe(setIsRetrying, false);
            setStateSafe(setRetryCount, 0);
          })
          .catch(err => {
            console.error('[AudioStreamer] Reconnection failed:', (err as Error).message || err);
            attemptReconnect();
          });
      }
    }, delay);
  }, [setStateSafe, onLog]);

  // Start streaming
  const startStreaming = useCallback(async (
    url: string,
    mode: 'batch' | 'streaming' = 'streaming',
    codec: 'pcm' | 'opus' = 'pcm'
  ): Promise<void> => {
    const trimmed = (url || '').trim();
    if (!trimmed) {
      const errorMsg = 'WebSocket URL is required.';
      setStateSafe(setError, errorMsg);
      return Promise.reject(new Error(errorMsg));
    }

    currentModeRef.current = mode;
    currentCodecRef.current = codec;
    manuallyStoppedRef.current = false;

    // Add codec parameter to URL if not already present
    let finalUrl = trimmed;
    if (!finalUrl.includes('codec=')) {
      const separator = finalUrl.includes('?') ? '&' : '?';
      finalUrl = `${finalUrl}${separator}codec=${codec}`;
      console.log(`[AudioStreamer] Added codec parameter: ${codec}`);
    }

    currentUrlRef.current = finalUrl;

    // Network gate
    const netState = await NetInfo.fetch();
    if (!netState.isConnected || !netState.isInternetReachable) {
      const errorMsg = 'No internet connection.';
      setStateSafe(setError, errorMsg);
      return Promise.reject(new Error(errorMsg));
    }

    console.log(`[AudioStreamer] Initializing WebSocket: ${finalUrl}`);
    console.log(`[AudioStreamer] Network state:`, netState);
    onLog?.('connecting', 'Initializing WebSocket connection', finalUrl);
    if (websocketRef.current) await stopStreaming();

    setStateSafe(setIsConnecting, true);
    setStateSafe(setError, null);

    return new Promise<void>((resolve, reject) => {
      try {
        console.log(`[AudioStreamer] Creating WebSocket connection...`);
        const ws = new WebSocket(finalUrl);
        console.log(`[AudioStreamer] WebSocket object created, waiting for connection...`);

        ws.onopen = async () => {
          console.log('[AudioStreamer] WebSocket open');

          // Log background gap diagnostics if reconnecting
          if (backgroundDisconnectTimeRef.current !== null) {
            const gapDurationMs = Date.now() - backgroundDisconnectTimeRef.current;
            const bufferedChunks = audioBufferRef.current.length;
            const droppedChunks = droppedChunkCountRef.current;
            console.log(`[AudioStreamer] RECONNECTED after background gap: ${gapDurationMs}ms, buffered=${bufferedChunks}, dropped=${droppedChunks}`);
            onLog?.('connected', 'Reconnected after background gap', `Gap: ${Math.round(gapDurationMs / 1000)}s, buffered: ${bufferedChunks}, dropped: ${droppedChunks}`);
            backgroundDisconnectTimeRef.current = null;
          } else {
            onLog?.('connected', 'WebSocket connected successfully', `Mode: ${currentModeRef.current}, Codec: ${currentCodecRef.current}`);
          }

          // Set binary type to arraybuffer (matches web implementation)
          if (ws.binaryType !== 'arraybuffer') {
            ws.binaryType = 'arraybuffer';
          }

          websocketRef.current = ws;
          reconnectAttemptsRef.current = 0;
          serverErrorCountRef.current = 0;
          audioChunkCountRef.current = 0; // Reset audio chunk counter
          setStateSafe(setIsConnecting, false);
          setStateSafe(setIsStreaming, true);
          setStateSafe(setError, null);

          // Start heartbeat (keep-alive ping)
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          heartbeatRef.current = setInterval(() => {
            try {
              if (websocketRef.current?.readyState === WebSocket.OPEN) {
                websocketRef.current.send(JSON.stringify({ type: 'ping', t: Date.now() }));
              }
            } catch {}
          }, HEARTBEAT_MS);

          // Start background health check (like Omi's 15-second keep-alive timer).
          // This catches cases where WebSocket dies silently (no onclose fired)
          // and proactively reconnects — critical for background streaming.
          if (healthCheckRef.current) clearInterval(healthCheckRef.current);
          healthCheckRef.current = setInterval(() => {
            if (manuallyStoppedRef.current) return;
            const ready = websocketRef.current?.readyState;
            if (ready !== WebSocket.OPEN && ready !== WebSocket.CONNECTING && currentUrlRef.current) {
              console.log(`[AudioStreamer] Health check: WebSocket dead (readyState=${ready}), triggering reconnect`);
              attemptReconnect();
            }
          }, HEALTH_CHECK_MS);

          try {
            const audioStartEvent: WyomingEvent = {
              type: 'audio-start',
              data: createAudioStartFormat(currentModeRef.current, currentCodecRef.current)
            };
            console.log(`[AudioStreamer] Sending audio-start event - mode: ${currentModeRef.current}, codec: ${currentCodecRef.current}`);
            await sendWyomingEvent(audioStartEvent);
            console.log('[AudioStreamer] audio-start sent successfully');
          } catch (e) {
            console.error('[AudioStreamer] audio-start failed:', e);
          }

          // Flush any audio buffered during background gap
          if (audioBufferRef.current.length > 0) {
            try {
              await flushAudioBuffer();
            } catch (e) {
              console.warn('[AudioStreamer] Buffer flush failed:', (e as Error).message);
            }
          }

          resolve();
        };

        ws.onmessage = (event) => {
          console.log('[AudioStreamer] Message:', event.data);

          // Parse message to check for errors and status updates
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;
            if (data) {
              // Handle relay_status message
              if (data.type === 'relay_status' && data.data) {
                console.log('[AudioStreamer] Relay status:', data.data);
                onRelayStatus?.(data.data as RelayStatus);
              }
              // Check for error responses from server
              else if (data.type === 'error' || data.error || data.status === 'error') {
                serverErrorCountRef.current += 1;
                const errorMsg = data.message || data.error || 'Server error';
                console.error(`[AudioStreamer] Server error ${serverErrorCountRef.current}/${MAX_SERVER_ERRORS}: ${errorMsg}`);
                onLog?.('error', `Server error (${serverErrorCountRef.current}/${MAX_SERVER_ERRORS})`, errorMsg);
                setStateSafe(setError, errorMsg);

                // Auto-stop after too many consecutive server errors
                if (serverErrorCountRef.current >= MAX_SERVER_ERRORS) {
                  console.log('[AudioStreamer] Too many server errors, stopping stream');
                  onLog?.('error', 'Too many server errors, stopped stream', `${MAX_SERVER_ERRORS} consecutive errors`);
                  manuallyStoppedRef.current = true;
                  ws.close(1000, 'too-many-errors');
                  setStateSafe(setError, `Stopped: ${errorMsg} (${MAX_SERVER_ERRORS} errors)`);
                }
              } else {
                // Reset error count on successful message
                serverErrorCountRef.current = 0;
              }
            }
          } catch {
            // Non-JSON message, ignore parse error
          }
        };

        ws.onerror = (e) => {
          const msg = (e as ErrorEvent).message || 'WebSocket connection error.';
          console.error('[AudioStreamer] Error:', msg);
          onLog?.('error', 'WebSocket connection error', msg);
          setStateSafe(setError, msg);
          setStateSafe(setIsConnecting, false);
          setStateSafe(setIsStreaming, false);
          if (websocketRef.current === ws) websocketRef.current = null;
          reject(new Error(msg));
        };

        ws.onclose = (event) => {
          console.log('[AudioStreamer] Closed. Code:', event.code, 'Reason:', event.reason);
          const isManual = event.code === 1000 && (event.reason === 'manual-stop' || event.reason === 'too-many-errors');

          if (!isManual) {
            onLog?.('disconnected', 'WebSocket connection closed', `Code: ${event.code}, Reason: ${event.reason || 'none'}`);
          }

          setStateSafe(setIsConnecting, false);
          setStateSafe(setIsStreaming, false);

          if (websocketRef.current === ws) websocketRef.current = null;

          if (!isManual && !manuallyStoppedRef.current) {
            setStateSafe(setError, 'Connection closed; attempting to reconnect.');
            attemptReconnect();
          }
        };
      } catch (e) {
        const msg = (e as Error).message || 'Failed to create WebSocket.';
        console.error('[AudioStreamer] Create WS error:', msg);
        setStateSafe(setError, msg);
        setStateSafe(setIsConnecting, false);
        setStateSafe(setIsStreaming, false);
        reject(new Error(msg));
      }
    });
  }, [attemptReconnect, sendWyomingEvent, setStateSafe, stopStreaming, flushAudioBuffer]);

  // Send audio data (with buffering when WebSocket is not open)
  const sendAudio = useCallback(async (audioBytes: Uint8Array) => {
    if (audioBytes.length === 0) return;

    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      try {
        // Log first and every 50th chunk
        audioChunkCountRef.current++;
        if (audioChunkCountRef.current === 1 || audioChunkCountRef.current % 50 === 0) {
          console.log(`[AudioStreamer] Sending audio chunk #${audioChunkCountRef.current}: ${audioBytes.length} bytes (codec: ${currentCodecRef.current})`);
        }
        // Use format based on current codec
        const audioFormat = currentCodecRef.current === 'opus' ? AUDIO_FORMAT_OPUS : AUDIO_FORMAT_PCM;
        const audioChunkEvent: WyomingEvent = { type: 'audio-chunk', data: audioFormat };
        await sendWyomingEvent(audioChunkEvent, audioBytes);
      } catch (e) {
        const msg = (e as Error).message || 'Error sending audio data.';
        console.error('[AudioStreamer] sendAudio error:', msg);
        setStateSafe(setError, msg);
      }
    } else if (!manuallyStoppedRef.current && currentUrlRef.current) {
      // WebSocket not open but we should be streaming - buffer the audio
      if (backgroundDisconnectTimeRef.current === null) {
        backgroundDisconnectTimeRef.current = Date.now();
        console.log('[AudioStreamer] WebSocket not open, starting to buffer audio chunks');
      }

      if (audioBufferRef.current.length < AUDIO_BUFFER_MAX_CHUNKS) {
        audioBufferRef.current.push({ data: audioBytes, timestamp: Date.now() });
      } else {
        // Buffer full, count dropped chunks for diagnostics
        droppedChunkCountRef.current++;
        if (droppedChunkCountRef.current === 1 || droppedChunkCountRef.current % 50 === 0) {
          console.warn(`[AudioStreamer] Audio buffer full, dropped ${droppedChunkCountRef.current} chunks. Buffer size: ${AUDIO_BUFFER_MAX_CHUNKS}`);
        }
      }
    } else {
      // Log only occasionally to avoid spam
      audioChunkCountRef.current++;
      if (audioChunkCountRef.current % 100 === 0) {
        console.log(
          `[AudioStreamer] NOT sending audio (stopped). hasWS=${!!websocketRef.current
          } ready=${websocketRef.current?.readyState
          } manuallyStopped=${manuallyStoppedRef.current}`
        );
      }
    }
  }, [sendWyomingEvent, setStateSafe]);

  const getWebSocketReadyState = useCallback(() => websocketRef.current?.readyState, []);

  // Get current audio buffer status (for diagnostics)
  const getBufferStatus = useCallback(() => ({
    bufferedChunks: audioBufferRef.current.length,
    droppedChunks: droppedChunkCountRef.current,
    isBuffering: backgroundDisconnectTimeRef.current !== null,
  }), []);

  // Connectivity-triggered reconnect
  useEffect(() => {
    const sub = NetInfo.addEventListener(state => {
      const online = !!state.isConnected && !!state.isInternetReachable;
      if (online && !manuallyStoppedRef.current) {
        const ready = websocketRef.current?.readyState;
        if (ready !== WebSocket.OPEN && currentUrlRef.current) {
          console.log('[AudioStreamer] Network back; scheduling reconnect');
          attemptReconnect();
        }
      }
    });
    return () => sub();
  }, [attemptReconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
        healthCheckRef.current = null;
      }
    };
  }, []);

  return {
    isStreaming,
    isConnecting,
    isRetrying,
    retryCount,
    maxRetries: Infinity,
    error,
    startStreaming,
    stopStreaming,
    cancelRetry,
    sendAudio,
    getWebSocketReadyState,
    getBufferStatus,
  };
};
