import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { OmiConnection, BleAudioCodec, OmiDevice } from 'friend-lite-react-native';
import { isDemoMode } from '../utils/demoModeStorage';
import { MOCK_OMI_DEVICES } from '../utils/mockData';
import type { ConnectionType, ConnectionStatus } from '../types/connectionLog';

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

export const useDeviceConnection = (
  omiConnection: OmiConnection,
  onDisconnect?: () => void, // Callback for when disconnection happens, e.g., to stop audio listener
  onConnect?: () => void, // Callback for when connection happens
  logEvent?: (type: ConnectionType, status: ConnectionStatus, message: string, details?: string) => void // Optional logging callback
): UseDeviceConnection => {
  const [connectedDevice, setConnectedDevice] = useState<OmiDevice | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [currentCodec, setCurrentCodec] = useState<BleAudioCodec | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(-1);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState<boolean>(false);

  // Check demo mode on mount and auto-connect demo device if needed
  useEffect(() => {
    const initDemoMode = async () => {
      const isDemo = await isDemoMode();
      setDemoMode(isDemo);

      // Auto-connect to demo device when in demo mode
      if (isDemo && MOCK_OMI_DEVICES.length > 0) {
        const demoDeviceId = MOCK_OMI_DEVICES[0].id;
        setConnectedDeviceId(demoDeviceId);
        setBatteryLevel(85);
        setConnectionError(null);
        if (onConnect) onConnect();
      }
    };

    initDemoMode();
  }, [onConnect]);

  const handleConnectionStateChange = useCallback((id: string, state: string) => {
    console.log(`Device ${id} connection state: ${state}`);
    const isNowConnected = state === 'connected';
    setIsConnecting(false);

    if (isNowConnected) {
        setConnectedDeviceId(id);
        setConnectionError(null); // Clear any previous error on successful connection
        // Log bluetooth connection
        if (logEvent) {
          logEvent('bluetooth', 'connected', 'OMI device connected', `Device ID: ${id}`);
        }
        // Potentially fetch the device details from omiConnection if needed to set connectedDevice
        // For now, we'll assume the app manages the full OmiDevice object elsewhere or doesn't need it here.
        if (onConnect) onConnect();
    } else {
        setConnectedDeviceId(null);
        setConnectedDevice(null);
        setCurrentCodec(null);
        setBatteryLevel(-1);
        // Log bluetooth disconnection
        if (logEvent) {
          logEvent('bluetooth', 'disconnected', 'OMI device disconnected', `Device ID: ${id}`);
        }
        if (onDisconnect) onDisconnect();
    }
  }, [onDisconnect, onConnect, logEvent]);

  const connectToDevice = useCallback(async (deviceId: string) => {
    if (connectedDeviceId && connectedDeviceId !== deviceId) {
      console.log('Disconnecting from previous device before connecting to new one.');
      await disconnectFromDevice();
    }
    if (connectedDeviceId === deviceId) {
        console.log('Already connected or connecting to this device');
        return;
    }

    // Check if this is the demo device
    const isDemoDevice = demoMode && MOCK_OMI_DEVICES.some(d => d.id === deviceId);
    if (isDemoDevice) {
      console.log('[useDeviceConnection] Demo device - simulating connection');
      setIsConnecting(true);
      setConnectionError(null);
      setConnectedDevice(null);
      setCurrentCodec(null);

      // Log connecting state
      if (logEvent) {
        logEvent('bluetooth', 'connecting', 'Connecting to demo OMI device', `Device ID: ${deviceId}`);
      }

      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // Set connected state
      setConnectedDeviceId(deviceId);
      setBatteryLevel(85); // Mock battery level
      setIsConnecting(false);

      // Log successful connection
      if (logEvent) {
        logEvent('bluetooth', 'connected', 'Demo OMI device connected', `Device ID: ${deviceId}`);
      }

      if (onConnect) onConnect();
      console.log('[useDeviceConnection] Demo device connected');
      return;
    }

    setIsConnecting(true);
    setConnectionError(null); // Clear previous error
    setConnectedDevice(null); // Clear previous device details
    setCurrentCodec(null);
    setBatteryLevel(-1);

    // Log connecting state
    if (logEvent) {
      logEvent('bluetooth', 'connecting', 'Connecting to OMI device', `Device ID: ${deviceId}`);
    }

    try {
      const success = await omiConnection.connect(deviceId, handleConnectionStateChange);
      if (success) {
        console.log('Successfully initiated connection to device:', deviceId);
        // Note: actual connected state is set by handleConnectionStateChange callback
      } else {
        setIsConnecting(false);
        const errorMsg = 'Could not connect to the device. Please try again.';
        setConnectionError(errorMsg);
        // Log connection error
        if (logEvent) {
          logEvent('bluetooth', 'error', 'Failed to connect to OMI device', errorMsg);
        }
        Alert.alert('Connection Failed', errorMsg);
      }
    } catch (error) {
      console.error('Connection error:', error);
      setIsConnecting(false);
      setConnectedDevice(null);
      setConnectedDeviceId(null);
      const errorMsg = String(error);
      setConnectionError(errorMsg);
      // Log connection error
      if (logEvent) {
        logEvent('bluetooth', 'error', 'Connection error', errorMsg);
      }
      Alert.alert('Connection Error', errorMsg);
    }
  }, [omiConnection, handleConnectionStateChange, connectedDeviceId, demoMode, onConnect, disconnectFromDevice]);

  const disconnectFromDevice = useCallback(async () => {
    console.log('Attempting to disconnect...');
    setIsConnecting(false); // No longer attempting to connect if we are disconnecting
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
      Alert.alert('Disconnect Error', String(error));
      // Even if disconnect fails, reset state as we intend to be disconnected
      setConnectedDevice(null);
      setConnectedDeviceId(null);
      setCurrentCodec(null);
      setBatteryLevel(-1);
    }
  }, [omiConnection, onDisconnect]);

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
    if (!connectedDeviceId) {
      Alert.alert('Not Connected', 'Please connect to a device first.');
      return;
    }

    // Check if this is the demo device
    const isDemoDevice = demoMode && MOCK_OMI_DEVICES.some(d => d.id === connectedDeviceId);
    if (isDemoDevice) {
      console.log('[useDeviceConnection] Demo device - returning mock battery level');
      setBatteryLevel(85);
      return;
    }

    if (!omiConnection.isConnected()) {
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
  }, [omiConnection, connectedDeviceId, demoMode]);

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
