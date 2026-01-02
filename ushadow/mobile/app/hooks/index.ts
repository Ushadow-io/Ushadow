/**
 * Hooks index
 *
 * Re-exports all custom hooks for easy importing.
 */

// Streaming hooks
export { useAudioStreamer } from './useAudioStreamer';
export type { UseAudioStreamer } from './useAudioStreamer';

export { usePhoneAudioRecorder } from './usePhoneAudioRecorder';
export type { UsePhoneAudioRecorder } from './usePhoneAudioRecorder';

export { useStreaming } from './useStreaming';
export type { UseStreaming } from './useStreaming';

// Discovery hooks
export { useTailscaleDiscovery } from './useTailscaleDiscovery';

// Bluetooth and connection hooks
export { useBluetoothManager } from './useBluetoothManager';
export { useConnectionLog } from './useConnectionLog';

// OMI Device hooks (from chronicle)
export { useDeviceConnection } from './useDeviceConnection';
export { useDeviceScanning } from './useDeviceScanning';
export { useAudioListener } from './useAudioListener';
export { useAudioManager } from './useAudioManager';

// Auth hooks
export { useTokenMonitor } from './useTokenMonitor';
