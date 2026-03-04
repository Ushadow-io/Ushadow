/**
 * streamingSession — Re-export shim.
 * Source of truth: @ushadow/mobile-core/audio
 */
export {
  generateSessionId,
  formatDuration,
  formatBytes,
  getSessionDuration,
  isSessionActive,
} from '../../../../packages/mobile-core/audio/types/streamingSession';

export type {
  SessionSource,
  SessionDestination,
  StreamingSession,
  SessionState,
} from '../../../../packages/mobile-core/audio/types/streamingSession';
