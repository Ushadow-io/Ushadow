/**
 * @ushadow/mobile-core/session
 *
 * Session tracking — lifecycle management and persistence.
 */

// Hooks
export { useSessionTracking } from './hooks/useSessionTracking';
export type { UseSessionTrackingReturn } from './hooks/useSessionTracking';

// Storage
export {
  createSessionStorage,
  loadSessions,
  saveSessions,
  addSession,
  updateSession,
  deleteSession,
  clearAllSessions,
  linkSessionToConversation,
} from './storage/sessionStorage';

// Re-export session types from audio module
export type {
  StreamingSession,
  SessionSource,
  SessionDestination,
  SessionState,
} from '../audio/types/streamingSession';
export {
  generateSessionId,
  formatDuration,
  formatBytes,
  getSessionDuration,
  isSessionActive,
} from '../audio/types/streamingSession';
