/**
 * useConnectionHealth Hook
 *
 * Monitors health of Bluetooth and WebSocket connections.
 * Useful for detecting "zombie" connections that appear connected but aren't working.
 *
 * Usage:
 * ```typescript
 * const { checkHealth, bluetoothHealthy, websocketHealthy } = useConnectionHealth({
 *   omiConnection,
 *   websocketReadyState: audioStreamer.getWebSocketReadyState(),
 *   onUnhealthy: (type) => {
 *     console.log(`${type} connection is unhealthy, reconnecting...`);
 *   }
 * });
 *
 * // Check health when returning to foreground
 * await checkHealth();
 * ```
 */

import { useState, useCallback } from 'react';
import { OmiConnection } from 'friend-lite-react-native';

interface UseConnectionHealthOptions {
  omiConnection?: OmiConnection;
  websocketReadyState?: number;
  onUnhealthy?: (type: 'bluetooth' | 'websocket' | 'both') => void;
  autoCheck?: boolean; // Not implemented yet, for future periodic checks
}

interface UseConnectionHealth {
  bluetoothHealthy: boolean | null; // null = not checked yet
  websocketHealthy: boolean | null;
  lastHealthCheck: Date | null;
  isChecking: boolean;
  checkHealth: () => Promise<{ bluetooth: boolean; websocket: boolean }>;
}

/**
 * Hook to check connection health status.
 *
 * Bluetooth health check:
 * - Verify isConnected() returns true
 * - Try to read battery level (low-cost operation that proves BLE is working)
 *
 * WebSocket health check:
 * - Verify readyState === WebSocket.OPEN (1)
 */
export const useConnectionHealth = (options?: UseConnectionHealthOptions): UseConnectionHealth => {
  const { omiConnection, websocketReadyState, onUnhealthy } = options || {};

  const [bluetoothHealthy, setBluetoothHealthy] = useState<boolean | null>(null);
  const [websocketHealthy, setWebsocketHealthy] = useState<boolean | null>(null);
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  /**
   * Check if Bluetooth connection is actually working.
   *
   * We consider Bluetooth healthy if:
   * 1. isConnected() returns true
   * 2. We can successfully read battery level (proves BLE communication works)
   */
  const checkBluetoothHealth = useCallback(async (): Promise<boolean> => {
    if (!omiConnection) {
      console.log('[ConnectionHealth] No omiConnection provided, skipping Bluetooth check');
      return true; // Not applicable
    }

    try {
      const isConnected = omiConnection.isConnected();
      console.log('[ConnectionHealth] Bluetooth isConnected():', isConnected);

      if (!isConnected) {
        console.log('[ConnectionHealth] ❌ Bluetooth: Not connected');
        return false;
      }

      // Try to read battery level to verify BLE communication works
      const batteryLevel = await omiConnection.getBatteryLevel();
      console.log('[ConnectionHealth] ✅ Bluetooth: Connected and responsive (battery:', batteryLevel, '%)');
      return true;

    } catch (error) {
      console.error('[ConnectionHealth] ❌ Bluetooth: Error during health check:', error);
      return false;
    }
  }, [omiConnection]);

  /**
   * Check if WebSocket connection is actually working.
   *
   * We consider WebSocket healthy if readyState === OPEN (1).
   * Future enhancement: Could send ping and wait for pong.
   */
  const checkWebSocketHealth = useCallback((): boolean => {
    if (websocketReadyState === undefined) {
      console.log('[ConnectionHealth] No websocketReadyState provided, skipping WebSocket check');
      return true; // Not applicable
    }

    const isOpen = websocketReadyState === WebSocket.OPEN; // 1
    console.log('[ConnectionHealth]', isOpen ? '✅' : '❌', 'WebSocket: readyState =', websocketReadyState);

    return isOpen;
  }, [websocketReadyState]);

  /**
   * Check health of both connections.
   * Returns { bluetooth: boolean, websocket: boolean }
   */
  const checkHealth = useCallback(async (): Promise<{ bluetooth: boolean; websocket: boolean }> => {
    console.log('[ConnectionHealth] Starting health check...');
    setIsChecking(true);

    const btHealthy = await checkBluetoothHealth();
    const wsHealthy = checkWebSocketHealth();

    setBluetoothHealthy(btHealthy);
    setWebsocketHealthy(wsHealthy);
    setLastHealthCheck(new Date());
    setIsChecking(false);

    console.log('[ConnectionHealth] Health check complete:', {
      bluetooth: btHealthy ? '✅' : '❌',
      websocket: wsHealthy ? '✅' : '❌',
    });

    // Trigger callback if unhealthy
    if (!btHealthy && !wsHealthy) {
      onUnhealthy?.('both');
    } else if (!btHealthy) {
      onUnhealthy?.('bluetooth');
    } else if (!wsHealthy) {
      onUnhealthy?.('websocket');
    }

    return { bluetooth: btHealthy, websocket: wsHealthy };
  }, [checkBluetoothHealth, checkWebSocketHealth, onUnhealthy]);

  return {
    bluetoothHealthy,
    websocketHealthy,
    lastHealthCheck,
    isChecking,
    checkHealth,
  };
};

export default useConnectionHealth;
