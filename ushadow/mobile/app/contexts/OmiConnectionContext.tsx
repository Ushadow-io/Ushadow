/**
 * OMI Connection Context — Re-export shim.
 *
 * Source of truth has moved to @ushadow/mobile-core/ble.
 * This file re-exports everything so existing imports keep working.
 */

export {
  OmiConnectionProvider,
  useOmiConnection,
} from '../../../../packages/mobile-core/ble';
