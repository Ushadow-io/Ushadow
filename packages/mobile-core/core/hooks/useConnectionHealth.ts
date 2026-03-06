/**
 * useConnectionHealth — Monitor health of Bluetooth and WebSocket connections.
 *
 * Detects "zombie" connections that appear connected but aren't working.
 */

import { useState, useCallback } from 'react';
import { OmiConnection } from 'friend-lite-react-native';

export interface UseConnectionHealthOptions {
  omiConnection?: OmiConnection;
  websocketReadyState?: number;
  onUnhealthy?: (type: 'bluetooth' | 'websocket' | 'both') => void;
}

export interface UseConnectionHealthReturn {
  bluetoothHealthy: boolean | null;
  websocketHealthy: boolean | null;
  lastHealthCheck: Date | null;
  isChecking: boolean;
  checkHealth: () => Promise<{ bluetooth: boolean; websocket: boolean }>;
}

export const useConnectionHealth = (options?: UseConnectionHealthOptions): UseConnectionHealthReturn => {
  const { omiConnection, websocketReadyState, onUnhealthy } = options || {};

  const [bluetoothHealthy, setBluetoothHealthy] = useState<boolean | null>(null);
  const [websocketHealthy, setWebsocketHealthy] = useState<boolean | null>(null);
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const checkBluetoothHealth = useCallback(async (): Promise<boolean> => {
    if (!omiConnection) {
      console.log('[ConnectionHealth] No omiConnection provided, skipping Bluetooth check');
      return true;
    }

    try {
      const isConnected = omiConnection.isConnected();
      console.log('[ConnectionHealth] Bluetooth isConnected():', isConnected);

      if (!isConnected) {
        console.log('[ConnectionHealth] Bluetooth: Not connected');
        return false;
      }

      const batteryLevel = await omiConnection.getBatteryLevel();
      console.log('[ConnectionHealth] Bluetooth: Connected and responsive (battery:', batteryLevel, '%)');
      return true;
    } catch (error) {
      console.error('[ConnectionHealth] Bluetooth: Error during health check:', error);
      return false;
    }
  }, [omiConnection]);

  const checkWebSocketHealth = useCallback((): boolean => {
    if (websocketReadyState === undefined) {
      console.log('[ConnectionHealth] No websocketReadyState provided, skipping WebSocket check');
      return true;
    }

    const isOpen = websocketReadyState === WebSocket.OPEN;
    console.log('[ConnectionHealth]', isOpen ? 'OK' : 'FAIL', 'WebSocket: readyState =', websocketReadyState);
    return isOpen;
  }, [websocketReadyState]);

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
      bluetooth: btHealthy ? 'OK' : 'FAIL',
      websocket: wsHealthy ? 'OK' : 'FAIL',
    });

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
