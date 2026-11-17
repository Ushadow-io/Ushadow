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
  /** Packets and bytes this phone sent in the session, about once a second. */
  onRelayStatus?: (status: RelayStatus) => void;
}

// Chronicle rejects any packet that does not decode to exactly the declared
// duration. Verified on a real OMI (2026-11-07): packets decode to 320 samples
// at 16 kHz = 20 ms. Chronicle's docs still say 60 ms for OMI-NEO; they are wrong
// for this firmware.
const WEARABLE_FRAME_MS = 20 as const;
const PHONE_FRAME_MS = 20 as const;

// ~11 min of retries (3 s doubling to a 30 s cap). Matches the packet buffer below, so
// a long network gap (locked phone, Wi-Fi <-> cellular) is retried and then replayed.
const MAX_RECONNECT_ATTEMPTS = 25;
// Packets kept while the socket is down: 10 min of 20 ms Opus (~3 MB). When full,
// the oldest packets go first.
const MAX_PENDING_PACKETS = 30_000;
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
  const { onLog, onRelayStatus } = options || {};
  // Session totals across reconnects, for the session log. Reset on a user stop.
  const sessionPacketsRef = useRef(0);
  const sessionBytesRef = useRef(0);
  const onRelayStatusRef = useRef(onRelayStatus);
  onRelayStatusRef.current = onRelayStatus;
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
  // Packets that arrived while the socket was down. Sent first, with their original
  // capture times, when the next capture starts. Cleared on a user stop.
  const pendingRef = useRef<Array<{ opus: Uint8Array; capturedAtMs: number; monotonicMs: number }>>([]);
  // Packets lost because the pending buffer was full.
  const droppedCountRef = useRef(0);
  // Last monotonic offset sent on this capture; Chronicle rejects a live clock that
  // does not advance, and background event batches can share a millisecond.
  const lastOffsetUsRef = useRef(-1);
  const flushPendingRef = useRef<((socket: AudioV2Socket) => void) | null>(null);
  // Last close code / server error, shown in the app log when the socket closes.
  const lastCloseDetailRef = useRef('');
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
    onRelayStatusRef.current?.({
      destinations: [],
      bytes_relayed: sessionBytesRef.current,
      chunks_relayed: sessionPacketsRef.current,
    });
    sessionPacketsRef.current = 0;
    sessionBytesRef.current = 0;
    pendingRef.current = [];
    droppedCountRef.current = 0;
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
      // startStreaming closes the current socket first; never kill a healthy one.
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        setStateSafe(setIsRetrying, false);
        setStateSafe(setRetryCount, 0);
        return;
      }
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
          onLog?.('disconnected', 'Audio connection closed',
            `${lastCloseDetailRef.current}; sent ${packetCountRef.current}, dropped ${droppedCountRef.current}`);
          setStateSafe(setError, 'Connection closed; attempting to reconnect.');
          attemptReconnect();
        }
      },
      onDiagnostic: event => {
        if (event.stage === 'server_error' || event.stage === 'transport_closed') {
          console.warn(`[AudioStreamer] ${event.stage}: ${event.detail ?? ''}`);
          lastCloseDetailRef.current = `${event.stage}: ${event.detail ?? ''}`;
        }
      },
    });
    socketRef.current = socket;

    try {
      await socket.connect();
      sequenceRef.current = 0;
      monotonicOriginRef.current = null;
      lastOffsetUsRef.current = -1;
      packetCountRef.current = 0;
      lastCloseDetailRef.current = '';
      const capabilities = phone ? typedCapabilities(phone.capabilities) : undefined;
      await socket.beginCapture({
        captureEpoch: phone?.captureEpoch ?? 0,
        processingProfile: phone ? phoneProfile(phone.capabilities) : ProcessingProfile.SOURCE_NATIVE,
        dataPurpose: DataPurpose.NORMAL_CAPTURE,
        deliveryClass: DeliveryClass.LIVE,
        capabilities,
      });
      if (capabilities) socket.voiceReady(capabilities);
      flushPendingRef.current?.(socket);
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

  const transmit = useCallback((socket: AudioV2Socket, opus: Uint8Array, capturedAtMs: number, monotonicMs: number) => {
    monotonicOriginRef.current ??= monotonicMs;
    const offsetUs = Math.max(
      lastOffsetUsRef.current + 1,
      Math.round((monotonicMs - monotonicOriginRef.current) * 1000),
    );
    lastOffsetUsRef.current = offsetUs;
    try {
      socket.sendPacket({
        sequence: sequenceRef.current++,
        capturedAtMs,
        monotonicOffsetUs: offsetUs,
        deviceMonotonicTimestampUs: monotonicMs * 1000,
        opus,
      });
      packetCountRef.current += 1;
      sessionPacketsRef.current += 1;
      sessionBytesRef.current += opus.length;
      if (sessionPacketsRef.current % 50 === 1) {
        onRelayStatusRef.current?.({
          destinations: [],
          bytes_relayed: sessionBytesRef.current,
          chunks_relayed: sessionPacketsRef.current,
        });
      }
      if (packetCountRef.current === 1 || packetCountRef.current % 250 === 0) {
        console.log(`[AudioStreamer] Sent packet #${packetCountRef.current} (${opus.length} bytes)`);
      }
    } catch (e) {
      setStateSafe(setError, (e as Error).message || 'Error sending audio data.');
    }
  }, [setStateSafe]);

  const sendPacket = useCallback((opus: Uint8Array, capturedAtMs: number, monotonicMs: number) => {
    if (!opus.length || manuallyStoppedRef.current) return;
    const socket = socketRef.current;
    if (socket?.activeBinding && socket.readyState === WebSocket.OPEN) {
      transmit(socket, opus, capturedAtMs, monotonicMs);
      return;
    }
    const pending = pendingRef.current;
    pending.push({ opus, capturedAtMs, monotonicMs });
    if (pending.length > MAX_PENDING_PACKETS) {
      pending.shift();
      droppedCountRef.current += 1;
    }
  }, [transmit]);

  // Send what arrived during the gap, oldest first, before any new live packet.
  // JS is single-threaded, so no live packet can slip in between.
  const flushPending = useCallback((socket: AudioV2Socket) => {
    const pending = pendingRef.current;
    if (!pending.length) return;
    pendingRef.current = [];
    for (const p of pending) transmit(socket, p.opus, p.capturedAtMs, p.monotonicMs);
    onLog?.('connected', `Sent ${pending.length} packets saved during the gap`,
      `${(pending.length * WEARABLE_FRAME_MS / 1000).toFixed(1)} s of audio; ${droppedCountRef.current} lost (buffer full)`);
  }, [onLog, transmit]);
  flushPendingRef.current = flushPending;

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

  // No NetInfo-driven reconnect: the socket's own close event is the only signal.
  // NetInfo flickers during Wi-Fi/cellular handoff and on background/foreground,
  // and acting on it killed healthy sockets (the Omi app removed the same gate, #6311).

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
