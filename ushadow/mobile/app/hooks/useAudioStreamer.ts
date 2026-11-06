/**
 * useAudioStreamer.ts
 *
 * Streams raw Opus to Chronicle using the chronicle.audio.v2 protocol
 * (see chronicle/docs/backend/audio-websocket-protocol.md).
 *
 * URL: wss://{host}/ws/audio/relay?destinations=[...]&token={jwt}
 * The Ushadow relay forwards the v2 stream to Chronicle unchanged (after
 * swapping the bearer token for a service token) and unwraps the Opus
 * packets for Mycelia.
 *
 * v2 has no resume: a reconnect opens a new capture session. Audio sent
 * while disconnected is lost.
 */
import { create } from '@bufbuild/protobuf';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import {
  CaptureCapabilitiesSchema,
  DataPurpose,
  DeliveryClass,
  DeviceKind,
  DuplexMode,
  EffectStatusSchema,
  InputRoute,
  OutputRoute,
  ProcessingProfile,
} from '../protocol/audioV2';
import { AudioV2Socket } from '../protocol/audioV2Socket';
import type { VoiceCapabilities } from '../protocol/audioCapabilities';
import type { CapturedOpusFrame } from '../protocol/capturedOpusFrame';
import type { PhoneCaptureSession } from './usePhoneAudioRecorder';

export interface UseAudioStreamer {
  isStreaming: boolean;
  isConnecting: boolean;
  isRetrying: boolean;
  retryCount: number;
  maxRetries: number;
  error: string | null;
  /**
   * Connect and start a capture. Pass `phone` for the phone mic; omit it for
   * an OMI wearable. `mode` is kept for call-site compatibility. `codec` must
   * be 'opus': Chronicle audio v2 does not accept PCM.
   */
  startStreaming: (
    url: string,
    mode?: 'batch' | 'streaming',
    codec?: 'pcm' | 'opus',
    phone?: PhoneCaptureSession,
  ) => Promise<void>;
  stopStreaming: () => void;
  cancelRetry: () => void;
  /** Send one raw Opus packet from an OMI wearable (stamped on arrival). */
  sendAudio: (opusPacket: Uint8Array) => void;
  /** Send one phone-mic frame with its native capture timestamps. */
  sendFrame: (frame: CapturedOpusFrame) => void;
  getWebSocketReadyState: () => number | undefined;
}

export interface RelayStatus {
  destinations: Array<{ name: string; connected: boolean; errors: number }>;
  bytes_relayed: number;
  chunks_relayed: number;
}

export interface UseAudioStreamerOptions {
  onLog?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message: string, details?: string) => void;
  /** Not sent in audio v2 mode; kept so existing callers compile. */
  onRelayStatus?: (status: RelayStatus) => void;
}

// Upstream Chronicle declares OMI packets as 60 ms. The server rejects any
// packet that does not decode to exactly this duration. UNVERIFIED on our
// device firmware: if OMI sends 10/20 ms frames, this must change.
const WEARABLE_FRAME_MS = 60 as const;
const PHONE_FRAME_MS = 20 as const;

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_MS = 3000;
const MAX_RECONNECT_MS = 30000;
const HEARTBEAT_MS = 25000;

const inputRoutes: Record<VoiceCapabilities['input_route'], InputRoute> = {
  built_in_mic: InputRoute.BUILT_IN_MIC,
  bluetooth_hfp: InputRoute.BLUETOOTH_HFP,
  wired_mic: InputRoute.WIRED_MIC,
  usb: InputRoute.USB,
  unknown: InputRoute.REMOTE,
};

const outputRoutes: Record<VoiceCapabilities['output_route'], OutputRoute> = {
  speakerphone: OutputRoute.SPEAKERPHONE,
  earpiece: OutputRoute.EARPIECE,
  headphones: OutputRoute.HEADPHONES,
  bluetooth_hfp: OutputRoute.BLUETOOTH_HFP,
  usb: OutputRoute.USB,
  remote: OutputRoute.REMOTE,
  unknown: OutputRoute.REMOTE,
};

function typedCapabilities(capabilities: VoiceCapabilities) {
  const effect = (value: VoiceCapabilities['aec']) => create(EffectStatusSchema, value);
  return create(CaptureCapabilitiesSchema, {
    duplexMode: capabilities.mode === 'duplex_full'
      ? DuplexMode.FULL
      : capabilities.mode === 'duplex_isolated' ? DuplexMode.ISOLATED : DuplexMode.HALF,
    inputRoute: inputRoutes[capabilities.input_route],
    outputRoute: outputRoutes[capabilities.output_route],
    nativeSampleRateHz: capabilities.native_sample_rate,
    incrementalPlayback: capabilities.incremental_playback,
    acousticEchoCancellation: effect(capabilities.aec),
    noiseSuppression: effect(capabilities.noise_suppression),
  });
}

function phoneProfile(capabilities: VoiceCapabilities): ProcessingProfile {
  if (capabilities.mode === 'duplex_full') return ProcessingProfile.DUPLEX_AEC;
  if (capabilities.mode === 'duplex_isolated') return ProcessingProfile.DUPLEX_ISOLATED;
  return ProcessingProfile.HALF_DUPLEX;
}

