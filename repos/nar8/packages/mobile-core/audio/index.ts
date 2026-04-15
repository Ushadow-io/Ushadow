/**
 * @ushadow/mobile-core/audio
 *
 * Audio streaming hooks, API clients, and session types.
 *
 * Tier 1 (extracted — domain-agnostic, zero app dependencies):
 * - useAudioStreamer: WebSocket audio streaming via Wyoming protocol
 * - usePhoneAudioRecorder: Real-time PCM capture from phone microphone
 * - useSpeechToText: Native speech-to-text recognition with streaming
 * - useMultiDestinationStreamer: Multi-destination relay/direct streaming
 * - audioProviderApi: REST API client for audio provider/destination discovery
 * - streamingSession types: Session tracking types and helpers
 *
 * Tier 2 (planned — need lifecycle/activity hook abstraction):
 * - useAudioListener: BLE audio from OMI devices
 * - useAudioManager: Orchestrator (OMI + phone mic + WebSocket)
 * - useStreaming: Combined recording + streaming lifecycle
 *
 * Tier 3 (planned — need theme abstraction):
 * - StreamingButton, StreamingDisplay, SourceSelector, etc.
 */

// ── Hooks ───────────────────────────────────────────────────────────

export { useAudioStreamer } from './hooks/useAudioStreamer';
export type {
  UseAudioStreamer,
  UseAudioStreamerOptions,
  RelayStatus,
} from './hooks/useAudioStreamer';

export { usePhoneAudioRecorder } from './hooks/usePhoneAudioRecorder';
export type { UsePhoneAudioRecorder } from './hooks/usePhoneAudioRecorder';

export { useSpeechToText } from './hooks/useSpeechToText';
export type {
  UseSpeechToTextOptions,
  UseSpeechToTextReturn,
} from './hooks/useSpeechToText';

export {
  useMultiDestinationStreamer,
  useRelayStreamer,
  useDirectMultiCast,
} from './hooks/useMultiDestinationStreamer';
export type {
  MultiDestinationConfig,
  UseMultiDestinationStreamer,
} from './hooks/useMultiDestinationStreamer';

// ── Services / API ──────────────────────────────────────────────────

export {
  getActiveAudioConsumer,
  getAvailableAudioConsumers,
  setActiveAudioConsumer,
  buildAudioStreamUrl,
  getAvailableAudioDestinations,
  buildRelayUrl,
  buildDirectUrl,
} from './services/audioProviderApi';
export type {
  AudioConsumerConfig,
  AudioConsumerResponse,
  AudioDestination,
} from './services/audioProviderApi';

// ── Types ───────────────────────────────────────────────────────────

export {
  generateSessionId,
  formatDuration,
  formatBytes,
  getSessionDuration,
  isSessionActive,
} from './types/streamingSession';
export type {
  SessionSource,
  SessionDestination,
  StreamingSession,
  SessionState,
} from './types/streamingSession';
