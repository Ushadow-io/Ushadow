/**
 * Session Storage — Re-export shim.
 * Source of truth: @ushadow/mobile-core/session
 */
export {
  loadSessions,
  saveSessions,
  addSession,
  updateSession,
  deleteSession,
  clearAllSessions,
  linkSessionToConversation,
} from '../../../../packages/mobile-core/session';
