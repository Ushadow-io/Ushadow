/**
 * Connection Log Types — Re-export shim.
 * Source of truth: @ushadow/mobile-core/core
 */
export {
  CONNECTION_TYPE_LABELS,
  CONNECTION_TYPE_EMOJIS,
  CONNECTION_TYPE_COLORS,
  STATUS_COLORS,
  STATUS_ICONS,
  generateLogId,
  createInitialConnectionState,
} from '../../../../packages/mobile-core/core';
export type {
  ConnectionType,
  ConnectionStatus,
  ConnectionLogEntry,
  ConnectionState,
} from '../../../../packages/mobile-core/core';