/** The relay URL carries the Ushadow token; v2 sends it in ClientHello too. */
function tokenFromUrl(url: string): string {
  const match = /[?&]token=([^&]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : '';
}

export const useAudioStreamer = (options?: UseAudioStreamerOptions): UseAudioStreamer => {
  const { onLog } = options || {};
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<AudioV2Socket | null>(null);
  const manuallyStoppedRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentUrlRef = useRef('');
  const phoneRef = useRef<PhoneCaptureSession | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const sequenceRef = useRef(0);
  const monotonicOriginRef = useRef<number | null>(null);
  const packetCountRef = useRef(0);
  const mountedRef = useRef(true);
  const startStreamingRef = useRef<UseAudioStreamer['startStreaming'] | null>(null);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const setStateSafe = useCallback(<T,>(setter: (v: T) => void, val: T) => {
    if (mountedRef.current) setter(val);
  }, []);

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = null;
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
  }, []);

  const closeSocket = useCallback(async (graceful: boolean) => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (!socket) return;
    if (graceful) {
      try { await socket.stopCapture(); } catch { /* socket may already be gone */ }
    }
    socket.close();
  }, []);

  const stopStreaming = useCallback(async () => {
    manuallyStoppedRef.current = true;
    clearTimers();
    await closeSocket(true);
    onLog?.('disconnected', 'Manually stopped streaming');
    setStateSafe(setIsStreaming, false);
    setStateSafe(setIsConnecting, false);
    setStateSafe(setIsRetrying, false);
    setStateSafe(setRetryCount, 0);
    reconnectAttemptsRef.current = 0;
  }, [clearTimers, closeSocket, onLog, setStateSafe]);

  const cancelRetry = useCallback(() => {
    manuallyStoppedRef.current = true;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = null;
    setStateSafe(setIsRetrying, false);
    setStateSafe(setIsConnecting, false);
    setStateSafe(setRetryCount, 0);
    reconnectAttemptsRef.current = 0;
  }, [setStateSafe]);

  const attemptReconnect = useCallback(() => {
    if (manuallyStoppedRef.current || !currentUrlRef.current) {
      setStateSafe(setIsRetrying, false);
      return;
    }
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      manuallyStoppedRef.current = true;
      onLog?.('error', 'Failed to reconnect after multiple attempts', `Max attempts: ${MAX_RECONNECT_ATTEMPTS}`);
      setStateSafe(setIsStreaming, false);
      setStateSafe(setIsConnecting, false);
      setStateSafe(setIsRetrying, false);
      setStateSafe(setRetryCount, 0);
      setStateSafe(setError, 'Failed to reconnect after multiple attempts.');
      return;
    }
    const attempt = reconnectAttemptsRef.current + 1;
    const delay = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * 2 ** reconnectAttemptsRef.current);
    reconnectAttemptsRef.current = attempt;
    onLog?.('connecting', `Reconnecting (attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS})`, `Delay: ${delay}ms`);
    setStateSafe(setIsConnecting, true);
    setStateSafe(setIsRetrying, true);
    setStateSafe(setRetryCount, attempt);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      if (manuallyStoppedRef.current) return;
      startStreamingRef.current?.(currentUrlRef.current, 'streaming', 'opus', phoneRef.current)
        .then(() => {
          setStateSafe(setIsRetrying, false);
          setStateSafe(setRetryCount, 0);
        })
        .catch(err => {
          console.error('[AudioStreamer] Reconnection failed:', (err as Error).message || err);
          attemptReconnect();
        });
    }, delay);
  }, [onLog, setStateSafe]);

  const startStreaming = useCallback(async (
    url: string,
    _mode: 'batch' | 'streaming' = 'streaming',
    codec: 'pcm' | 'opus' = 'opus',
    phone?: PhoneCaptureSession,
  ): Promise<void> => {
    const trimmed = (url || '').trim();
    if (!trimmed) {
      setStateSafe(setError, 'WebSocket URL is required.');
      throw new Error('WebSocket URL is required.');
    }
    if (codec !== 'opus') {
      const msg = 'Chronicle audio v2 accepts Opus only; PCM streaming is no longer supported.';
      setStateSafe(setError, msg);
      throw new Error(msg);
    }
    const netState = await NetInfo.fetch();
    if (!netState.isConnected || !netState.isInternetReachable) {
      setStateSafe(setError, 'No internet connection.');
      throw new Error('No internet connection.');
    }

    manuallyStoppedRef.current = false;
    currentUrlRef.current = trimmed;
    phoneRef.current = phone;
    clearTimers();
    await closeSocket(false);
    setStateSafe(setIsConnecting, true);
    setStateSafe(setError, null);
    onLog?.('connecting', 'Opening audio v2 connection', trimmed.replace(/token=[^&]+/, 'token=***'));

    const socket = new AudioV2Socket({
      url: trimmed,
      bearerToken: tokenFromUrl(trimmed),
      sourceId: phone ? 'phone-mic' : 'omi',
      displayName: phone ? 'phone-mic' : 'omi',
      deviceKind: phone
        ? (Platform.OS === 'ios' ? DeviceKind.IOS_PHONE : DeviceKind.ANDROID_PHONE)
        : DeviceKind.OMI,
      uplinkFrameDurationMs: phone ? PHONE_FRAME_MS : WEARABLE_FRAME_MS,
      onClosed: () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
        setStateSafe(setIsStreaming, false);
        setStateSafe(setIsConnecting, false);
        if (!manuallyStoppedRef.current) {
          onLog?.('disconnected', 'Audio connection closed');
          setStateSafe(setError, 'Connection closed; attempting to reconnect.');
          attemptReconnect();
        }
      },
      onDiagnostic: event => {
        if (event.stage === 'server_error' || event.stage === 'transport_closed') {
          console.warn(`[AudioStreamer] ${event.stage}: ${event.detail ?? ''}`);
        }
      },
    });
    socketRef.current = socket;

    try {
      await socket.connect();
      sequenceRef.current = 0;
      monotonicOriginRef.current = null;
      packetCountRef.current = 0;
      const capabilities = phone ? typedCapabilities(phone.capabilities) : undefined;
      await socket.beginCapture({
        captureEpoch: phone?.captureEpoch ?? 0,
        processingProfile: phone ? phoneProfile(phone.capabilities) : ProcessingProfile.SOURCE_NATIVE,
        dataPurpose: DataPurpose.NORMAL_CAPTURE,
        deliveryClass: DeliveryClass.LIVE,
        capabilities,
      });
      if (capabilities) socket.voiceReady(capabilities);
      heartbeatRef.current = setInterval(() => {
        try { socket.heartbeat(performance.now()); } catch { /* closed */ }
      }, HEARTBEAT_MS);
      reconnectAttemptsRef.current = 0;
      onLog?.('connected', 'Audio v2 capture started', phone ? 'phone mic' : 'wearable');
      setStateSafe(setIsConnecting, false);
      setStateSafe(setIsStreaming, true);
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : 'Audio v2 connection failed';
      onLog?.('error', 'Audio v2 connection failed', msg);
      if (socketRef.current === socket) socketRef.current = null;
      socket.close();
      setStateSafe(setError, msg);
      setStateSafe(setIsConnecting, false);
      setStateSafe(setIsStreaming, false);
      throw cause instanceof Error ? cause : new Error(msg);
    }
  }, [attemptReconnect, clearTimers, closeSocket, onLog, setStateSafe]);

  startStreamingRef.current = startStreaming;

  const sendPacket = useCallback((opus: Uint8Array, capturedAtMs: number, monotonicMs: number) => {
    const socket = socketRef.current;
    if (!socket?.activeBinding || socket.readyState !== WebSocket.OPEN || !opus.length) return;
    monotonicOriginRef.current ??= monotonicMs;
    try {
      socket.sendPacket({
        sequence: sequenceRef.current++,
        capturedAtMs,
        monotonicOffsetUs: Math.max(0, Math.round((monotonicMs - monotonicOriginRef.current) * 1000)),
        deviceMonotonicTimestampUs: monotonicMs * 1000,
        opus,
      });
      packetCountRef.current += 1;
      if (packetCountRef.current === 1 || packetCountRef.current % 250 === 0) {
        console.log(`[AudioStreamer] Sent packet #${packetCountRef.current} (${opus.length} bytes)`);
      }
    } catch (e) {
      setStateSafe(setError, (e as Error).message || 'Error sending audio data.');
    }
  }, [setStateSafe]);

  const sendAudio = useCallback((opusPacket: Uint8Array) => {
    if (phoneRef.current) return; // phone frames go through sendFrame
    sendPacket(opusPacket, Date.now(), performance.now());
  }, [sendPacket]);

  const sendFrame = useCallback((frame: CapturedOpusFrame) => {
    const phone = phoneRef.current;
    if (!phone || frame.captureEpoch !== phone.captureEpoch) return;
    sendPacket(frame.opus, frame.capturedAtMs, frame.monotonicTimestampMs);
  }, [sendPacket]);

  const getWebSocketReadyState = useCallback(() => socketRef.current?.readyState, []);

  // Reconnect when the network comes back
  useEffect(() => {
    const sub = NetInfo.addEventListener(state => {
      const online = !!state.isConnected && !!state.isInternetReachable;
      if (online && !manuallyStoppedRef.current && currentUrlRef.current
        && socketRef.current?.readyState !== WebSocket.OPEN && !reconnectTimeoutRef.current) {
        attemptReconnect();
      }
    });
    return () => sub();
  }, [attemptReconnect]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    isStreaming,
    isConnecting,
    isRetrying,
    retryCount,
    maxRetries: MAX_RECONNECT_ATTEMPTS,
    error,
    startStreaming,
    stopStreaming,
    cancelRetry,
    sendAudio,
    sendFrame,
    getWebSocketReadyState,
  };
};
