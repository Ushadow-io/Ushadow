/**
 * Bluetooth Context — Re-export shim.
 *
 * Source of truth has moved to @ushadow/mobile-core/ble.
 * This file re-exports everything so existing imports keep working.
 */

export {
  BluetoothProvider,
  useBluetooth,
} from '../../../../packages/mobile-core/ble';
export type { BluetoothContextType } from '../../../../packages/mobile-core/ble';
