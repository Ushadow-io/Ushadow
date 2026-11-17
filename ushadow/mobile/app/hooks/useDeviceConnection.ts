import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { OmiConnection, BleAudioCodec, OmiDevice } from 'friend-lite-react-native';

interface UseDeviceConnection {
  connectedDevice: OmiDevice | null;
  isConnecting: boolean;
  connectionError: string | null;
  currentCodec: BleAudioCodec | null;
  batteryLevel: number;
  connectToDevice: (deviceId: string) => Promise<void>;
  disconnectFromDevice: () => Promise<void>;
  getAudioCodec: () => Promise<void>;
  getBatteryLevel: () => Promise<void>;
  connectedDeviceId: string | null;
}

interface UseDeviceConnectionOptions {
  onDisconnect?: () => void; // Callback for when disconnection happens
  onConnect?: () => void; // Callback for when connection happens
  onLog?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message: string, details?: string) => void;
  /** Asked when the link drops on its own. true = reconnect straight away. */
  shouldAutoReconnect?: () => boolean;
}

const RECONNECT_RETRY_MS = [2_000, 5_000, 10_000, 30_000];

export const useDeviceConnection = (
  omiConnection: OmiConnection,
  options?: UseDeviceConnectionOptions
): UseDeviceConnection => {
  const { onDisconnect, onConnect, onLog, shouldAutoReconnect } = options || {};
  const manualDisconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateChangeRef = useRef<(id: string, state: string) => void>(() => {});
  const shouldAutoReconnectRef = useRef(shouldAutoReconnect);
  shouldAutoReconnectRef.current = shouldAutoReconnect;

  useEffect(() => () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
  }, []);

  // Re-issue the connect from inside the disconnect callback, with no timer first.
  // On iOS a CoreBluetooth connect never times out: it stays pending and completes
  // when the device is back in range, even while the app is in the background.
  // A JS timer would not run while iOS has the app suspended. (Same approach as the
  // Omi app's native BLE manager.)
  const reconnect = useCallback(async (deviceId: string) => {
    if (manualDisconnectRef.current || !shouldAutoReconnectRef.current?.()) return;
    setIsConnecting(true);
    onLog?.('connecting', 'Reconnecting to OMI device', `Device ID: ${deviceId}`);
    let ok = false;
    try {
      ok = await omiConnection.connect(deviceId, (id, state) => stateChangeRef.current(id, state));
    } catch (error) {
      onLog?.('error', 'OMI reconnect failed', String(error));
    }
    if (ok) return; // the CONNECTED callback finishes the job
    setIsConnecting(false);
    const delay = RECONNECT_RETRY_MS[Math.min(reconnectAttemptRef.current, RECONNECT_RETRY_MS.length - 1)];
    reconnectAttemptRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => { void reconnect(deviceId); }, delay);
  }, [omiConnection, onLog]);
  const [connectedDevice, setConnectedDevice] = useState<OmiDevice | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [currentCodec, setCurrentCodec] = useState<BleAudioCodec | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(-1);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);

  const handleConnectionStateChange = useCallback((id: string, state: string) => {
    console.log(`Device ${id} connection state: ${state}`);
    const isNowConnected = state === 'connected';
    setIsConnecting(false);

    if (isNowConnected) {
        reconnectAttemptRef.current = 0;
        setConnectedDeviceId(id);
        setConnectionError(null); // Clear any previous error on successful connection
        onLog?.('connected', 'OMI device connected', `Device ID: ${id}`);
        // Potentially fetch the device details from omiConnection if needed to set connectedDevice
        // For now, we'll assume the app manages the full OmiDevice object elsewhere or doesn't need it here.
        if (onConnect) onConnect();
    } else {
        setConnectedDeviceId(null);
        setConnectedDevice(null);
        setCurrentCodec(null);
        setBatteryLevel(-1);
        onLog?.('disconnected', 'OMI device disconnected', `Device ID: ${id}`);
        if (onDisconnect) onDisconnect();
        void reconnect(id);
    }
  }, [onDisconnect, onConnect, onLog, reconnect]);
  stateChangeRef.current = handleConnectionStateChange;

  const connectToDevice = useCallback(async (deviceId: string) => {
    if (connectedDeviceId && connectedDeviceId !== deviceId) {
      console.log('Disconnecting from previous device before connecting to new one.');
      await disconnectFromDevice();
    }
    if (connectedDeviceId === deviceId) {
        console.log('Already connected or connecting to this device');
        return;
    }

    manualDisconnectRef.current = false;
    setIsConnecting(true);
    setConnectionError(null); // Clear previous error
    setConnectedDevice(null); // Clear previous device details
    setCurrentCodec(null);
    setBatteryLevel(-1);
    onLog?.('connecting', 'Connecting to OMI device', `Device ID: ${deviceId}`);

    try {
      const success = await omiConnection.connect(deviceId, handleConnectionStateChange);
      if (success) {
        console.log('Successfully initiated connection to device:', deviceId);
        // Note: actual connected state is set by handleConnectionStateChange callback
      } else {
        setIsConnecting(false);
        const errorMsg = 'Could not connect to the device. Please try again.';
        setConnectionError(errorMsg);
        onLog?.('error', 'Failed to connect to OMI device', errorMsg);
        Alert.alert('Connection Failed', errorMsg);
      }
    } catch (error) {
      console.error('Connection error:', error);
      setIsConnecting(false);
      setConnectedDevice(null);
      setConnectedDeviceId(null);
      const errorMsg = String(error);
      setConnectionError(errorMsg);
      onLog?.('error', 'OMI connection error', errorMsg);
      Alert.alert('Connection Error', errorMsg);
    }
  }, [omiConnection, handleConnectionStateChange, connectedDeviceId, onLog]);

  const disconnectFromDevice = useCallback(async () => {
    console.log('Attempting to disconnect...');
    manualDisconnectRef.current = true;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    setIsConnecting(false); // No longer attempting to connect if we are disconnecting
    onLog?.('disconnected', 'Disconnecting from OMI device');
    try {
      if (onDisconnect) {
        await onDisconnect(); // Call pre-disconnect cleanup (e.g., stop audio)
      }
      await omiConnection.disconnect();
      console.log('Successfully disconnected.');
      setConnectedDevice(null);
      setConnectedDeviceId(null);
      setCurrentCodec(null);
      setBatteryLevel(-1);
      // The handleConnectionStateChange should also be triggered by the SDK upon disconnection
    } catch (error) {
      console.error('Disconnect error:', error);
      onLog?.('error', 'OMI disconnect error', String(error));
      Alert.alert('Disconnect Error', String(error));
      // Even if disconnect fails, reset state as we intend to be disconnected
      setConnectedDevice(null);
      setConnectedDeviceId(null);
      setCurrentCodec(null);
      setBatteryLevel(-1);
    }
  }, [omiConnection, onDisconnect, onLog]);

  const getAudioCodec = useCallback(async () => {
    if (!omiConnection.isConnected() || !connectedDeviceId) {
      Alert.alert('Not Connected', 'Please connect to a device first.');
      return;
    }
    try {
      const codecValue = await omiConnection.getAudioCodec();
      setCurrentCodec(codecValue);
      console.log('Audio codec:', codecValue);
    } catch (error) {
      console.error('Get codec error:', error);
      if (String(error).includes('not connected')) {
        setConnectedDevice(null);
        setConnectedDeviceId(null);
        Alert.alert('Connection Lost', 'The device appears to be disconnected. Please reconnect.');
      } else {
        Alert.alert('Error', `Failed to get audio codec: ${error}`);
      }
    }
  }, [omiConnection, connectedDeviceId]);

  const getBatteryLevel = useCallback(async () => {
    if (!omiConnection.isConnected() || !connectedDeviceId) {
      Alert.alert('Not Connected', 'Please connect to a device first.');
      return;
    }
    try {
      const level = await omiConnection.getBatteryLevel();
      setBatteryLevel(level);
      console.log('Battery level:', level);
    } catch (error) {
      console.error('Get battery level error:', error);
      if (String(error).includes('not connected')) {
        setConnectedDevice(null);
        setConnectedDeviceId(null);
        Alert.alert('Connection Lost', 'The device appears to be disconnected. Please reconnect.');
      } else {
        Alert.alert('Error', `Failed to get battery level: ${error}`);
      }
    }
  }, [omiConnection, connectedDeviceId]);

  return {
    connectedDevice,
    isConnecting,
    connectionError,
    currentCodec,
    batteryLevel,
    connectToDevice,
    disconnectFromDevice,
    getAudioCodec,
    getBatteryLevel,
    connectedDeviceId
  };
};
