/**
 * useAudioStreamer.ts
 *
 * WebSocket audio streaming hook using Wyoming protocol.
 * Adapted from Chronicle's implementation for Ushadow mobile app.
 *
 * Wyoming Protocol: JSON header + binary payload for structured audio sessions.
 *
 * URL Format:
 * - Streaming URL: wss://{tailscale-host}/chronicle/ws_pcm?token={jwt}
 * - /chronicle prefix routes through Caddy to Chronicle backend
 * - /ws_pcm is the Wyoming protocol PCM audio endpoint
 * - Token is appended automatically via appendTokenToUrl()
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export interface UseAudioStreamer {
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
  startStreaming: (url: string) => Promise<void>;
  stopStreaming: () => void;
  sendAudio: (audioBytes: Uint8Array) => void;
  getWebSocketReadyState: () => number | undefined;
}

// Wyoming Protocol Types
interface WyomingEvent {
  type: string;
  data?: Record<string, unknown>;
  version?: string;
  payload_length?: number | null;
}

// Audio format constants (matching backend expectations)
const AUDIO_FORMAT = {
  rate: 16000,
  width: 2,
  channels: 1,
};

// Reconnection constants
const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_SERVER_ERRORS = 5;
const BASE_RECONNECT_MS = 3000;
const MAX_RECONNECT_MS = 30000;
const HEARTBEAT_MS = 25000;

export const useAudioStreamer = (): UseAudioStreamer => {
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const websocketRef = useRef<WebSocket | null>(null);
  const manuallyStoppedRef = useRef<boolean>(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentUrlRef = useRef<string>('');
  const reconnectAttemptsRef = useRef<number>(0);
  const serverErrorCountRef = useRef<number>(0);

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
      event.version = '1.0.0';
      event.payload_length = payload ? payload.length : null;

      const jsonHeader = JSON.stringify(event) + '\n';
      websocketRef.current.send(jsonHeader);
      if (payload?.length) websocketRef.current.send(payload);
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

    setStateSafe(setIsStreaming, false);
    setStateSafe(setIsConnecting, false);
  }, [sendWyomingEvent, setStateSafe]);

  // Reconnect with exponential backoff
  const attemptReconnect = useCallback(() => {
    if (manuallyStoppedRef.current || !currentUrlRef.current) {
      console.log('[AudioStreamer] Not reconnecting: manually stopped or missing URL');
      return;
    }
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[AudioStreamer] Reconnect attempts exhausted');
      manuallyStoppedRef.current = true;
      setStateSafe(setIsStreaming, false);
      setStateSafe(setIsConnecting, false);
      setStateSafe(setError, 'Failed to reconnect after multiple attempts.');
      return;
    }

    const attempt = reconnectAttemptsRef.current + 1;
    const delay = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * Math.pow(2, reconnectAttemptsRef.current));
    reconnectAttemptsRef.current = attempt;

    console.log(`[AudioStreamer] Reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);

    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    setStateSafe(setIsConnecting, true);

    reconnectTimeoutRef.current = setTimeout(() => {
      if (!manuallyStoppedRef.current) {
        startStreaming(currentUrlRef.current)
          .catch(err => {
            console.error('[AudioStreamer] Reconnection failed:', (err as Error).message || err);
            attemptReconnect();
          });
      }
    }, delay);
  }, [setStateSafe]);

  // Start streaming
  const startStreaming = useCallback(async (url: string): Promise<void> => {
    const trimmed = (url || '').trim();
    if (!trimmed) {
      const errorMsg = 'WebSocket URL is required.';
      setStateSafe(setError, errorMsg);
      return Promise.reject(new Error(errorMsg));
    }

    currentUrlRef.current = trimmed;
    manuallyStoppedRef.current = false;

    // Network gate
    const netState = await NetInfo.fetch();
    if (!netState.isConnected || !netState.isInternetReachable) {
      const errorMsg = 'No internet connection.';
      setStateSafe(setError, errorMsg);
      return Promise.reject(new Error(errorMsg));
    }

    console.log(`[AudioStreamer] Initializing WebSocket: ${trimmed}`);
    if (websocketRef.current) await stopStreaming();

    setStateSafe(setIsConnecting, true);
    setStateSafe(setError, null);

    return new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(trimmed);

        ws.onopen = async () => {
          console.log('[AudioStreamer] WebSocket open');
          websocketRef.current = ws;
          reconnectAttemptsRef.current = 0;
          serverErrorCountRef.current = 0;
          setStateSafe(setIsConnecting, false);
          setStateSafe(setIsStreaming, true);
          setStateSafe(setError, null);

          // Start heartbeat
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          heartbeatRef.current = setInterval(() => {
            try {
              if (websocketRef.current?.readyState === WebSocket.OPEN) {
                websocketRef.current.send(JSON.stringify({ type: 'ping', t: Date.now() }));
              }
            } catch {}
          }, HEARTBEAT_MS);

          try {
            const audioStartEvent: WyomingEvent = { type: 'audio-start', data: AUDIO_FORMAT };
            console.log('[AudioStreamer] Sending audio-start event');
            await sendWyomingEvent(audioStartEvent);
            console.log('[AudioStreamer] audio-start sent successfully');
          } catch (e) {
            console.error('[AudioStreamer] audio-start failed:', e);
          }

          resolve();
        };

        ws.onmessage = (event) => {
          console.log('[AudioStreamer] Message:', event.data);

          // Parse message to check for errors
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;
            if (data) {
              // Check for error responses from server
              if (data.type === 'error' || data.error || data.status === 'error') {
                serverErrorCountRef.current += 1;
                const errorMsg = data.message || data.error || 'Server error';
                console.error(`[AudioStreamer] Server error ${serverErrorCountRef.current}/${MAX_SERVER_ERRORS}: ${errorMsg}`);
                setStateSafe(setError, errorMsg);

                // Auto-stop after too many consecutive server errors
                if (serverErrorCountRef.current >= MAX_SERVER_ERRORS) {
                  console.log('[AudioStreamer] Too many server errors, stopping stream');
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
          setStateSafe(setError, msg);
          setStateSafe(setIsConnecting, false);
          setStateSafe(setIsStreaming, false);
          if (websocketRef.current === ws) websocketRef.current = null;
          reject(new Error(msg));
        };

        ws.onclose = (event) => {
          console.log('[AudioStreamer] Closed. Code:', event.code, 'Reason:', event.reason);
          const isManual = event.code === 1000 && (event.reason === 'manual-stop' || event.reason === 'too-many-errors');

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
  }, [attemptReconnect, sendWyomingEvent, setStateSafe, stopStreaming]);

  // Send audio data
  const sendAudio = useCallback(async (audioBytes: Uint8Array) => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN && audioBytes.length > 0) {
      try {
        console.log(`[AudioStreamer] Sending audio chunk: ${audioBytes.length} bytes`);
        const audioChunkEvent: WyomingEvent = { type: 'audio-chunk', data: AUDIO_FORMAT };
        await sendWyomingEvent(audioChunkEvent, audioBytes);
      } catch (e) {
        const msg = (e as Error).message || 'Error sending audio data.';
        console.error('[AudioStreamer] sendAudio error:', msg);
        setStateSafe(setError, msg);
      }
    } else {
      console.log(
        `[AudioStreamer] NOT sending audio. hasWS=${!!websocketRef.current
        } ready=${websocketRef.current?.readyState === WebSocket.OPEN
        } bytes=${audioBytes.length}`
      );
    }
  }, [sendWyomingEvent, setStateSafe]);

  const getWebSocketReadyState = useCallback(() => websocketRef.current?.readyState, []);

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
    };
  }, []);

  return {
    isStreaming,
    isConnecting,
    error,
    startStreaming,
    stopStreaming,
    sendAudio,
    getWebSocketReadyState,
  };
};
