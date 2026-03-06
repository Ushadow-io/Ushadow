/**
 * @ushadow/mobile-core/ble
 *
 * Bluetooth / OMI device discovery, connection, and audio streaming.
 */

// Contexts
export { BluetoothProvider, useBluetooth } from './contexts/BluetoothContext';
export type { BluetoothContextType } from './contexts/BluetoothContext';
export { OmiConnectionProvider, useOmiConnection } from './contexts/OmiConnectionContext';

// Hooks
export { useDeviceScanning } from './hooks/useDeviceScanning';
export type { UseDeviceScanningReturn } from './hooks/useDeviceScanning';
export { useDeviceConnection } from './hooks/useDeviceConnection';
export type { UseDeviceConnectionReturn, UseDeviceConnectionOptions } from './hooks/useDeviceConnection';
export { useAudioListener } from './hooks/useAudioListener';
export type { UseAudioListenerReturn } from './hooks/useAudioListener';

// Storage
export {
  createDeviceStorage,
  getSavedDevices,
  saveDevice,
  updateDeviceName,
  removeDevice,
  getDeviceById,
  setActiveDevice,
  getActiveDeviceId,
  getActiveDevice,
  clearActiveDevice,
} from './storage/deviceStorage';
export type { SavedDevice } from './storage/deviceStorage';
