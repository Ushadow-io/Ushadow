/**
 * Persistent Logger — Re-export shim.
 * Source of truth: @ushadow/mobile-core/core
 */
export {
  addPersistentLog,
  getPersistentLogs,
  clearPersistentLogs,
  getPersistentLogsText,
} from '../../../../packages/mobile-core/core';
export type { PersistentLogEntry } from '../../../../packages/mobile-core/core';
